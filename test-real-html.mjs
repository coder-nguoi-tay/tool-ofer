import { chromium } from 'playwright';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { handleRadioAndSurveyOptions, fillAlphaIntentSpecialFields, syncUplevelRewardsFields, handleOfferwallCards } from './autofill.mjs';

const logsDir = '/Users/codernguoitay/Library/Application Support/AutoLeadPC-2/logs/html/offer-1';
const files = readdirSync(logsDir).filter(f => f.endsWith('.html'));

const targets = [
  { name: 'sweepstakesalerts', pattern: /sweepstakesalerts\.com/ },
  { name: 'uplevel', pattern: /uplevelrewards\.com/ },
];

const record = {
  firstname: 'Test', lastname: 'User', fullname: 'Test User',
  email: 'test.user@gmail.com', phone: '8145551234', areacode: '814',
  address: '4125 N Inspiration Loop', zipcode: '99654', zip: '99654',
  city: 'Wasilla', state: 'AK', gender: 'Male', dob: '1990-05-18'
};

async function testFile(f) {
  const path = join(logsDir, f);
  const html = readFileSync(path, 'utf8');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const results = { file: f, alpha: 0, uplevel: 0, survey: 0, offerwall: 0 };
    
    try {
      const frame = page;
      results.alpha = await fillAlphaIntentSpecialFields(frame, record);
    } catch (e) { results.alphaErr = e.message?.slice(0,50); }
    try {
      const frame = page;
      results.uplevel = await syncUplevelRewardsFields(frame, record);
    } catch (e) { results.uplevelErr = e.message?.slice(0,50); }
    try {
      const frame = page;
      const sess = { autofillFields: 0, autofillActions: 0 };
      results.survey = await handleRadioAndSurveyOptions(frame, record, sess);
      results.surveySess = { f: sess.autofillFields, a: sess.autofillActions };
    } catch (e) { results.surveyErr = e.message?.slice(0,50); }
    try {
      const frame = page;
      results.offerwall = await handleOfferwallCards(frame, page, { maxConcurrentSubOffers: 8 });
    } catch (e) { results.owErr = e.message?.slice(0,50); }
    
    await browser.close();
    return results;
  } catch (e) {
    await browser.close().catch(()=>{});
    return { file: f, error: e.message?.slice(0,80) };
  }
}

async function run() {
  const results = [];
  for (const t of targets) {
    const matching = files.filter(f => t.pattern.test(f)).slice(0, 6);
    console.log(`\n=== Testing ${t.name} (${matching.length} files) ===`);
    for (const f of matching) {
      const r = await testFile(f);
      console.log(`${f.split('_')[2]}_${f.split('_')[3]} | alpha:${r.alpha||0} uplevel:${r.uplevel||0} survey:${r.survey||0} ow:${r.offerwall||0}`);
      results.push({ target: t.name, ...r });
    }
  }
  writeFileSync('/Users/codernguoitay/research_offer/real_html_test_results.json', JSON.stringify(results, null, 2));
  console.log('\nDone. Results: ~/research_offer/real_html_test_results.json');
}

run().catch(e => { console.error(e.stack); process.exit(1); });
