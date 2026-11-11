import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import {
  isCloakBrowserInstalled,
  getCloakBrowserStatus,
  applyCloakHumanize,
  launchCloakBrowserPersistentContext,
} from "../cloakbrowser-engine.mjs";

/**
 * Dọn thư mục profile tạm của một lần khởi chạy CloakBrowser.
 *
 * @param {string} userDataDir Thư mục profile cần xoá.
 * @return {Promise<void>} Hoàn tất khi đã dọn xong hoặc bỏ qua lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
async function removeProfileDir(userDataDir) {
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}

test('CloakBrowser: trạng thái và thông tin binary', () => {
  const status = getCloakBrowserStatus();
  assert.ok(status, 'Status phải là một object');
  assert.equal(typeof status.installed, 'boolean');
  assert.equal(typeof status.platform, 'string');
  assert.equal(typeof isCloakBrowserInstalled(), 'boolean');
});

test('CloakBrowser: applyCloakHumanize xử lý an toàn khi context rỗng', async () => {
  const result = await applyCloakHumanize(null);
  assert.equal(result, false);
});

test('CloakBrowser: applyCloakHumanize thật sự gắn Humanize layer vào context thật', async (t) => {
  if (!isCloakBrowserInstalled()) {
    t.skip('CloakBrowser binary chưa tải xong trên môi trường test');
    return;
  }

  const userDataDir = `/tmp/cloak-humanize-off-${process.pid}-${Date.now()}`;
  let context = null;
  try {
    context = await launchCloakBrowserPersistentContext({
      userDataDir,
      headless: true,
      humanize: false,
      args: ['--no-first-run', '--no-default-browser-check'],
    });

    assert.ok(context, 'Context phải được khởi tạo thành công');
    assert.notEqual(
      context._humanPatched,
      true,
      'humanize=false thì CloakBrowser không được tự gắn Humanize layer',
    );

    const patched = await applyCloakHumanize(context);
    assert.equal(patched, true, 'applyCloakHumanize phải báo thành công trên context thật');
    assert.equal(
      context._humanPatched,
      true,
      'Sau khi applyCloakHumanize, cờ _humanPatched phải được thư viện đặt — đây là dấu hiệu duy nhất của thành công vì patchContext() trả về undefined',
    );

    const page = context.pages()[0] || await context.newPage();
    await page.goto('data:text/html,<html><body>humanize</body></html>');
    const webdriver = await page.evaluate(() => navigator.webdriver);
    assert.ok(!webdriver, 'navigator.webdriver phải bị ẩn sau khi vá Humanize');
  } finally {
    if (context) await context.close().catch(() => {});
    await removeProfileDir(userDataDir);
  }
});

test('CloakBrowser: humanize=true được CloakBrowser tự gắn ngay khi khởi chạy', async (t) => {
  if (!isCloakBrowserInstalled()) {
    t.skip('CloakBrowser binary chưa tải xong trên môi trường test');
    return;
  }

  const userDataDir = `/tmp/cloak-humanize-on-${process.pid}-${Date.now()}`;
  let context = null;
  try {
    context = await launchCloakBrowserPersistentContext({
      userDataDir,
      headless: true,
      humanize: true,
      humanPreset: 'default',
      args: ['--no-first-run', '--no-default-browser-check'],
    });

    assert.ok(context, 'Context phải được khởi tạo thành công');
    assert.equal(
      context._humanPatched,
      true,
      'humanize=true thì CloakBrowser phải tự gọi patchContext trong lúc launch',
    );

    // Gọi lại wrapper trên context đã được vá: không được phá lớp Humanize hiện có.
    assert.equal(await applyCloakHumanize(context), true);
    assert.equal(context._humanPatched, true, 'Vá lần hai không được gỡ lớp Humanize');
  } finally {
    if (context) await context.close().catch(() => {});
    await removeProfileDir(userDataDir);
  }
});

test('CloakBrowser: khởi chạy persistent context và thực hiện thao tác', async (t) => {
  if (!isCloakBrowserInstalled()) {
    t.skip('CloakBrowser binary chưa tải xong trên môi trường test');
    return;
  }

  const userDataDir = `/tmp/cloak-test-${process.pid}-${Date.now()}`;
  let context = null;
  try {
    context = await launchCloakBrowserPersistentContext({
      userDataDir,
      headless: true,
      humanize: true,
      args: ['--no-first-run', '--no-default-browser-check'],
    });

    assert.ok(context, 'Context phải được khởi tạo thành công');
    const page = context.pages()[0] || await context.newPage();
    await page.goto('data:text/html,<html><body><button id="test-btn" onclick="this.textContent=\'Clicked\'">Click</button></body></html>');
    await page.click('#test-btn');
    const text = await page.locator('#test-btn').textContent();
    assert.equal(text, 'Clicked');
  } finally {
    if (context) await context.close().catch(() => {});
    await removeProfileDir(userDataDir);
  }
});

test('CloakBrowser: chạy đa luồng đồng thời (concurrent multi-threaded persistent contexts)', async (t) => {
  if (!isCloakBrowserInstalled()) {
    t.skip('CloakBrowser binary chưa tải xong trên môi trường test');
    return;
  }

  const dir1 = `/tmp/cloak-mt-1-${process.pid}-${Date.now()}`;
  const dir2 = `/tmp/cloak-mt-2-${process.pid}-${Date.now()}`;
  let ctx1 = null;
  let ctx2 = null;
  try {
    [ctx1, ctx2] = await Promise.all([
      launchCloakBrowserPersistentContext({
        userDataDir: dir1,
        headless: true,
        humanize: true,
        args: ['--no-first-run', '--no-default-browser-check'],
      }),
      launchCloakBrowserPersistentContext({
        userDataDir: dir2,
        headless: true,
        humanize: true,
        args: ['--no-first-run', '--no-default-browser-check'],
      }),
    ]);

    assert.ok(ctx1, 'Luồng 1 (Context 1) phải chạy được');
    assert.ok(ctx2, 'Luồng 2 (Context 2) phải chạy được');

    const p1 = ctx1.pages()[0] || await ctx1.newPage();
    const p2 = ctx2.pages()[0] || await ctx2.newPage();

    await Promise.all([
      p1.goto('data:text/html,<html><body>Slot 1 Data</body></html>'),
      p2.goto('data:text/html,<html><body>Slot 2 Data</body></html>'),
    ]);

    const [t1, t2] = await Promise.all([
      p1.evaluate(() => document.body.innerText),
      p2.evaluate(() => document.body.innerText),
    ]);

    assert.equal(t1, 'Slot 1 Data');
    assert.equal(t2, 'Slot 2 Data');
  } finally {
    if (ctx1) await ctx1.close().catch(() => {});
    if (ctx2) await ctx2.close().catch(() => {});
    await removeProfileDir(dir1);
    await removeProfileDir(dir2);
  }
});
