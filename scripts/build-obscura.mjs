import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, copyFile, chmod, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const project = dirname(dirname(fileURLToPath(import.meta.url)));
/**
 * Build engine native đúng máy đích và đặt binary độc lập vào bin để đóng gói.
 * @return {Promise<void>} Binary render/CDP đã được dựng, không chép dữ liệu người dùng.
 * @throws {Error} Khi thiếu Rust toolchain hoặc build/copy thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function buildObscura() {
  const name = `obscura_antidetect_demo${process.platform === 'win32' ? '.exe' : ''}`;
  const coreManifest = join(project, 'demo-obscura-antidetect/obscura-upstream/crates/obscura/Cargo.toml');
  try {
    await access(coreManifest);
  } catch (cause) {
    throw new Error(`Thiếu mã nguồn core Obscura tùy chỉnh tại ${coreManifest}. Cần checkout đúng bản core của dự án trước khi build.`, { cause });
  }
  await execute('cargo', ['build', '--release', '--locked', '--manifest-path', join(project, 'demo-obscura-antidetect/Cargo.toml')], {
    cwd: project, env: { ...process.env, CARGO_BUILD_JOBS: '2', CARGO_INCREMENTAL: '0' }, maxBuffer: 10 * 1024 * 1024,
  });
  await mkdir(join(project, 'bin'), { recursive: true });
  // Replace the inode atomically: overwriting a signed Mach-O in place leaves
  // macOS with stale code-signing pages and the next launch is killed (SIGKILL).
  const stagingBinary = join(project, 'bin', `${name}.tmp-${process.pid}`);
  try {
    await copyFile(join(project, 'demo-obscura-antidetect/target/release', name), stagingBinary);
    if (process.platform !== 'win32') await chmod(stagingBinary, 0o755);
    await rename(stagingBinary, join(project, 'bin', name));
  } finally {
    await rm(stagingBinary, { force: true });
  }
  console.log(`Đã build Obscura native: bin/${name}`);
}
await buildObscura();
