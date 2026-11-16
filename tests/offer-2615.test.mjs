import assert from 'node:assert/strict';
import test from 'node:test';
import { isOffer2615, isOffer2615Configured } from '../src/autofill/offers/2615/match-offer.mjs';
import { dispatchOfferCustomPreScan } from '../src/autofill/offers/index.mjs';
import { clickPathThankyouButton } from '../src/autofill/offers/2615/click-path-thankyou.mjs';
import { verifyOffer2615Landing } from '../src/autofill/offers/2615/verify-offer-landing.mjs';
import { handleNoSurvey } from '../src/autofill/adsmith/handle-no-survey.mjs';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';
import { recoverConfirmedLeadErrorPage } from '../src/leads/actions/recover-confirmed-lead-error-page.mjs';
import { attachMaxRunTimer } from '../src/browser/actions/attach-max-run-timer.mjs';

test('isOffer2615 nhận diện chính xác offer 2615 từ websiteUrl, offerId và URL trang', () => {
  // Khớp qua session.websiteUrl
  assert.equal(isOffer2615(null, { websiteUrl: 'https://toffers.top/click/?key=33335&offer_id=2615&aff_id=qg39v' }), true);
  assert.equal(isOffer2615(null, { websiteUrl: 'https://example.com/?offer_id=2615' }), true);

  // Khớp qua session.offerId
  assert.equal(isOffer2615(null, { offerId: '2615' }), true);
  assert.equal(isOffer2615(null, { offerId: 2615 }), true);

  // Khớp qua page.url()
  const mockPage1 = { url: () => 'https://blog.financialhelpfinder.com/paththankyou.php' };
  const mockPage2 = { url: () => 'https://financialhelpfinder.com/thankyou.php' };
  const mockPage3 = { url: () => 'https://www.financialhelpfinder.com/' };
  assert.equal(isOffer2615(mockPage1, {}), true);
  assert.equal(isOffer2615(mockPage2, {}), true);
  assert.equal(isOffer2615(mockPage3, {}), true);

  // Không khớp với offer hoặc URL khác
  assert.equal(isOffer2615(null, { websiteUrl: 'https://toffers.top/click/?key=33335&offer_id=9999' }), false);
  assert.equal(isOffer2615({ url: () => 'https://example.com/other-page' }, {}), false);
  assert.equal(isOffer2615(null, {}), false);
});

test('dispatchOfferCustomPreScan bỏ qua các offer không khớp', async () => {
  const mockPage = { url: () => 'https://other-offer.com/form' };
  const handled = await dispatchOfferCustomPreScan(mockPage, {
    session: { websiteUrl: 'https://other-offer.com' },
    options: {}
  });
  assert.equal(handled, false, 'Không can thiệp vào các offer khác');
});

test('dispatchOfferCustomPreScan cho offer 2615 ở trang form thường vẫn trả về false để điền form bình thường', async () => {
  const mockPage = {
    url: () => 'https://blog.financialhelpfinder.com/step1.php',
    locator: () => ({ first: () => ({ isVisible: async () => false }) })
  };
  const handled = await dispatchOfferCustomPreScan(mockPage, {
    session: { websiteUrl: 'https://toffers.top/click/?offer_id=2615' },
    options: {}
  });
  assert.equal(handled, false, 'Trang form bình thường không bị chặn');
});

test('dispatchOfferCustomPreScan tôn trọng lựa chọn Cách giải offerSolver (generic | 2615 | auto)', async () => {
  const mockPathThankyouPage = {
    url: () => 'https://blog.financialhelpfinder.com/paththankyou.php',
    locator: () => ({ first: () => ({ isVisible: async () => false }) })
  };

  // 1. Khi chọn generic: Bỏ qua hoàn toàn kể cả trang là paththankyou của 2615
  const handledGeneric = await dispatchOfferCustomPreScan(mockPathThankyouPage, {
    session: { offerSolver: 'generic', websiteUrl: 'https://toffers.top/click/?offer_id=2615' },
    options: {}
  });
  assert.equal(handledGeneric, false, 'Khi chọn generic thì không gọi solver 2615');

  // 2. Khi chọn 2615: Ép chạy solver 2615 kể cả websiteUrl không chứa offer_id
  const handledForce2615 = await dispatchOfferCustomPreScan(mockPathThankyouPage, {
    session: { offerSolver: '2615', websiteUrl: 'https://unrelated-domain.com' },
    options: {}
  });
  assert.equal(handledForce2615, true, 'Khi ép solver 2615 thì gọi solver 2615');

  // 3. Khi chọn auto: Tự nhận diện theo URL
  const handledAuto = await dispatchOfferCustomPreScan(mockPathThankyouPage, {
    session: { offerSolver: 'auto', websiteUrl: 'https://toffers.top/click/?offer_id=2615' },
    options: {}
  });
  assert.equal(handledAuto, true, 'Auto tự nhận diện được offer 2615');
});

