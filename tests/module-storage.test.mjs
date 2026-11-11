import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/**
 * Chạy kiểm tra lưu trữ với HOME tạm để không đụng dữ liệu đang dùng trên máy.
 * @param {string} source Mã kiểm tra chạy trong tiến trình riêng.
 * @return {void} Xác nhận tiến trình hoàn tất thành công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function checkWithTemporaryHome(source) {
  const homeDirectory = mkdtempSync(join(tmpdir(), 'autolead-storage-'));
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
      cwd: new URL("../", import.meta.url),
      env: { ...process.env, HOME: homeDirectory, AUTOLEADPC_INSTANCE: '1', AUTOLEADPC_DATA_DIR: 'AutoLeadPC-test' },
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(homeDirectory, { recursive: true, force: true });
  }
}

test('email: nạp lô đồng thời không trùng, lưu/khôi phục và không cấp lại email bị từ chối', () => {
  checkWithTemporaryHome(String.raw`
    import assert from 'node:assert/strict';
    import { mkdir, writeFile, readFile } from 'node:fs/promises';
    import { join } from 'node:path';
    import { appDataDirectory } from './src/config/paths.mjs';
    import * as email from './src/queues/email.mjs';
    await mkdir(appDataDirectory, { recursive: true });
    const sourcePath = join(process.env.HOME, 'emails.txt');
    await writeFile(sourcePath, 'alice.test@example.com|password\nalice.test@example.com\nbob.test@example.com\n');
    Object.assign(email.emailAutoRefill, { sourcePath, batchSize: 100 });
    const first = email.refillEmailBatchFromSource();
    assert.equal(first, email.refillEmailBatchFromSource());
    assert.equal(await first, 2);
    assert.deepEqual(email.emailQueue.available, ['alice.test@example.com', 'bob.test@example.com']);
    email.rejectEmail('alice.test@example.com');
    await email.saveEmailQueue();
    email.emailQueue.available.length = 0;
    await email.loadEmailQueue();
    const saved = JSON.parse(await readFile(email.emailQueuePath, 'utf8'));
    assert.deepEqual(saved.rejected, ['alice.test@example.com']);
    assert.equal(email.dequeueNextEmail(), 'bob.test@example.com');
    assert.equal(email.dequeueNextEmail(), 'bob.test@example.com');
    assert.ok(!email.emailQueue.used.includes('alice.test@example.com'));
  `);
});

test('cấu hình AI và Telegram lưu/đọc trong đúng thư mục instance', () => {
  checkWithTemporaryHome(String.raw`
    import assert from 'node:assert/strict';
    import { mkdir, writeFile } from 'node:fs/promises';
    import { join } from 'node:path';
    import * as paths from './src/config/paths.mjs';
    import * as ai from './src/config/ai.mjs';
    import * as telegram from './src/config/telegram.mjs';
    assert.equal(paths.getAutoLeadPCDir(), join(process.env.HOME, 'Downloads', 'AutoLeadPC'));
    await mkdir(join(process.env.HOME, '.autoleadpc'));
    assert.equal(paths.getAutoLeadPCDir(), join(process.env.HOME, '.autoleadpc'));
    assert.equal(ai.saveAiConfigFile({ enabled: true }).success, true);
    assert.equal(ai.loadAiConfig().enabled, true);
    await writeFile(ai.getAiConfigFilePath(), '{invalid');
    assert.equal(ai.loadAiConfig().enabled, true);
    await telegram.saveTelegramConfig({ botToken: ' test-token ', allowedUserId: 42 });
    assert.deepEqual(await telegram.loadTelegramConfig(), { botToken: 'test-token', allowedUserId: 42, notifyChatId: 42 });
    assert.ok(telegram.getTelegramConfigPath().startsWith(paths.appDataDirectory));
  `);
});

test('log: lưu/khôi phục lịch sử và chỉ xoá dữ liệu của offer được chọn', () => {
  checkWithTemporaryHome(String.raw`
    import assert from 'node:assert/strict';
    import { mkdir, writeFile, access } from 'node:fs/promises';
    import { join } from 'node:path';
    import * as logs from './src/logging/browser-logs.mjs';
    for (const offer of [1, 2]) {
      const folder = join(logs.interactionHtmlDirectory, 'offer-' + offer);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, 'page.html'), '<html></html>');
      logs.persistedBrowserLogs.push({ id: String(offer), offer, logs: [] });
    }
    await logs.savePersistedBrowserLogs();
    logs.persistedBrowserLogs.length = 0;
    await logs.loadPersistedBrowserLogs();
    assert.equal(logs.persistedBrowserLogs.length, 2);
    assert.equal(await logs.countSavedHtmlFiles(), 2);
    assert.equal((await logs.clearAllLogsAndHtml(1)).success, true);
    assert.deepEqual(logs.persistedBrowserLogs.map(row => row.offer), [2]);
    assert.equal(await logs.countSavedHtmlFiles(), 1);
    await access(join(logs.interactionHtmlDirectory, 'offer-2', 'page.html'));
  `);
});

test('711Proxy: lưu cấu hình vào dữ liệu người dùng, giữ nguyên resources và các mục INI khác', () => {
  checkWithTemporaryHome(String.raw`
    import assert from 'node:assert/strict';
    import { mkdir, readFile, writeFile } from 'node:fs/promises';
    import { join, dirname } from 'node:path';
    import { appDataDirectory } from './src/config/paths.mjs';
    import { proxy711, saveProxy711Config, loadProxy711Config } from './src/proxy/provider711.mjs';
    const resourceSettings = new URL('./Config/Settings/Settings.ini', import.meta.url);
    const resourceBefore = await readFile(resourceSettings, 'utf8').catch(() => null);
    const userSettings = join(appDataDirectory, 'Config', 'Settings', 'Settings.ini');
    await mkdir(dirname(userSettings), { recursive: true });
    await writeFile(userSettings, '[Browser]\nMode=Chrome\n');
    Object.assign(proxy711, { username: 'fixture-user', passwd: 'fixture-password' });
    await saveProxy711Config();
    const userIni = await readFile(userSettings, 'utf8');
    assert.ok(userIni.includes('[Browser]\nMode=Chrome'));
    assert.ok(userIni.includes('[Proxy711]'));
    assert.ok(userIni.includes('Username=fixture-user'));
    const resourceAfter = await readFile(resourceSettings, 'utf8').catch(() => null);
    assert.ok(resourceBefore === resourceAfter, 'Không được thay đổi Settings.ini trong resources');
    Object.assign(proxy711, { username: '', passwd: '' });
    await loadProxy711Config();
    assert.equal(proxy711.username, 'fixture-user');
    assert.equal(proxy711.passwd, 'fixture-password');
  `);
});
