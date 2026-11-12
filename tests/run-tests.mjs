import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Danh sách các file test cần chạy song song bằng `node --test`.
 *
 * Danh sách nằm ở một nơi duy nhất thay vì trong package.json, để `build-app.sh`
 * và môi trường chạy thật dùng cùng một nguồn — trước đây gói `.app` thiếu
 * `multi-tab-ai.test.mjs` nên test biến mất trong im lặng.
 *
 * @type {string[]}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
const TEST_FILES = [
  'adsmith-yes-except-dove.test.mjs',
  'submit-validation-dialog.test.mjs',
  'custom-gender-buttons.test.mjs',
  'birthday-field.test.mjs',
  'adsmith-no-continue.test.mjs',
  'yes-no-step-advance.test.mjs',
  'submit-navigation-wait.test.mjs',
  'adsmith-no-speed.test.mjs',
  'http-polling-log.test.mjs',
  'select-navigation.test.mjs',
  'adsmith-focus-loop.test.mjs',
  'closed-target-error.test.mjs',
  'toffers-point-stability.test.mjs',
  'financialhelp-paththankyou.test.mjs',
  'record-proxy-outcome.test.mjs',
  'legal-link-submit.test.mjs',
  'log-routing.test.mjs',
  'excluded-offer-once.test.mjs',
  'log-evidence-efficiency.test.mjs',
  'unique-offer-tabs.test.mjs',
  'ai-completion-survey-regression.test.mjs',
  'lead-wait-policy.test.mjs',
  'late-progress-recovery.test.mjs',
  'yes-no-fallback.test.mjs',
  'financialhelp-autofill.test.mjs',
  'financialhelp-completion.test.mjs',
  'screen-debug.test.mjs',
  'lead-observe-after-email.test.mjs',
  'recorder-log-policy.test.mjs',
  'recording-retention.test.mjs',
  'browser-load-policy.test.mjs',
  'non-offer-slot-release.test.mjs',
  'survey-verification.test.mjs',
  'first-slot-mouse.test.mjs',
  'autofill-stall-recovery.test.mjs',
  'ai-queue-capacity.test.mjs',
  'data-saver-background.test.mjs',
  'manual-answer-regression.test.mjs',
  'record-repair-policy.test.mjs',
  'semantic-blocks.test.mjs',
  'spa-progress.test.mjs',
  'single-app-build.test.mjs',
  'ai-visible-state.test.mjs',
  'ai-action-target.test.mjs',
  'form-scope-recovery.test.mjs',
  'adsmith-no-survey.test.mjs',
  'twy-scoped-survey.test.mjs',
  'scoped-question-widgets.test.mjs',
  'active-form-submit.test.mjs',
  'active-form-flow.test.mjs',
  'browser-recorder.test.mjs',
  'submit-form-visibility.test.mjs',
  'confirmed-lead-protection.test.mjs',
  'address-suggestion.test.mjs',
  'telegram-command-routing.test.mjs',
  'http-routes.test.mjs',
  'module-storage.test.mjs',
  'ui-assets.test.mjs',
  'proxy-queue-manual-import.test.mjs',
  'adspower-profile.test.mjs',
  'bandwidth-tracker.test.mjs',
  'screencast.test.mjs',
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
  'mock-pages/alphaintent-sweepstakes.test.mjs',
  'mock-pages/field-matching.test.mjs',
  'mock-pages/reg-container.test.mjs',
  'proxy-stop.test.mjs',
  'no-lead-auto-refill.test.mjs',
  'screen-view.test.mjs',
  'script.test.mjs',
  'stealth.test.mjs',
  'survey-semantic.test.mjs',
  'survey-solver.test.mjs',
  'toffers-lead.test.mjs',
  'toffers-duplicate-close.test.mjs',
  'proxy711-balance.test.mjs',
  'data-saver.test.mjs',
  'tgbot-features.test.mjs',
  'auto-refill-proxy-fix.test.mjs',
  'tg-miniapp.test.mjs',
  'soi-coreg-freeze.test.mjs',
];

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = dirname(testsDirectory);
const applicationSupportDirectory = join(homedir(), 'Library', 'Application Support');
mkdirSync(applicationSupportDirectory, { recursive: true });
const testDataDirectory = mkdtempSync(join(applicationSupportDirectory, 'AutoLeadPC-tests-'));
const testEnvironment = { ...process.env, AUTOLEADPC_DATA_DIR: basename(testDataDirectory) };
process.on('exit', () => rmSync(testDataDirectory, { recursive: true, force: true }));
/**
 * Xác định đường dẫn tuyệt đối của bài kiểm tra trong thư mục tests.
 * @param {string} fileName Tên bài kiểm tra hoặc đường dẫn con.
 * @return {string} Đường dẫn file kiểm tra.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function resolveTestPath(fileName) {
  return join(testsDirectory, fileName);
}

/**
 * Chạy một lệnh con, luôn trả về mã thoát (không bao giờ null).
 *
 * @param {string[]} args Các tham số truyền cho Node.
 * @return {number} Mã thoát của tiến trình con (1 nếu tiến trình chết không rõ lý do).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: projectDirectory, env: testEnvironment });
  return result.status ?? 1;
}

// `node --test` in ra "Could not find ..." nhưng VẪN exit code 0 khi thiếu file,
// khiến test bị mất mà không ai biết. Kiểm tra trước để fail rõ ràng.
const missing = TEST_FILES.filter((name) => !existsSync(resolveTestPath(name)));
if (missing.length > 0) {
  console.error(`[test] Thiếu file test: ${missing.join(', ')}`);
  process.exit(1);
}

const selfcheckExit = run([resolveTestPath('selfcheck.mjs')]);
if (selfcheckExit !== 0) {
  process.exit(selfcheckExit);
}

const testExit = run(['--test', ...TEST_FILES.map((name) => resolveTestPath(name))]);
process.exit(testExit);