test('handleNoSurvey bỏ qua khi session.offerSolver là generic', async () => {
  const mockFrame = {
    url: () => 'https://www.adsmith.io/forge/v4/?plc=9235',
    parentFrame: () => ({ url: () => 'https://financialhelpfinder.com/' }),
    frameElement: async () => ({ getAttribute: async () => 'AS_IFRAME', dispose: async () => {} })
  };
  const mockPage = { _autofillSession: { offerSolver: 'generic' } };

  const result = await handleNoSurvey(mockFrame, mockPage, {});
  assert.equal(result, null, 'Khi chọn generic thì không kích hoạt handleNoSurvey của 2615');
});

test('fillPageForms tích hợp đúng luồng: generic không chặn, 2615 xử lý đúng paththankyou', async () => {
  let footerMarked = false;
  const createMockPage = (url, solver) => ({
    isClosed: () => false,
    url: () => url,
    frames: function() { return [this]; },
    locator: () => ({
      first: () => ({
        isVisible: async () => true,
        scrollIntoViewIfNeeded: async () => {},
        evaluate: async () => {},
        click: async () => true
      })
    }),
    evaluate: async (fn) => {
      if (fn && fn.name === 'markFooterLikeLinks') footerMarked = true;
      return null;
    },
    _autofillSession: { offerSolver: solver, websiteUrl: 'https://toffers.top/click/?offer_id=2615' }
  });

  // Trường hợp 1: Chế độ generic -> không bị chặn ở pre-scan của 2615
  footerMarked = false;
  const genericPage = createMockPage('https://blog.financialhelpfinder.com/paththankyou.php', 'generic');
  await fillPageForms(genericPage, {
    session: genericPage._autofillSession,
    sessionRecord: {},
    options: {}
  });
  assert.equal(footerMarked, true, 'Generic cho phép đi tiếp qua các bước sau thay vì bị chặn ở pre-scan 2615');

  // Trường hợp 2: Chế độ 2615 -> xử lý xong tại pre-scan và dừng (không chạy tiếp xuống markFooterLikeLinks)
  footerMarked = false;
  const solver2615Page = createMockPage('https://blog.financialhelpfinder.com/paththankyou.php', '2615');
  await fillPageForms(solver2615Page, {
    session: solver2615Page._autofillSession,
    sessionRecord: {},
    options: {}
  });
  assert.equal(footerMarked, false, 'Solver 2615 xử lý xong paththankyou và dừng ngay, không chạy tiếp pipeline generic');
});

test('luồng Offer 2615 khi đã có lead: cứ tiếp tục F5 qua 3 lần để làm hết thay vì dừng tắt gây mất lead', async (t) => {
  let reloads = 0;
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);

  const mockSession = {
    exitIp: '198.51.100.77',
    confirmedLeadIp: '198.51.100.77',
    leadCheckStatus: 'confirmed',
    websiteUrl: 'https://toffers.top/click/?key=33335&offer_id=2615&aff_id=qg39v',
    offerSolver: '2615',
    lastActionTime: now
  };

  const mockPage = {
    isClosed: () => false,
    url: () => 'https://blog.financialhelpfinder.com/step-error',
    _uxMainStatus: 502,
    reload: async () => {
      reloads++;
      return { status: () => 502 }; // Giả lập vẫn lỗi để kiểm tra số lần F5
    }
  };

  // Thử 5 lượt F5 liên tiếp (mỗi lượt cách nhau 16s quá hạn cooldown 15s)
  for (let i = 0; i < 5; i++) {
    const res = await recoverConfirmedLeadErrorPage(mockSession, mockPage);
    assert.equal(res, true);
    now += 16_000;
  }

  assert.equal(reloads, 5, 'Với luồng 2615 có lead: không dừng ở 3 lần mà tiếp tục F5 cả 5 lượt');
  assert.equal(mockPage._uxErrorRecoveryExhausted, false, 'Tuyệt đối không đánh dấu exhausted làm tắt browser');
});

