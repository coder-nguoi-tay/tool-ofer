import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { handleSweepstakesCardPage } from '../src/autofill/offerwall/handle-sweepstakes-card-page.mjs';
import { isSweepstakesCardPage } from '../src/autofill/offerwall/is-sweepstakes-card-page.mjs';
import { openCardLinkInNewTab } from '../src/autofill/offerwall/open-card-link-in-new-tab.mjs';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';
import { limitOfferTabs } from '../src/browser/tabs/limit-offer-tabs.mjs';
import { attachUniqueOfferTabs } from '../src/browser/tabs/attach-unique-offer-tabs.mjs';
import { getEmptyOfferPageReason } from '../src/leads/actions/get-empty-offer-page-reason.mjs';
import { attachAutofillPageWatcher } from '../src/autofill/attach-autofill-page-watcher.mjs';

const skip = !existsSync(chromium.executablePath());

/**
 * Dựng màn card 98% offline, không truy cập offer thật hoặc storage người dùng.
 * @param {object} t Context node:test dùng dọn browser.
 * @param {string} cards Nội dung card giả, không chứa dữ liệu người thật.
 * @return {Promise<object>} Browser, context, root và session confirmed để kiểm guard.
 * @throws {Error} Khi Chromium hoặc fixture không khởi động được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
async function createFixture(t, cards) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const html = `<html style="--progressPercentage:98%"><body><form id="wall">${cards}</form></body></html>`;
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('/wall') ? html : '<form><input name="firstname"></form>' }));
  const root = await context.newPage();
  await root.goto('https://sweepstakesalerts.com/wall');
  const session = { browser: context, mainPage: root, enableLeadCheck: false, confirmedLeadIp: '192.0.2.10', exitIp: '192.0.2.10', leadCheckStatus: 'confirmed', currentRecord: { firstname: 'Fixture' }, autofillFields: 0 };
  root._autofillSession = session;
  return { browser, context, root, session };
}

test('màn card giữ root, dọn đúng context một lần, mở mọi card lồng form/wrapper và chống trùng qua reload', { skip }, async t => {
  const { browser, context, root, session } = await createFixture(t, `<div class="offerwall-card-wrap">
    <div class="card"><a target="_blank" href="https://offer.test/one?utm_source=first">One</a></div>
    <div class="card"><a target="_blank" href="https://offer.test/one?utm_source=duplicate">One again</a></div>
    <div class="card"><a target="_blank" href="https://offer.test/two">Two</a></div>
    <div class="card" hidden><a target="_blank" href="https://offer.test/hidden">Hidden</a></div>
    <div class="card"><a href="https://yougov.com/">Excluded</a></div></div>`);
  const old = await context.newPage();
  await old.goto('https://old.test/question');
  session.mainPage = old;
  const otherContext = await browser.newContext();
  const otherIpTab = await otherContext.newPage();
  limitOfferTabs(context, session);
  attachUniqueOfferTabs(context, session);
  root.mainFrame()._activeAutofillFormScope = { active: true, memberSelector: '#wall input' };
  await fillPageForms(root, { session, sessionRecord: session.currentRecord, options: { autoSubmit: true }, triggerLeadCheckAfterEmail() {} });
  assert.equal(old.isClosed(), true);
  assert.equal(otherIpTab.isClosed(), false);
  assert.equal(session.mainPage, root);
  assert.equal(root.url(), 'https://sweepstakesalerts.com/wall');
  assert.equal(context.pages().length, 3);
  assert.ok(context.pages().some(page => page.url().includes('/one?utm_source=first')));
  assert.ok(context.pages().some(page => page.url() === 'https://offer.test/two'));
  assert.equal(session.confirmedLeadIp, '192.0.2.10');
  const extra = await context.newPage();
  await root.reload();
  assert.equal(await handleSweepstakesCardPage(root, session, {}), true);
  assert.equal(extra.isClosed(), false, 'không dọn lại tab mới sau reload');
  assert.equal(context.pages().length, 4, 'reload không mở lại link đã xử lý');
});

test('màn card mở tối đa MAX_CONCURRENT_SUB_OFFERS tab con cùng lúc (3, giảm tải máy 2026-11-16) và mở tiếp khi có chỗ, cho tới hết thẻ', { skip }, async t => {
  const { MAX_CONCURRENT_SUB_OFFERS } = await import('../src/runtime/constants/max-concurrent-sub-offers.mjs');
  assert.equal(MAX_CONCURRENT_SUB_OFFERS, 3);
  const cards = Array.from({ length: 12 }, (_, index) => `<div class="card"><a target="_blank" href="https://offer.test/${index}">Offer ${index}</a></div>`).join('');
  const { context, root, session } = await createFixture(t, cards);
  limitOfferTabs(context, session);
  attachUniqueOfferTabs(context, session);
  await handleSweepstakesCardPage(root, session, {});
  assert.equal(context.pages().length, 1 + MAX_CONCURRENT_SUB_OFFERS, 'chỉ mở 3 tab con cùng lúc');
  assert.equal(await root.locator('[data-ux-opened="1"]').count(), MAX_CONCURRENT_SUB_OFFERS);
  for (let round = 0; round < 12 && await root.locator('[data-ux-opened="1"]').count() < 12; round++) {
    await context.pages().find(page => page !== root).close();
    await handleSweepstakesCardPage(root, session, {});
    assert.ok(context.pages().length <= 1 + MAX_CONCURRENT_SUB_OFFERS, 'không vượt trần khi mở tiếp');
  }
  assert.equal(await root.locator('[data-ux-opened="1"]').count(), 12, 'vẫn mở hết mọi thẻ, chỉ là lần lượt');
  assert.equal(root.isClosed(), false);
  assert.equal(await getEmptyOfferPageReason(root, { key: root.url(), since: Date.now() - 60000 }), null);
});

test('dừng sau lead hoặc chờ lead không dọn tab và không mở card', { skip }, async t => {
  const { context, root, session } = await createFixture(t, '<div class="card"><a target="_blank" href="https://offer.test/one">One</a></div>');
  const old = await context.newPage();
  session.enableLeadCheck = true;
  session.stopAutofillOnLead = true;
  await handleSweepstakesCardPage(root, session, {});
  assert.equal(old.isClosed(), false);
  assert.equal(context.pages().length, 2);
  session.stopAutofillOnLead = false;
  session.confirmedLeadIp = null;
  session.leadCheckStatus = 'checking';
  await handleSweepstakesCardPage(root, session, {});
  assert.equal(old.isClosed(), false);
  assert.equal(context.pages().length, 2);
});

test('98% thiếu card/link thật, card ẩn hoặc sai host không kích hoạt dọn tab', { skip }, async t => {
  const { root, context, session } = await createFixture(t, '<div class="card"><a target="_blank" href="https://offer.test/one">One</a></div>');
  const old = await context.newPage();
  await root.evaluate(() => document.documentElement.style.setProperty('--progressPercentage', '80%'));
  assert.equal(await isSweepstakesCardPage(root), false);
  await root.evaluate(() => { document.documentElement.style.setProperty('--progressPercentage', '98%'); document.querySelector('.card').hidden = true; });
  assert.equal(await handleSweepstakesCardPage(root, session, {}), false);
  await root.goto('https://another.test/wall');
  assert.equal(await handleSweepstakesCardPage(root, session, {}), false);
  await root.goto('https://sweepstakesalerts.com/wall');
  await root.evaluate(() => document.querySelector('.card').remove());
  assert.equal(await handleSweepstakesCardPage(root, session, {}), false);
  assert.equal(old.isClosed(), false);
});

test('hai lượt quét đồng thời không mở card trùng', { skip }, async t => {
  const { context, root, session } = await createFixture(t, '<div class="card"><a target="_blank" href="https://offer.test/one">One</a></div><div class="card"><a target="_blank" href="https://offer.test/two">Two</a></div>');
  await Promise.all([handleSweepstakesCardPage(root, session, {}), handleSweepstakesCardPage(root, session, {})]);
  assert.equal(context.pages().length, 3);
  assert.equal(root.url(), 'https://sweepstakesalerts.com/wall');
});

test('data-destination-url không tự mở tab khi CTA không yêu cầu; link hash hoặc chính sách không đủ để dọn tab', { skip }, async t => {
  const { context, root, session } = await createFixture(t, '<div class="offerwall-card" data-destination-url="https://offer.test/data"><button type="button">Claim</button></div>');
  assert.equal(await handleSweepstakesCardPage(root, session, {}), true);
  assert.equal(context.pages().length, 1);
  assert.equal(root.url(), 'https://sweepstakesalerts.com/wall');
  await root.setContent('<html style="--progressPercentage:98%"><div class="card"><a href="#details">Details</a><a href="/privacy-policy">Privacy</a></div></html>');
  assert.equal(await isSweepstakesCardPage(root), false);
});

test('Stop/lead về trong lúc tạo tab thì không điều hướng offer', async () => {
  let navigations = 0, closed = false;
  const child = { isClosed: () => false, goto: async () => { navigations++; }, close: async () => { closed = true; } };
  const root = { context: () => ({ newPage: async () => child }) };
  assert.equal(await openCardLinkInNewTab(root, 'https://offer.test/one', () => true), false);
  assert.equal(navigations, 0);
  assert.equal(closed, true);
});

test('link tải chậm không giữ lượt mở card và vẫn giữ nguyên tracking của URL', async () => {
  let navigation;
  const child = { isClosed: () => false, goto: (url, options) => { navigation = { url, options }; return new Promise(() => {}); } };
  const root = { url: () => 'https://sweepstakesalerts.com/wall?private=fixture', context: () => ({ newPage: async () => child }) };
  assert.equal(await openCardLinkInNewTab(root, 'https://offer.test/one?clickid=fixture'), true);
  assert.equal(navigation.url, 'https://offer.test/one?clickid=fixture');
  assert.equal(navigation.options.referer, 'https://sweepstakesalerts.com/');
});

test('watcher chờ card không gọi AI hoặc phục hồi reload khi chưa có chỗ mở tab', { skip }, async t => {
  const { root, session } = await createFixture(t, '<div class="card"><a target="_blank" href="https://offer.test/one">One</a></div>');
  let scans = 0, aiCalls = 0;
  root._uxSweepstakesCardPageUrl = root.url();
  attachAutofillPageWatcher(root, {
    trackedPages: new WeakSet(), session, record: session.currentRecord,
    options: { stuckThreshold: 0, libraryFirstPassDelayMs: 0, onStuck: () => { aiCalls++; } },
    fillVisibleForms: async () => { scans++; }, checkLeadAfterEmailOnPage() {}, isSpamAdUrl: () => false, watchPage() {}
  });
  await root.waitForTimeout(200);
  for (let index = 0; index < 3; index++) { root.triggerAutofillScan(); await root.waitForTimeout(100); }
  assert.ok(scans >= 3);
  assert.equal(aiCalls, 0);
  assert.equal(root._lateProgressRecoveryActive, undefined);
});

test('Addept cross-origin giữ trang chờ iframe, bỏ attribution và mở card bên trong', { skip }, async t => {
  const { root, context, session } = await createFixture(t, `<div id="ow-placement"><iframe data-content-iframe="62" src="https://sdk.scrptk.com/content/render?placement=62"></iframe></div>
    <div class="ow-attribution"><a href="https://addept.com" target="_blank">Addept</a><a href="https://addept.com/privacy-policy">Privacy Policy</a></div>`);
  const old = await context.newPage();
  const frame = root.frames().find(item => item.url().includes('sdk.scrptk.com'));
  assert.ok(frame);
  await root.locator('#ow-placement').evaluate(element => element.hidden = true);
  assert.equal(await isSweepstakesCardPage(root), false, 'placement ẩn không nhận làm màn offer');
  await root.locator('#ow-placement').evaluate(element => element.hidden = false);
  assert.equal(await handleSweepstakesCardPage(root, session, {}), true);
  assert.equal(old.isClosed(), false, 'iframe chưa có card không dọn tab cũ');
  assert.equal(context.pages().length, 2, 'không bấm attribution khi đợi iframe');
  await frame.setContent('<div class="card"><a target="_blank" href="https://offer.test/iframe-one">One</a></div><div class="card"><a target="_blank" href="https://offer.test/iframe-two">Two</a></div>');
  await handleSweepstakesCardPage(root, session, {});
  assert.equal(old.isClosed(), true);
  assert.equal(context.pages().length, 3);
  assert.ok(context.pages().some(page => page.url().includes('/iframe-one')));
  assert.ok(context.pages().some(page => page.url().includes('/iframe-two')));
  assert.equal(root.url(), 'https://sweepstakesalerts.com/wall');
});

test('Addept chọn task rồi bấm CTA và Skip trong iframe, không bấm link nhà cung cấp', { skip }, async t => {
  const { root, context, session } = await createFixture(t, '<div id="ow-placement"><iframe data-content-iframe="62" src="https://sdk.scrptk.com/content/render"></iframe></div><div class="ow-attribution"><a href="https://addept.com">Addept</a></div>');
  const frame = root.frames().find(item => item.url().includes('sdk.scrptk.com'));
  await frame.setContent(`<div class="unit-stack"><button class="unit-card" data-index="0" data-creative-view-model='{"headline":"Offline offer"}' onclick="document.getElementById('infoPanel').hidden=false">Offer</button><button class="unit-card" data-index="1" onclick="document.getElementById('infoPanel').hidden=false">Second offer</button></div>
    <div id="infoPanel" hidden><a id="infoPanelButton" href="https://offer.test/task" target="_blank">Open offer</a><button id="skipButton" onclick="document.getElementById('infoPanel').hidden=true">Skip</button></div>`);
  await handleSweepstakesCardPage(root, session, {});
  assert.equal(await frame.locator('#infoPanel').isVisible(), true);
  assert.equal(context.pages().length, 1);
  frame._uxOwHandledAt = 0;
  const popup = context.waitForEvent('page');
  await handleSweepstakesCardPage(root, session, {});
  const child = await popup;
  await child.waitForLoadState();
  assert.equal(child.url(), 'https://offer.test/task');
  frame._uxOwHandledAt = 0;
  await handleSweepstakesCardPage(root, session, {});
  assert.equal(await frame.locator('#infoPanel').isVisible(), false);
  frame._uxOwHandledAt = 0;
  await handleSweepstakesCardPage(root, session, {});
  assert.equal(await frame.locator('#infoPanelButton').getAttribute('data-ux-ow-cta'), null, 'CTA dùng lại phải mở được task kế tiếp');
  assert.equal(await frame.locator('.unit-card[data-ux-ow-clicked="1"]').count(), 2);
  assert.equal(root.isClosed(), false);
});

test('chỉ mở card vùng trung tâm, bỏ mọi card ở header/footer/sidebar/attribution và ngoài main', { skip }, async t => {
  const { root, context, session } = await createFixture(t, `<header><div class="card"><a target="_blank" href="https://offer.test/header">Header</a></div></header>
    <main><div class="card"><footer><a class="offer-button" href="https://offer.test/footer-in-card">Continue</a></footer><a target="_blank" href="https://offer.test/central">Central</a></div>
    <aside><div class="card"><a target="_blank" href="https://offer.test/aside">Aside</a></div></aside>
    <div class="ow-attribution"><div class="card"><a href="https://addept.com">Addept</a></div></div></main>
    <div class="card"><a target="_blank" href="https://offer.test/outside">Outside main</a></div>
    <footer><div class="card"><a target="_blank" href="https://offer.test/footer">Footer</a></div></footer>`);
  assert.equal(await handleSweepstakesCardPage(root, session, {}), true);
  assert.equal(context.pages().length, 2);
  assert.equal(context.pages().find(page => page !== root).url(), 'https://offer.test/central');
});

test('chỉ có card ngoài vùng nội dung thì không nhận màn card và không dọn tab', { skip }, async t => {
  const { root, context, session } = await createFixture(t, '<main><p>Đang tải offer</p></main><footer><div class="card"><a target="_blank" href="https://offer.test/footer">Claim</a></div></footer><div class="card"><a target="_blank" href="https://offer.test/outside">Offer ngoài main</a></div>');
  const old = await context.newPage();
  assert.equal(await handleSweepstakesCardPage(root, session, {}), false);
  assert.equal(old.isClosed(), false);
  assert.equal(context.pages().length, 2);
});

test('Addept mở lần lượt 0→1→2→3, mỗi URL chỉ click một lần dù có card trùng, quét đồng thời và reload', { skip }, async t => {
  const { root, context, session } = await createFixture(t, '<div id="ow-placement"><iframe data-content-iframe="62" src="https://sdk.scrptk.com/content/render"></iframe></div>');
  const urls = ['https://offer.test/first', 'https://offer.test/first?utm_source=duplicate', 'https://offer.test/second', 'https://offer.test/third'];
  const html = `<script>window.selections=[];window.attempts=[];</script><div class="unit-stack">${urls.map((url, index) => `<button class="unit-card" data-index="${index}" onclick="window.selections.push(${index});document.getElementById('infoPanelButton').href='${url}';document.getElementById('infoPanel').hidden=false">Offer ${index}</button>`).join('')}</div>
    <div id="infoPanel" hidden><a id="infoPanelButton" target="_blank" onclick="window.attempts.push(this.href)">Open offer</a></div><button id="skipButton" onclick="document.getElementById('infoPanel').hidden=true">Skip</button>`;
  let frame = root.frames().find(item => item.url().includes('sdk.scrptk.com'));
  await frame.setContent(html);
  for (let index = 0; index < 15; index++) {
    frame._uxOwHandledAt = 0;
    await Promise.all([handleSweepstakesCardPage(root, session, {}), handleSweepstakesCardPage(root, session, {})]);
  }
  assert.deepEqual(await frame.evaluate(() => window.selections), [0, 1, 2, 3]);
  assert.deepEqual(await frame.evaluate(() => window.attempts), [urls[0], urls[2], urls[3]]);
  assert.deepEqual(context.pages().filter(page => page !== root).map(page => page.url()), [urls[0], urls[2], urls[3]]);
  for (const child of context.pages().filter(page => page !== root)) await child.close();
  await root.reload();
  frame = root.frames().find(item => item.url().includes('sdk.scrptk.com'));
  await frame.setContent(html);
  await frame.locator('.unit-card').evaluateAll(cards => cards.forEach(card => card.disabled = true));
  for (let index = 0; index < 6; index++) {
    frame._uxOwHandledAt = 0;
    await handleSweepstakesCardPage(root, session, {});
  }
  assert.deepEqual(await frame.evaluate(() => window.selections), []);
  assert.equal(await frame.locator('.unit-card[data-ux-ow-clicked="1"]').count(), 4, 'card đã xử lý dù disabled vẫn được bỏ qua theo lịch sử');
  assert.deepEqual(await frame.evaluate(() => window.attempts), []);
  assert.equal(context.pages().length, 1);
});

test('CTA có lỗi input chỉ thử một lần, dựng lại nút không click lại link', async () => {
  const { handleOfferwallTasks } = await import('../src/autofill/handle-offerwall-tasks.mjs');
  let attempts = 0;
  let siblings = Array.from({ length: 9 }, () => ({ isClosed: () => false }));
  const context = { pages: () => [page, ...siblings] };
  const page = { context: () => context, url: () => 'https://sweepstakesalerts.com/wall', isClosed: () => false };
  const control = {
    count: async () => 1,
    evaluate: async fn => fn.name === 'inspectInteractionReadiness' ? { ready: true } : fn({ setAttribute() {} }),
    click: async () => { attempts++; throw new Error('input kết quả chưa xác định'); },
    first() { return this; }
  };
  const frame = { evaluate: async () => ({ kind: 'cta', selector: '#infoPanelButton', destUrl: 'https://offer.test/once' }), locator: () => control };
  await handleOfferwallTasks(page, frame);
  assert.equal(attempts, 0, 'đủ trần tab thì chờ, không tiêu lượt click');
  siblings = [];
  frame._uxOwHandledAt = 0;
  await handleOfferwallTasks(page, frame);
  frame._uxOwHandledAt = 0;
  await handleOfferwallTasks(page, frame);
  assert.equal(attempts, 1);
});

test('thứ tự mở theo vị trí hiển thị dù CSS đảo thứ tự DOM, quét đồng thời không vượt trước', { skip }, async t => {
  const { root, context, session } = await createFixture(t, '<div class="card" style="order:2"><a target="_blank" href="https://offer.test/last">Last</a></div><div class="card" style="order:1"><a target="_blank" href="https://offer.test/first">First</a></div>');
  await root.locator('#wall').evaluate(element => { element.style.display = 'flex'; element.style.flexDirection = 'column'; });
  await Promise.all([handleSweepstakesCardPage(root, session, {}), handleSweepstakesCardPage(root, session, {})]);
  assert.deepEqual(context.pages().filter(page => page !== root).map(page => page.url()), ['https://offer.test/first', 'https://offer.test/last']);
});

test('link đầu đang được giữ chỗ thì chờ, không mở link sau vượt trước hoặc đánh dấu link đầu đã xong', { skip }, async t => {
  const { reserveOfferLink } = await import('../src/browser/tabs/reserve-offer-link.mjs');
  const { root, context, session } = await createFixture(t, '<div class="card"><a target="_blank" href="https://offer.test/first">First</a></div><div class="card"><a target="_blank" href="https://offer.test/second">Second</a></div>');
  const releasePending = reserveOfferLink(root, 'https://offer.test/first');
  await handleSweepstakesCardPage(root, session, {});
  assert.equal(context.pages().length, 1);
  assert.equal(await root.locator('[data-ux-opened="1"]').count(), 0);
  releasePending(false);
  await handleSweepstakesCardPage(root, session, {});
  assert.deepEqual(context.pages().filter(page => page !== root).map(page => page.url()), ['https://offer.test/first', 'https://offer.test/second']);
});

test('bấm card nhưng chưa hiện panel thì chờ xác minh, không bấm lại hoặc vượt sang card sau', { skip }, async t => {
  const { root, session } = await createFixture(t, '<div id="ow-placement"><iframe data-content-iframe="62" src="https://sdk.scrptk.com/content/render"></iframe></div>');
  const frame = root.frames().find(item => item.url().includes('sdk.scrptk.com'));
  await frame.setContent('<script>window.attempts=[]</script><div class="unit-stack"><button class="unit-card" data-index="0" onclick="window.attempts.push(0)">First</button><button class="unit-card" data-index="1" onclick="window.attempts.push(1)">Second</button></div>');
  const logs = [];
  for (let index = 0; index < 3; index++) {
    frame._uxOwHandledAt = 0;
    await handleSweepstakesCardPage(root, session, { onLog: event => logs.push(event.type) });
  }
  assert.deepEqual(await frame.evaluate(() => window.attempts), [0]);
  assert.ok(logs.includes('survey_selection_unverified'));
  await frame.evaluate(() => document.body.insertAdjacentHTML('beforeend', `<div id="infoPanel"><a id="infoPanelButton" target="_blank" href="https://offer.test/late-panel">Open offer</a><button id="skipButton" onclick="document.getElementById('infoPanel').hidden=true">Skip</button></div>`));
  frame._uxOwHandledAt = 0;
  const popup = root.context().waitForEvent('page');
  await handleSweepstakesCardPage(root, session, {});
  const child = await popup;
  await child.waitForLoadState();
  assert.equal(child.url(), 'https://offer.test/late-panel');
  assert.deepEqual(await frame.evaluate(() => window.attempts), [0], 'panel hiện muộn vẫn tiếp tục mà không click lại card');
});

for (const solver of ['common', '2615']) {
  test(`card ${solver} để HTML quyết định điều hướng cha hoặc hủy click`, { skip }, async t => {
    const { handleOfferwallCards } = await import(solver === '2615' ? '../src/autofill/offers/2615/solver/handle-offerwall-cards.mjs' : '../src/autofill/handle-offerwall-cards.mjs');
    const { root, context } = await createFixture(t, '<div class="card"><a href="https://offer.test/final" onclick="event.preventDefault()">Final</a></div>');
    await handleOfferwallCards(root.mainFrame(), root, { cardSelector: '.card', orderedCards: true, maxConcurrentSubOffers: 0 });
    assert.equal(context.pages().length, 1);
    assert.equal(root.url(), 'https://sweepstakesalerts.com/wall');
    await root.locator('.card').evaluate(card => { card.removeAttribute('data-ux-opened'); card.querySelector('a').removeAttribute('onclick'); card.querySelector('a').removeAttribute('data-ux-offer-action-label'); card.querySelector('a').href = 'https://offer.test/final-self'; });
    await handleOfferwallCards(root.mainFrame(), root, { cardSelector: '.card', orderedCards: true, maxConcurrentSubOffers: 0 });
    await root.waitForURL('https://offer.test/final-self', { timeout: 3000 });
    assert.equal(context.pages().length, 1, 'chuyển trang cha vẫn chạy khi hết quota tab con');
  });
}
