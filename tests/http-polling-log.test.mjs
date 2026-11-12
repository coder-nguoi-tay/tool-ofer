import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { attachRequestLogging } from '../src/http/attach-request-logging.mjs';

/**
 * Gửi một request giả qua logger và trả các dòng log in ra.
 * @param {object} t Context node:test.
 * @param {Array<[string, string, number|null, boolean?]>} requests [method, url, status, aborted].
 * @return {string[]} Dòng log.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
function run(t, requests) {
  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
  for (const [method, url, status, aborted] of requests) {
    const response = new EventEmitter();
    response.statusCode = status;
    response.writableFinished = !aborted;
    attachRequestLogging({ method, url }, response);
    if (!aborted) response.emit('finish');
    response.emit('close');
  }
  return logs;
}

test('HTTP: polling của Screen View / log / Telegram thành công không ghi log', t => {
  const logs = run(t, [
    ['GET', '/browser-logs', 200], ['GET', '/telegram/config', 200], ['GET', '/screen/snapshot/5', 200],
    ['GET', '/screen/tabs/1', 200], ['POST', '/screen/input/1', 200], ['GET', '/screen/stream/1', null, true]
  ]);
  assert.deepEqual(logs, []);
});

test('HTTP: lỗi của các endpoint đó vẫn ghi; lệnh thật vẫn ghi', t => {
  const logs = run(t, [['GET', '/screen/snapshot/5', 503], ['POST', '/screen/input/1', 500], ['POST', '/stop', 200], ['GET', '/browser-logs', 200, true]]);
  assert.equal(logs.length, 4);
  assert.match(logs[0], /GET \/screen\/snapshot\/5 503/);
  assert.match(logs[2], /POST \/stop 200/);
  assert.match(logs[3], /GET \/browser-logs aborted/);
});
