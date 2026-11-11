import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Script } from 'node:vm';
import { serveUiAsset } from "../src/http/ui-assets.mjs";

test('giao diện tải được CSS/JS qua HTTP và HEAD không gửi nội dung', async (t) => {
  const server = createServer(async (request, response) => {
    if (await serveUiAsset(request, response)) return;
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const feature of ['mac', 'desktop', 'mini']) {
    const bundles = JSON.parse(await readFile(new URL("../ui/bundles.json", import.meta.url), 'utf8'));
    const html = await readFile(new URL(`../ui/${feature}/index.html`, import.meta.url), 'utf8');
    for (const [file, mime] of [['app.js', 'text/javascript'], ['styles.css', 'text/css']]) {
      const path = `/assets/${feature}/${file}`;
      assert.ok(html.includes(`"${path}"`));
      const response = await fetch(base + path + '?v=1');
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('content-type').startsWith(mime));
      const sources = await Promise.all(bundles[`${feature}/${file}`].map((part) => readFile(new URL(`../ui/${part}`, import.meta.url), 'utf8')));
      const body = await response.text();
      assert.equal(body, sources.join(file.endsWith('.js') ? '\n;\n' : '\n'));
      if (file.endsWith('.js')) assert.doesNotThrow(() => new Script(body, { filename: path }));
      const head = await fetch(base + path, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
    }
  }
  for (const path of ['/assets/unknown/app.js', '/assets/desktop/../../package.json']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  assert.equal((await fetch(base + '/assets/mac/app.js', { method: 'POST' })).status, 404);
});
