import { reportSelectMismatch } from '../src/autofill/report-select-mismatch.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { FINANCIALHELP_STEP_FIXTURE } from './mock-pages/financialhelp-step-fixture.mjs';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { inspectAndFixFormWithAi } from '../src/ai-assist/inspect-and-fix-form-with-ai.mjs';
import { moduleState } from '../src/ai-assist/state/module-state.mjs';
import { MAX_CONCURRENT_AGT } from '../src/ai-assist/state/max-concurrent-agt.mjs';

const skip = !existsSync(chromium.executablePath());
test('form FinancialHelpFinder trong iframe đi qua tên/DOB/Yes-No/địa chỉ/liên hệ, không mượn nút trang cha', { skip }, async t => {
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  for (const allVisible of [false, true]) await t.test(allVisible ? 'CSS chưa tải: vẫn đi theo bước đầu còn hiển thị' : 'CSS ẩn đúng các bước kế tiếp', async () => {
    const { context, page, session } = await createFormScopeFixture(browser, '<form id="AS_LOAD_FORM"><input type="hidden" name="token"><iframe id="AS_IFRAME" style="width:800px;height:600px"></iframe></form><button id="parent-next">Continue</button>');
    try {
      const body = allVisible ? FINANCIALHELP_STEP_FIXTURE.replace('[id^=sign_up_step]{display:none', '[id^=sign_up_step]{display:block') : FINANCIALHELP_STEP_FIXTURE;
      await context.route('**/survey', route => route.fulfill({ contentType: 'text/html', body }));
      await page.locator('#AS_IFRAME').evaluate(element => { element.src = 'https://form-scope.test/survey'; });
      await page.waitForFunction(() => document.querySelector('iframe').contentWindow !== null);
      let frame;
      for (let attempt = 0; attempt < 100; attempt++) {
        frame = page.frames().find(item => item.url().endsWith('/survey'));
        if (frame && await frame.locator('#fname_input').count()) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      Object.assign(session, { slot: 2, exitIp: '192.0.2.70', leadCheckStatus: 'confirmed' });
      const record = { firstname: 'Ada', lastname: 'Lovelace', title: 'Ms.', dob: '1990-08-15', address: '123 Main St', zipcode: '02108', email: 'ada@example.invalid', phone: '2025550100' };
      const scan = () => fillPageForms(page, { session, sessionRecord: record, options: { autoSubmit: true, simulateTypo: false }, triggerLeadCheckAfterEmail() { throw new Error('Không check lại IP confirmed'); } });
      await scan();
      assert.equal(page._activeAutofillFrame, frame);
      assert.equal(await frame.locator('#fname_input').inputValue(), 'Ada');
      assert.equal(await frame.locator('#dob').inputValue(), '');
      assert.equal(await frame.locator('#address').inputValue(), '');
      for (let pass = 0; pass < 15 && await frame.locator('#reg-data').getAttribute('data-sent') !== '1'; pass++) await scan();
      assert.equal(await frame.locator('#reg-data').getAttribute('data-sent'), '1');
      assert.equal(session.leadCheckStatus, 'confirmed');
      assert.equal(await frame.locator('#dob').inputValue(), '1990-08-15');
      assert.equal(await frame.locator('#zip_code').inputValue(), '02108');
      assert.equal(await frame.locator('#email').inputValue(), 'ada@example.invalid');
      assert.equal(await page.locator('#parent-next').getAttribute('data-ux-clicked'), null);
    } finally { await context.close(); }
  });
});

test('AI repair khi đủ chỗ chạy phải xếp hàng; timeout không tiêu lượt retry hoặc nhả nhầm chỗ AI', { skip }, async t => {
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<form><input required name="firstname"></form>');t.after(() => context.close());
  const previous = moduleState.agtRunningCount; t.after(() => { moduleState.agtRunningCount = previous; moduleState.agtWaiters.length = 0; });
  moduleState.agtRunningCount = MAX_CONCURRENT_AGT;
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  const logs = [];
  const result = await inspectAndFixFormWithAi(page, { firstname: 'Ada' }, { slot: 1, exitIp: '192.0.2.71', leadCheckStatus: 'confirmed' }, { aiConfig: { enabled: true, mode: 'auto_on_stuck' }, onLog: event => { logs.push(event); if (event.type === 'ai_queued') now += 16000; } });
  assert.equal(result.status, 'queue_timeout');
  assert.equal(moduleState.agtRunningCount, MAX_CONCURRENT_AGT);
  assert.equal(page._aiFormFixing, false);
  assert.equal(page._aiFormRepairRetry, undefined);
  assert.ok(logs.some(event => event.type === 'ai_queued' && event.detail.includes('ưu tiên IP')));
  assert.equal(moduleState.agtWaiters.length, 0);
});


test('dropdown không khớp record chỉ ghi một lý do chờ cho cùng trạng thái', () => {
  const events = [], frame = { url: () => 'https://fixture.test/form' };
  const metadata = { id: 'cq2', options: [{ value: '', text: 'Choose' }, { value: 'one', text: 'One' }] };
  const options = { onLog: event => events.push(event) };
  reportSelectMismatch(frame, metadata, ['missing'], { reason: 'option_unmatched' }, options, frame);
  reportSelectMismatch(frame, metadata, ['missing'], { reason: 'option_unmatched' }, options, frame);
  assert.equal(events.length, 1);
  assert.match(events[0].detail, /record/);
  metadata.options.push({ value: 'two', text: 'Two' });
  reportSelectMismatch(frame, metadata, ['missing'], { reason: 'option_unmatched' }, options, frame);
  assert.equal(events.length, 2);
});