test('luồng Offer 2615 khi đã có lead: attachMaxRunTimer không tự đóng trình duyệt khi hết giờ', async () => {
  let browserClosed = false;
  const mockSession = {
    isClosed: false,
    exitIp: '198.51.100.88',
    confirmedLeadIp: '198.51.100.88',
    leadCheckStatus: 'confirmed',
    websiteUrl: 'https://toffers.top/click/?key=33335&offer_id=2615',
    offerSolver: '2615',
    browser: { isClosed: () => false, close: () => { browserClosed = true; } }
  };

  // Hẹn giờ 0.001 phút (~60ms)
  const cancel = attachMaxRunTimer(mockSession, 0.001, () => { browserClosed = true; });
  await new Promise(r => setTimeout(r, 120));
  cancel();

  assert.equal(browserClosed, false, 'Luồng 2615 có lead không bị đóng trình duyệt theo timer');
});

test('isOffer2615Configured nhận diện đúng cấu hình ban đầu của Offer 2615', () => {
  assert.equal(isOffer2615Configured({ offerSolver: '2615' }), true);
  assert.equal(isOffer2615Configured({ websiteUrl: 'https://toffers.top/click/?key=1&offer_id=2615' }), true);
  assert.equal(isOffer2615Configured({ offerId: '2615' }), true);
  assert.equal(isOffer2615Configured({ websiteUrl: 'https://blog.financialhelpfinder.com/path1' }), true);
  assert.equal(isOffer2615Configured({ offerSolver: 'generic', websiteUrl: 'https://toffers.top/click/?offer_id=2615' }), false);
  assert.equal(isOffer2615Configured({ websiteUrl: 'https://toffers.top/click/?offer_id=2672' }), false);
});

test('verifyOffer2615Landing: tải đúng blog.financialhelpfinder.com thì hợp lệ, không đóng trình duyệt', async () => {
  let closeCalled = false;
  const mockSession = {
    websiteUrl: 'https://toffers.top/click/?key=33335&offer_id=2615',
    offerSolver: '2615'
  };
  const mockPage = {
    url: () => 'https://blog.financialhelpfinder.com/find-financial-help-programs/?subid=123'
  };

  const handled = await verifyOffer2615Landing(mockPage, mockSession, {
    closeActiveBrowsers: async () => { closeCalled = true; }
  });

  assert.equal(handled, false, 'Không báo link sai');
  assert.equal(closeCalled, false, 'Không gọi đóng trình duyệt');
  assert.equal(mockSession._offer2615LandingVerified, true, 'Đã xác thực landing thành công');
});

test('verifyOffer2615Landing: tải link mở ra KHÔNG PHẢI blog.financialhelpfinder.com thì dừng phiên và bù phiên mới', async () => {
  let sessionClosed = false;
  let refillCalled = false;
  const logs = [];
  const mockSession = {
    websiteUrl: 'https://toffers.top/click/?key=33335&offer_id=2615',
    offerSolver: '2615',
    addBrowserLog: (entry) => logs.push(entry)
  };
  // Trang bị redirect sang toffers error hoặc offer khác
  const mockPage = {
    url: () => 'https://toffers.top/error.php?error=ip_192.0.2.1_clicked_offer_2615'
  };

  const handled = await verifyOffer2615Landing(mockPage, mockSession, {
    closeSession: async () => { sessionClosed = true; },
    queueAutomaticRefill: () => { refillCalled = true; },
    onLog: (entry) => logs.push(entry)
  });

  assert.equal(handled, true, 'Phải báo link sai và xử lý đóng');
  assert.equal(sessionClosed, true, 'Phải đóng phiên này');
  assert.equal(mockSession.isClosed, true, 'Phiên được đánh dấu đã đóng');
  assert.equal(mockSession.suppressAutoRefill, false, 'Cho phép tự bù phiên mới');
  assert.equal(mockSession._offer2615InvalidLandingTriggered, true, 'Ghi nhận cờ đóng');
  assert.ok(logs.some(l => l.type === 'offer_2615_invalid_landing'), 'Có log ghi nhận link sai');
});

