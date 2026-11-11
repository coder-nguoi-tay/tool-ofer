/**
 * Test "màn hình thật đã ghi nhận": chạy bộ autofill handler thồi trên 20 file HTML mẫu
 * dựng từ snapshot các phiên thủ công (~/Downloads/mau-man-hinh-offer).
 *
 * Bản thân kịch bản nằm tại tests/integration/test-offline-screens.mjs (khởi động HTTP server cục bộ,
 * dùng Playwright headless, chặn network ngoài). Test này chỉ đảm bảo kịch bản bất bại:
 * kết quả chạy phải đạt "pass" > 0 và "fail = 0" — nếu handler autofill thui khỏi hoạt
 * động đúng trên mẫu màn thật (vd bug twyPickNoRatio trong evaluate từng làm mọi thẻ crash).
 *
 * Bộ mẫu và Chromium không có sẵn trên CI hay máy khác: khi thiếu thì skip kèm lý do.
 *
 * @author coder-nguoi-tay
 * @since 2026-10-25
 */
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SAMPLE_DIR = join(homedir(), 'Downloads', 'mau-man-hinh-offer');
const skip = !existsSync(SAMPLE_DIR)
  ? `Thiếu bộ mẫu ${SAMPLE_DIR}`
  : !existsSync(chromium.executablePath()) && 'Chưa cài Chromium của Playwright';

test('offline-screen-samples: autofill handler phải xử lý đúng mọi màn HTML mẫu thật', { skip }, () => {
  // fileURLToPath thay vì .pathname: đường dẫn trong .app có dấu cách sẽ thành %20.
  const run = spawnSync(process.execPath, [fileURLToPath(new URL("../integration/test-offline-screens.mjs", import.meta.url))], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
  });
  const output = run.stdout || '';
  const m = output.match(/ℹ pass (\d+), fail (\d+)/);
  if (!m) {
    throw new Error(`Không đọc được kết quả test offline (exit=${run.status}).\n${output.slice(-1500)}\n${run.stderr || ''}`);
  }
  const pass = Number(m[1]);
  const fail = Number(m[2]);
  if (fail > 0 || pass === 0) {
    throw new Error(`Test offline FAIL (pass=${pass}, fail=${fail}).\nChi tiết:\n${output.slice(-3000)}`);
  }
});
