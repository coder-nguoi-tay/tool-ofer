import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LEAD_CONFIG,
  updateLeadConfig,
  isLeadPresent,
  normalizeIpAddress,
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
