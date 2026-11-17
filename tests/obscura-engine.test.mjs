import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  resolveObscuraBinary,
  generateObscuraProfile,
  buildObscuraStealthScript,
} from '../src/obscura-engine/index.mjs';
import { launchObscuraBrowsers } from '../src/browser/actions/launch-obscura-browsers.mjs';
import { launchRefillBrowsers } from '../src/refill/actions/launch-refill-browsers.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { getAutoRefillStatus } from '../src/refill/actions/get-auto-refill-status.mjs';
import { captureScreenThumbnail } from '../src/browser/screen/capture-screen-thumbnail.mjs';
import { handlePostBrowserClose } from '../src/http/routes/browser/post-close.mjs';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleState } from '../src/logging/browser-logs/state/module-state.mjs';
import * as RootFacade from '../obscura-engine.mjs';

test.after(() => {
  clearTimeout(moduleState.saveBrowserLogsTimer);
});

test('Obscura Engine Integration Suite', async (t) => {
  await t.test('1. resolveObscuraBinary resolves an existing binary', () => {
    const binPath = resolveObscuraBinary();
    assert.ok(binPath, 'Đường dẫn binary không được rỗng');
    assert.ok(existsSync(binPath), `File binary phải tồn tại trên ổ đĩa: ${binPath}`);
  });

  await t.test('2. generateObscuraProfile creates a valid deterministic profile', () => {
    const p1 = generateObscuraProfile({ seed: 101, os: 'windows' });
    assert.equal(p1.id, '101');
    assert.equal(p1.platform, 'Win32');
    assert.ok(p1.user_agent.includes('Windows NT 10.0'));
    assert.ok(p1.hardware_concurrency > 0);
    assert.ok(p1.webgl.unmasked_renderer.length > 0);
    assert.ok(p1.canvas_noise_seed > 0);
    assert.ok(p1.audio_noise_seed > 0);

    // Tính nhất quán (deterministic)
    const p2 = generateObscuraProfile({ seed: 101, os: 'windows' });
    assert.equal(p1.canvas_noise_seed, p2.canvas_noise_seed);
    assert.equal(p1.audio_noise_seed, p2.audio_noise_seed);
    assert.equal(p1.user_agent, p2.user_agent);

    // Khác seed sinh ra vân tay khác nhau
    const p3 = generateObscuraProfile({ seed: 999, os: 'windows' });
    assert.notEqual(p1.canvas_noise_seed, p3.canvas_noise_seed);
  });

  await t.test('3. generateObscuraProfile supports macOS and Android', () => {
    const macProfile = generateObscuraProfile({ seed: 202, os: 'mac' });
    assert.equal(macProfile.platform, 'MacIntel');
    assert.ok(macProfile.user_agent.includes('Macintosh'));
    assert.ok(macProfile.webgl.unmasked_renderer.includes('Apple'));

    const androidProfile = generateObscuraProfile({ seed: 303, os: 'android' });
    assert.equal(androidProfile.platform, 'Linux armv8l');
    assert.ok(androidProfile.user_agent.includes('Android 14'));
    assert.equal(androidProfile.client_hints.mobile, true);
  });

  await t.test('3.1. Chrome version pool is within 148-156 (excluding 155)', () => {
    const validMajors = new Set(['148', '149', '150', '151', '152', '153', '154', '156']);
    const observedMajors = new Set();

    for (let s = 100; s <= 130; s++) {
      const prof = generateObscuraProfile({ seed: s, os: 'windows' });
      const major = prof.chrome_version.split('.')[0];
      assert.ok(validMajors.has(major), `Phiên bản Chrome (${major}) phải nằm trong pool 148-156 (không có 155)`);
      assert.notEqual(major, '155', 'Không được phép có Chrome 155');
      assert.ok(prof.user_agent.includes(`Chrome/${prof.chrome_version}`));
      
      const brandChrome = prof.client_hints.brands.find(b => b.brand === 'Google Chrome');
      assert.ok(brandChrome, 'Brand Google Chrome phải tồn tại');
      assert.equal(brandChrome.version, major);

      observedMajors.add(major);
    }

    // Kiểm tra tính ngẫu nhiên phong phú: qua 30 seed phải xuất hiện nhiều version khác nhau
    assert.ok(observedMajors.size >= 4, `Phải có ít nhất 4 phiên bản Chrome khác nhau trong 30 seed, thực tế: ${observedMajors.size}`);
  });

  await t.test('4. buildObscuraStealthScript generates executable stealth JavaScript', () => {
    const script = buildObscuraStealthScript({ seed: 101, os: 'windows' });
    assert.ok(script.length > 1000);
    assert.ok(script.includes('navigator.webdriver'));
    assert.ok(script.includes('window.chrome'));
    // Canvas/audio/WebGL do engine tự lo theo danh tính phiên; script tiêm không còn hook các API này.
    assert.ok(!script.includes('HTMLCanvasElement.prototype.getContext'));
    // Không để lại global đánh dấu cho trang dò.
    assert.ok(!script.includes('__obscura_antidetect_active'));
  });

  await t.test('5. Root facade re-exports matches src/obscura-engine', () => {
    assert.equal(typeof RootFacade.resolveObscuraBinary, 'function');
    assert.equal(typeof RootFacade.generateObscuraProfile, 'function');
    assert.equal(typeof RootFacade.buildObscuraStealthScript, 'function');
    assert.equal(typeof RootFacade.startObscuraSession, 'function');
    assert.equal(typeof RootFacade.stopObscuraSession, 'function');
    assert.equal(typeof RootFacade.openObscuraBrowser, 'function');
  });

  await t.test('6. openObscuraBrowser launches, connects Playwright over CDP, and evaluates script', async () => {
    const session = await RootFacade.openObscuraBrowser({
      slot: 88,
      port: 9288,
      seed: 888,
      os: 'windows',
      targetUrl: 'data:text/html,<!DOCTYPE html><html><head><title>Obscura AutoLead</title></head><body><h1>Live</h1></body></html>',
    });

    try {
      assert.ok(session.browser, 'Browser instance phải tồn tại');
      assert.ok(session.page, 'Page instance phải tồn tại');
      assert.equal(session.engine, 'obscura');

      const engineGlobals = await session.page.evaluate(() => Object.getOwnPropertyNames(window).filter(k => /obscura|antidetect/i.test(k)));
      assert.deepEqual(engineGlobals, [], 'Trang không được thấy global của engine/anti-detect');

      const webdriver = await session.page.evaluate(() => navigator.webdriver);
      // Chrome/Safari thật không automation trả false; undefined/null là dấu hiệu plugin stealth bị CreepJS bắt.
      assert.equal(webdriver, false, 'navigator.webdriver phải giống trình duyệt thật (false)');
    } finally {
      await session.close();
    }
  });

  await t.test('7. launcher không mở trực tiếp khi chưa cấp proxy', async () => {
    const before = activeBrowsers.size;
    const result = await launchObscuraBrowsers(JSON.stringify({ requestedCount: 1, websiteUrl: 'https://fixture.invalid/offer', runMode: 'manual' }));
    assert.equal(activeBrowsers.size, before);
    assert.equal(result.results.length, 0);
    assert.ok(result.warnings.length);
  });
  await t.test('8. tự bù Obscura không đổi engine hoặc mở trực tiếp khi queue rỗng', async () => {
    const result = await launchRefillBrowsers(JSON.stringify({ browserMode: 'Obscura', requestedCount: 1, websiteUrl: 'https://fixture.invalid/offer' }), { assignedStreamRoles: [1] });
    assert.equal(result.results.length, 0);
    assert.ok(result.warnings.length);
  });

  await t.test('9. Screen Preview and State: Obscura session appears in chromeSessions and supports snapshot', async () => {
    const session = await RootFacade.openObscuraBrowser({
      slot: 99,
      port: 9299,
      seed: 9999,
      os: 'windows',
      targetUrl: 'data:text/html,<!DOCTYPE html><html><body style="background:red"><h1>Screen Preview Test</h1></body></html>',
    });

    try {
      // 1. Kiểm tra session.browser tương thích với hệ thống Screen Preview (pages() & mainPage)
      assert.ok(session.browser, 'session.browser phải tồn tại');
      assert.ok(typeof session.browser.pages === 'function', 'session.browser.pages phải là hàm (Playwright Context)');
      const pages = session.browser.pages();
      assert.ok(pages.length > 0, 'Phải có ít nhất 1 page');
      assert.equal(session.mainPage, pages[0], 'session.mainPage phải là page chính');

      // 2. Kiểm tra GET /state (getAutoRefillStatus) nhận diện được Obscura session
      const status = getAutoRefillStatus();
      const reportedSession = status.chromeSessions.find((s) => s.slot === 99);
      assert.ok(reportedSession, 'Obscura slot 99 phải nằm trong chromeSessions của /state');
      assert.equal(reportedSession.engine, 'Obscura', 'engine hiển thị phải là Obscura');
      assert.ok(reportedSession.version, 'Phiên bản Chrome phải hiển thị');

      // 3. Kiểm tra khả năng chụp ảnh thu nhỏ (Screen Preview Thumbnail)
      const diagnostics = { captures: 0, captureDurationTotalMs: 0, captureDurationMaxMs: 0, captureFailures: 0 };
      const thumb = await captureScreenThumbnail(session, session.page, diagnostics);
      assert.ok(thumb, 'Thumbnail buffer chụp từ Obscura phải tồn tại (không null)');
      assert.ok(Buffer.isBuffer(thumb), 'Thumbnail phải là một Buffer');
      assert.ok(thumb.length > 100, `Thumbnail size (${thumb.length} bytes) phải hợp lệ`);
    } finally {
      await session.close();
    }
  });

  await t.test('10. Browser Close: Obscura session closes cleanly via single close API and close all', async () => {
    // A. Kiểm tra đóng đơn lẻ qua POST /browser/close/:slot
    const session1 = await RootFacade.openObscuraBrowser({
      slot: 77,
      port: 9277,
      seed: 7777,
      os: 'windows',
      targetUrl: 'data:text/html,<h1>Close Test 1</h1>',
    });

    assert.ok(activeBrowsers.has(session1), 'Session 1 phải có trong activeBrowsers');
    const childPid1 = session1.pid;
    assert.ok(childPid1 > 0, 'PID của tiến trình Obscura phải hợp lệ');

    // Giả lập request POST /browser/close/77
    let statusSent = 0;
    let bodySent = null;
    const mockReq = { method: 'POST', url: '/browser/close/77' };
    const mockRes = {
      writeHead(s, h) { statusSent = s; },
      end(b) { bodySent = b ? JSON.parse(b) : null; },
    };

    const handled = await handlePostBrowserClose(mockReq, mockRes);
    assert.equal(handled, true, 'Handler phải xử lý route /browser/close/77');
    assert.equal(statusSent, 200, 'HTTP Status phải là 200');
    assert.ok(!activeBrowsers.has(session1), 'Session 1 phải được xóa khỏi activeBrowsers sau khi đóng');

    // Chờ 100ms và kiểm tra PID đã dừng
    await new Promise((r) => setTimeout(r, 100));
    let isPid1Alive = false;
    try {
      process.kill(childPid1, 0);
      isPid1Alive = true;
    } catch (_) {
      isPid1Alive = false;
    }
    assert.equal(isPid1Alive, false, 'Tiến trình con Obscura (PID 1) phải bị tiêu diệt khi đóng slot');

    // B. Kiểm tra Đóng tất cả qua closeActiveBrowsers()
    const session2 = await RootFacade.openObscuraBrowser({
      slot: 78,
      port: 9278,
      seed: 7878,
      os: 'mac',
      targetUrl: 'data:text/html,<h1>Close All Test</h1>',
    });

    assert.ok(activeBrowsers.has(session2), 'Session 2 phải có trong activeBrowsers');
    const childPid2 = session2.pid;

    const directory = await mkdtemp(join(tmpdir(), 'autoleadpc-obscura-close-'));
    const sourceUrl = new URL('../src/browser/actions/close-active-browsers.mjs', import.meta.url);
    let source = await readFile(sourceUrl, 'utf8');
    source = source.replace(/from (['"])([^'"]+)\1/g, (match, quote, address) => address.includes('execute-file.mjs')
      ? `from '${pathToFileURL(join(directory, 'execute.mjs')).href}'`
      : `from '${new URL(address, sourceUrl).href}'`);
    await writeFile(join(directory, 'execute.mjs'), 'export const executeFile = async () => ({});');
    await writeFile(join(directory, 'close.mjs'), source);
    try { await (await import(pathToFileURL(join(directory, 'close.mjs')).href)).closeActiveBrowsers(); }
    finally { await rm(directory, { recursive: true, force: true }); }
    assert.ok(!activeBrowsers.has(session2), 'Session 2 phải được xóa khỏi activeBrowsers sau closeActiveBrowsers');

    await new Promise((r) => setTimeout(r, 100));
    let isPid2Alive = false;
    try {
      process.kill(childPid2, 0);
      isPid2Alive = true;
    } catch (_) {
      isPid2Alive = false;
    }
    assert.equal(isPid2Alive, false, 'Tiến trình con Obscura (PID 2) phải bị tiêu diệt khi closeActiveBrowsers');
  });
});
