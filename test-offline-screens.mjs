/**
 * Test offline autofill trên bộ file HTML mẫu đã ghi nhận từ các phiên thật
 * (~/Downloads/mau-man-hinh-offer). Mỗi màn được nạp bằng Playwright (headless),
 * chạy handler chuyên dụng nhiều lượt, rồi kiểm tra trạng thái DOM sau chọn.
 *
 * Chạy: node test-offline-screens.mjs
 *
 * @author coder-nguoi-tay
 * @since 2026-10-25
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { handleAlphaIntentQuestions, handleAlphaIntentSoiCards, handleAdsmithSurvey, handleTwyOfferCards, handleOfferwallTasks, handleMuiQuestionButtons, handleGoogleOauthSkip, handleSurveySemanticQuestions } from './autofill.mjs';

const TEST_RECORD = { firstname: 'John', lastname: 'Doe', email: 'john.doe814@gmail.com', mail: 'john.doe814@gmail.com', zipcode: '35549', zip: '35549', phonenumber: '8147420430', phone: '8147420430', addressline1: '123 Main St', city: 'Arlington', state: 'TX', birthyear: '1990', birthmonth: '04', birthday: '07' };

const SAMPLE_DIR = join(process.env.HOME, 'Downloads', 'mau-man-hinh-offer');
const SCANS_PER_SCREEN = 8;

/**
 * HTTP server nội bộ petr phục vụ bộ mẫu qua 127.0.0.1 (thay cho file://)
 * — engine alpha-intent của funnel cần origin http hợp lệ để init/fetch.
 *
 * @param {number} port Cổng lắng nghe.
 * @return {Promise<import('node:http').Server>} Server đã sẵn sàng.
 * @author coder-nguoi-tay
 * @since 2026-10-25
 */
