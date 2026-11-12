import { prepareSnapshotHtml } from './prepare-snapshot-html.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { interactionHtmlDirectory } from '../browser-logs/state/interaction-html-directory.mjs';
import { inspectFormState } from './inspect-form-state.mjs';
import { readEvidenceWithTimeout } from './read-evidence-with-timeout.mjs';

/**
 * Lưu giao diện và trạng thái các frame sau một nhóm hành động của phiên.
 * Lỗi chụp ảnh không làm mất HTML hoặc thông tin form đã thu được.
 * @param {object} page Tab Playwright cần chụp.
 * @param {object} session Phiên sở hữu tab.
 * @param {string} reason Hành động hoặc lỗi kích hoạt chụp.
 * @param {object|null} [previous=null] Bằng chứng trước của cùng tab để tránh ghi lại nội dung giống hệt.
 * @return {Promise<object|null>} Tệp bằng chứng và trạng thái form, hoặc null khi tab đóng.
 * @throws {Error} Khi không thể ghi tệp bằng chứng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function captureBrowserSnapshot(page, session, reason, previous = null) {
  if (page.isClosed() || !/^https?:\/\//i.test(page.url())) return null;
  const url = page.url();
  const capturedAt = new Date().toISOString();
  const [htmlResult, titleResult, formResult] = await Promise.allSettled([
    readEvidenceWithTimeout(page, 'html', () => page.content()),
    readEvidenceWithTimeout(page, 'title', () => page.title()),
    Promise.all(page.frames().slice(0, 12).map(async frame => ({
      url: frame.url(), ...await readEvidenceWithTimeout(frame, 'form', () => frame.evaluate(inspectFormState)).catch(() => ({ unavailable: true })),
    }))),
  ]);
  const prepared = prepareSnapshotHtml(htmlResult.status === 'fulfilled' ? htmlResult.value : '');
  const { html, contentHash, ...htmlMetadata } = prepared;
  const snapshotHash = createHash('sha256').update(contentHash).update(JSON.stringify(formResult.status === 'fulfilled' ? formResult.value : [])).digest('hex');
  const reusableState = htmlResult.status === 'fulfilled' && formResult.status === 'fulfilled' && !formResult.value.some(frame => frame.unavailable || frame.visualOnly);
  if (reusableState && previous?.snapshotHash === snapshotHash && previous.snapshotUrl === url && previous.htmlPath && previous.screenshotPath) {
    const filesExist = await Promise.all([access(previous.htmlPath), access(previous.screenshotPath)]).then(() => true).catch(() => false);
    if (filesExist) return { ...previous, snapshotReason: reason, snapshotReused: true, snapshotCheckedAt: capturedAt };
  }
  const imageResult = await Promise.resolve().then(() => page.screenshot({ type: 'jpeg', quality: 65, scale: 'css', timeout: 5000 })).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }));
  const image = imageResult.status === 'fulfilled' ? imageResult.value : null;
  const offer = page._offerNumber ?? session.offerNumber ?? session.streamRole ?? 1;
  const directory = join(interactionHtmlDirectory, `offer-${offer}`);
  await mkdir(directory, { recursive: true });
  const prefix = `offer${offer}_${capturedAt.replace(/[:.]/g, '-')}_${randomUUID().slice(0, 8)}`;
  const htmlFilename = html ? `${prefix}.html` : null;
  const screenshotFilename = image ? `${prefix}.jpg` : null;
  await Promise.all([
    html ? writeFile(join(directory, htmlFilename), html, 'utf8') : null,
    image ? writeFile(join(directory, screenshotFilename), image) : null,
  ]);
  return {
    snapshotUrl: page.url(), navigationDuringCapture: page.url() !== url,
    title: titleResult.status === 'fulfilled' ? titleResult.value : '',
    snapshotReason: reason, capturedAt, capturePhase: 'after_event',
    htmlPath: htmlFilename ? join(directory, htmlFilename) : null, htmlFilename,
    screenshotPath: screenshotFilename ? join(directory, screenshotFilename) : null, screenshotFilename,
    formState: formResult.status === 'fulfilled' ? formResult.value : [],
    snapshotError: [htmlResult, imageResult].filter(result => result.status === 'rejected').map(result => result.reason?.message || 'capture failed').join('; ') || null,
    snapshotHash, ...htmlMetadata,
  };
}
