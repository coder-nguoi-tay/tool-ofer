import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { prepareSnapshotHtml } from '../src/logging/recorder/prepare-snapshot-html.mjs';
import { getSnapshotDelay } from '../src/logging/recorder/get-snapshot-delay.mjs';
import { summarizeRecordingSession } from '../src/logging/recorder/summarize-recording-session.mjs';
import { attachRequestLogging } from '../src/http/attach-request-logging.mjs';

test('snapshot bỏ script/data URI lớn và marker động; giữ form và giới hạn 512 KB có cảnh báo', () => {
  const first = prepareSnapshotHtml('<script>' + 's'.repeat(100000) + '</script><form data-ux-scope="one"><select><option>One</option></select></form><autoleadpc-mouse-pointer style="left:5px"></autoleadpc-mouse-pointer><img src="data:image/png;base64,' + 'A'.repeat(5000) + '">');
  const second = prepareSnapshotHtml('<form data-ux-scope="two"><select><option>One</option></select></form><img src="data:image/png;base64,' + 'B'.repeat(5000) + '">');
  assert.equal(first.contentHash, second.contentHash);
  assert.match(first.html, /<select>/);
  assert.doesNotMatch(first.html, /<script|mouse-pointer|A{100}/);
  const huge = prepareSnapshotHtml('<div>' + 'é'.repeat(400000) + '</div>');
  assert.ok(huge.htmlStoredBytes <= 512 * 1024);
  assert.equal(huge.htmlTruncated, true);
  assert.match(huge.html, /snapshot truncated/);
  assert.notEqual(prepareSnapshotHtml('<select><option>Two</option></select>').contentHash, second.contentHash);
});

test('nhịp snapshot thường chờ 5s, lỗi mới và đổi URL được ưu tiên', () => {
  const page = { url: () => 'https://offer.test/form' };
  const state = { entries: [{ type: 'page_loaded' }], previousSnapshot: { snapshotUrl: page.url() }, lastCheckedAt: 10000 };
  assert.equal(getSnapshotDelay(page, state, 11000), 4000);
  assert.equal(getSnapshotDelay(page, { ...state, entries: [{ type: 'page_error' }] }, 11000), 650);
  assert.equal(getSnapshotDelay({ url: () => 'https://offer.test/next' }, state, 11000), 650);
});

test('tóm tắt có trần 100 mốc, giữ lỗi đầu và chuỗi AI mới nhất mà không giữ dữ liệu nặng', () => {
  const original = { id: 'session', logs: Array.from({ length: 300 }, (_, index) => ({ id: String(index), sequence: index, type: index === 0 ? 'page_error' : 'ai_action', detail: 'x'.repeat(1000), htmlPath: '/old.html', recentActions: [1, 2, 3] })) };
  original.logs[2].type = 'page_loaded';
  original.logs[2].snapshotError = 'capture timeout';
  const summary = summarizeRecordingSession(original, 10000);
  assert.equal(summary.logs.length, 100);
  assert.equal(summary.logs[0].id, '0');
  assert.equal(summary.logs.at(-1).id, '299');
  assert.equal(summary.logs[0].detail.length, 600);
  assert.equal(summary.logs[0].htmlPath, undefined);
  assert.equal(summary.logs[2].snapshotError, 'capture timeout');
  assert.equal(summary.omittedEventCount, 200);
  assert.equal(original.logs.length, 300);
});

test('HTTP bỏ polling thành công, giữ lỗi/lệnh/abort một dòng và không log query', t => {
  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
  for (const [method, url, status, aborted] of [
    ['GET', '/state?secret=hidden', 200], ['POST', '/toffers/overview', 200], ['GET', '/proxy-queue', 200],
    ['GET', '/state', 503], ['POST', '/launch?secret=hidden', 200], ['GET', '/state', 200, true]
  ]) {
    const response = new EventEmitter();
    response.statusCode = status;
    response.writableFinished = !aborted;
    attachRequestLogging({ method, url }, response);
    if (!aborted) response.emit('finish');
    response.emit('close');
  }
  assert.equal(logs.length, 3);
  assert.match(logs[0], /GET \/state 503/);
  assert.match(logs[1], /POST \/launch 200/);
  assert.match(logs[2], /aborted/);
  assert.ok(logs.every(line => !line.includes('secret')));
});
