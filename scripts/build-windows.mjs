import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const executeFile = promisify(execFile);
const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const buildDirectory = join(projectDirectory, '.windows-build');
const backendDirectory = join(buildDirectory, 'backend');
const runtimeFiles = ['app.mjs', 'autofill.mjs', 'option-scorer.mjs', 'observer.mjs', 'analyze-ops.mjs', 'stealth.mjs', 'survey-solver.mjs', 'ai-assist.mjs', 'lead-check.mjs', 'chrome-versions.mjs', 'adspower-profile.mjs', 'multilogin-profile.mjs', 'gologin-profile.mjs', 'obscura-engine.mjs', 'codex-form-agent.mjs', 'local-profile-engine.mjs', 'playwright-mcp-human.cjs', 'relay.mjs', 'tgbot.mjs', 'tunnel.mjs', 'mcp-server.mjs', 'captcha.mjs', 'script.mjs', 'pc-app.png', 'useragents.txt', 'autoleadpc-icon.svg', 'src', 'ui', 'Config/Browser'];

/**
 * Tải nội dung đóng gói từ nguồn chính thức và từ chối phản hồi HTTP lỗi.
 * @param {string} address URL nguồn.
 * @return {Promise<Buffer>} Dữ liệu đã tải.
 * @throws {Error} Khi mạng hoặc HTTP thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
async function downloadBuildResource(address) {
  const response = await fetch(address, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Không tải được ${address}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Dựng backend Windows sạch từ source hiện tại, Node chính thức và dependency đúng Windows x64.
 * @return {Promise<void>} Backend sẵn sàng cho bộ cài.
 * @throws {Error} Khi tải, checksum, dependency hoặc đóng gói thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
async function buildWindowsInstaller() {
  const manifest = JSON.parse(await readFile(join(projectDirectory, 'package.json'), 'utf8'));
  await rm(backendDirectory, { recursive: true, force: true });
  await mkdir(backendDirectory, { recursive: true });
  for (const filename of runtimeFiles) await cp(join(projectDirectory, filename), join(backendDirectory, filename), { recursive: true });
  const obscuraBinary = process.env.AUTOLEADPC_OBSCURA_WINDOWS_BIN || join(projectDirectory, 'bin/obscura_antidetect_demo.exe');
  if (process.platform === 'win32' && !process.env.AUTOLEADPC_OBSCURA_WINDOWS_BIN) {
    try { await access(obscuraBinary); } catch { await executeFile(process.execPath, [join(projectDirectory, 'scripts/build-obscura.mjs')], { cwd: projectDirectory, maxBuffer: 10 * 1024 * 1024 }); }
  }
  const obscuraBytes = await readFile(obscuraBinary);
  if (obscuraBytes.toString('ascii', 0, 2) !== 'MZ') throw new Error('Thiếu binary Obscura Windows x64 hợp lệ; chạy node scripts/build-obscura.mjs trên Windows.');
  await mkdir(join(backendDirectory, 'bin'), { recursive: true });
  await cp(obscuraBinary, join(backendDirectory, 'bin/obscura_antidetect_demo.exe'));
  // Chỉ lấy tài nguyên trong allowlist, không đóng gói Config/Settings, profile, log hoặc dữ liệu người dùng.
  await cp(join(projectDirectory, 'package-lock.json'), join(backendDirectory, 'package-lock.json'));
  await writeFile(join(backendDirectory, 'package.json'), JSON.stringify(manifest, null, 2));
  console.log('Cài dependency Windows x64 vào staging riêng…');
  await executeFile(process.execPath, [process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'ci', '--omit=dev', '--ignore-scripts', '--os=win32', '--cpu=x64', '--no-audit', '--no-fund'], { cwd: backendDirectory, maxBuffer: 10 * 1024 * 1024 });
  // sqlite3 của GoLogin là native: lấy prebuild Windows N-API, không chép binary macOS.
  await executeFile(process.execPath, [join(backendDirectory, 'node_modules/prebuild-install/bin.js'), '--runtime=napi', '--target=6', '--platform=win32', '--arch=x64'], { cwd: join(backendDirectory, 'node_modules/sqlite3'), maxBuffer: 10 * 1024 * 1024 });
  await access(join(backendDirectory, 'node_modules/sqlite3/build/Release/node_sqlite3.node'));
  await access(join(backendDirectory, 'node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe'));

  const nodeCatalog = JSON.parse((await downloadBuildResource('https://nodejs.org/dist/index.json')).toString());
  const nodeVersion = nodeCatalog.find(release => release.version.startsWith('v22.') && release.lts).version;
  const nodeFilename = `node-${nodeVersion}-win-x64.zip`;
  const nodeOrigin = `https://nodejs.org/dist/${nodeVersion}`;
  const [archive, checksums] = await Promise.all([downloadBuildResource(`${nodeOrigin}/${nodeFilename}`), downloadBuildResource(`${nodeOrigin}/SHASUMS256.txt`)]);
  const expectedChecksum = checksums.toString().split('\n').find(line => line.endsWith(`  ${nodeFilename}`))?.split(' ')[0];
  if (createHash('sha256').update(archive).digest('hex') !== expectedChecksum) throw new Error('Checksum Node Windows không khớp.');
  const archivePath = join(buildDirectory, nodeFilename);
  await writeFile(archivePath, archive);
  console.log(`Đóng gói Node ${nodeVersion} Windows x64…`);
  if (process.platform === 'win32') {
    await executeFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath $env:AUTOLEADPC_NODE_ARCHIVE -DestinationPath $env:AUTOLEADPC_NODE_DESTINATION -Force"], { env: { ...process.env, AUTOLEADPC_NODE_ARCHIVE: archivePath, AUTOLEADPC_NODE_DESTINATION: buildDirectory } });
  } else {
    await executeFile('unzip', ['-q', '-o', archivePath, '-d', buildDirectory]);
  }
  await mkdir(join(backendDirectory, 'runtime-node'), { recursive: true });
  for (const filename of ['node.exe', 'LICENSE']) await cp(join(buildDirectory, `node-${nodeVersion}-win-x64`, filename), join(backendDirectory, 'runtime-node', filename));
  await rm(join(buildDirectory, `node-${nodeVersion}-win-x64`), { recursive: true, force: true });
  await rm(archivePath);
  const wrapperManifestPath = join(projectDirectory, 'packaging/windows/package.json');
  const wrapperManifest = JSON.parse(await readFile(wrapperManifestPath, 'utf8'));
  await writeFile(wrapperManifestPath, JSON.stringify({ ...wrapperManifest, version: manifest.version }, null, 2) + '\n');
  if (process.argv.includes('--prepare-only')) return;
  console.log('Tạo bộ cài AutoLeadPC .exe…');
  const { stdout, stderr } = await executeFile(process.execPath, [join(projectDirectory, 'node_modules/electron-builder/cli.js'), '--config', 'packaging/windows/electron-builder.cjs', '--win', '--x64'], { cwd: projectDirectory, maxBuffer: 20 * 1024 * 1024 });
  console.log(stdout);
  if (stderr) console.error(stderr);
  const packagedBackend = join(projectDirectory, 'dist/windows/win-unpacked/resources/backend');
  for (const filename of ['bin/obscura_antidetect_demo.exe', 'runtime-node/node.exe', 'node_modules/sqlite3/build/Release/node_sqlite3.node', 'node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe']) {
    const binary = await readFile(join(packagedBackend, filename));
    if (binary.toString('ascii', 0, 2) !== 'MZ') throw new Error(`Bundle thiếu binary Windows hợp lệ: ${filename}`);
  }
  console.log(`Đã kiểm tra Node, SQLite và Codex Windows trong bundle: dist/windows/AutoLeadPC-Setup-${manifest.version}-x64.exe`);
}

await buildWindowsInstaller();
