// Chạy tay: node tests/manual/continuous-agy-smoke.mjs
// Dùng agy THẬT (tốn một ít quota) trên trang fixture cục bộ, không truy cập website/lead thật.
import { chromium } from 'playwright';
import { startContinuousAgent, stopContinuousAgent, getContinuousAgentState } from '../../src/continuous-agent/index.mjs';

const html = (step) => `<form id="f">${step === 1
  ? '<input name="email" id="email" type="email" placeholder="Email"><input name="firstname" id="fname" placeholder="First name">'
  : '<input name="zip" id="zip" placeholder="ZIP code"><label><input type="checkbox" id="agree"> I agree</label>'}</form>`;
let step = 1;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html(step) }));
const page = await context.newPage();
await page.goto('https://smoke.test/offer');
const logs = [];
const session = { isClosed: false, addLog: entry => { logs.push(entry); console.log('[log]', entry.type, entry.detail || ''); }, triggerAutofillScan: () => {} };
const record = { email: 'smoke@example.test', firstname: 'Smoke', zip: '10001' };
const agent = startContinuousAgent(page, () => record, session, { aiConfig: { enabled: true, mode: 'continuous', cliBinary: 'agy', timeoutSeconds: 120 } });
const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 500)); } return false; };
const ok1 = await until(async () => (await page.inputValue('#email')) === record.email && (await page.inputValue('#fname')) === record.firstname, 150000);
console.log('Màn 1 điền đúng:', ok1, getContinuousAgentState(page));
step = 2; await page.goto('https://smoke.test/offer2'); // website chuyển bước
const ok2 = await until(async () => (await page.inputValue('#zip')) === record.zip, 150000);
console.log('Màn 2 điền đúng:', ok2, getContinuousAgentState(page));
const convo = agent.transport.conversationId;
stopContinuousAgent(page, 'smoke_done');
await agent.done;
console.log('Một hội thoại xuyên suốt:', Boolean(convo), convo, '| turns:', agent.turnCount, '| actions:', agent.actionCount);
await browser.close();
process.exit(ok1 && ok2 ? 0 : 1);
