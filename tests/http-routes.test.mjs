import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createInterfaceRequestHandler } from "../src/http/create-interface-request-handler.mjs";

test('HTTP: giao diện, tài nguyên và command dùng đúng handler sau khi tách file', async (t) => {
  const listener = createInterfaceRequestHandler({
    interfaceHtml: 'fallback-mac',
    interfacePcHtml: 'fallback-desktop',
    handlers: {
      '/check': async (body) => ({ received: JSON.parse(body) }),
      '/close': async () => { throw new Error('command-fixture-error'); },
    },
  });
  const server = createServer(listener);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [route, file] of [['/', 'desktop/index.html'], ['/pc', 'desktop/index.html'], ['/mac', 'mac/index.html'], ['/mini', 'mini/index.html']]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), await readFile(new URL('../ui/' + file, import.meta.url), 'utf8'));
  }
  const head = await fetch(base + '/mini', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(base + '/assets/desktop/app.js')).status, 200);
  const command = await fetch(base + '/check', { method: 'POST', body: JSON.stringify({ count: 3 }) });
  assert.equal(command.status, 200);
  assert.deepEqual(await command.json(), { received: { count: 3 } });
  const failed = await fetch(base + '/close', { method: 'POST', body: '{}' });
  assert.equal(failed.status, 400);
  assert.deepEqual(await failed.json(), { error: 'command-fixture-error' });
  assert.equal((await fetch(base + '/check')).status, 404);
  assert.equal((await fetch(base + '/does-not-exist')).status, 404);
  const missingStream = await fetch(base + '/screen/input/987654', { method: 'POST', body: '{}' });
  assert.equal(missingStream.status, 404);
  assert.deepEqual(await missingStream.json(), { error: 'stream not open' });
});
