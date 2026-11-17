import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Tìm kiếm đường dẫn file nhị phân của Obscura Anti-Detect Engine.
 * Ưu tiên:
 * 1. Biến môi trường OBSCURA_BIN
 * 2. Bản build release: demo-obscura-antidetect/target/release/obscura_antidetect_demo
 * 3. Bản build debug: demo-obscura-antidetect/target/debug/obscura_antidetect_demo
 *
 * @return {string} Đường dẫn tuyệt đối đến file nhị phân Obscura.
 * @throws {Error} Nếu không tìm thấy file thực thi phù hợp.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export function resolveObscuraBinary() {
  if (process.env.OBSCURA_BIN && existsSync(process.env.OBSCURA_BIN)) {
    return resolve(process.env.OBSCURA_BIN);
  }

  const executableName = `obscura_antidetect_demo${process.platform === 'win32' ? '.exe' : ''}`;
  const workspaceRoot = resolve(__dirname, '../..');

  const packagedBinPath = resolve(workspaceRoot, 'bin', executableName);
  if (existsSync(packagedBinPath)) {
    return packagedBinPath;
  }

  const releasePath = resolve(workspaceRoot, 'demo-obscura-antidetect/target/release', executableName);
  if (existsSync(releasePath)) {
    return releasePath;
  }

  const debugPath = resolve(workspaceRoot, 'demo-obscura-antidetect/target/debug', executableName);
  if (existsSync(debugPath)) {
    return debugPath;
  }

  throw new Error(
    'Không tìm thấy file nhị phân Obscura Anti-Detect Engine. ' +
    'Vui lòng chạy `cargo build --release` trong thư mục demo-obscura-antidetect/ hoặc thiết lập OBSCURA_BIN.'
  );
}
