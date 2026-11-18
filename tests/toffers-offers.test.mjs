import test from 'node:test';
import assert from 'node:assert/strict';
import { parseToffersOfferRow } from '../lead-check.mjs';
import { fetchToffersOffers } from '../lead-check.mjs';
import { fetchToffersCountries } from '../lead-check.mjs';
import { fetchToffersNetworks } from '../lead-check.mjs';
import { handleGetToffersOffers } from '../src/http/routes/toffers/get-offers.mjs';
import { handleGetToffersCountries } from '../src/http/routes/toffers/get-countries.mjs';
import { handleGetToffersNetworks } from '../src/http/routes/toffers/get-networks.mjs';

test('parseToffersOfferRow trích xuất chính xác các trường từ dòng dữ liệu DataTables', () => {
  const sampleRow = [
    '<input value="2675" type="checkbox" name="checkid">',
    '2675',
    '<img alt="img" class="offer-img" width="30px" height="30px" src="https://toffers.top/uploads/offer_2675.png">',
    '30',
    'Sweepstakes Alert US CPA ',
    '<img src="https://toffers.top/assets/images/pc.png" />',
    ['us'],
    '0.5',
    '1417',
    '512',
    '<input onClick="this.setSelectionRange(0, this.value.length)" type="text" value="https://toffers.top/clicks/?key=33335&offer_id=2675&aff_id=qg39v&sub1={clickid}" class="form-control"><span style="display: none;">link</span>',
    '<input onClick="this.setSelectionRange(0, this.value.length)" type="text" value="https://toffers.top/click/?key=33335&offer_id=2675&aff_id=qg39v" class="form-control"><span style="display: none;">link</span>',
    '<a target="_blank" href="https://sweepstakesalerts.com/win-5k-prize/">Preview</a>',
    'Mo ta chi tiet',
    'Kpi danh gia',
    '<button>Details</button>',
    'Live'
  ];

  const parsed = parseToffersOfferRow(sampleRow);
  assert.ok(parsed, 'Kết quả không được null');
  assert.equal(parsed.id, '2675');
  assert.equal(parsed.name, 'Sweepstakes Alert US CPA');
  assert.equal(parsed.netId, '30');
  assert.equal(parsed.image, 'https://toffers.top/uploads/offer_2675.png');
  assert.equal(parsed.agent, 'pc');
  assert.deepEqual(parsed.geo, ['us']);
  assert.equal(parsed.payout, '0.5');
  assert.equal(parsed.clicks, '1417');
  assert.equal(parsed.leads, '512');
  assert.equal(parsed.linkClick, 'https://toffers.top/clicks/?key=33335&offer_id=2675&aff_id=qg39v&sub1={clickid}');
  assert.equal(parsed.linkLead, 'https://toffers.top/click/?key=33335&offer_id=2675&aff_id=qg39v');
  assert.equal(parsed.preview, 'https://sweepstakesalerts.com/win-5k-prize/');
  assert.equal(parsed.status, 'Live');
});

test('parseToffersOfferRow nhận diện agent android và ios', () => {
  const androidRow = new Array(17).fill('');
  androidRow[1] = '1001';
  androidRow[4] = 'Android App Offer';
  androidRow[5] = '<img src="/assets/images/android.png" />';
  const parsedAndroid = parseToffersOfferRow(androidRow);
  assert.equal(parsedAndroid.agent, 'android');

  const iosRow = new Array(17).fill('');
  iosRow[1] = '1002';
  iosRow[4] = 'iOS Game Offer';
  iosRow[5] = '<img src="/assets/images/ios.png" />';
  const parsedIos = parseToffersOfferRow(iosRow);
  assert.equal(parsedIos.agent, 'ios');
});

test('parseToffersOfferRow xử lý an toàn mảng rỗng hoặc không hợp lệ', () => {
  assert.equal(parseToffersOfferRow(null), null);
  assert.equal(parseToffersOfferRow([]), null);
  assert.equal(parseToffersOfferRow(['1', '2']), null);
});

