import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isImageUrl,
  isMediaUrl,
  isEssentialOfferUrl,
  isHeavyAdOrTrackerUrl,
  HEAVY_AD_AND_TRACKER_HOSTS,
  attachDataSaver,
} from './app.mjs';

test('isImageUrl correctly identifies image files and ignores media', () => {
  // Should return true for images
  assert.equal(isImageUrl('https://example.com/logo.png'), true);
  assert.equal(isImageUrl('https://example.com/images/banner.JPG'), true);
  assert.equal(isImageUrl('https://example.com/captcha.jpeg?v=123'), true);
  assert.equal(isImageUrl('https://example.com/icon.svg'), true);
  assert.equal(isImageUrl('https://example.com/photo.webp'), true);
  assert.equal(isImageUrl('https://example.com/favicon.ico'), true);
  assert.equal(isImageUrl('https://example.com/anim.gif'), true);
  assert.equal(isImageUrl('https://example.com/modern.avif'), true);

  // Should return false for non-images
  assert.equal(isImageUrl('https://example.com/video.mp4'), false);
  assert.equal(isImageUrl('https://example.com/stream.m3u8'), false);
  assert.equal(isImageUrl('https://example.com/script.js'), false);
  assert.equal(isImageUrl('https://example.com/style.css'), false);
  assert.equal(isImageUrl('https://example.com/offer'), false);
  assert.equal(isImageUrl(''), false);
});

test('isMediaUrl correctly identifies video and audio resources', () => {
  // Should return true for media
  assert.equal(isMediaUrl('https://example.com/ad.mp4'), true);
  assert.equal(isMediaUrl('https://example.com/stream.m3u8?token=xyz'), true);
  assert.equal(isMediaUrl('https://example.com/clip.webm'), true);
  assert.equal(isMediaUrl('https://example.com/audio.mp3'), true);
  assert.equal(isMediaUrl('https://example.com/segment.ts'), true);
  assert.equal(isMediaUrl('https://example.com/track.ogg'), true);
  assert.equal(isMediaUrl('https://example.com/sound.wav'), true);

  // Should return false for non-media
  assert.equal(isMediaUrl('https://example.com/captcha.png'), false);
  assert.equal(isMediaUrl('https://example.com/index.html'), false);
  assert.equal(isMediaUrl('https://example.com/main.js'), false);
  assert.equal(isMediaUrl(''), false);
});

test('isEssentialOfferUrl protects security, verification, and captcha URLs', () => {
  assert.equal(isEssentialOfferUrl('https://www.google.com/recaptcha/api.js'), true);
  assert.equal(isEssentialOfferUrl('https://hcaptcha.com/1/api.js'), true);
  assert.equal(isEssentialOfferUrl('https://challenges.cloudflare.com/turnstile/v0/api.js'), true);
  assert.equal(isEssentialOfferUrl('https://example.com/cdn-cgi/challenge-platform/scripts'), true);
  assert.equal(isEssentialOfferUrl('https://client-api.arkoselabs.com/fc/gt2/public_key/'), true);

  // Normal pages should not be flagged as essential captcha
  assert.equal(isEssentialOfferUrl('https://adnetwork.com/video.mp4'), false);
  assert.equal(isEssentialOfferUrl('https://vidoomy.com/ad.js'), false);
});

test('isHeavyAdOrTrackerUrl blocks heavy video ad and replay domains but preserves essential', () => {
  assert.equal(isHeavyAdOrTrackerUrl('https://static.vidoomy.com/player/vidoomy.min.js'), true);
  assert.equal(isHeavyAdOrTrackerUrl('https://cdn.connatix.com/player/connatix.js'), true);
  assert.equal(isHeavyAdOrTrackerUrl('https://widgets.outbrain.com/outbrain.js'), true);
  assert.equal(isHeavyAdOrTrackerUrl('https://cdn.taboola.com/libtrc/unip/123/tfa.js'), true);
  assert.equal(isHeavyAdOrTrackerUrl('https://pubads.g.doubleclick.net/gampad/ads'), true);
  assert.equal(isHeavyAdOrTrackerUrl('https://static.hotjar.com/c/hotjar-12345.js'), true);
  assert.equal(isHeavyAdOrTrackerUrl('https://www.clarity.ms/tag/abc123'), true);

  // Normal offer domains or captchas should never be blocked
  assert.equal(isHeavyAdOrTrackerUrl('https://my-affiliate-offer.com/survey/step1'), false);
  assert.equal(isHeavyAdOrTrackerUrl('https://www.google.com/recaptcha/api2/anchor'), false);
});

