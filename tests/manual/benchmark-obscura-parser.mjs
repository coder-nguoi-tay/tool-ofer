import '../helpers/obscura-data-fixture.mjs';
import http from 'node:http';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openObscuraBrowser } from '../../src/obscura-engine/open-obscura-browser.mjs';

/**
 * Đo thời điểm form khởi tạo với một script async chậm, chạy xen kẽ hai binary.
 * @param {string[]} binaries Binary baseline và binary mới, chỉ dùng fixture loopback.
 * @return {Promise<object>} Mẫu thời gian và RSS/CPU của process Obscura thử nghiệm.
 * @throws {Error} Khi engine không khởi động hoặc form không được tạo.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function benchmark(binaries) {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', request.url.endsWith('.js') ? 'application/javascript' : 'text/html');
    if (request.url === '/slow.js') { setTimeout(() => response.end('window.slowFinished=true;'), 600); return; }
    if (request.url === '/form.js') {
      setTimeout(() => response.end("const input=document.createElement('input');input.type='email';document.body.appendChild(input);window.formReadyAt=Date.now();"), 15);
      return;
    }
    response.end(`<!doctype html><html><head><script>window.requestStartedAt=${Date.now()};</script><script async src="/slow.js"></script><script async src="/form.js"></script></head><body></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const previousBinary = process.env.OBSCURA_BIN;
  const results = [];
  try {
    for (let round = 0; round < 4; round++) {
      const order = round % 2 ? [...binaries].reverse() : binaries;
      for (const binary of order) {
        process.env.OBSCURA_BIN = resolve(binary);
        const session = await openObscuraBrowser({ slot: 982, port: 0, registerSession: false, seed: 4242, os: 'windows' });
        try {
          const started = performance.now();
          await session.page.goto(`http://127.0.0.1:${server.address().port}/`);
          const result = await session.page.evaluate(() => ({ formReadyMs: window.formReadyAt - window.requestStartedAt, inputs: document.querySelectorAll('input').length }));
          if (result.inputs !== 1 || !Number.isFinite(result.formReadyMs)) throw new Error('Fixture không khởi tạo được form');
          const [rssKb, cpu] = execFileSync('ps', ['-p', String(session.pid), '-o', 'rss=,time='], { encoding: 'utf8' }).trim().split(/\s+/);
          if (round > 0) results.push({ binary: resolve(binary), round, ...result, navigationMs: Math.round(performance.now() - started), rssKb: Number(rssKb), cpu });
        } finally { await session.close(); }
      }
    }
    return { fixture: 'async-600ms/form-15ms', warmupRounds: 1, measuredRounds: 3, seed: 4242, results };
  } finally {
    if (previousBinary === undefined) delete process.env.OBSCURA_BIN;
    else process.env.OBSCURA_BIN = previousBinary;
    await new Promise(resolve => server.close(resolve));
  }
}

const binaries = process.argv.slice(2);
if (binaries.length !== 2) throw new Error('Cách chạy: node tests/manual/benchmark-obscura-parser.mjs <baseline-bin> <new-bin>');
console.log(JSON.stringify(await benchmark(binaries), null, 2));
