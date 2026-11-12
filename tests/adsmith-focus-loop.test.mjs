import assert from 'node:assert/strict';
import test from 'node:test';
import { handleAdsmithSurvey } from '../src/autofill/handle-adsmith-survey.mjs';

/**
 * Trang cha giả có #AS_IFRAME hiển thị: đếm số lần click chuột thật.
 * @param {string} url URL trang cha.
 * @return {{page: object, frame: object, clicks: () => number}} Trang, frame chính và bộ đếm click.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
function adsmithParent(url) {
  let clicks = 0;
  const page = { currentUrl: url, url() { return this.currentUrl; }, frames: () => [], mouse: { click: async () => { clicks++; } } };
  const frame = {
    url: () => page.currentUrl,
    locator: () => ({ first: () => ({ isVisible: async () => true, boundingBox: async () => ({ x: 0, y: 0, width: 300, height: 400 }) }) })
  };
  return { page, frame, clicks: () => clicks };
}

test('Adsmith: cùng một trang chỉ click focus #AS_IFRAME tối đa 3 lần và chỉ log lần đầu', async t => {
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const { page, frame, clicks } = adsmithParent('https://blog.financialhelpfinder.com/path1c.php');
  const logs = [];
  const options = { onLog: entry => logs.push(entry) };
  for (let i = 0; i < 10; i++) {
    now += 6000;
    await handleAdsmithSurvey(page, frame, options);
  }
  assert.equal(clicks(), 3, 'không click focus lặp mãi khi khảo sát trong iframe không tiến triển');
  assert.equal(logs.filter(entry => entry.type === 'as_frame_focus').length, 1);

  page.currentUrl = 'https://blog.financialhelpfinder.com/path1d.php';
  now += 6000;
  await handleAdsmithSurvey(page, frame, options);
  assert.equal(clicks(), 4, 'sang trang mới thì được focus lại');
});
