import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fillAlphaIntentSpecialFields, fillAlphaIntentFullName } from './autofill.mjs';

const logsDir = '/Users/codernguoitay/Library/Application Support/AutoLeadPC-2/logs/html/offer-1';
const f = 'offer1_2026-10-23T12-32-22-787_slot5_tab1_sweepstakesalerts.com_3ea9136d0dc1.html';
const html = readFileSync(join(logsDir,f), 'utf8');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'domcontentloaded' });

const record = { firstname: 'Test', lastname: 'User', fullname: 'Test User', email: 'test@gmail.com', phone: '8145551234', address: '4125 N Inspiration Loop', zipcode: '99654', city: 'Wasilla', gender: 'Male', dob: '1990-05-18' };

console.log('count:', await page.locator('#ai-funnel').count());
console.log('name1:', await page.locator('#ai-funnel input#name').count());
console.log('name2:', await page.locator('input[data-testid="fullname-input"]').count());

const r1 = await fillAlphaIntentFullName(page, record);
console.log('fullNameResult:', r1);
const r2 = await fillAlphaIntentSpecialFields(page, record);
console.log('specialResult:', r2);

await browser.close();
