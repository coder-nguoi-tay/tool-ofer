import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

/**
 * Kiểm tra phần ghi thao tác người dùng trên trình duyệt thật, chạy ĐÚNG đoạn script được
 * inject trong app.mjs (trích ra lúc chạy) chứ không phải bản sao. Bảo đảm: không lộ giá trị
 * input/select, chỉ lấy text của phần tử tương tác và tối đa 40 ký tự, và bỏ qua iframe.
 *
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-09
 */

// Trích thân hàm truyền cho page.evaluateOnNewDocument bằng cách cân bằng ngoặc nhọn.
function extractInjectedScript(source) {
  const marker = 'await page.evaluateOnNewDocument(() => {';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'không tìm thấy evaluateOnNewDocument trong app.mjs');
  const open = start + marker.length - 1;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error('ngoặc không cân bằng khi trích script inject');
}

const injected = extractInjectedScript(readFileSync(new URL('./app.mjs', import.meta.url), 'utf8'));
const records = [];

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.exposeFunction('__autoLeadWriteInteraction', (event) => { records.push(event); return Promise.resolve(); });
  await page.addInitScript({ content: injected });

  const doc = `<!doctype html><meta charset=utf-8>
    <div id="pii">email-bi-mat@example.com toi la Nguyen Van A</div>
    <span role="button" id="lnk" title="toolip rat dai qua gioi han bon muoi ky tu nen phai bi cat">Mo trang san pham cua toi that la dai qua gioi han 40 ky tu</span>
    <input id="inp" name="cardnumber" value="4111111111111111">
    <select id="sel" name="country"><option>VietNam</option><option value="us">UnitedStates</option></select>
    <iframe srcdoc="<span role='button' id='ifr'>click trong iframe</span>"></iframe>`;
  await page.goto(`data:text/html,${encodeURIComponent(doc)}`, { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => document.getElementById('pii').click());
  await page.evaluate(() => document.getElementById('lnk').click());
  await page.evaluate(() => document.getElementById('inp').click());
  await page.selectOption('#sel', 'us');
  await page.evaluate(() => document.querySelector('iframe').contentDocument.getElementById('ifr').click());
  await page.waitForTimeout(300);

  const clicks = records.filter((r) => r.type === 'click');
  const changes = records.filter((r) => r.type === 'change');

  const pii = clicks.find((r) => r.details?.target?.id === 'pii');
  assert.ok(pii, 'phải ghi click trên div');
  assert.equal(pii.details.target.text, undefined, 'KHÔNG được lộ text của div PII');

  const lnk = clicks.find((r) => r.details?.target?.id === 'lnk');
  assert.ok(lnk, 'phải ghi click trên nút');
  assert.equal(lnk.details.target.text.length, 40, 'text phải cắt còn 40 ký tự');
  assert.ok(lnk.details.target.text.startsWith('Mo trang'));
  assert.equal(lnk.details.target.label.length, 40, 'label (title) phải cắt còn 40 ký tự');

  const inp = clicks.find((r) => r.details?.target?.id === 'inp');
  assert.equal(inp.details.target.text, undefined, 'input mang giá trị không được lộ text');

  const sel = changes.find((r) => r.details?.target?.id === 'sel');
  assert.ok(sel, 'phải ghi change trên select');
  assert.equal(sel.details.target.text, undefined, 'KHÔNG được lộ nhãn option của select');
  assert.equal(sel.details.valueRedacted, true);

  assert.equal(records.find((r) => r.details?.target?.id === 'ifr'), undefined, 'thao tác trong iframe KHÔNG được ghi');

  console.log(`verify-logging OK: ${records.length} sự kiện | nút text="${lnk.details.target.text}" (${lnk.details.target.text.length}), label cắt ${lnk.details.target.label.length} | div/input/select không lộ text | iframe bị chặn`);
} finally {
  await browser.close();
}
