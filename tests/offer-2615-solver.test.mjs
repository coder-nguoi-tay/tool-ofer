import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { attachAutofill } from '../src/autofill/attach-autofill.mjs';

/**
 * Context giả không có tab: chỉ kiểm tra phiên được gắn vào pipeline nào.
 * @return {object} Context.
 */
const emptyContext = () => ({ on() {}, pages: () => [] });

test('phiên offer 2615 chạy bản giải riêng; offer khác và cách giải "generic" chạy giải chung', () => {
  const byUrl = { websiteUrl: 'https://toffers.top/click/?key=1&offer_id=2615&aff_id=x' };
  attachAutofill(emptyContext(), [{}], 'https://toffers.top', byUrl, {});
  assert.equal(byUrl.solverPipeline, '2615');
  const bySolver = { websiteUrl: 'https://offer.test/', offerSolver: '2615' };
  attachAutofill(emptyContext(), [{}], 'https://offer.test', bySolver, {});
  assert.equal(bySolver.solverPipeline, '2615');
  const other = { websiteUrl: 'https://toffers.top/click/?key=1&offer_id=2598&aff_id=x' };
  attachAutofill(emptyContext(), [{}], 'https://toffers.top', other, {});
  assert.equal(other.solverPipeline, undefined);
  const forcedGeneric = { websiteUrl: 'https://toffers.top/click/?key=1&offer_id=2615&aff_id=x', offerSolver: 'generic' };
  attachAutofill(emptyContext(), [{}], 'https://toffers.top', forcedGeneric, {});
  assert.equal(forcedGeneric.solverPipeline, undefined);
});

test('mọi module của bản giải 2615 nạp được (import trỏ đúng sau khi chép)', async () => {
  const walk = dir => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : path.endsWith('.mjs') ? [path] : []; });
  const files = walk('src/autofill/offers/2615/solver');
  assert.ok(files.length > 100, `chỉ có ${files.length} file`);
  for (const file of files) await import(`../${file}`);
});

test('phiên 2615 tối đa 2 tab (tab thứ 3 bị đóng); offer khác vẫn theo trần chung', async () => {
  const { EventEmitter } = await import('node:events');
  const { limitOfferTabs } = await import('../src/browser/tabs/limit-offer-tabs.mjs');
  const openThree = session => {
    const context = new EventEmitter(), pages = [];
    context.pages = () => pages;
    const makePage = () => { let closed = false; const page = { isClosed: () => closed, close: async () => { closed = true; } }; pages.push(page); return page; };
    makePage();
    limitOfferTabs(context, session);
    for (let i = 0; i < 2; i++) context.emit('page', makePage());
    return pages;
  };
  const offer2615 = openThree({ websiteUrl: 'https://toffers.top/click/?key=1&offer_id=2615&aff_id=x' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(offer2615.map(page => page.isClosed()), [false, false, true]);
  const other = openThree({ websiteUrl: 'https://toffers.top/click/?key=1&offer_id=2598&aff_id=x' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(other.map(page => page.isClosed()), [false, false, false]);
});

test('bản giải 2615 mở offer con lần lượt từng tab (dùng giới hạn riêng của 2615, không dùng 10 tab / 3 tab con chung)', async () => {
  const { readFileSync } = await import('node:fs');
  const { OFFER_2615_MAX_TABS, OFFER_2615_MAX_SUB_TABS } = await import('../src/autofill/offers/2615/limits.mjs');
  assert.equal(OFFER_2615_MAX_TABS, 2);
  assert.equal(OFFER_2615_MAX_SUB_TABS, 1);
  for (const file of ['handle-offerwall-cards.mjs', 'handle-offerwall-tasks.mjs', 'offerwall/handle-sweepstakes-card-page.mjs']) {
    const source = readFileSync(`src/autofill/offers/2615/solver/${file}`, 'utf8');
    assert.match(source, /from '[./]+limits\.mjs'/, file);
    assert.doesNotMatch(source, /max-offer-tabs|max-concurrent-sub-offers/, file);
  }
});