test('HEAVY_AD_AND_TRACKER_HOSTS contains known bandwidth drainers', () => {
  assert.ok(Array.isArray(HEAVY_AD_AND_TRACKER_HOSTS));
  assert.ok(HEAVY_AD_AND_TRACKER_HOSTS.includes('vidoomy.com'));
  assert.ok(HEAVY_AD_AND_TRACKER_HOSTS.includes('connatix.com'));
  assert.ok(HEAVY_AD_AND_TRACKER_HOSTS.includes('outbrain.com'));
  assert.ok(HEAVY_AD_AND_TRACKER_HOSTS.includes('taboola.com'));
  assert.ok(HEAVY_AD_AND_TRACKER_HOSTS.includes('hotjar.com'));
});

test('attachDataSaver intercepts routes and never blocks images', async () => {
  let routeCalled = false;
  let registeredPattern = null;
  let routeHandler = null;

  const mockContext = {
    route: async (pattern, handler) => {
      routeCalled = true;
      registeredPattern = pattern;
      routeHandler = handler;
    },
  };

  const session = { slot: 1, addBrowserLog: () => {} };
  await attachDataSaver(mockContext, session);

  assert.equal(routeCalled, true);
  assert.equal(registeredPattern, '**/*');
  assert.ok(typeof routeHandler === 'function');

  // Test 1: Image request must continue
  let imageContinued = false;
  let imageAborted = false;
  await routeHandler({
    request: () => ({
      resourceType: () => 'image',
      url: () => 'https://example.com/question-logo.png',
    }),
    continue: async () => { imageContinued = true; },
    abort: async () => { imageAborted = true; },
  });
  assert.equal(imageContinued, true);
  assert.equal(imageAborted, false);

  // Test 2: Video media request must abort
  let videoContinued = false;
  let videoAborted = false;
  await routeHandler({
    request: () => ({
      resourceType: () => 'media',
      url: () => 'https://example.com/ad-banner.mp4',
    }),
    continue: async () => { videoContinued = true; },
    abort: async () => { videoAborted = true; },
  });
  assert.equal(videoContinued, false);
  assert.equal(videoAborted, true);
  assert.equal(session.blockedMediaCount, 1);

  // Test 3: Ad/Tracker domain script MUST CONTINUE so survey questions & answers never break!
  let adContinued = false;
  let adAborted = false;
  await routeHandler({
    request: () => ({
      resourceType: () => 'script',
      url: () => 'https://static.vidoomy.com/player.js',
    }),
    continue: async () => { adContinued = true; },
    abort: async () => { adAborted = true; },
  });
  assert.equal(adContinued, true, 'Scripts must never be blocked, preserving all questionnaire JS');
  assert.equal(adAborted, false);

  // Test 4: Normal survey script must continue
  let normalContinued = false;
  let normalAborted = false;
  await routeHandler({
    request: () => ({
      resourceType: () => 'script',
      url: () => 'https://survey-funnel.com/assets/form.js',
    }),
    continue: async () => { normalContinued = true; },
    abort: async () => { normalAborted = true; },
  });
  assert.equal(normalContinued, true);
  assert.equal(normalAborted, false);

  // Test 5: Survey questions/answers API via Fetch must continue
  let apiContinued = false;
  let apiAborted = false;
  await routeHandler({
    request: () => ({
      resourceType: () => 'fetch',
      url: () => 'https://survey-funnel.com/api/get-questions?offerId=101',
    }),
    continue: async () => { apiContinued = true; },
    abort: async () => { apiAborted = true; },
  });
  assert.equal(apiContinued, true, 'API calls fetching survey questions must continue');
  assert.equal(apiAborted, false);

  // Test 6: Video streaming chunk fetched via Fetch must abort to save bandwidth
  let chunkContinued = false;
  let chunkAborted = false;
  await routeHandler({
    request: () => ({
      resourceType: () => 'fetch',
      url: () => 'https://cdn.videoad.com/hls/segment_001.ts',
    }),
    continue: async () => { chunkContinued = true; },
    abort: async () => { chunkAborted = true; },
  });
  assert.equal(chunkContinued, false);
  assert.equal(chunkAborted, true, 'Streaming video chunks must be aborted to save proxy bandwidth');
  assert.equal(session.blockedMediaCount, 2);

  // Test 7: Nested survey co-reg iframe (subdocument) must continue
  let iframeContinued = false;
  let iframeAborted = false;
  await routeHandler({
    request: () => ({
      resourceType: () => 'subdocument',
      url: () => 'https://coreg-survey.com/widget?step=2',
    }),
    continue: async () => { iframeContinued = true; },
    abort: async () => { iframeAborted = true; },
  });
  assert.equal(iframeContinued, true, 'Nested survey frames must continue');
  assert.equal(iframeAborted, false);

  // Test 8: API with ?ts= timestamp in query string must NOT be treated as video .ts
  assert.equal(isMediaUrl('https://survey-funnel.com/api/answer?ts=1731168000'), false);
  assert.equal(isMediaUrl('https://example.com/stream.m3u8'), true);
  assert.equal(isMediaUrl('https://example.com/segment.m4s'), true);
});
