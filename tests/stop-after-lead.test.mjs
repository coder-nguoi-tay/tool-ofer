import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

const directory = mkdtempSync(join(homedir(), 'Library/Application Support/AutoLeadPC-tests-stop-lead-'));
process.env.AUTOLEADPC_DATA_DIR = basename(directory);
const { shouldStopAfterLead } = await import('../src/autofill/should-stop-after-lead.mjs');
const { shouldPauseForLead } = await import('../src/autofill/should-pause-for-lead.mjs');
const { humanClick } = await import('../src/autofill/human-click.mjs');
const { humanMouseMove } = await import('../src/autofill/human-mouse-move.mjs');
const { humanWheelScroll } = await import('../src/autofill/human-wheel-scroll.mjs');
const { naturalMouseDrift } = await import('../src/autofill/natural-mouse-drift.mjs');
const { fillSelectOrTextField } = await import('../src/autofill/fill-select-or-text-field.mjs');
const { executeAction } = await import('../src/ai-assist/execute-action.mjs');
const { runAiAssist } = await import('../src/ai-assist/run-ai-assist.mjs');
const { inspectAndFixFormWithAi } = await import('../src/ai-assist/inspect-and-fix-form-with-ai.mjs');
const { waitForAiCapacity } = await import('../src/ai-assist/wait-for-ai-capacity.mjs');
const { resumeAutofillAfterAi } = await import('../src/browser/actions/resume-autofill-after-ai.mjs');
const { completeFinancialhelpSession } = await import('../src/leads/actions/complete-financialhelp-session.mjs');
const { runCodexFormAgent } = await import('../src/codex-form-agent/run-codex-form-agent.mjs');
const { Codex } = await import('@openai/codex-sdk');
const { getAutoRefillStatus } = await import('../src/refill/actions/get-auto-refill-status.mjs');
const { activeBrowsers } = await import('../src/browser/sessions.mjs');
const { createLeadTestSession } = await import('./helpers/lead-session-fixture.mjs');
test.after(() => rmSync(directory, { recursive: true, force: true }));

test('chỉ dừng IP có lead khi bật tùy chọn; cờ confirmed bền qua reload; bỏ tick chạy bình thường', () => {
  const session = { exitIp: '192.0.2.50', enableLeadCheck: true, stopAutofillOnLead: true };
  assert.equal(shouldStopAfterLead(session), false);
  session.leadCheckStatus = 'checking';
  assert.equal(shouldPauseForLead(session), true);
  session.leadCheckStatus = 'confirmed';
  assert.equal(shouldStopAfterLead(session), true);
  assert.equal(shouldPauseForLead(session), true);
  session.leadCheckStatus = null;
  session.screen5LeadVerified = false;
  assert.equal(shouldStopAfterLead(session), true);
  assert.equal(shouldPauseForLead(session, { enableLeadCheck: false }), false);
  session.stopAutofillOnLead = false;
  assert.equal(shouldStopAfterLead(session), false);
  assert.equal(shouldPauseForLead(session), false);
  assert.equal(session.confirmedLeadIp, '192.0.2.50');
});

test('có lead: không click/rê/cuộn, không chạy AI hoặc AI xếp hàng, không tự đóng browser hoàn tất', async () => {
  const session = { exitIp: '192.0.2.51', enableLeadCheck: true, stopAutofillOnLead: true, leadCheckStatus: 'confirmed', triggerAutofillScan: () => assert.fail('Không tiếp tục autofill') };
  const page = { _autofillSession: session, isClosed: () => false, locator: () => assert.fail('Không tìm target sau lead'),
    mouse: { move: () => assert.fail('Không rê'), wheel: () => assert.fail('Không cuộn'), down: () => assert.fail('Không click') } };
  assert.equal(await humanClick(page, { click: () => assert.fail('Không fallback click') }), false);
  await humanMouseMove(page, 100, 100);
  await humanWheelScroll(page, 200);
  await naturalMouseDrift(page);
  assert.equal((await executeAction(page, { action: 'click', selector: '#next' }, session)).reason, 'lead_confirmed_paused');
  await runAiAssist(page, {}, session, { aiConfig: { enabled: true } });
  assert.equal((await inspectAndFixFormWithAi(page, {}, session)).status, 'lead_confirmed_paused');
  assert.equal(await waitForAiCapacity(page, session, 'state'), 'page_changed');
  resumeAutofillAfterAi(page, session);
  assert.equal(await completeFinancialhelpSession(session, () => assert.fail('Không đóng browser đang dừng sau lead')), false);
});

