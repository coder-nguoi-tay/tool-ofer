import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { isLeadWaitEnabled } from '../src/autofill/is-lead-wait-enabled.mjs';
import { shouldPauseForLead } from '../src/autofill/should-pause-for-lead.mjs';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';
import { trackFrameScreen } from '../src/autofill/track-frame-screen.mjs';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';

test('chờ lead chỉ bật khi opt-in; cờ tắt luôn thắng và không xóa lead đã có', () => {
  assert.equal(isLeadWaitEnabled({}), false);
  assert.equal(isLeadWaitEnabled({ enableLeadCheck: true }), true);
  for (const options of [{}, { enableLeadCheck: true }, { enableLeadCheck: false }]) {
    const session = { enableLeadCheck: false, leadCheckStatus: 'checking', leadCheckTriggered: true };
    assert.equal(shouldPauseForLead(session, options), false);
    assert.equal(session.leadCheckStatus, 'checking');
  }
  assert.equal(shouldPauseForLead({ enableLeadCheck: true, leadCheckStatus: 'checking' }, { enableLeadCheck: false }), false);
  assert.equal(shouldPauseForLead({ enableLeadCheck: true, leadCheckStatus: 'checking' }), true);
  assert.equal(shouldPauseForLead({ enableLeadCheck: true, leadCheckStatus: 'failed' }), true);
  assert.equal(shouldPauseForLead({ enableLeadCheck: true, leadCheckStatus: 'confirmed', screen5LeadVerified: true, leadCheckTriggered: true }), false);
});

test('Jump Page không bật cờ chờ khi phiên tắt chờ lead, bật thì vẫn chờ', async () => {
  for (const enabled of [false, true]) {
    const session = { enableLeadCheck: enabled, emailFilled: true };
    let checks = 0;
    const paused = await trackFrameScreen({ session, screenInfo: { isJumpPage: true }, frameProgress: {}, options: { onEmailSubmitted: () => { checks++; } } });
    assert.equal(paused, enabled);
    assert.equal(checks, enabled ? 1 : 0);
    assert.equal(session.leadCheckStatus, enabled ? 'checking' : undefined);
  }
});

test('checkbox tắt vẫn điền form thật khi còn cờ checking/failed; bật thì dừng', {
  skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium'
}, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const status of ['checking', 'failed']) {
    for (const enabled of [false, true]) {
      const { context, page, session } = await createFormScopeFixture(browser, '<form><label>First Name<input name="firstname"></label></form>');
      try {
        Object.assign(session, { enableLeadCheck: enabled, leadCheckStatus: status, leadCheckTriggered: true, screen5LeadCheckTriggered: true });
        await fillPageForms(page, { session, sessionRecord: { firstname: 'Ada' }, options: { autoSubmit: false, enableLeadCheck: enabled }, triggerLeadCheckAfterEmail() { throw new Error('Không được kích hoạt chờ'); } });
        assert.equal(await page.locator('input').inputValue(), enabled ? '' : 'Ada');
      } finally { await context.close(); }
    }
  }
});
