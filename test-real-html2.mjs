import { chromium } from 'playwright';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { handleRadioAndSurveyOptions, fillAlphaIntentSpecialFields, syncUplevelRewardsFields, handleOfferwallCards } from './autofill.mjs';

const logsDir = '/Users/codernguoitay/Library/Application Support/AutoLeadPC-2/logs/html/offer-1';
const files = readdirSync(logsDir).filter(f => f.endsWith('.html'));

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
      results.alpha = await fillAlphaIntentSpecialFields(page, record);
    } catch (e) { results.alphaErr = e.message?.slice(0,80); }
    try {
      results.uplevel = await syncUplevelRewardsFields(page, record);
    } catch (e) { results.uplevelErr = e.message?.slice(0,80); }
    try {
      const sess = { autofillFields: 0, autofillActions: 0 };
      results.survey = await handleRadioAndSurveyOptions(page, record, sess);
    } catch (e) { results.surveyErr = e.message?.slice(0,80); }
    try {
      results.offerwall = await handleOfferwallCards(page, page, { maxConcurrentSubOffers: 8 });
    } catch (e) { results.owErr = e.message?.slice(0,80); }
    
    await browser.close();
    return results;
  } catch (e) {
    await browser.close().catch(()=>{});
    return { file: f, error: e.message?.slice(0,100) };
  }
}

async function run() {
  const results = [];
  // Test sweepstakes with alpha
  const sweep = files.filter(f => f.includes('sweepstakesalerts.com')).filter(f => {
    const html = readFileSync(join(logsDir,f),'utf8');
    return html.includes('alpha-intent') || html.includes('ai-funnel');
  }).slice(0, 5);
  console.log(`\n=== Testing sweepstakesalerts with alpha (${sweep.length}) ===`);
  for (const f of sweep) {
    const r = await testFile(f);
    console.log(`${f.split('_')[4]} | alpha:${r.alpha||0} uplevel:${r.uplevel||0} survey:${r.survey||0} ow:${r.offerwall||0} ${r.alphaErr||r.uplevelErr||r.surveyErr||r.owErr||''}`);
    results.push({ target: 'sweepstakes-alpha', ...r });
  }
  // Test uplevel
  const up = files.filter(f => f.includes('uplevelrewards.com')).slice(0, 5);
  console.log(`\n=== Testing uplevel (${up.length}) ===`);
  for (const f of up) {
    const r = await testFile(f);
    console.log(`${f.split('_')[4]} | alpha:${r.alpha||0} uplevel:${r.uplevel||0} survey:${r.survey||0} ow:${r.offerwall||0}`);
    results.push({ target: 'uplevel', ...r });
  }
  writeFileSync('/Users/codernguoitay/research_offer/real_html_test_results2.json', JSON.stringify(results, null, 2));
  console.log('\nDone.');
}

run().catch(e => { console.error(e); process.exit(1); });
