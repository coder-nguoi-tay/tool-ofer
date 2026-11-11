import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const sourceDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const applicationName = 'AutoLeadPC Mac 2 AdsPower.app';

/**
 * Cô lập quy trình đóng gói vào thư mục tạm, dùng compiler/signing giả để không thay app thật.
 * @param {object} context Test context sở hữu thư mục tạm.
 * @return {object} Source fixture, nơi cài app và môi trường công cụ giả.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
function createBuildFixture(context) {
  const directory = mkdtempSync(join(tmpdir(), 'AutoLeadPC-build-test-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const applications = join(directory, 'Applications');
  const commands = join(directory, 'commands');
  mkdirSync(applications);
  mkdirSync(commands);
  const rootFiles = ['AutoLeadPCMacApp.swift', 'AutoLeadPC2.icns', 'autoleadpc-icon.svg', 'app.mjs', 'autofill.mjs', 'option-scorer.mjs', 'observer.mjs', 'analyze-ops.mjs', 'stealth.mjs', 'cloakbrowser-engine.mjs', 'survey-solver.mjs', 'ai-assist.mjs', 'lead-check.mjs', 'chrome-versions.mjs', 'adspower-profile.mjs', 'codex-form-agent.mjs', 'local-profile-engine.mjs', 'playwright-mcp-human.cjs', 'pc-app.png', 'package.json', 'package-lock.json', 'relay.mjs', 'useragents.txt', 'QA_TEST_CASES.md', 'README.md', 'tgbot.mjs', 'tunnel.mjs', 'mcp-server.mjs', 'script.mjs', 'captcha.mjs'];
  for (const name of rootFiles) cpSync(join(sourceDirectory, name), join(directory, name));
  for (const folder of ['src', 'ui', 'tests', 'mock-pages', 'Config/Browser', 'Config/Settings', 'node_modules', 'runtime-node']) mkdirSync(join(directory, folder), { recursive: true });
  for (const feature of ['desktop', 'mac', 'mini', 'replay']) {
    mkdirSync(join(directory, 'ui', feature));
    writeFileSync(join(directory, 'ui', feature, 'index.html'), `<html>${feature}</html>`);
  }
  writeFileSync(join(directory, 'Config/Settings/Settings.ini'), 'private fixture settings');
  writeFileSync(join(directory, 'Config/Browser/template.json'), '{}');
  writeFileSync(join(directory, 'runtime-node/node'), 'fixture runtime');
  const buildScript = readFileSync(join(sourceDirectory, 'build-app.sh'), 'utf8').replaceAll('/Applications', applications);
  assert.doesNotMatch(buildScript, /\$(?:\{)?HOME\b|\b(?:zip|rsync)\b/, 'Build chỉ được ghi vào đích cố định đã cô lập');
  writeFileSync(join(directory, 'build-app.sh'), buildScript);
  writeFileSync(join(commands, 'swiftc'), '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do if [ "$1" = "-o" ]; then shift; printf "fixture binary" > "$1"; exit; fi; shift; done\n', { mode: 0o755 });
  writeFileSync(join(commands, 'codesign'), '#!/bin/sh\n[ "${FAIL_SIGNING:-0}" != "1" ]\n', { mode: 0o755 });
  writeFileSync(join(commands, 'iconutil'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  writeFileSync(join(commands, 'xattr'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(commands, 'mv'), '#!/bin/sh\nif [ "${FAIL_INSTALL:-0}" = "1" ] && [ "$2" = "$TEST_INSTALLED_APP" ] && [ "${1##*/}" != "previous.app" ]; then exit 1; fi\nexec /bin/mv "$@"\n', { mode: 0o755 });
  const installed = join(applications, applicationName);
  return { directory, applications, installed, env: { ...process.env, PATH: commands + ':' + process.env.PATH, TEST_INSTALLED_APP: installed } };
}

test('build lặp chỉ thay một app cố định, không giữ ZIP hoặc backup và không chép settings', context => {
  const fixture = createBuildFixture(context);
  for (const version of ['first', 'latest']) {
    writeFileSync(join(fixture.directory, 'app.mjs'), version);
    const result = spawnSync('bash', ['build-app.sh'], { cwd: fixture.directory, env: fixture.env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(readFileSync(join(fixture.installed, 'Contents/Resources/launcher/app.mjs'), 'utf8'), version);
    assert.deepEqual(readdirSync(fixture.applications), [applicationName]);
    assert.equal(existsSync(join(fixture.directory, applicationName)), false);
    assert.equal(existsSync(join(fixture.installed, 'Contents/Resources/launcher/Config/Settings')), false);
    for (const feature of ['desktop', 'mac', 'mini', 'replay']) {
      assert.equal(readFileSync(join(fixture.installed, 'Contents/Resources/launcher/ui', feature, 'index.html'), 'utf8'), `<html>${feature}</html>`);
    }
    assert.ok(existsSync(join(fixture.installed, 'Contents/Resources/runtime-node/node')));
    assert.ok(existsSync(join(fixture.installed, 'Contents/Resources/launcher/build-app.sh')));
    assert.ok(existsSync(join(fixture.installed, 'Contents/Resources/launcher/AutoLeadPCMacApp.swift')));
  }
});

test('build/sign thất bại giữ nguyên app đang cài và dọn staging', context => {
  const fixture = createBuildFixture(context);
  mkdirSync(fixture.installed);
  writeFileSync(join(fixture.installed, 'current-version'), 'keep');
  const result = spawnSync('bash', ['build-app.sh'], { cwd: fixture.directory, env: { ...fixture.env, FAIL_SIGNING: '1' }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(join(fixture.installed, 'current-version'), 'utf8'), 'keep');
  assert.deepEqual(readdirSync(fixture.applications), [applicationName]);
});

test('thay app thất bại phục hồi bản cũ và dọn backup tạm', context => {
  const fixture = createBuildFixture(context);
  mkdirSync(fixture.installed);
  writeFileSync(join(fixture.installed, 'current-version'), 'restore');
  const result = spawnSync('bash', ['build-app.sh'], { cwd: fixture.directory, env: { ...fixture.env, FAIL_INSTALL: '1' }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(join(fixture.installed, 'current-version'), 'utf8'), 'restore');
  assert.deepEqual(readdirSync(fixture.applications), [applicationName]);
});
