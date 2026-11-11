import test from 'node:test';
import assert from 'node:assert/strict';
import { attachDataSaver } from '../src/browser/data-saver/attach-data-saver.mjs';
import { isNonessentialBackgroundUrl } from '../src/browser/data-saver/is-nonessential-background-url.mjs';

test('lọc engine video/ghi phiên nhưng giữ website chính, captcha và API form', async () => {
  assert.equal(isNonessentialBackgroundUrl('https://scripts.clarity.ms/collect', 'https://form.test'), true);
  assert.equal(isNonessentialBackgroundUrl('https://scripts.clarity.ms/collect', 'https://www.clarity.ms'), false);
  assert.equal(isNonessentialBackgroundUrl('https://vendor.test/api/submit', 'https://form.test'), false);
  let handler;
  const session = { mainPage: { url: () => 'https://form.test/' } };
  await attachDataSaver({ route: async (_, callback) => { handler = callback; } }, session);
  for (const [type, url, expected] of [
    ['script', 'https://static.vidoomy.com/player.js', 'abort'],
    ['fetch', 'https://www.clarity.ms/collect', 'abort'],
    ['xhr', 'https://fullstory.com/recording', 'abort'],
    ['script', 'https://form.test/assets/form.js', 'continue'],
    ['fetch', 'https://form.test/api/submit', 'continue'],
    ['document', 'https://coreg.test/widget', 'continue'],
    ['image', 'https://static.vidoomy.com/question.png', 'continue'],
    ['script', 'https://challenges.cloudflare.com/turnstile/v0/api.js', 'continue'],
    ['fetch', 'https://video.test/chunk.m4s', 'abort'],
  ]) {
    let actual;
    await handler({ request: () => ({ resourceType: () => type, url: () => url }), continue: async () => { actual = 'continue'; }, abort: async () => { actual = 'abort'; } });
    assert.equal(actual, expected, `${type} ${url}`);
  }
  assert.equal(session.blockedAdsCount, 3);
  assert.equal(session.blockedMediaCount, 1);
});

test('gắn route lỗi không để cờ attached khiến lần thử sau bị bỏ qua', async () => {
  const session = {};
  await attachDataSaver({ route: async () => { throw new Error('fixture route failure'); } }, session);
  assert.equal(session._dataSaverAttached, false);
  let attached = false;
  await attachDataSaver({ route: async () => { attached = true; } }, session);
  assert.equal(attached, true);
  assert.equal(session._dataSaverAttached, true);
});