test('lead về giữa lúc gõ: dừng ký tự tiếp theo và không lách sang fill fallback', async () => {
  const session = { exitIp: '192.0.2.52', enableLeadCheck: true, stopAutofillOnLead: true };
  const typed = [];
  const page = { _autofillSession: session, waitForTimeout: async () => {}, keyboard: {
    type: async character => { typed.push(character); session.leadCheckStatus = 'confirmed'; },
  } };
  const field = { focus: async () => {}, press: async () => {}, evaluate: async () => {},
    inputValue: async () => '', fill: () => assert.fail('Không fill sau lead') };
  await fillSelectOrTextField({ session, page, field, metadata: { type: 'text', names: ['firstname'] }, valueToFill: 'Alex', options: {}, frameProgress: {}, unmatchedFieldNames: new Set(), record: {} });
  assert.deepEqual(typed, ['A']);
});

test('bỏ tùy chọn dừng: IP có lead vẫn click bình thường', async () => {
  let clicks = 0;
  const page = { _autofillSession: { exitIp: '192.0.2.53', enableLeadCheck: true, stopAutofillOnLead: false, leadCheckStatus: 'confirmed' } };
  assert.equal(await humanClick(page, { click: async () => clicks++ }), true);
  assert.equal(clicks, 1);
});

test('lead về lúc xác minh target click: không lách sang click dự phòng', async () => {
  const session = { exitIp: '192.0.2.56', enableLeadCheck: true, stopAutofillOnLead: true };
  const page = { _autofillSession: session };
  const target = { evaluate: async () => { session.leadCheckStatus = 'confirmed'; return { ready: true }; }, click: () => assert.fail('Không click fallback sau khi có lead') };
  assert.equal(await humanClick(page, target), false);
});

test('giao diện hiển thị đã dừng sau lead, không báo đang tự điền vì còn callback AI cũ', () => {
  const { session } = createLeadTestSession('192.0.2.55');
  Object.assign(session, { enableLeadCheck: true, stopAutofillOnLead: true, leadCheckStatus: 'confirmed', aiAssistRunning: true });
  activeBrowsers.add(session);
  try {
    const state = getAutoRefillStatus().chromeSessions.find(row => row.slot === session.slot);
    assert.equal(state.autofillPausedForLead, true);
    assert.equal(state.aiRunning, false);
    assert.match(state.action, /đã dừng/);
  } finally { activeBrowsers.delete(session); }
});

test('Codex MCP đang chạy nhận abort khi lead về, không chờ hết timeout để nhả chuột', async t => {
  const session = { exitIp: '192.0.2.54', enableLeadCheck: true, stopAutofillOnLead: true };
  let signal;
  t.mock.method(Codex.prototype, 'startThread', () => ({
    runStreamed: async (_prompt, options) => {
      signal = options.signal;
      session.leadCheckStatus = 'confirmed';
      return { events: (async function* () {
        await new Promise(resolve => setTimeout(resolve, 150));
        if (signal.aborted) throw new Error('Aborted after lead');
        yield { type: 'turn.completed' };
      })() };
    },
  }));
  const result = await runCodexFormAgent({ session, endpoint: 'ws://127.0.0.1:12345', targetUrl: 'https://offer.test/form', timeoutMs: 10000, logger: () => {} });
  assert.equal(signal.aborted, true);
  assert.equal(result.status, 'lead_confirmed_paused');
});
