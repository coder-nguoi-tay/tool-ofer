import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { validateTargetUrl, redactSecrets, runCodexFormAgent } from './codex-form-agent.mjs';
import { getAgtSpawnConfig } from './ai-assist.mjs';

test('getAgtSpawnConfig maps codex_mcp to codex and provides augmented PATH', () => {
  const config = getAgtSpawnConfig('codex_mcp');
  assert.equal(config.bin, 'codex');
  assert.ok(config.env.PATH.includes('/opt/homebrew/bin'));
});

test('validateTargetUrl chỉ chấp nhận giao thức http và https', () => {
  const httpUrl = validateTargetUrl('http://example.com/test');
  assert.equal(httpUrl.protocol, 'http:');

  const httpsUrl = validateTargetUrl('https://www.selenium.dev/selenium/web/web-form.html');
  assert.equal(httpsUrl.protocol, 'https:');

  assert.throws(() => validateTargetUrl('file:///etc/passwd'), /Giao thức không được phép/);
  assert.throws(() => validateTargetUrl('javascript:alert(1)'), /Giao thức không được phép/);
  assert.throws(() => validateTargetUrl('ftp://example.com'), /Giao thức không được phép/);
  assert.throws(() => validateTargetUrl(''), /URL trang đích không hợp lệ/);
});

test('validateTargetUrl kiểm tra nghiêm ngặt domainAllowlist khi được chỉ định', () => {
  const allowlist = ['selenium.dev', 'getfly.vn'];

  assert.equal(validateTargetUrl('https://www.selenium.dev/form', allowlist).hostname, 'www.selenium.dev');
  assert.equal(validateTargetUrl('https://getfly.vn/login', allowlist).hostname, 'getfly.vn');

  assert.throws(
    () => validateTargetUrl('https://untrusted-site.com/form', allowlist),
    /không nằm trong danh sách cho phép/
  );
});

test('redactSecrets lọc sạch CDP WebSocket endpoint, mật khẩu và API token', () => {
  const rawLog = 'Connected to ws://127.0.0.1:50325/devtools/browser/abc-123 with Bearer secret-token-123456789 and password=SuperSecretPassword123';
  const redacted = redactSecrets(rawLog);

  assert.ok(!redacted.includes('abc-123'));
  assert.ok(!redacted.includes('secret-token-123456789'));
  assert.ok(!redacted.includes('SuperSecretPassword123'));
  assert.ok(redacted.includes('ws://[REDACTED_CDP_ENDPOINT]'));
  assert.ok(redacted.includes('Bearer [REDACTED_API_KEY]'));
  assert.ok(redacted.includes('password=[REDACTED]'));
});

test('runCodexFormAgent báo lỗi khi thiếu CDP WebSocket endpoint', async () => {
  await assert.rejects(
    runCodexFormAgent({
      endpoint: '',
      targetUrl: 'https://example.com',
    }),
    /Thiếu CDP WebSocket endpoint/
  );
});

test('playwright-mcp-human.cjs thực thi hợp lệ và hỗ trợ cờ --cdp-endpoint', () => {
  const script = join(process.cwd(), 'playwright-mcp-human.cjs');
  const result = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('--cdp-endpoint'));
  assert.ok(result.stdout.includes('Playwright MCP (Human Mode)'));
});
