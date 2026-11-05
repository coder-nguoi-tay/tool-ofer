import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mockDirectory = dirname(fileURLToPath(import.meta.url));
const defaultLogDirectory = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC-2', 'logs', 'html');
const assetDirectory = join(mockDirectory, 'assets');
const manifestPath = join(mockDirectory, 'form-assets.json');
const allowedAssetHosts = new Set([
  'plugin-cdn.alphaintent.com',
  'cdn.play.sweepstakesalerts.com',
  'cdn.financebuzz.com',
  'cdn.smarterauto.com',
  'cdn.launchpotato.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

/**
 * Tìm snapshot HTML theo thư mục con để chọn đúng form đã dùng trong mô phỏng.
 *
 * @param {string} directory Thư mục log cần quét.
 * @return {Promise<string[]>} Danh sách đường dẫn HTML đã sắp xếp.
 * @throws {Error} Khi không thể đọc thư mục log.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function findHtmlSnapshots(directory) {
  const snapshots = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) snapshots.push(...await findHtmlSnapshots(entryPath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) snapshots.push(entryPath);
  }
  return snapshots.sort();
}

/**
 * Lấy thuộc tính HTML có dấu nháy đơn hoặc kép mà không in giá trị ra log.
 *
 * @param {string} tag Thẻ HTML cần phân tích.
 * @param {string} attributeName Tên thuộc tính cần tìm.
 * @return {string|null} Giá trị thuộc tính hoặc null nếu không tồn tại.
 * @throws {never} Hàm chỉ phân tích chuỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function readHtmlAttribute(tag, attributeName) {
  const escapedAttributeName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`\\b${escapedAttributeName}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2]
    ?.replace(/&amp;/gi, '&') || null;
}

/**
 * Chuẩn hóa URL tham chiếu từ HTML hoặc CSS, bỏ qua tài nguyên nội tuyến.
 *
 * @param {string} resourceValue Giá trị URL nguồn.
 * @param {URL} baseUrl URL gốc dùng giải quyết đường dẫn tương đối.
 * @return {string|null} URL HTTPS chuẩn hóa hoặc null nếu URL không thuộc mạng HTTPS.
 * @throws {never} URL lỗi được bỏ qua có chủ đích.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function normalizeRemoteAssetUrl(resourceValue, baseUrl) {
  if (!resourceValue || resourceValue.startsWith('data:') || resourceValue.startsWith('#')) return null;
  try {
    const assetUrl = new URL(resourceValue, baseUrl);
    return assetUrl.protocol === 'https:' ? assetUrl.href : null;
  } catch {
    return null;
  }
}

/**
 * Thu thập tài nguyên CSS, ảnh và font được HTML form tham chiếu.
 *
 * @param {string} html HTML snapshot của form.
 * @param {URL} pageUrl URL gốc của trang đã lưu.
 * @return {Set<string>} Tập URL tài nguyên HTTPS.
 * @throws {never} URL sai định dạng được bỏ qua.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function collectPageAssetUrls(html, pageUrl) {
  const assetUrls = new Set();
  const addReference = (resourceValue, baseUrl) => {
    const normalizedUrl = normalizeRemoteAssetUrl(resourceValue.trim(), baseUrl);
    if (normalizedUrl) assetUrls.add(normalizedUrl);
  };
  for (const tagMatch of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = tagMatch[0];
    if (/\brel\s*=\s*["']stylesheet["']/i.test(tag)) {
      addReference(readHtmlAttribute(tag, 'href'), pageUrl);
    }
  }
  for (const tagMatch of html.matchAll(/<(?:img|source|video|audio)\b[^>]*>/gi)) {
    const tag = tagMatch[0];
    addReference(readHtmlAttribute(tag, 'src'), pageUrl);
    const sourceSet = readHtmlAttribute(tag, 'srcset');
    for (const sourceCandidate of sourceSet?.split(',') || []) {
      addReference(sourceCandidate.trim().split(/\s+/, 1)[0], pageUrl);
    }
  }
  for (const styleMatch of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const reference of styleMatch[1].matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)|@import\s+(?:url\()?\s*["']?([^"'; )]+)["']?/gi)) {
      addReference(reference[1] || reference[2], pageUrl);
    }
  }
  for (const styleAttribute of html.matchAll(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    for (const reference of styleAttribute[2].matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      addReference(reference[1], pageUrl);
    }
  }
  return assetUrls;
}

/**
 * Chọn snapshot Alpha Intent đầu tiên giống form nhập đang có trong fixture.
 *
 * @param {string[]} snapshots Danh sách toàn bộ snapshot HTML.
 * @return {Promise<object>} HTML và đường dẫn snapshot đã chọn.
 * @throws {Error} Khi không có snapshot form Alpha Intent.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function findInformationFormSnapshot(snapshots) {
  for (const snapshotPath of snapshots) {
    const html = await readFile(snapshotPath, 'utf8');
    if (/ai-content--form/i.test(html) && /class\s*=\s*["'][^"']*ai-form/i.test(html) && /input-fullname/i.test(html)) {
      return { snapshotPath, html };
    }
  }
  throw new Error('No saved Alpha Intent information form was found.');
}

/**
 * Lấy URL gốc từ base/canonical của snapshot hoặc tên host lưu cùng log.
 *
 * @param {string} html HTML snapshot của form.
 * @param {string} snapshotPath Đường dẫn log dùng suy ra host dự phòng.
 * @return {URL} URL gốc dùng phân giải tài nguyên.
 * @throws {Error} Khi không suy ra được URL gốc HTTPS.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function resolveSavedPageUrl(html, snapshotPath) {
  const baseTag = html.match(/<base\b[^>]*>/i)?.[0];
  const baseHref = baseTag ? readHtmlAttribute(baseTag, 'href') : null;
  const canonicalTag = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => /\brel\s*=\s*["']canonical["']/i.test(tag));
  const canonicalHref = canonicalTag ? readHtmlAttribute(canonicalTag, 'href') : null;
  const fileName = basename(snapshotPath);
  const hostFromFileName = fileName.match(/_tab\d+_([a-z0-9.-]+)_/i)?.[1];
  const fallbackUrl = hostFromFileName ? `https://${hostFromFileName}/` : 'https://sweepstakesalerts.com/';
  return new URL(baseHref || canonicalHref || fallbackUrl, fallbackUrl);
}

/**
 * Tìm các URL phụ trong CSS đã tải để cache ảnh nền, CSS import và font.
 *
 * @param {string} css Nội dung CSS.
 * @param {URL} stylesheetUrl URL của stylesheet đang phân tích.
 * @return {string[]} URL HTTPS được tham chiếu bởi CSS.
 * @throws {never} URL sai định dạng được bỏ qua.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function collectCssAssetUrls(css, stylesheetUrl) {
  const assetUrls = new Set();
  for (const reference of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)|@import\s+(?:url\()?\s*["']?([^"'; )]+)["']?/gi)) {
    const normalizedUrl = normalizeRemoteAssetUrl(reference[1] || reference[2], stylesheetUrl);
    if (normalizedUrl) assetUrls.add(normalizedUrl);
  }
  return [...assetUrls];
}

/**
 * Chọn phần mở rộng file theo MIME để các stylesheet và font chạy cục bộ.
 *
 * @param {string} contentType MIME trả về từ máy chủ.
 * @param {string} resourceUrl URL nguồn dùng dự phòng phần mở rộng.
 * @return {string} Phần mở rộng file có dấu chấm.
 * @throws {never} Hàm chỉ ánh xạ chuỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function getAssetFileExtension(contentType, resourceUrl) {
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  const mimeExtensions = {
    'text/css': '.css',
    'image/svg+xml': '.svg',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'font/woff2': '.woff2',
    'font/woff': '.woff',
    'application/font-woff': '.woff',
    'application/vnd.ms-fontobject': '.eot',
  };
  if (mimeExtensions[mimeType]) return mimeExtensions[mimeType];
  const extension = extname(new URL(resourceUrl).pathname);
  return extension && extension.length <= 8 ? extension : '.bin';
}

/**
 * Viết lại URL trong CSS thành đường dẫn local hoặc bỏ nội dung chưa được cache.
 *
 * @param {string} css Nội dung stylesheet.
 * @param {URL} stylesheetUrl URL nguồn dùng phân giải đường dẫn tương đối.
 * @param {Map<string, string>} localAssetPaths Ánh xạ URL nguồn sang file local.
 * @return {string} CSS dùng tài nguyên cục bộ.
 * @throws {never} URL lỗi được bỏ qua và thay bằng none.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function rewriteCssAssetUrls(css, stylesheetUrl, localAssetPaths) {
  const localizeUrl = (resourceValue) => {
    if (resourceValue.startsWith('data:') || resourceValue.startsWith('#')) return resourceValue;
    const normalizedUrl = normalizeRemoteAssetUrl(resourceValue, stylesheetUrl);
    const localAssetPath = normalizedUrl ? localAssetPaths.get(normalizedUrl) : null;
    return localAssetPath ? basename(localAssetPath) : 'none';
  };
  return css
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote, resourceValue) => `url(${quote}${localizeUrl(resourceValue.trim())}${quote})`)
    .replace(/@import\s+(["'])([^"']+)\1/gi, (_match, quote, resourceValue) => `@import ${quote}${localizeUrl(resourceValue)}${quote}`);
}

/**
 * Tải, kiểm tra host và cache tài nguyên tĩnh tham chiếu bởi form snapshot.
 *
 * @param {object} formSnapshot Snapshot HTML đã được chọn.
 * @param {URL} pageUrl URL gốc của snapshot.
 * @return {Promise<object>} Manifest ánh xạ URL băm sang file cục bộ.
 * @throws {Error} Khi tài nguyên được phép tải không thành công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function cacheFormSnapshotAssets(formSnapshot, pageUrl) {
  const queuedAssetUrls = [...collectPageAssetUrls(formSnapshot.html, pageUrl)];
  const visitedAssetUrls = new Set();
  const downloadedAssets = new Map();
  const unresolvedAssetHosts = new Set();
  for (let queueIndex = 0; queueIndex < queuedAssetUrls.length; queueIndex += 1) {
    const assetUrl = queuedAssetUrls[queueIndex];
    if (visitedAssetUrls.has(assetUrl)) continue;
    visitedAssetUrls.add(assetUrl);
    const parsedAssetUrl = new URL(assetUrl);
    if (!allowedAssetHosts.has(parsedAssetUrl.hostname)) {
      unresolvedAssetHosts.add(parsedAssetUrl.hostname);
      continue;
    }
    const response = await fetch(assetUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Static asset request failed with HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (!/^(?:text\/css|image\/|font\/|application\/(?:font-woff|vnd\.ms-fontobject))/.test(contentType.toLowerCase())) {
      unresolvedAssetHosts.add(parsedAssetUrl.hostname);
      continue;
    }
    const body = Buffer.from(await response.arrayBuffer());
    const finalUrl = response.url || assetUrl;
    downloadedAssets.set(assetUrl, { body, contentType, finalUrl });
    downloadedAssets.set(finalUrl, { body, contentType, finalUrl });
    if (contentType.toLowerCase().startsWith('text/css')) {
      queuedAssetUrls.push(...collectCssAssetUrls(body.toString('utf8'), new URL(finalUrl)));
    }
  }

  await mkdir(assetDirectory, { recursive: true });
  const localAssetPaths = new Map();
  for (const [assetUrl, asset] of downloadedAssets) {
    const extension = getAssetFileExtension(asset.contentType, assetUrl);
    const contentHash = createHash('sha256').update(asset.body).digest('hex').slice(0, 20);
    localAssetPaths.set(assetUrl, `assets/${contentHash}${extension}`);
  }
  for (const [assetUrl, asset] of downloadedAssets) {
    const localAssetPath = localAssetPaths.get(assetUrl);
    const outputPath = join(mockDirectory, localAssetPath);
    const savedAssetBody = asset.contentType.toLowerCase().startsWith('text/css')
      ? rewriteCssAssetUrls(asset.body.toString('utf8'), new URL(asset.finalUrl), localAssetPaths)
      : asset.body;
    await writeFile(outputPath, savedAssetBody);
  }

  const assetsByUrlHash = {};
  for (const [assetUrl, localAssetPath] of localAssetPaths) {
    const urlHash = createHash('sha256').update(assetUrl).digest('hex');
    assetsByUrlHash[urlHash] = localAssetPath;
  }
  const manifest = {
    sourceSnapshot: basename(formSnapshot.snapshotPath),
    assetCount: new Set(localAssetPaths.values()).size,
    assetsByUrlHash,
    unresolvedAssetHosts: [...unresolvedAssetHosts],
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

/**
 * Tìm form đã lưu rồi tải CDN CSS, ảnh và font thành file dùng được ngoại tuyến.
 *
 * @return {Promise<void>} Ghi cache tài nguyên và manifest vào thư mục mô phỏng.
 * @throws {Error} Khi không tìm thấy form hoặc tài nguyên tĩnh tải thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function main() {
  const logDirectory = resolve(process.argv[2] || defaultLogDirectory);
  const snapshots = await findHtmlSnapshots(logDirectory);
  const formSnapshot = await findInformationFormSnapshot(snapshots);
  const pageUrl = resolveSavedPageUrl(formSnapshot.html, formSnapshot.snapshotPath);
  const manifest = await cacheFormSnapshotAssets(formSnapshot, pageUrl);
  console.log(JSON.stringify({
    sourceSnapshot: manifest.sourceSnapshot,
    assetCount: manifest.assetCount,
    unresolvedAssetHosts: manifest.unresolvedAssetHosts,
    manifestPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[capture-form-assets] ${error.message}`);
  process.exitCode = 1;
});
