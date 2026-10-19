import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LEAD_CONFIG,
  updateLeadConfig,
  isLeadPresent,
  normalizeIpAddress,
  recordLeadIpStats,
  getLeadIpStats,
  initLeadIpStats,
  clearLeadIpStats,
  leadIpStatsMap,
} from './lead-check.mjs';

test('normalizeIpAddress extracts pure IP without port or protocol', () => {
  assert.equal(normalizeIpAddress('http://192.168.1.1:8080'), '192.168.1.1');
  assert.equal(normalizeIpAddress('  65.35.139.24:9999 '), '65.35.139.24');
  assert.equal(normalizeIpAddress('1.1.1.1'), '1.1.1.1');
  assert.equal(normalizeIpAddress(''), '');
});

test('isLeadPresent identifies matching IP in results array', () => {
  const sampleLeadData = {
    results: [
      { id: '29914', nameoff: 'Test Offer', point: '0.3', ip: '65.35.139.24', geo: 'US' },
      { id: '29915', nameoff: 'Second Offer', point: '0.5', ip: '104.28.1.5', geo: 'CA' },
    ],
    check: '29914',
  };

  assert.equal(isLeadPresent(sampleLeadData, '65.35.139.24'), true);
  assert.equal(isLeadPresent(sampleLeadData, ['1.2.3.4', '104.28.1.5:8000']), true);
  assert.equal(isLeadPresent(sampleLeadData, '8.8.8.8'), false);
});

test('updateLeadConfig updates DEFAULT_LEAD_CONFIG correctly', () => {
  const originalDatas = DEFAULT_LEAD_CONFIG.datas;
  updateLeadConfig({ datas: '9999' });
  assert.equal(DEFAULT_LEAD_CONFIG.datas, '9999');

  // Khôi phục lại
  updateLeadConfig({ datas: originalDatas });
  assert.equal(DEFAULT_LEAD_CONFIG.datas, originalDatas);
});

test('recordLeadIpStats records and updates screen and jump count progressively', () => {
  clearLeadIpStats();
  const ip = '185.220.101.5';

  // Lần đầu xác nhận lead ở Màn 5 với 5 lần nhảy
  const first = recordLeadIpStats({
    ip,
    screen: 5,
    completedScreens: 4,
    jumpCount: 5,
    offerName: 'Survey Offer A',
  });

  assert.ok(first);
  assert.equal(first.ip, ip);
  assert.equal(first.screen, 5);
  assert.equal(first.completedScreens, 4);
  assert.equal(first.jumpCount, 5);

  // Tiến trình tiếp tục đến Màn 20 với 20 lần nhảy trang
  const updated = recordLeadIpStats({
    ip,
    screen: 20,
    completedScreens: 19,
    jumpCount: 20,
  });

  assert.equal(updated.screen, 20);
  assert.equal(updated.completedScreens, 19);
  assert.equal(updated.jumpCount, 20);
  assert.equal(updated.offerName, 'Survey Offer A');

  // Đảm bảo không bị lùi về số màn hoặc số lần nhảy nhỏ hơn nếu nhận event cũ
  const fallback = recordLeadIpStats({
    ip,
    screen: 10,
    jumpCount: 12,
  });

  assert.equal(fallback.screen, 20);
  assert.equal(fallback.jumpCount, 20);

  // Tra cứu theo IP (kèm port để test chuẩn hóa)
  const query = getLeadIpStats(`${ip}:8080`);
  assert.ok(query);
  assert.equal(query.screen, 20);
  assert.equal(query.jumpCount, 20);
});

test('initLeadIpStats and clearLeadIpStats initialize and reset persisted stats', () => {
  clearLeadIpStats();
  assert.equal(leadIpStatsMap.size, 0);

  initLeadIpStats({
    '45.33.32.1': { screen: 15, completedScreens: 14, jumpCount: 15, offerName: 'Offer B' },
    '198.51.100.2': { screen: 25, completedScreens: 24, jumpCount: 26, offerName: 'Offer C' },
  });

  assert.equal(leadIpStatsMap.size, 2);
  const item1 = getLeadIpStats('45.33.32.1');
  assert.equal(item1.screen, 15);
  assert.equal(item1.jumpCount, 15);

  const item2 = getLeadIpStats('198.51.100.2');
  assert.equal(item2.screen, 25);
  assert.equal(item2.jumpCount, 26);

  const allList = getLeadIpStats();
  assert.equal(allList.length, 2);

  clearLeadIpStats();
  assert.equal(leadIpStatsMap.size, 0);
});