function serveSamples(port) {
  const server = createServer((req, res) => {
    const name = decodeURIComponent((req.url || '/').replace(/^\//, '')) || 'index.html';
    const file = `${SAMPLE_DIR}/${name}`;
    try {
      const html = readFileSync(file);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

/**
 * Chạy bộ test offline trên toàn bộ file mẫu, mỗi file dùng 1 page riêng.
 *
 * @return {Promise<void>} In kết quả pass/fail từng màn.
 * @author coder-nguoi-tay
 * @since 2026-10-25
 */
async function main() {
  const PORT = 3287;
  const server = await serveSamples(PORT);
  const files = readdirSync(SAMPLE_DIR).filter((f) => f.endsWith('.html') && f !== 'index.html').sort();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  // Chặn mọi request ngoài server mẫu: engine alpha-intent gọi API thật sẽ đôi khi
  // rate limit (429) rồi XOÁ DOM câu hỏi → test flake.Offline thật về network vẫn có
  // DOM snapshot nguyên vẹn, đủ để test handler.
  await context.route(/^(?!.*127\.0\.0\.1:3287)/, (route) => route.abort().catch(() => {}));
  const results = [];

  for (const file of files) {
    const page = await context.newPage();
    const logs = [];
    const onLog = (e) => logs.push(`${e.type}: ${(e.detail || '').slice(0, 90)}`);
    try {
      await page.goto(`http://127.0.0.1:${PORT}/${encodeURIComponent(file)}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      // Chờ engine alpha-intent init/interstitial (đối chiếu data-object-interstitial-timeout-seconds=3)
      const frame = page.mainFrame();
      await page.waitForTimeout(3600).catch(() => {});
      // Engine alpha-intent thật cần API/interstitial để "bật" màn câu hỏi (mở visibility).
      // Test offline mô phỏng đúng bước đó: nếu màn câu hỏi chưa được bật thì bật nó như engine.
      await frame.evaluate(() => {
        document.querySelectorAll('.ai-content.question-object, #alpha-intent-content').forEach((q) => {
          q.style.visibility = 'visible';
          q.style.opacity = '1';
        });
        document.querySelectorAll('button.question-answer-button').forEach((b) => {
          b.classList.remove('ai-pointer-events-none');
          b.style.pointerEvents = 'auto';
          // visibility kế thừa từ tổ tiên: ch rods tất cả tổ tiên (engine thật bật tổ tiên khi active màn)
          let a = b.parentElement;
          while (a && a !== document.body) {
            a.style.visibility = 'visible';
            a = a.parentElement;
          }
        });
      }).catch(() => {});
      // Trạng thái "đã có lựa chọn trước khi test" phải đọc TRƯỚC khi chạy handler
      // (sau khi chọn, nút tự có class selected/active — gây nhầm là state cũ).
      const preAnswered = await frame.evaluate(() => {
        const sel = document.querySelector('button.question-answer-button.selected, button.question-answer-button.active, button.question-answer-button[data-ux-clicked="1"], button.question-answer-button[data-ux-submitted="1"]');
        return sel ? (sel.innerText || '').trim().slice(0, 40) : null;
      }).catch(() => null);
      let clicks = 0;
      for (let i = 0; i < SCANS_PER_SCREEN; i++) {
        clicks += await handleAlphaIntentQuestions(page, frame, { onLog }).catch(() => 0);
        clicks += await handleAlphaIntentSoiCards(page, frame, { onLog }).catch(() => 0);
        clicks += await handleTwyOfferCards(frame, TEST_RECORD, { onLog }).catch(() => 0);
        clicks += await handleOfferwallTasks(page, frame, { onLog }).catch(() => 0);
        clicks += await handleMuiQuestionButtons(page, frame, { onLog }).catch(() => 0);
        clicks += await handleGoogleOauthSkip(page, frame, { onLog }).catch(() => 0);
        clicks += await handleSurveySemanticQuestions(page, frame, { onLog, record: { age: 31, vehicle_type: 'Car' } }).catch(() => 0);
      }
      // Trạng thái DOM sau chọn
      const state = await frame.evaluate(() => {
        const qClicked = Array.from(document.querySelectorAll('[data-ux-qclicked="1"]')).map((b) => (b.innerText || '').trim().slice(0, 40));
        const soiDone = document.querySelector('[data-ux-soi-done="1"]');
        const soiChoice = soiDone ? (soiDone.querySelector('#ct-creative-submit-yes') ? 'YES' : (soiDone.querySelector('#ct-creative-submit-no') ? 'NO' : '?')) : null;
        const twyAnswered = Array.from(document.querySelectorAll('input[id*="twyinputyes-"]:checked, input[id*="twyinputno-"]:checked')).length;
        const twyFilled = Array.from(document.querySelectorAll('input[twyfieldtype], input[twyregisterfield]')).filter((i) => i.value).length;
        return { qClicked, soiChoice, twyAnswered, twyFilled };
      }).catch(() => ({ qClicked: [], soiChoice: null, twyAnswered: 0, twyFilled: 0 }));

      const isQuestion = /Q-\d/.test(file) || (await frame.evaluate(() => !!document.querySelector('button.question-answer-button')).catch(() => false));
      const isSoi = file.includes('SOI');
      const hasOwSuccess = logs.some((l) => l.startsWith('ow_task_selected'));
      let verdict = 'SKIP';
      if (file.includes('SCRPTK')) verdict = hasOwSuccess ? 'PASS' : 'FAIL';
      if (file.includes('GMAIL-OAUTH')) verdict = logs.some((l) => l.startsWith('gmail_oauth_skipped')) ? 'PASS' : 'FAIL';
      if (file.includes('SEMANTIC')) {
        const okRow = await frame.evaluate(() => {
          const c = document.querySelector('[data-ux-semantic-clicked="1"]');
          if (!c) return null;
          return c.innerText.replace(/\s+/g,' ').trim();
        }).catch(() => null);
        const ann = file.includes('age') ? okRow === '25-34' : (file.includes('vehicle') ? okRow === 'Car' : (okRow === 'SUV' || okRow === null));
        verdict = okRow && ann ? 'PASS' : 'FAIL';
      }
      if (file.includes('CHOICE-skip')) verdict = logs.some((l) => l.startsWith('gmail_oauth_skipped')) ? 'PASS' : 'FAIL';
      if (file.includes('MUI')) {
        const picked = await frame.evaluate(() => (document.querySelector('[data-ux-mui-clicked="1"]')?.getAttribute('name') || null)).catch(() => null);
        verdict = picked ? 'PASS' : 'FAIL';
      }
      const hasTwySuccess = logs.some((l) => l.startsWith('twy_card_answered') || l.startsWith('twy_filled') || l.startsWith('twy_submitted'));
      if (file.includes('TWY')) verdict = hasTwySuccess ? 'PASS' : 'FAIL';
      if (preAnswered) verdict = 'SKIP_ALREADY_ANSWERED';
      else if (isQuestion) verdict = state.qClicked.length ? 'PASS' : 'FAIL';
      if (isSoi) verdict = state.soiChoice ? 'PASS' : 'FAIL';
      results.push({ file, verdict, clicks, qClicked: state.qClicked.join(' | '), soiChoice: state.soiChoice, logs: logs.slice(0, 3) });
    } catch (e) {
      results.push({ file, verdict: 'ERROR', err: e.message });
    }
    await page.close().catch(() => {});
  }

  await browser.close();
  server.close();
  console.log('\n===== KẾT QUẢ TEST OFFLINE trên mẫu màn hình thật =====');
  for (const r of results) {
    const icon = { PASS: '✅', FAIL: '❌', SKIP: '⏭️ ', SKIP_ALREADY_ANSWERED: '🟡', ERROR: '💥' }[r.verdict];
    console.log(`${icon} ${r.file}  (clicks=${r.clicks}${r.qClicked ? `, đã chọn: ${r.qClicked}` : ''}${r.soiChoice ? `, SOI=${r.soiChoice}` : ''})`);
    if (r.verdict === 'FAIL' || r.verdict === 'ERROR') {
      console.log(`   logs: ${(r.logs || []).join(' ; ') || 'không có'}${r.err ? ` err=${r.err}` : ''}`);
    }
  }
  const pass = results.filter((r) => r.verdict === 'PASS').length;
  const fail = results.filter((r) => r.verdict === 'FAIL' || r.verdict === 'ERROR').length;
  console.log(`\nℹ pass ${pass}, fail ${fail}, skip ${results.length - pass - fail}`);
}

main().catch((e) => { console.error('Lỗi test:', e); process.exit(1); });
