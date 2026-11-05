import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { handleRadioAndSurveyOptions, fillAlphaIntentSpecialFields, syncUplevelRewardsFields, handleOfferwallCards } from './autofill.mjs';

const logsDir = '/Users/codernguoitay/Library/Application Support/AutoLeadPC-2/logs/html/offer-1';
const flowPath = '/Users/codernguoitay/research_offer/flow_timeline.json';

const flowData = JSON.parse(readFileSync(flowPath, 'utf8'));
const flows = flowData.flows.slice(0, 8); // test first 8 flows

const record = {
  firstname: 'Test', lastname: 'User', fullname: 'Test User',
  email: 'test.user@gmail.com', phone: '8145551234', areacode: '814',
  address: '4125 N Inspiration Loop', zipcode: '99654', zip: '99654',
  city: 'Wasilla', state: 'AK', gender: 'Male', dob: '1990-05-18'
};

async function testStep(step) {
  const path = join(logsDir, step.file);
  const html = readFileSync(path, 'utf8');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const results = { domain: step.domain, file: step.file.split('_').slice(2,5).join('_'), ts: step.ts };
    
    try { results.alpha = await fillAlphaIntentSpecialFields(page, record); } catch (e) { results.alpha = -1; }
    try { results.uplevel = await syncUplevelRewardsFields(page, record); } catch (e) { results.uplevel = -1; }
    try { const sess = { autofillFields: 0, autofillActions: 0 }; results.survey = await handleRadioAndSurveyOptions(page, record, sess); results.actions = sess.autofillActions; } catch (e) { results.survey = -1; }
    try { results.offerwall = await handleOfferwallCards(page, page, { maxConcurrentSubOffers: 8 }); } catch (e) { results.offerwall = -1; }
    
    await browser.close();
    return results;
  } catch (e) {
    await browser.close().catch(()=>{});
    return { domain: step.domain, file: step.file, error: e.message?.slice(0,60) };
  }
}

async function run() {
  const allResults = [];
  for (const flow of flows) {
    console.log(`\n=== Flow slot:${flow.slot} tab:${flow.tab} (${flow.steps.length} steps) ===`);
    for (const step of flow.steps) {
      if (!step.analysis) continue;
      // skip tiny files
      if (step.analysis.len < 1000) continue;
      const r = await testStep(step);
      console.log(`[${step.idx}] ${step.domain.padEnd(25)} | alpha:${(r.alpha||0).toString().padStart(2)} up:${(r.uplevel||0).toString().padStart(2)} surv:${(r.survey||0).toString().padStart(2)} ow:${(r.offerwall||0).toString().padStart(2)} act:${(r.actions||0)}`);
      allResults.push({ flow: {slot: flow.slot, tab: flow.tab}, ...r });
    }
  }
  writeFileSync('/Users/codernguoitay/research_offer/real_flow_test_results.json', JSON.stringify(allResults, null, 2));
  console.log('\nDone. Results: ~/research_offer/real_flow_test_results.json');
}

run().catch(e => { console.error(e); process.exit(1); });