test('fetchToffersOffers gửi đúng tham số và parse kết quả mock', async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, opts) => {
      assert.ok(url.includes('/partner/offers/get_offers/working'));
      assert.equal(opts.method, 'POST');
      assert.ok(opts.headers.Cookie.includes('qcodes_'));

      return new Response(JSON.stringify({
        draw: '2',
        recordsTotal: '1',
        recordsFiltered: '1',
        data: [[
          '<input value="999" type="checkbox">',
          '999',
          '',
          '10',
          'Mock Offer Working',
          '',
          ['ca'],
          '1.2',
          '100',
          '5',
          '<input value="https://toffers.top/clicks/?id=999">',
          '<input value="https://toffers.top/click/?id=999">',
          '<a href="https://example.com">Preview</a>',
          '',
          '',
          '',
          'Live'
        ]]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const res = await fetchToffersOffers({
      type: 'working',
      draw: 2,
      start: 0,
      length: 10,
      filters: { geo: 'ca' }
    });

    assert.equal(res.success, true);
    assert.equal(res.type, 'working');
    assert.equal(res.recordsTotal, 1);
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0].id, '999');
    assert.equal(res.data[0].name, 'Mock Offer Working');
    assert.equal(res.data[0].linkLead, 'https://toffers.top/click/?id=999');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('fetchToffersCountries và fetchToffersNetworks trả về danh sách chuẩn', async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (url.includes('get_country')) {
        return new Response(JSON.stringify([
          { id: 'us', text: 'United States (US)' },
          { id: 'vn', text: 'Vietnam (VN)' }
        ]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('get_network')) {
        return new Response(JSON.stringify([
          { id: '10', text: '10' },
          { id: '20', text: '20' }
        ]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected url: ${url}`);
    };

    const countries = await fetchToffersCountries();
    assert.equal(countries.length, 2);
    assert.equal(countries[0].id, 'us');

    const networks = await fetchToffersNetworks();
    assert.equal(networks.length, 2);
    assert.equal(networks[0].id, '10');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('handleGetToffersOffers trả về JSON qua HTTP route', async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      draw: 1,
      recordsTotal: 1,
      recordsFiltered: 1,
      data: [[
        '<input value="123">', '123', '', '5', 'HTTP Route Offer', '', ['us'], '0.9', '10', '1',
        '<input value="https://toffers.top/clicks/?123">',
        '<input value="https://toffers.top/click/?123">',
        '<a href="https://preview.com"></a>', '', '', '', 'Live'
      ]]
    }), { status: 200, headers: { 'content-type': 'application/json' } });

    const req = {
      method: 'GET',
      url: '/toffers/offers?type=working&length=5'
    };

    let responseData = '';
    let responseStatus = 0;
    const res = {
      writeHead(status, headers) {
        responseStatus = status;
      },
      end(data) {
        responseData = data;
      }
    };

    const handled = await handleGetToffersOffers(req, res);
    assert.equal(handled, true);
    assert.equal(responseStatus, 200);

    const parsed = JSON.parse(responseData);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data[0].id, '123');
    assert.equal(parsed.data[0].name, 'HTTP Route Offer');
    assert.equal(parsed.data[0].clicks, '10');
    assert.equal(parsed.data[0].leads, '1');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('renderToffersOffers hiển thị đúng số Clicks, số Leads và tỷ lệ CR', async () => {
  const fs = await import('node:fs/promises');
  const code = await fs.readFile('ui/desktop/functions/render-toffers-offers.js', 'utf8');

  // Tạo môi trường DOM giả lập tối thiểu để chạy renderToffersOffers
  const domElements = {
    dgvToffersOffersBody: { innerHTML: '' },
    toffersOfferCountText: { textContent: '' },
    tabToffersOffersCount: { textContent: '' },
    toffersPaginationControls: { innerHTML: '' }
  };

  const fakeDocument = {
    getElementById: (id) => domElements[id] || null
  };

  const sandbox = {
    document: fakeDocument,
    window: { currentToffersPage: 0, currentToffersPageSize: 20 },
    escHtml: (str) => String(str || '').replace(/[&<>"']/g, ''),
  };

  const vm = await import('node:vm');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  sandbox.renderToffersOffers({
    success: true,
    recordsTotal: 1,
    recordsFiltered: 1,
    type: 'working',
    data: [{
      id: '2675',
      name: 'Sweepstakes Alert US CPA',
      clicks: '1000',
      leads: '250',
      geo: ['us'],
      payout: '1.5',
      linkLead: 'https://toffers.top/click/?id=2675',
      linkClick: 'https://toffers.top/clicks/?id=2675'
    }]
  });

  const html = domElements.dgvToffersOffersBody.innerHTML;
  assert.ok(html.includes('1000'), 'Phải chứa số clicks');
  assert.ok(html.includes('250'), 'Phải chứa số leads');
  assert.ok(html.includes('25.0%'), 'Phải tính và hiển thị đúng CR (250/1000 = 25.0%)');
  assert.ok(html.includes('https://toffers.top/click/?id=2675'), 'Phải chứa link lead');
});
