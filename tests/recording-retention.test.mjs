import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, utimes, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pruneStoredRecordings } from '../src/logging/recorder/prune-stored-recordings.mjs';

/**
 * Tạo file recorder giả theo tuổi, không dùng thư mục log hay dữ liệu thực của app.
 * @param {string} directory Thư mục fixture.
 * @param {string} name Tên file cần tạo.
 * @param {number} ageDays Tuổi file theo ngày.
 * @return {Promise<string>} Đường dẫn file fixture.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function recordingFile(directory, name, ageDays) {
  const path = join(directory, name);
  await writeFile(path, 'recording-data');
  const date = new Date(Date.now() - ageDays * 86_400_000);
  await utimes(path, date, date);
  return path;
}

test('retention giữ phiên đang chạy/có ghi chú; chỉ xóa phiên và orphan quá hạn', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'autolead-retention-'));
  try {
    const old = await recordingFile(directory, 'manual-ops-old.jsonl', 10);
    const active = await recordingFile(directory, 'manual-ops-active.jsonl', 10);
    const pinned = await recordingFile(directory, 'manual-ops-pinned.jsonl', 10);
    const orphan = await recordingFile(directory, 'manual-ops-orphan.jsonl', 10);
    const temporary = await recordingFile(directory, 'browser-logs.json.aaaaaaaa-aaaa.tmp', 2);
    const unknown = await recordingFile(directory, 'preferences.sqlite', 10);
    const endedAt = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const sessions = [{ id: 'old', endedAt }, { id: 'active', endedAt }, { id: 'pinned', endedAt, feedback: [{ eventId: 'one' }] }];
    const result = await pruneStoredRecordings({ directory, sessions, activeIds: new Set(['active']) });
    assert.deepEqual(sessions.map(session => session.id), ['active', 'pinned']);
    assert.equal(result.removedFiles, 3);
    for (const path of [old, orphan, temporary]) await assert.rejects(access(path));
    for (const path of [active, pinned, unknown]) await access(path);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('retention theo dung lượng dọn phiên cũ trước; không theo symlink ra ngoài logs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'autolead-retention-'));
  try {
    const outside = join(directory, 'outside.html');
    await writeFile(outside, 'must keep');
    await mkdir(join(directory, 'html'));
    await symlink(directory, join(directory, 'html/offer-1'));
    await recordingFile(directory, 'manual-ops-old.jsonl', 3);
    const recent = await recordingFile(directory, 'manual-ops-recent.jsonl', 2);
    const sessions = [
      { id: 'old', endedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
      { id: 'recent', endedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
    ];
    const result = await pruneStoredRecordings({ directory, sessions, activeIds: new Set(), maxBytes: 15 });
    assert.equal(result.removedSessions, 1);
    assert.equal(sessions[0].id, 'recent');
    await access(recent); await access(outside);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('retention không xóa bằng chứng nếu ghi metadata trước khi dọn thất bại', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'autolead-retention-'));
  try {
    const file = await recordingFile(directory, 'manual-ops-old.jsonl', 10);
    const session = { id: 'old', endedAt: new Date(Date.now() - 10 * 86_400_000).toISOString() };
    const sessions = [session];
    const result = await pruneStoredRecordings({ directory, sessions, activeIds: new Set(), persist: async () => false });
    assert.equal(result.removedSessions, 0);
    assert.equal(sessions[0], session);
    await access(file);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('trần file dọn orphan nhỏ mới trong ngày nhưng giữ file đang ghi và phiên có feedback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'autolead-retention-count-'));
  try {
    const old = await recordingFile(directory, 'manual-ops-orphan-old.jsonl', 0.5);
    const newer = await recordingFile(directory, 'manual-ops-orphan-new.jsonl', 0.25);
    const fresh = await recordingFile(directory, 'manual-ops-fresh.jsonl', 0);
    const active = await recordingFile(directory, 'manual-ops-active.jsonl', 2);
    const pinned = await recordingFile(directory, 'manual-ops-pinned.jsonl', 2);
    const sessions = [{ id: 'active' }, { id: 'pinned', feedback: [{ note: 'keep' }] }];
    const result = await pruneStoredRecordings({ directory, sessions, activeIds: new Set(['active']), maxFiles: 3 });
    assert.equal(result.removedFiles, 2);
    for (const path of [old, newer]) await assert.rejects(access(path));
    for (const path of [fresh, active, pinned]) await access(path);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('HTML toàn trang mặc định tắt; debug hết hạn hoặc đủ 10 MB không lấy thêm content', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { attachFullHtmlLoggerToPage } from './src/logging/html-capture/attach-full-html-logger-to-page.mjs';
    import { logFullPageHtml } from './src/logging/html-capture/log-full-page-html.mjs';
    import { moduleState } from './src/logging/html-capture/state/module-state.mjs';
    import { isFullHtmlDebugEnabled } from './src/logging/html-capture/is-full-html-debug-enabled.mjs';
    let contents = 0, listeners = 0;
    const page = { isClosed: () => false, on: () => { listeners++; }, content: async () => { contents++; return '<html></html>'; } };
    if (process.env.AUTOLEADPC_FULL_HTML_DEBUG !== '1') {
      attachFullHtmlLoggerToPage(page);
      logFullPageHtml(page);
      assert.equal(listeners, 0);
    } else {
      moduleState.fullHtmlBytes = 10 * 1024 * 1024;
      logFullPageHtml(page);
      const now = Date.now();
      Date.now = () => now + 601000;
      assert.equal(isFullHtmlDebugEnabled(), false);
      moduleState.fullHtmlBytes = 0;
      logFullPageHtml(page);
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(contents, 0);
  `;
  for (const enabled of ['0', '1']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, AUTOLEADPC_FULL_HTML_DEBUG: enabled }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});