test('verifyOffer2615Landing: tải link mở ra domain khác (wrong offer) thì dừng phiên và bù phiên mới', async () => {
  let sessionClosed = false;
  const mockSession = {
    websiteUrl: 'https://toffers.top/click/?key=33335&offer_id=2615',
    offerSolver: 'auto'
  };
  const mockPage = {
    url: () => 'https://surveyjunkie.com/register?aff=123'
  };

  const handled = await verifyOffer2615Landing(mockPage, mockSession, {
    closeSession: async () => { sessionClosed = true; },
    landingTimeoutMs: 100
  });

  assert.equal(handled, true, 'Phải báo link sai');
  assert.equal(sessionClosed, true, 'Phải đóng phiên này');
});

test('verifyOffer2615Landing: khi đang ở toffers.top/click sau đó vài giây chuyển hướng đến blog.financialhelpfinder.com thì thành công và không tắt trình duyệt', async () => {
  let sessionClosed = false;
  const mockSession = {
    websiteUrl: 'https://toffers.top/click/?key=33335&offer_id=2615',
    offerSolver: '2615'
  };
  let currentUrl = 'https://toffers.top/click/?key=33335&offer_id=2615';

  // Giả lập topoffer tải xong và chuyển hướng sang blog.financialhelpfinder.com sau 150ms
  setTimeout(() => {
    currentUrl = 'https://blog.financialhelpfinder.com/find-financial-help-programs/';
  }, 150);

  const mockPage = {
    url: () => currentUrl,
    waitForURL: async (predicate, { timeout } = {}) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (predicate({ href: currentUrl })) return;
        await new Promise(r => setTimeout(r, 50));
      }
      throw new Error('timeout');
    }
  };

  const handled = await verifyOffer2615Landing(mockPage, mockSession, {
    closeSession: async () => { sessionClosed = true; },
    landingTimeoutMs: 2000
  });

  assert.equal(handled, false, 'Không báo link sai khi chuyển hướng thành công');
  assert.equal(sessionClosed, false, 'Không được tắt trình duyệt');
  assert.equal(mockSession._offer2615LandingVerified, true, 'Đã xác nhận landing');
});

test('verifyOffer2615Landing: sau vài giây ở topoffer mà không chuyển hướng đến blog.financialhelpfinder.com thì dừng phiên và bù phiên mới', async () => {
  let sessionClosed = false;
  const mockSession = {
    websiteUrl: 'https://toffers.top/click/?key=33335&offer_id=2615',
    offerSolver: '2615'
  };
  const mockPage = {
    url: () => 'https://toffers.top/landing-stuck-page',
    waitForURL: async () => {
      await new Promise(r => setTimeout(r, 200));
      throw new Error('waitForURL timeout');
    }
  };

  const handled = await verifyOffer2615Landing(mockPage, mockSession, {
    closeSession: async () => { sessionClosed = true; },
    landingTimeoutMs: 200
  });

  assert.equal(handled, true, 'Phải báo link sai sau khi hết thời gian chờ chuyển hướng');
  assert.equal(sessionClosed, true, 'Phải dừng phiên');
});

test('verifyOffer2615Landing: một khi đã verify landing ban đầu thì các bước sau không bị kích hoạt lại', async () => {
  let closeCalled = false;
  const mockSession = {
    websiteUrl: 'https://toffers.top/click/?key=33335&offer_id=2615',
    offerSolver: '2615',
    _offer2615LandingVerified: true
  };
  const mockPage = {
    url: () => 'https://financialhelpfinder.com/thankyou.php'
  };

  const handled = await verifyOffer2615Landing(mockPage, mockSession, {
    closeActiveBrowsers: async () => { closeCalled = true; }
  });

  assert.equal(handled, false);
  assert.equal(closeCalled, false, 'Các bước sau không bị đóng');
});

test('verifyOffer2615Landing: không áp dụng cho cấu hình generic hoặc offer khác', async () => {
  let closeCalled = false;
  const mockSessionGeneric = {
    websiteUrl: 'https://toffers.top/click/?offer_id=2615',
    offerSolver: 'generic'
  };
  const mockPage = {
    url: () => 'https://some-other-domain.com/form'
  };

  const handled = await verifyOffer2615Landing(mockPage, mockSessionGeneric, {
    closeActiveBrowsers: async () => { closeCalled = true; }
  });

  assert.equal(handled, false, 'Generic không bị can thiệp');
  assert.equal(closeCalled, false);
});


