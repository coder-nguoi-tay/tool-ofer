import assert from 'node:assert/strict';
import test from 'node:test';
import { browserProfilePath } from "../app.mjs";

test('profile Chrome tách theo kênh, phiên bản Chrome và proxy', () => {
  const build = { channel: 'stable', version: '150.0.7871.187' };
  const chromePath = browserProfilePath(build, 'same-proxy');

  assert.match(chromePath, /chrome-profiles\/stable\/150\.0\.7871\.187\/same-proxy$/);
  assert.notEqual(browserProfilePath({ ...build, version: '152.0.7977.83' }, 'same-proxy'), chromePath);
});
