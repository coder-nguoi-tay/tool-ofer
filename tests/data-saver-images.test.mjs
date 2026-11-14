import test from 'node:test';
import assert from 'node:assert/strict';
import { isNonessentialImageUrl } from '../src/browser/data-saver/is-nonessential-image-url.mjs';
import { attachDataSaver } from '../src/browser/data-saver/attach-data-saver.mjs';

test('isNonessentialImageUrl bảo vệ 100% ảnh Captcha, ảnh khảo sát, logo, SVG và ảnh cùng domain', () => {
  // Ảnh Captcha và anti-bot phải luôn được giữ
  assert.equal(isNonessentialImageUrl('https://challenges.cloudflare.com/turnstile/v0/api/challenge.png'), false);
  assert.equal(isNonessentialImageUrl('https://www.google.com/recaptcha/api2/payload?c=123'), false);
  assert.equal(isNonessentialImageUrl('https://imgs.hcaptcha.com/task-image-123.jpg'), false);

  // Ảnh SVG, Favicon, Data URL
  assert.equal(isNonessentialImageUrl('https://cdn.test/icons/checkmark.svg'), false);
  assert.equal(isNonessentialImageUrl('https://offer.test/favicon.ico'), false);
  assert.equal(isNonessentialImageUrl('data:image/png;base64,iVBORw0KGgoAAAANS'), false);

  // Ảnh câu hỏi, lựa chọn, logo, survey
  assert.equal(isNonessentialImageUrl('https://cdn.brand.com/pepsi-logo.png'), false);
  assert.equal(isNonessentialImageUrl('https://survey.provider.com/images/choice_a.jpg'), false);
  assert.equal(isNonessentialImageUrl('https://survey.provider.com/questions/q1_rating_star.png'), false);

  // Ảnh cùng domain với trang web
  assert.equal(isNonessentialImageUrl('https://www.offer.com/assets/banner-hero.jpg', 'https://www.offer.com/lead'), false);
  assert.equal(isNonessentialImageUrl('https://cdn.offer.com/img/product.png', 'https://offer.com/form'), false);
});

test('isNonessentialImageUrl chặn banner quảng cáo rác và tracking pixel bên thứ 3', () => {
  // 3rd party ad networks
  assert.equal(isNonessentialImageUrl('https://ad.doubleclick.net/ddm/ad/banner.jpg', 'https://offer.com'), true);
  assert.equal(isNonessentialImageUrl('https://pagead2.googlesyndication.com/pagead/imgad?id=123', 'https://offer.com'), true);
  assert.equal(isNonessentialImageUrl('https://static.criteo.net/images/promo.png', 'https://offer.com'), true);
  assert.equal(isNonessentialImageUrl('https://images.taboola.com/taboola/image/fetch/ad.jpg', 'https://offer.com'), true);

  // Tracking pixels
  assert.equal(isNonessentialImageUrl('https://www.facebook.com/tr/?id=123456&ev=PageView&noscript=1', 'https://offer.com'), true);
  assert.equal(isNonessentialImageUrl('https://analytics.tracker.com/pixel.gif', 'https://offer.com'), true);
  assert.equal(isNonessentialImageUrl('https://metrics.vendor.com/beacon.gif?t=123', 'https://offer.com'), true);
});

test('attachDataSaver xử lý lọc ảnh thông minh trong luồng route của BrowserContext', async () => {
  let routeHandler;
  let emulatedMediaArg = null;
  let initScriptAdded = false;

  const mockContext = {
    emulateMedia: async opts => { emulatedMediaArg = opts; },
    addInitScript: async fn => { initScriptAdded = typeof fn === 'function'; },
    route: async (pattern, handler) => {
      assert.equal(pattern, '**/*');
      routeHandler = handler;
    }
  };

  const session = {
    slot: 1,
    mainPage: { url: () => 'https://survey.example.com/start' }
  };

  await attachDataSaver(mockContext, session);

  assert.equal(session._dataSaverAttached, true);
  assert.equal(emulatedMediaArg?.reducedMotion, 'reduce');
  assert.equal(initScriptAdded, true);

  // Kiểm tra route: ảnh captcha được tiếp tục
  let captchaAction = null;
  await routeHandler({
    request: () => ({
      resourceType: () => 'image',
      url: () => 'https://challenges.cloudflare.com/turnstile/v0/icon.png',
      frame: () => ({ page: () => ({ url: () => 'https://survey.example.com/start' }) })
    }),
    continue: async () => { captchaAction = 'continue'; },
    abort: async () => { captchaAction = 'abort'; }
  });
  assert.equal(captchaAction, 'continue');

  // Kiểm tra route: ảnh tracking pixel bị abort
  let trackerAction = null;
  await routeHandler({
    request: () => ({
      resourceType: () => 'image',
      url: () => 'https://www.facebook.com/tr/?id=999&ev=Sub',
      frame: () => ({ page: () => ({ url: () => 'https://survey.example.com/start' }) })
    }),
    continue: async () => { trackerAction = 'continue'; },
    abort: async reason => { trackerAction = reason || 'abort'; }
  });
  assert.equal(trackerAction, 'blockedbyclient');
  assert.equal(session.blockedAdsCount, 1);
});
