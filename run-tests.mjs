import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Danh sách các file test cần chạy song song bằng `node --test`.
 *
 * Danh sách nằm ở một nơi duy nhất thay vì trong package.json, để `build-app.sh`
 * và môi trường chạy thật dùng cùng một nguồn — trước đây gói `.app` thiếu
 * `multi-tab-ai.test.mjs` nên test biến mất trong im lặng.
 *
 * @type {string[]}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
const TEST_FILES = [
  'adspower-profile.test.mjs',
  'bandwidth-tracker.test.mjs',
  'browser-profile-path.test.mjs',
  'browser-session-lifecycle.test.mjs',
  'check-duplicate.test.mjs',
  'chrome-profile-template.test.mjs',
  'chrome-versions.test.mjs',
  'form-reject.test.mjs',
  'cloakbrowser-engine.test.mjs',
  'codex-form-agent.test.mjs',
  'entry-point.test.mjs',
  'local-profile-engine.test.mjs',
  'multi-tab-ai.test.mjs',
  'option-scorer.test.mjs',
  'mock-pages/manual-screen-samples.test.mjs',
  'mock-pages/uplevel-funnel.test.mjs',
  'proxy-stop.test.mjs',
  'screen-view.test.mjs',
  'script.test.mjs',
  'stealth.test.mjs',
  'survey-semantic.test.mjs',
  'survey-solver.test.mjs',
  'toffers-lead.test.mjs',
];

const rootDir = dirname(fileURLToPath(import.meta.url));
const resolvePath = (name) => join(rootDir, name);

/**
 * Chạy một lệnh con, luôn trả về mã thoát (không bao giờ null).
 *
 * @param {string[]} args Các tham số truyền cho Node.
 * @return {number} Mã thoát của tiến trình con (1 nếu tiến trình chết không rõ lý do).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: rootDir });
  return result.status ?? 1;
}

// `node --test` in ra "Could not find ..." nhưng VẪN exit code 0 khi thiếu file,
// khiến test bị mất mà không ai biết. Kiểm tra trước để fail rõ ràng.
const missing = TEST_FILES.filter((name) => !existsSync(resolvePath(name)));
if (missing.length > 0) {
  console.error(`[test] Thiếu file test: ${missing.join(', ')}`);
  process.exit(1);
}

const selfcheckExit = run([resolvePath('selfcheck.mjs')]);
if (selfcheckExit !== 0) {
  process.exit(selfcheckExit);
}

const testExit = run(['--test', ...TEST_FILES.map((name) => resolvePath(name))]);
process.exit(testExit);
