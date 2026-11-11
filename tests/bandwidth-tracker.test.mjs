import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  formatBytes,
  getLocalDateKey,
  recordBandwidthUsage,
  getBandwidthSummary,
  attachBandwidthTracker,
  bandwidthDailyStats,
  record711BalanceSample,
} from "../app.mjs";

test('formatBytes formats byte sizes accurately', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(-10), '0 B');
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(1024), '1.00 KB');
  assert.equal(formatBytes(1536 * 1024), '1.50 MB');
  assert.equal(formatBytes(1073741824), '1.00 GB');
});

test('getLocalDateKey returns YYYY-MM-DD format', () => {
  const key = getLocalDateKey();
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
});

test('recordBandwidthUsage and getBandwidthSummary accumulate accurately', () => {
  const initialAllTime = bandwidthDailyStats.totalBytesAllTime;
  const initialUpload = bandwidthDailyStats.totalUploadAllTime;
  const initialDownload = bandwidthDailyStats.totalDownloadAllTime;

  recordBandwidthUsage(10240, 1024, 9216);

  assert.equal(bandwidthDailyStats.totalBytesAllTime, initialAllTime + 10240);
  assert.equal(bandwidthDailyStats.totalUploadAllTime, initialUpload + 1024);
  assert.equal(bandwidthDailyStats.totalDownloadAllTime, initialDownload + 9216);

  const summary = getBandwidthSummary();
  assert.ok(summary.today);
  assert.ok(summary.allTime);
  assert.ok(Array.isArray(summary.daily));
  assert.equal(summary.today.date, getLocalDateKey());
  assert.ok(summary.today.totalBytes >= 10240);
  assert.ok(summary.today.formatted.includes('KB') || summary.today.formatted.includes('MB') || summary.today.formatted.includes('B'));
});

test('attachBandwidthTracker hooks requestfinished and tracks per session and tab', async () => {
  const mockContext = new EventEmitter();
  const session = {
    slot: 1,
    exitIp: '1.2.3.4',
  };

  attachBandwidthTracker(mockContext, session);
  assert.equal(session.bandwidthBytes, 0);
  assert.equal(session.bandwidthFormatted, '0 B');

  // Simulate a page/frame request
  const mockPage = {
    _bandwidthBytes: 0,
    _bytesSent: 0,
    _bytesReceived: 0,
  };
  const mockFrame = {
    page: () => mockPage,
  };
  const mockReq = {
    frame: () => mockFrame,
    sizes: async () => ({
      requestHeadersSize: 300,
      requestBodySize: 200,
      responseHeadersSize: 400,
      responseBodySize: 1600,
    }),
  };

  mockContext.emit('requestfinished', mockReq);
  // Wait a tick for async req.sizes()
  await new Promise(r => setTimeout(r, 50));

  // Up: 300 + 200 = 500, Down: 400 + 1600 = 2000, Total = 2500 bytes
  assert.equal(session.bandwidthBytes, 2500);
  assert.equal(session.bytesSent, 500);
  assert.equal(session.bytesReceived, 2000);
  assert.equal(session.requestCount, 1);
  assert.equal(session.bandwidthFormatted, formatBytes(2500));

  assert.equal(mockPage._bandwidthBytes, 2500);
  assert.equal(mockPage._bytesSent, 500);
  assert.equal(mockPage._bytesReceived, 2000);
  assert.equal(mockPage._requestCount, 1);
  assert.equal(mockPage._bandwidthFormatted, formatBytes(2500));
});

test('record711BalanceSample: số dư giảm = 711 thực trừ theo ngày/giờ, tăng = nạp gói', () => {
  const now = new Date(2026, 10, 10, 9, 15);
  const key = getLocalDateKey(now);
  bandwidthDailyStats.last711Balance = null;
  delete bandwidthDailyStats.daily[key];

  assert.equal(record711BalanceSample(5_000_000_000, now), 0); // lần đầu chỉ lấy mốc
  assert.equal(record711BalanceSample(4_900_000_000, now), 100_000_000);
  assert.equal(record711BalanceSample(4_900_000_000, now), 0);
  assert.equal(record711BalanceSample(4_850_000_000, now), 50_000_000);
  assert.equal(record711BalanceSample(6_000_000_000, now), 0); // nạp thêm gói, không tính tiêu hao

  assert.equal(bandwidthDailyStats.daily[key].proxy711Bytes, 150_000_000);
  assert.equal(bandwidthDailyStats.daily[key].proxy711Hours['09'], 150_000_000);
  assert.equal(bandwidthDailyStats.last711Balance, 6_000_000_000);
});
