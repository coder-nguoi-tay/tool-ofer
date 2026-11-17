import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, copyFile, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const project = dirname(dirname(fileURLToPath(import.meta.url)));
/**
 * Build engine native đúng máy đích và đặt binary độc lập vào bin để đóng gói.
 * @return {Promise<void>} Binary render/CDP đã được dựng, không chép dữ liệu người dùng.
 * @throws {Error} Khi thiếu Rust toolchain hoặc build/copy thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
async function buildObscura() {
  const name = `obscura_antidetect_demo${process.platform === 'win32' ? '.exe' : ''}`;
  await execute('cargo', ['build', '--release', '--locked', '--manifest-path', join(project, 'demo-obscura-antidetect/Cargo.toml')], {
    cwd: project, env: { ...process.env, CARGO_BUILD_JOBS: '2', CARGO_INCREMENTAL: '0' }, maxBuffer: 10 * 1024 * 1024,
  });
  await mkdir(join(project, 'bin'), { recursive: true });
  await copyFile(join(project, 'demo-obscura-antidetect/target/release', name), join(project, 'bin', name));
  if (process.platform !== 'win32') await chmod(join(project, 'bin', name), 0o755);
  console.log(`Đã build Obscura native: bin/${name}`);
}
await buildObscura();
