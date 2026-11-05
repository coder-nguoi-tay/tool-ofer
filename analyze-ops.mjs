/**
 * Phân tích file manual-ops JSONL (thao tác tay người dùng) bằng AI CLI (codex/opencode/agy),
 * sinh:
 *   1. logs/manual-ops-analysis-<stamp>.md — báo cáo hành vi link offer
 *   2. logs/manual-ops-rules.json — luật tự động nạp vào autofill (twyYesRatio, pacing...)
 *
 * Chạy: node analyze-ops.mjs [path/to/manual-ops-xxx.jsonl]
 *
 * @author coder-nguoi-tay
 * @since 2026-10-25
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { callAgt } from './ai-assist.mjs';

const appDataDir = join(process.env.HOME, 'Library', 'Application Support', 'AutoLeadPC-2');
const logsDir = join(appDataDir, 'logs');

function resolveInputFile() {
  const arg = process.argv[2];
  if (arg && existsSync(arg)) return arg;
  if (!existsSync(logsDir)) throw new Error('Chưa có thư mục logs');
  const files = readdirSync(logsDir)
    .filter((f) => /^manual-ops-.*\.jsonl$/.test(f))
    .sort();
  if (!files.length) throw new Error('Chưa có file manual-ops-*.jsonl nào. Vui lòng chạy offer + thao tác tay trước.');
  return join(logsDir, files[files.length - 1]);
}

function summarizeOps(lines) {
  const seq = [];
  let prevUrl = '';
  for (const ev of lines) {
    const url = (ev.frm || '').replace(/\?.*/, '');
    const jump = url !== prevUrl;
    if (jump) { seq.push({ kind: 'URL', url }); prevUrl = url; }
    if (ev.kind === 'click') {
      const el = ev.el || {};
      seq.push({
        kind: 'click',
        target: [el.tag, el.id ? `#${el.id}` : null, el.cls ? `.${String(el.cls).split(' ')[0]}` : null].filter(Boolean).join(''),
        text: (el.text || '').slice(0, 40),
        trusted: ev.trusted,
      });
    } else if (ev.kind === 'navigate') {
      seq.push({ kind: 'navigate', to: (ev.to || '').replace(/\?.*/, '') });
    } else if (ev.kind === 'submit') {
      seq.push({ kind: 'submit', el: ev.el?.id || ev.el?.cls || 'form' });
    }
  }
  return seq.slice(-400); // tối đa 400 thao tác gần nhất
}

async function main() {
  const file = resolveInputFile();
  const raw = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  const seq = summarizeOps(raw);
  if (!seq.length) { console.log('Không có thao tác nào được ghi nhận.'); return; }

  const prompt = [
    'Bạn là chuyên gia phân tích hành vi thao tác trên các trang "offer/survey co-reg" (financialhelpfinder, twyne, adsmith).',
    'Dưới đây là chuỗi thao tác tay (click/navigate) tôi ghi nhận từ trình duyệt. Hãy phân tích hành vi của link offer.',
    'Đầu ra CŨNG CHỈ 1 khối JSON duy nhất với:',
    '{ "report": "markdown tóm tắt chu trình ngắn gọn (<=30 dòng, tiếng Việt)",',
    '  "rules": { "twyYesRatio": <số 0..1 tỉ lệ nên chọn Yes>, "answerDelayMs": <số ms nên chờ giữa 2 thao tác>,',
    '             "focusFrameBeforeClick": <true/false>, "continueSelectors": ["selector CSS ưu tiên"],',
    '             "notes": ["các mũi khôn gợi ý hạn chế/thao tác cần mô phỏng"] } }',
    '',
    'Dữ liệu:',
    JSON.stringify(seq, null, 1).slice(0, 45000),
  ].join('\n');

  console.log(`Phân tích ${seq.length} thao tác bằng AI CLI...`);
  const out = await callAgt(prompt, { timeoutSeconds: 240 });
  console.log(out.slice(0, 600));

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const mdPath = join(logsDir, `manual-ops-analysis-${stamp}.md`);
  const rulesPath = join(logsDir, 'manual-ops-rules.json');

  // Trích JSON từ output
  let rules = null;
  let report = out;
  const m = out.match(/\{[\s\S]*"rules"[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      rules = parsed.rules || parsed;
      report = parsed.report || out;
    } catch {
      // AI trả text dài: giữ nguyên
    }
  }

  writeFileSync(mdPath, `# Phân tích manual-ops (${new Date().toISOString()})\n\nNguồn: ${file}\n\n${report}\n`);
  if (rules) {
    writeFileSync(rulesPath, JSON.stringify({ updatedAt: new Date().toISOString(), source: file, rules }, null, 2));
    console.log(`Đã ghi luật autofill: ${rulesPath}`);
  }
  console.log(`Báo cáo: ${mdPath}`);
}

main().catch((e) => { console.error('Lỗi phân tích:', e.message); process.exit(1); });
