import assert from 'node:assert/strict';
import test from 'node:test';
import { browserProfilePath } from './app.mjs';

test('CloakBrowser không dùng lại profile Chrome có phiên bản engine khác', () => {
  const build = { channel: 'stable', version: '150.0.7871.187' };
  const chromePath = browserProfilePath(build, 'same-proxy');
  const cloakPath = browserProfilePath(build, 'same-proxy', '145.0.7632.109.2');

  assert.match(chromePath, /chrome-profiles\/stable\/150\.0\.7871\.187\/same-proxy$/);
  assert.match(cloakPath, /chrome-profiles\/cloakbrowser\/145\.0\.7632\.109\.2\/same-proxy$/);
  assert.notEqual(chromePath, cloakPath);
});
