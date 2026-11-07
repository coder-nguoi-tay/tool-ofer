import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const relayPath = fileURLToPath(new URL('./relay.mjs', import.meta.url));
const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('relay.mjs chạy main khi gọi trực tiếp, kể cả qua symlink có dấu cách', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'autolead entry '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const linkPath = join(dir, 'relay link.mjs');
  symlinkSync(relayPath, linkPath);
  // File proxy không tồn tại: main có chạy thì báo lỗi và exit 1, không mở cổng nào.
  const run = spawnSync(process.execPath, [linkPath, join(dir, 'missing.txt')], { encoding: 'utf8' });
  assert.equal(run.status, 1, run.stderr);
});

test('import relay.mjs không kích hoạt main', () => {
  const code = `await import(${JSON.stringify(new URL('./relay.mjs', import.meta.url).href)});`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '');
});

test('entry point không phụ thuộc import.meta.main, vốn không có trên Node cũ', () => {
  for (const name of ['./app.mjs', './relay.mjs']) {
    assert.doesNotMatch(read(name), /^if \(import\.meta\.main\)/m, name);
  }
});

test('mcp-server và tgbot dùng cùng cổng mặc định với app', () => {
  const defaultPort = (name) => read(name).match(/AUTOLEADPC_PORT\) \|\| (\d+)/)?.[1];
  for (const name of ['./mcp-server.mjs', './tgbot.mjs']) {
    assert.equal(defaultPort(name), defaultPort('./app.mjs'), name);
  }
});
