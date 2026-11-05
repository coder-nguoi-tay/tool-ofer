import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, readdir, readFile, mkdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { fillAlphaIntentFullName, handleRadioAndSurveyOptions } from './autofill.mjs';

const projectDirectory = dirname(fileURLToPath(import.meta.url));
const mockDirectory = join(projectDirectory, 'mock-pages');
const defaultLogDirectory = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC-2', 'logs', 'html');
const temporaryActionLogPath = join(mockDirectory, 'offer-actions.tmp.jsonl');

/**
 * Tìm snapshot HTML theo thư mục con, không mở hoặc in nội dung ra terminal.
 *
 * @param {string} directory Thư mục log HTML cần quét.
 * @return {Promise<string[]>} Danh sách đường dẫn snapshot HTML.
 * @throws {Error} Khi không thể đọc thư mục log.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function findHtmlSnapshots(directory) {
  const snapshots = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      snapshots.push(...await findHtmlSnapshots(entryPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      snapshots.push(entryPath);
    }
  }
  return snapshots.sort();
}

/**
 * Đếm selector cấu trúc trong HTML mà không giữ lại giá trị người dùng hoặc nội dung trang.
 *
 * @param {string} html Snapshot HTML nguồn.
 * @return {object} Số lượng marker cấu trúc được nhận diện.
 * @throws {never} Hàm chỉ đếm chuỗi và không ném lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function countHtmlStructures(html) {
  const structuralHtml = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi, '<textarea></textarea>')
    .replace(/\s(?:value|href|src|placeholder|title)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ' [redacted]');
  const patterns = {
    forms: /<form\b/gi,
    radioInputs: /<input\b[^>]*\btype\s*=\s*["']radio["']/gi,
    checkboxInputs: /<input\b[^>]*\btype\s*=\s*["']checkbox["']/gi,
    questionAnswersContainers: /\bid\s*=\s*["']question-answers["']/gi,
    answerButtons: /<button\b[^>]*\bid\s*=\s*["']answer-[^"']+["']/gi,
    questionAnswerButtonClasses: /question-answer-button/gi,
    phoneWidgets: /<input-phone\b/gi,
    phoneInputs: /<input\b[^>]*\bid\s*=\s*["']phone["']/gi,
    hiddenRequiredFields: /data-hidden-required\s*=\s*["']true["']/gi,
    phoneSaveButtons: /button-save-phone/gi,
    ratingGroups: /(?:nps-scale|rating-scale|star-rating|rating-stars|data-rating-group)/gi,
    matrixGroups: /(?:matrix-row|survey-matrix|likert-row|data-matrix-row)/gi,
    choiceCards: /(?:btn-option|choice-card|option-card|answer-card)/gi,
    aiQuestionSections: /ai-content--question/gi,
  };
  const counts = {};
  for (const [name, pattern] of Object.entries(patterns)) {
    counts[name] = [...structuralHtml.matchAll(pattern)].length;
  }
  return counts;
}

/**
 * Tổng hợp cấu trúc của toàn bộ snapshot HTML thành báo cáo chỉ gồm số đếm.
 *
 * @param {string} logDirectory Gốc thư mục chứa các snapshot HTML.
 * @return {Promise<object>} Báo cáo số snapshot và nhóm cấu trúc.
 * @throws {Error} Khi không đọc được thư mục hoặc snapshot.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function summarizeSavedHtmlLogs(logDirectory) {
  const snapshots = await findHtmlSnapshots(logDirectory);
  const totals = {
    snapshotCount: snapshots.length,
    forms: 0,
    snapshotsWithForm: 0,
    snapshotsWithoutForm: 0,
    radioInputs: 0,
    checkboxInputs: 0,
    questionAnswersContainers: 0,
    answerButtons: 0,
    questionAnswerButtonClasses: 0,
    phoneWidgets: 0,
    phoneInputs: 0,
    hiddenRequiredFields: 0,
    phoneSaveButtons: 0,
    ratingGroups: 0,
    matrixGroups: 0,
    choiceCards: 0,
    aiQuestionSections: 0,
  };
  for (const snapshot of snapshots) {
    const html = await readFile(snapshot, 'utf8');
    const counts = countHtmlStructures(html);
    for (const [name, count] of Object.entries(counts)) totals[name] += count;
    if (/<form\b/i.test(html)) totals.snapshotsWithForm += 1;
    else totals.snapshotsWithoutForm += 1;
  }
  return totals;
}

/**
 * Làm sạch snapshot trước khi Chromium phân tích, không cho phép script hoặc request ngoài chạy.
 *
 * @param {string} html HTML snapshot được đọc từ log.
 * @param {object} [options={}] Tùy chọn giữ link CSS và nguồn ảnh đã lưu.
 * @param {boolean} [options.preserveVisualAssets=false] Giữ tài nguyên nhìn thấy được khi đọc form.
 * @return {string} HTML chỉ còn nội dung tĩnh để phân tích DOM.
 * @throws {never} Hàm chỉ biến đổi chuỗi HTML.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function sanitizeSavedSnapshotForParsing(html, { preserveVisualAssets = false } = {}) {
  const sanitizedHtml = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<(?:object|applet)\b[^>]*>[\s\S]*?<\/(?:object|applet)>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  if (preserveVisualAssets) {
    return sanitizedHtml
      .replace(/<link\b[^>]*>/gi, (tag) => /\brel\s*=\s*["']stylesheet["']/i.test(tag) ? tag : '')
      .replace(/<([a-z][\w:-]*)\b[^>]*>/gi, (tag, tagName) => {
        const elementName = tagName.toLowerCase();
        const safeTag = tag
          .replace(/\s+(?:action|formaction|method|target|enctype)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
          .replace(elementName === 'a'
            ? /\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i
            : elementName === 'link' || elementName === 'base'
              ? /$^/
              : /\s+href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
          elementName === 'a' ? 'href="#"' : '');
        if (['img', 'source', 'video', 'audio', 'input'].includes(elementName)) return safeTag;
        return safeTag.replace(/\s+(?:src|srcset|poster|data-src)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      });
  }
  return sanitizedHtml
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/\s+(?:href|src|srcset|action|formaction|poster|data-src)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/@import\s+[^;]+;?/gi, '')
    .replace(/url\(\s*(['"]?)[^)]+\)/gi, 'none');
}

/**
 * Giải URL gốc của trang đã lưu để ánh xạ tài nguyên tương đối sang cache local.
 *
 * @param {string} html HTML snapshot nguồn.
 * @param {string} snapshotPath Đường dẫn snapshot dùng suy ra host dự phòng.
 * @return {URL} URL trang nguồn.
 * @throws {never} Dùng URL dự phòng nếu snapshot không có canonical.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function resolveSavedPageUrl(html, snapshotPath) {
  const baseTag = html.match(/<base\b[^>]*>/i)?.[0];
  const baseHref = baseTag?.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2]?.replace(/&amp;/gi, '&');
  const canonicalTag = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => /\brel\s*=\s*["']canonical["']/i.test(tag));
  const canonicalHref = canonicalTag?.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2]?.replace(/&amp;/gi, '&');
  const hostFromFileName = basename(snapshotPath).match(/_tab\d+_([a-z0-9.-]+)_/i)?.[1];
  const fallbackUrl = `https://${hostFromFileName || 'sweepstakesalerts.com'}/`;
  try {
    return new URL(baseHref || canonicalHref || fallbackUrl, fallbackUrl);
  } catch {
    return new URL(fallbackUrl);
  }
}

/**
 * Ánh xạ tài nguyên nguồn trong snapshot sang file cache đã tải cục bộ.
 *
 * @param {string} html HTML snapshot form nguồn.
 * @param {URL} pageUrl URL gốc của snapshot.
 * @param {object} assetManifest Manifest do capture-form-assets.mjs tạo.
 * @return {Map<string, string>} URL chuẩn hóa sang đường dẫn tương đối mock-pages.
 * @throws {never} Tài nguyên sai URL hoặc chưa có trong cache được bỏ qua.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function mapSavedFormAssets(html, pageUrl, assetManifest) {
  const assetPathsByUrl = new Map();
  const references = [];
  const addReference = (value) => {
    if (value) references.push(value.trim());
  };
  for (const tagMatch of html.matchAll(/<(?:link|img|source|video|audio)\b[^>]*>/gi)) {
    const tag = tagMatch[0];
    const isStylesheet = tag.startsWith('<link') && /\brel\s*=\s*["']stylesheet["']/i.test(tag);
    if (tag.startsWith('<link') && !isStylesheet) continue;
    const srcValue = tag.match(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/i)?.[2];
    addReference(srcValue);
    const sourceSet = tag.match(/\bsrcset\s*=\s*(["'])(.*?)\1/i)?.[2];
    for (const sourceCandidate of sourceSet?.split(',') || []) addReference(sourceCandidate.trim().split(/\s+/, 1)[0]);
  }
  for (const styleMatch of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const match of styleMatch[1].matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)|@import\s+(?:url\()?\s*["']?([^"'; )]+)["']?/gi)) {
      addReference(match[1] || match[2]);
    }
  }
  for (const styleAttribute of html.matchAll(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    for (const match of styleAttribute[2].matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) addReference(match[1]);
  }
  for (const reference of references) {
    try {
      const assetUrl = new URL(reference, pageUrl).href;
      const urlHash = createHash('sha256').update(assetUrl).digest('hex');
      const localAssetPath = assetManifest.assetsByUrlHash[urlHash];
      if (localAssetPath) assetPathsByUrl.set(assetUrl, localAssetPath);
    } catch {
      continue;
    }
  }
  return assetPathsByUrl;
}

/**
 * Viết lại URL CSS trong form snapshot sang đường dẫn cache cục bộ.
 *
 * @param {string} css CSS inline từ snapshot.
 * @param {URL} pageUrl URL nguồn dùng phân giải tham chiếu tương đối.
 * @param {Map<string, string>} assetPathsByUrl Ánh xạ tài nguyên đã cache.
 * @return {string} CSS không cần gọi lại CDN.
 * @throws {never} URL không hợp lệ được thay bằng none.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function rewriteSavedFormCss(css, pageUrl, assetPathsByUrl) {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote, reference) => {
    if (reference.startsWith('data:') || reference.startsWith('#')) return `url(${quote}${reference}${quote})`;
    try {
      const localAssetPath = assetPathsByUrl.get(new URL(reference, pageUrl).href);
      return localAssetPath ? `url(${quote}${localAssetPath}${quote})` : 'url(none)';
    } catch {
      return 'url(none)';
    }
  }).replace(/@import\s+(["'])([^"']+)\1/gi, (_match, quote, reference) => {
    try {
      const localAssetPath = assetPathsByUrl.get(new URL(reference, pageUrl).href);
      return localAssetPath ? `@import ${quote}${localAssetPath}${quote}` : '';
    } catch {
      return '';
    }
  });
}

/**
 * Tạo lại link CSS và style inline theo đúng thứ tự trong HTML form đã lưu.
 *
 * @param {string} html HTML snapshot form.
 * @param {URL} pageUrl URL nguồn dùng phân giải tài nguyên.
 * @param {Map<string, string>} assetPathsByUrl Ánh xạ URL sang file cache.
 * @return {string} Các thẻ style/link local giữ thứ tự nguồn.
 * @throws {never} Tài nguyên chưa cache được bỏ qua an toàn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function buildSavedFormStyleMarkup(html, pageUrl, assetPathsByUrl) {
  const styleMarkup = [];
  const seenStyleMarkup = new Set();
  const styleResourcePattern = /<link\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style>/gi;
  for (const match of html.matchAll(styleResourcePattern)) {
    const tag = match[0];
    let localStyleMarkup = '';
    if (tag.startsWith('<link')) {
      if (!/\brel\s*=\s*["']stylesheet["']/i.test(tag)) continue;
      const stylesheetUrl = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2]?.replace(/&amp;/gi, '&');
      if (!stylesheetUrl) continue;
      try {
        const assetUrl = new URL(stylesheetUrl, pageUrl).href;
        const localAssetPath = assetPathsByUrl.get(assetUrl);
        if (!localAssetPath) continue;
        const media = tag.match(/\bmedia\s*=\s*(["'])(.*?)\1/i)?.[2];
        localStyleMarkup = `<link rel="stylesheet" data-mock-form-source-style href="${localAssetPath}"${media ? ` media="${media}"` : ''}>`;
      } catch {
        continue;
      }
    } else {
      const css = tag.replace(/^<style\b[^>]*>/i, '').replace(/<\/style>$/i, '');
      localStyleMarkup = `<style data-mock-form-source-style>${rewriteSavedFormCss(css, pageUrl, assetPathsByUrl)}</style>`;
    }
    if (localStyleMarkup && !seenStyleMarkup.has(localStyleMarkup)) {
      seenStyleMarkup.add(localStyleMarkup);
      styleMarkup.push(localStyleMarkup);
    }
  }
  return styleMarkup.join('\n');
}

/**
 * Chuẩn bị cache tài nguyên và stylesheet ứng với đúng snapshot form nguồn.
 *
 * @param {string} html HTML snapshot form.
 * @param {string} snapshotPath Đường dẫn snapshot form.
 * @param {object} assetManifest Manifest tài nguyên CSS, ảnh và font.
 * @return {object} URL gốc, tài nguyên local và stylesheet cần chèn.
 * @throws {Error} Khi manifest chưa khớp snapshot hoặc thiếu tài nguyên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function buildSavedFormAssetContext(html, snapshotPath, assetManifest) {
  assert.equal(assetManifest.sourceSnapshot, basename(snapshotPath), 'form asset cache matches the selected saved snapshot');
  assert.deepEqual(assetManifest.unresolvedAssetHosts, [], 'all captured form styles and media are available locally');
  const pageUrl = resolveSavedPageUrl(html, snapshotPath);
  const assetPathsByUrl = mapSavedFormAssets(html, pageUrl, assetManifest);
  const stylesheetPaths = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /\brel\s*=\s*["']stylesheet["']/i.test(tag))
    .map((tag) => tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2]?.replace(/&amp;/gi, '&'))
    .filter(Boolean)
    .map((reference) => {
      const assetUrl = new URL(reference, pageUrl).href;
      return assetPathsByUrl.get(assetUrl);
    })
    .filter(Boolean);
  assert.ok(stylesheetPaths.length > 0, 'saved form has locally cached stylesheet links');
  return {
    sourceBaseUrl: pageUrl.href,
    assetPathsByUrl: Object.fromEntries(assetPathsByUrl),
    assetPathCount: assetPathsByUrl.size,
    stylesheetPaths,
  };
}

/**
 * Trích form, câu hỏi hoặc offer phụ từ snapshot, giữ selector nguồn và loại dữ liệu nhập.
 *
 * @param {import('playwright').Page} page Trang Chromium dùng phân tích snapshot.
 * @param {string} html Snapshot HTML đã lưu.
 * @param {'form'|'question'|'offer'} stageType Loại trang hoặc offer cần trích.
 * @param {object} [visualAssetContext={}] Cache tài nguyên local để giữ giao diện form nguồn.
 * @return {Promise<object|null>} DOM đã khử dữ liệu nhập và metadata cấu trúc.
 * @throws {Error} Khi Chromium không phân tích được HTML.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function extractSavedOfferStage(page, html, stageType, visualAssetContext = {}) {
  const sanitizedSnapshot = stageType === 'form'
    ? sanitizeSavedSnapshotForParsing(html, { preserveVisualAssets: true })
    : sanitizeSavedSnapshotForParsing(html);
  await page.setContent(sanitizedSnapshot, { waitUntil: 'domcontentloaded' });
  return page.evaluate(({ requestedStageType, sourceBaseUrl, assetPathsByUrl }) => {
    const target = requestedStageType === 'form'
      ? [...document.querySelectorAll('.ai-content--form')].find((element) => element.querySelector('form.ai-form') && element.querySelector('input-fullname'))
      : requestedStageType === 'question'
        ? [...document.querySelectorAll('.ai-content--question')].find((element) => element.querySelector('#question-answers'))
        : [...document.querySelectorAll('.multi-offer .ai-content--offer[id^="offer-"]')].find((element) => element.classList.contains('offer-object'));
    if (!target) return null;

    let clonedBody;
    if (requestedStageType === 'form') {
      const targetMarker = 'data-mock-saved-form-root';
      target.setAttribute(targetMarker, 'true');
      clonedBody = document.body.cloneNode(true);
      const clonedTarget = clonedBody.querySelector(`[${targetMarker}]`);
      if (!clonedTarget) throw new Error('cloned saved form root is missing');
      clonedTarget.removeAttribute(targetMarker);
      for (let styleIndex = 0; styleIndex < document.documentElement.style.length; styleIndex += 1) {
        const propertyName = document.documentElement.style.item(styleIndex);
        if (propertyName.startsWith('--')) {
          clonedBody.style.setProperty(propertyName, document.documentElement.style.getPropertyValue(propertyName));
        }
      }
      const capturedInformationForm = clonedTarget.querySelector('form.ai-form');
      for (const formElement of [...clonedBody.querySelectorAll('form')]) {
        if (formElement === capturedInformationForm) continue;
        const nonFormContainer = document.createElement('div');
        for (const attribute of [...formElement.attributes]) nonFormContainer.setAttribute(attribute.name, attribute.value);
        while (formElement.firstChild) nonFormContainer.appendChild(formElement.firstChild);
        formElement.replaceWith(nonFormContainer);
      }
    } else {
      let clonedBranch = target.cloneNode(true);
      if (requestedStageType !== 'offer') {
        let currentElement = target;
        while (currentElement.parentElement && currentElement.parentElement !== document.body) {
          const parentElement = currentElement.parentElement;
          const clonedParent = parentElement.cloneNode(false);
          clonedParent.appendChild(clonedBranch);
          clonedBranch = clonedParent;
          currentElement = parentElement;
        }
      }
      clonedBody = document.body.cloneNode(false);
      clonedBody.appendChild(clonedBranch);
    }
    const retainedAttributes = new Set([
      'id', 'class', 'type', 'name', 'role', 'for', 'required', 'readonly', 'hidden', 'disabled',
      'multiple', 'autocomplete', 'tabindex', 'min', 'max', 'minlength', 'maxlength', 'pattern',
      'step', 'inputmode', 'aria-hidden', 'aria-expanded', 'aria-selected', 'aria-controls',
      'aria-labelledby', 'aria-label', 'aria-describedby', 'placeholder', 'title', 'alt',
      'src', 'srcset', 'data-testid', 'data-hidden-required', 'accept', 'checked', 'value',
    ]);
    const resolveCapturedAsset = (resourceValue) => {
      if (resourceValue.startsWith('data:')) return resourceValue;
      try {
        return assetPathsByUrl[new URL(resourceValue, sourceBaseUrl).href] || null;
      } catch {
        return null;
      }
    };
    const rewriteCapturedStyle = (styleValue) => styleValue.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote, resourceValue) => {
      if (resourceValue.startsWith('data:') || resourceValue.startsWith('#')) return `url(${quote}${resourceValue}${quote})`;
      const localAssetPath = resolveCapturedAsset(resourceValue);
      return localAssetPath ? `url(${quote}${localAssetPath}${quote})` : 'url(none)';
    });

    for (const element of [clonedBody, ...clonedBody.querySelectorAll('*')]) {
      for (const attribute of [...element.attributes]) {
        const attributeName = attribute.name.toLowerCase();
        if (attributeName === 'style') {
          element.setAttribute('style', requestedStageType === 'form'
            ? rewriteCapturedStyle(attribute.value)
            : attribute.value.replace(/url\([^)]*\)/gi, 'none'));
        } else if (attributeName === 'src') {
          const localAssetPath = requestedStageType === 'form' ? resolveCapturedAsset(attribute.value) : null;
          if (localAssetPath) element.setAttribute(attribute.name, localAssetPath);
          else element.removeAttribute(attribute.name);
        } else if (attributeName === 'srcset') {
          const localSources = requestedStageType === 'form'
            ? attribute.value.split(',').map((candidate) => {
              const [resourceValue, descriptor] = candidate.trim().split(/\s+/, 2);
              const localAssetPath = resolveCapturedAsset(resourceValue);
              return localAssetPath ? `${localAssetPath}${descriptor ? ` ${descriptor}` : ''}` : null;
            }).filter(Boolean)
            : [];
          if (localSources.length) element.setAttribute(attribute.name, localSources.join(', '));
          else element.removeAttribute(attribute.name);
        } else if (attributeName === 'href' && element.tagName === 'A') {
          element.setAttribute(attribute.name, '#');
        } else if (attributeName.startsWith('on') || (!retainedAttributes.has(attributeName) && !attributeName.startsWith('data-') && !attributeName.startsWith('aria-'))) {
          element.removeAttribute(attribute.name);
        }
      }
      if (element.matches('input, textarea')) {
        const inputType = element.tagName === 'INPUT' ? element.type.toLowerCase() : '';
        const isControlInput = ['button', 'submit', 'reset', 'image', 'radio', 'checkbox'].includes(inputType);
        const fieldValue = element.getAttribute('value') || '';
        const isUnansweredMask = fieldValue.includes('_') && /^[\s_./-]+$/.test(fieldValue);
        if (element.tagName === 'TEXTAREA' || (!isControlInput && !isUnansweredMask)) {
          element.removeAttribute('value');
        }
        if (requestedStageType !== 'form') {
          element.removeAttribute('checked');
          if (element.tagName === 'INPUT') element.checked = false;
        }
        if (element.tagName === 'TEXTAREA') element.textContent = '';
      }
      if (element.matches('button.question-answer-button')) {
        element.classList.remove('active', 'selected', 'checked', 'chosen');
        element.removeAttribute('aria-checked');
        element.removeAttribute('aria-selected');
      }
      if (element.tagName === 'OPTION' && requestedStageType !== 'form') element.removeAttribute('selected');
    }

    if (requestedStageType !== 'form') {
      const textWalker = document.createTreeWalker(clonedBody, NodeFilter.SHOW_TEXT);
      while (textWalker.nextNode()) {
        textWalker.currentNode.textContent = textWalker.currentNode.textContent
          .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'example.invalid')
          .replace(/\b(?:\+?\d[\d .()-]{7,}\d)\b/g, '5550100');
      }
    }
    const question = requestedStageType === 'question' ? target : null;
    const answerButtons = question ? [...question.querySelectorAll('#question-answers button.question-answer-button')] : [];
    const isMultiSelect = Boolean(question?.querySelector('.ai-button--multiselect, .ai-select--question'));
    const offer = requestedStageType === 'offer' ? target : null;
    return {
      bodyMarkup: clonedBody.outerHTML,
      questionId: question?.id || null,
      answerCount: answerButtons.length,
      isMultiSelect,
      questionProfile: question ? `${answerButtons.length}-${isMultiSelect ? 'multi' : 'single'}` : 'information-form',
      questionHasForm: question ? Boolean(question.querySelector('form')) : false,
      offerId: offer?.id || null,
      offerHasForm: offer ? Boolean(offer.querySelector('form')) : false,
      offerActionCount: offer ? offer.querySelectorAll('a[id^="ct-creative-submit-"], .ct-creative-submit, .ai-submit-button').length : 0,
    };
  }, {
    requestedStageType: stageType,
    sourceBaseUrl: visualAssetContext.sourceBaseUrl || 'https://sweepstakesalerts.com/',
    assetPathsByUrl: visualAssetContext.assetPathsByUrl || {},
  });
}

/**
 * Tìm mọi offer có thể dựng từ một snapshot, kể cả các nút chọn trong offer và offer tĩnh.
 *
 * @param {import('playwright').Page} page Trang Chromium dùng phân tích snapshot.
 * @param {string} html Snapshot HTML nguồn.
 * @return {Promise<object>} Danh sách offer dựng được và form offer bị loại khỏi mô phỏng.
 * @throws {Error} Khi Chromium không phân tích được snapshot.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function extractSavedSecondaryOffers(page, html) {
  await page.setContent(sanitizeSavedSnapshotForParsing(html), { waitUntil: 'domcontentloaded' });
  return page.evaluate(() => {
    const candidateSelectors = [
      { sourceType: 'multi_offer', selector: '.multi-offer .ai-content--offer[id^="offer-"]' },
      { sourceType: 'offers_list', selector: '[id^="offers_list-"]' },
      { sourceType: 'offer_object', selector: '.ai-content--offer[id^="offer-"]' },
      { sourceType: 'offer_container', selector: '.offer-container-v2' },
      { sourceType: 'offerwall_card', selector: '[id^="offerwall_card_"]' },
    ];
    const candidateRoots = new Map();
    const savedMarkupRoots = [document, ...[...document.querySelectorAll('template')].map((template) => template.content)];
    for (const markupRoot of savedMarkupRoots) {
      for (const { sourceType, selector } of candidateSelectors) {
        for (const element of markupRoot.querySelectorAll(selector)) {
          if (!candidateRoots.has(element)) candidateRoots.set(element, sourceType);
        }
      }
    }

    const retainedAttributes = new Set([
      'id', 'class', 'type', 'name', 'role', 'for', 'required', 'readonly', 'hidden', 'disabled',
      'multiple', 'autocomplete', 'tabindex', 'min', 'max', 'minlength', 'maxlength', 'pattern',
      'step', 'inputmode', 'aria-hidden', 'aria-expanded', 'aria-selected', 'aria-controls',
      'aria-labelledby', 'aria-label', 'aria-pressed', 'data-testid', 'data-hidden-required',
    ]);
    const standardActionSelector = [
      'a[id^="ct-creative-submit-"]',
      'button[id^="ct-creative-submit-"]',
      '.ct-creative-submit',
      '.ai-submit-button',
      '.ai-skip',
      '.eligibility-btn',
    ].join(',');
    const answerSelector = 'button.question-answer-button, button[id^="answer-"]';
    const offers = [];
    const excludedFormOffers = [];
    const scan = {
      candidateRootCount: candidateRoots.size,
      excludedFormRootCount: 0,
      excludedEmptyRootCount: 0,
    };

    for (const [target, sourceType] of candidateRoots) {
      const containsForm = target.matches('form') || Boolean(target.closest('form')) || Boolean(target.querySelector('form'));
      if (containsForm) {
        scan.excludedFormRootCount += 1;
        excludedFormOffers.push({ offerId: target.id || null, sourceType });
        continue;
      }

      const standardActions = [...target.querySelectorAll(standardActionSelector)];
      const answerActions = [...target.querySelectorAll(answerSelector)];
      const isQuestionOffer = answerActions.length > 0;
      const declineAction = standardActions.find((element) => {
        const actionId = (element.id || '').toLowerCase();
        return element.classList.contains('ai-skip') || /(?:no|skip|decline|02|05)$/.test(actionId);
      }) || null;
      const primaryAction = isQuestionOffer
        ? answerActions[0]
        : standardActions.find((element) => element !== declineAction) || null;
      const actionType = isQuestionOffer ? 'question_answer' : primaryAction ? 'primary_cta' : 'informational';
      const sourceActions = isQuestionOffer ? answerActions : standardActions;
      const textContent = (target.innerText || target.textContent || '').trim();
      if (!primaryAction && !textContent) {
        scan.excludedEmptyRootCount += 1;
        continue;
      }

      let clonedBranch = target.cloneNode(true);
      const clonedTarget = clonedBranch;
      let currentElement = target;
      while (currentElement.parentElement && currentElement.parentElement !== document.body) {
        const parentElement = currentElement.parentElement;
        if (parentElement.tagName === 'FORM') break;
        const clonedParent = parentElement.cloneNode(false);
        clonedParent.removeAttribute('id');
        clonedParent.appendChild(clonedBranch);
        clonedBranch = clonedParent;
        currentElement = parentElement;
      }
      const clonedBody = document.createElement('body');
      clonedBody.appendChild(clonedBranch);

      for (const element of [clonedBody, ...clonedBody.querySelectorAll('*')]) {
        for (const attribute of [...element.attributes]) {
          const attributeName = attribute.name.toLowerCase();
          if (attributeName === 'style') {
            element.setAttribute('style', attribute.value.replace(/url\([^)]*\)/gi, 'none'));
          } else if (attributeName.startsWith('on') || !retainedAttributes.has(attributeName)) {
            element.removeAttribute(attribute.name);
          }
        }
        if (element.matches('input, textarea')) {
          element.removeAttribute('value');
          element.removeAttribute('checked');
          if (element.tagName === 'INPUT') element.checked = false;
          if (element.tagName === 'TEXTAREA') element.textContent = '';
        }
        if (element.tagName === 'OPTION') element.removeAttribute('selected');
      }

      const clonedStandardActions = [...clonedTarget.querySelectorAll(standardActionSelector)];
      const clonedAnswerActions = [...clonedTarget.querySelectorAll(answerSelector)];
      const markAction = (sourceAction, clonedAction, mockAction) => {
        if (!sourceAction || !clonedAction) return;
        clonedAction.dataset.mockSecondaryOfferAction = mockAction;
        clonedAction.dataset.mockSourceActionId = sourceAction.id || '';
        clonedAction.setAttribute('role', 'button');
        clonedAction.setAttribute('tabindex', '0');
        clonedAction.setAttribute('aria-pressed', 'false');
      };
      if (isQuestionOffer) {
        answerActions.forEach((answerAction, index) => markAction(answerAction, clonedAnswerActions[index], 'answer'));
        if (declineAction) {
          const declineIndex = standardActions.indexOf(declineAction);
          markAction(declineAction, clonedStandardActions[declineIndex], 'decline');
        }
      } else {
        if (primaryAction) {
          const primaryIndex = standardActions.indexOf(primaryAction);
          markAction(primaryAction, clonedStandardActions[primaryIndex], 'accept');
        }
        if (declineAction) {
          const declineIndex = standardActions.indexOf(declineAction);
          markAction(declineAction, clonedStandardActions[declineIndex], 'decline');
        }
      }

      const textWalker = document.createTreeWalker(clonedBody, NodeFilter.SHOW_TEXT);
      while (textWalker.nextNode()) {
        textWalker.currentNode.textContent = textWalker.currentNode.textContent
          .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'example.invalid')
          .replace(/\b(?:\+?\d[\d .()-]{7,}\d)\b/g, '5550100');
      }

      const normalizedText = textContent
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'example.invalid')
        .replace(/\b(?:\+?\d[\d .()-]{7,}\d)\b/g, '5550100')
        .replace(/\b\d{10,}\b/g, '<number>')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const identitySignature = [
        sourceType,
        target.id.replace(/\d{10,}/g, '<number>'),
        typeof target.className === 'string' ? target.className : '',
        normalizedText,
        ...sourceActions.map((action) => `${action.id || action.className || action.tagName}:${(action.innerText || action.value || '').trim()}`),
      ].join('|');
      offers.push({
        bodyMarkup: clonedBody.outerHTML,
        offerId: target.id || null,
        sourceType,
        actionType,
        offerHasForm: false,
        sourceActionCount: sourceActions.length,
        primaryActionId: primaryAction?.id || null,
        declineActionId: declineAction?.id || null,
        identitySignature,
      });
    }
    return { offers, excludedFormOffers, scan };
  });
}

/**
 * Quét mọi snapshot, dựng offer 10 trang và gắn toàn bộ offer phụ có thể khôi phục.
 *
 * @param {import('playwright').Page} page Trang Chromium dùng dựng các mock local.
 * @param {string} logDirectory Gốc thư mục chứa các snapshot HTML đã lưu.
 * @return {Promise<object>} Số trang, cấu trúc câu hỏi, offer và kết quả quét log.
 * @throws {Error} Khi log thiếu form, câu hỏi hoặc offer phụ cần thiết.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function buildMockPagesFromSavedHtml(page, logDirectory) {
  const snapshots = await findHtmlSnapshots(logDirectory);
  const formAssetManifest = JSON.parse(await readFile(join(mockDirectory, 'form-assets.json'), 'utf8'));
  let informationForm;
  let informationFormHtml;
  let informationFormAssetContext;
  let informationFormSnapshotPath;
  const questionCandidates = [];
  const seenQuestionIds = new Set();
  const secondaryOffersByIdentity = new Map();
  const excludedFormOffersByIdentity = new Map();
  const offerwallMarkersById = new Map();
  const secondaryOfferScan = {
    scannedSnapshotCount: snapshots.length,
    offerMarkerSnapshotCount: 0,
    offerRootOccurrenceCount: 0,
    excludedFormRootCount: 0,
    excludedEmptyRootCount: 0,
    duplicateOfferOccurrenceCount: 0,
    offerwallMarkerOccurrenceCount: 0,
  };
  let snapshotOrder = 0;

  for (const snapshot of snapshots) {
    const html = await readFile(snapshot, 'utf8');
    if (!informationForm && /ai-content--form/i.test(html) && /class\s*=\s*["'][^"']*ai-form/i.test(html) && /input-fullname/i.test(html)) {
      const formAssetContext = buildSavedFormAssetContext(html, snapshot, formAssetManifest);
      const extractedForm = await extractSavedOfferStage(page, html, 'form', formAssetContext);
      if (extractedForm?.bodyMarkup.includes('id="generic-funnel"')) {
        informationForm = extractedForm;
        informationFormHtml = html;
        informationFormAssetContext = formAssetContext;
        informationFormSnapshotPath = snapshot;
      }
    }
    if (/id\s*=\s*["']question-answers["']/i.test(html) && /ai-content--question/i.test(html)) {
      const extractedQuestion = await extractSavedOfferStage(page, html, 'question');
      if (extractedQuestion?.questionId && !seenQuestionIds.has(extractedQuestion.questionId)) {
        assert.equal(extractedQuestion.questionHasForm, false, 'saved answer stage has no form element');
        seenQuestionIds.add(extractedQuestion.questionId);
        questionCandidates.push({ ...extractedQuestion, html, snapshotOrder });
      }
    }
    if (/(?:offerwall_card_|offers_list-|offer-container-v2|multi-offer|ai-content--offer)/i.test(html)) {
      secondaryOfferScan.offerMarkerSnapshotCount += 1;
      for (const markerMatch of html.matchAll(/offerwall_card_[\w-]+/gi)) {
        secondaryOfferScan.offerwallMarkerOccurrenceCount += 1;
        const markerId = markerMatch[0];
        const existingMarker = offerwallMarkersById.get(markerId);
        if (existingMarker) {
          if (!existingMarker.sourceSnapshotNames.includes(basename(snapshot))) {
            existingMarker.sourceSnapshotNames.push(basename(snapshot));
          }
          existingMarker.sourceSnapshotCount = existingMarker.sourceSnapshotNames.length;
          continue;
        }
        offerwallMarkersById.set(markerId, {
          sourceSnapshotCount: 1,
          sourceSnapshotNames: [basename(snapshot)],
        });
      }
      const extractedOffers = await extractSavedSecondaryOffers(page, html);
      secondaryOfferScan.offerRootOccurrenceCount += extractedOffers.scan.candidateRootCount;
      secondaryOfferScan.excludedFormRootCount += extractedOffers.scan.excludedFormRootCount;
      secondaryOfferScan.excludedEmptyRootCount += extractedOffers.scan.excludedEmptyRootCount;
      for (const excludedOffer of extractedOffers.excludedFormOffers) {
        const normalizedOfferId = excludedOffer.offerId?.replace(/_\d{10,}$/, '_<timestamp>') || null;
        const identityKey = normalizedOfferId || excludedOffer.sourceType;
        const existingExcludedOffer = excludedFormOffersByIdentity.get(identityKey);
        if (existingExcludedOffer) {
          if (!existingExcludedOffer.sourceSnapshotNames.includes(basename(snapshot))) {
            existingExcludedOffer.sourceSnapshotNames.push(basename(snapshot));
          }
          existingExcludedOffer.sourceSnapshotCount = existingExcludedOffer.sourceSnapshotNames.length;
          continue;
        }
        excludedFormOffersByIdentity.set(identityKey, {
          offerId: normalizedOfferId,
          sourceType: excludedOffer.sourceType,
          sourceSnapshotNames: [basename(snapshot)],
          sourceSnapshotCount: 1,
        });
      }
      for (const extractedOffer of extractedOffers.offers) {
        const identitySignatureHash = createHash('sha256').update(extractedOffer.identitySignature).digest('hex');
        const identityKey = extractedOffer.offerId
          ? `offer:${extractedOffer.offerId}`
          : `${extractedOffer.sourceType}:${identitySignatureHash}`;
        const existingOffer = secondaryOffersByIdentity.get(identityKey);
        const sourceSnapshotName = basename(snapshot);
        if (existingOffer) {
          secondaryOfferScan.duplicateOfferOccurrenceCount += 1;
          if (!existingOffer.sourceSnapshotNames.includes(sourceSnapshotName)) {
            existingOffer.sourceSnapshotNames.push(sourceSnapshotName);
          }
          existingOffer.sourceSnapshotCount = existingOffer.sourceSnapshotNames.length;
          continue;
        }
        secondaryOffersByIdentity.set(identityKey, {
          ...extractedOffer,
          offerId: extractedOffer.offerId || `captured-${identitySignatureHash.slice(0, 12)}`,
          identityKey,
          identitySignature: undefined,
          identitySignatureHash,
          html,
          snapshotOrder,
          sourceSnapshotCount: 1,
          sourceSnapshotNames: [sourceSnapshotName],
        });
      }
    }
    snapshotOrder += 1;
  }

  assert.ok(informationForm, 'saved logs contain an Alpha Intent information form');
  assert.ok(questionCandidates.length >= 9, 'saved logs contain nine distinct question IDs');
  const selectedSecondaryOffers = [...secondaryOffersByIdentity.values()]
    .sort((first, second) => first.snapshotOrder - second.snapshotOrder);
  assert.ok(selectedSecondaryOffers.filter((offer) => offer.actionType !== 'informational').length >= 2, 'saved logs contain multiple actionable secondary offers');

  const selectedQuestions = [];
  const selectedQuestionIds = new Set();
  const selectedProfiles = new Set();
  for (const candidate of questionCandidates) {
    if (!selectedProfiles.has(candidate.questionProfile)) {
      selectedQuestions.push(candidate);
      selectedQuestionIds.add(candidate.questionId);
      selectedProfiles.add(candidate.questionProfile);
    }
  }
  assert.ok(selectedQuestions.length <= 9, 'question profile count fits the 10-page offer');
  for (const candidate of questionCandidates) {
    if (selectedQuestions.length === 9) break;
    if (selectedQuestionIds.has(candidate.questionId)) continue;
    selectedQuestions.push(candidate);
    selectedQuestionIds.add(candidate.questionId);
    selectedProfiles.add(candidate.questionProfile);
  }
  selectedQuestions.sort((first, second) => first.snapshotOrder - second.snapshotOrder);
  assert.equal(selectedQuestions.length, 9, 'offer contains exactly nine distinct question pages');
  assert.ok(selectedProfiles.size >= 5, 'offer includes the five captured answer structures');

  const offerCatalog = {
    ...secondaryOfferScan,
    uniqueOfferCount: selectedSecondaryOffers.length,
    uniqueActionableOfferCount: selectedSecondaryOffers.filter((offer) => offer.actionType !== 'informational').length,
    uniqueInformationalOfferCount: selectedSecondaryOffers.filter((offer) => offer.actionType === 'informational').length,
    uniqueFormExcludedOfferCount: offerwallMarkersById.size + excludedFormOffersByIdentity.size,
    excludedFormOffers: [
      ...[...offerwallMarkersById.entries()].map(([offerId, offer]) => ({
        offerId,
        sourceType: 'offerwall_form_marker',
        exclusionReason: 'The saved marker belongs to a form element, and only the information-entry page may contain a form.',
        sourceSnapshotCount: offer.sourceSnapshotCount,
        sourceSnapshotNames: offer.sourceSnapshotNames,
      })),
      ...[...excludedFormOffersByIdentity.values()].map((offer) => ({
      offerId: offer.offerId,
      sourceType: offer.sourceType,
      exclusionReason: 'The captured offer root contains a form.',
      sourceSnapshotCount: offer.sourceSnapshotCount,
      sourceSnapshotNames: offer.sourceSnapshotNames,
      })),
    ],
    offers: selectedSecondaryOffers.map((offer) => ({
      offerId: offer.offerId,
      sourceType: offer.sourceType,
      actionType: offer.actionType,
      primaryActionId: offer.primaryActionId,
      declineActionId: offer.declineActionId,
      sourceActionCount: offer.sourceActionCount,
      sourceSnapshotCount: offer.sourceSnapshotCount,
        sourceSnapshotNames: offer.sourceSnapshotNames,
    })),
  };
  await writeFile(join(mockDirectory, 'offer-log-catalog.json'), `${JSON.stringify(offerCatalog, null, 2)}\n`, 'utf8');

  const stages = [
    { kind: 'information_form', bodyMarkup: informationForm.bodyMarkup, profile: informationForm.questionProfile },
    ...selectedQuestions.map((question) => ({
      kind: 'question',
      bodyMarkup: question.bodyMarkup,
      profile: question.questionProfile,
      questionId: question.questionId,
      answerCount: question.answerCount,
      html: question.html,
    })),
  ];
  stages[stages.length - 1].secondaryOffers = selectedSecondaryOffers;
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  const combinedBody = await page.evaluate((offerStages) => {
    const mockFlow = document.createElement('div');
    mockFlow.id = 'mock-offer-flow';
    offerStages.forEach((offerStage, stageIndex) => {
      const stageDocument = new DOMParser().parseFromString(offerStage.bodyMarkup, 'text/html');
      const pageElement = document.createElement('section');
      pageElement.className = 'mock-offer-page';
      for (let styleIndex = 0; styleIndex < stageDocument.body.style.length; styleIndex += 1) {
        const propertyName = stageDocument.body.style.item(styleIndex);
        if (propertyName.startsWith('--')) {
          pageElement.style.setProperty(propertyName, stageDocument.body.style.getPropertyValue(propertyName));
        }
      }
      pageElement.dataset.offerPage = String(stageIndex + 1);
      pageElement.dataset.pageKind = offerStage.kind;
      if (offerStage.profile) pageElement.dataset.questionProfile = offerStage.profile;
      if (offerStage.questionId) pageElement.dataset.questionId = offerStage.questionId;
      if (offerStage.answerCount) pageElement.dataset.answerCount = String(offerStage.answerCount);
      pageElement.hidden = stageIndex !== 0;
      pageElement.inert = stageIndex !== 0;
      if (stageIndex !== 0) pageElement.style.setProperty('display', 'none', 'important');
      for (const child of [...stageDocument.body.children]) pageElement.appendChild(child);

      const controls = document.createElement('div');
      controls.className = 'mock-offer-controls';
      controls.hidden = stageIndex === 0;
      const nextButton = document.createElement('button');
      nextButton.type = 'button';
      nextButton.className = 'mock-offer-next';
      nextButton.dataset.mockAction = 'next-page';
      nextButton.textContent = stageIndex === 9 ? 'Finish sample' : `Continue to page ${stageIndex + 2}`;
      if (stageIndex === 0) {
        nextButton.disabled = true;
        const validationMessage = document.createElement('p');
        validationMessage.id = 'mock-form-validation-message';
        validationMessage.className = 'mock-form-validation-message';
        validationMessage.setAttribute('role', 'alert');
        validationMessage.textContent = 'Fill all required fields and check the AI disclaimer to continue.';
        controls.appendChild(validationMessage);
      }
      controls.appendChild(nextButton);
      pageElement.appendChild(controls);
      if (offerStage.secondaryOffers?.length) {
        const secondaryOfferWall = document.createElement('section');
        secondaryOfferWall.id = 'mock-secondary-offers';
        secondaryOfferWall.className = 'mock-secondary-offers';
        secondaryOfferWall.setAttribute('aria-label', 'Captured secondary offers');
        const wallHeading = document.createElement('h2');
        wallHeading.textContent = 'Secondary offers';
        secondaryOfferWall.appendChild(wallHeading);
        const offerGrid = document.createElement('div');
        offerGrid.className = 'mock-secondary-offers-grid';
        offerStage.secondaryOffers.forEach((secondaryOffer, offerIndex) => {
          const offerCard = document.createElement('article');
          offerCard.className = 'mock-secondary-offer-card';
          offerCard.dataset.mockSecondaryOfferId = secondaryOffer.offerId;
          offerCard.dataset.mockSecondaryOfferType = secondaryOffer.sourceType;
          offerCard.dataset.mockOfferActionType = secondaryOffer.actionType;
          offerCard.dataset.mockOfferStatus = secondaryOffer.actionType === 'informational' ? 'informational' : 'pending';
          const offerHeading = document.createElement('h3');
          offerHeading.textContent = `Offer ${offerIndex + 1} · ${secondaryOffer.offerId}`;
          offerCard.appendChild(offerHeading);
          const offerDocument = new DOMParser().parseFromString(secondaryOffer.bodyMarkup, 'text/html');
          for (const offerContent of [...offerDocument.body.children]) offerCard.appendChild(offerContent);
          const localActions = offerCard.querySelectorAll('[data-mock-secondary-offer-action]');
          if (secondaryOffer.actionType !== 'informational' && localActions.length === 0) {
            throw new Error(`captured secondary offer ${secondaryOffer.offerId} lost its source action`);
          }
          const offerStatus = document.createElement('p');
          offerStatus.className = 'mock-secondary-offer-status';
          offerStatus.setAttribute('role', 'status');
          offerStatus.textContent = secondaryOffer.actionType === 'informational'
            ? 'Captured informational content; no saved CTA'
            : 'Pending local choice';
          offerCard.appendChild(offerStatus);
          offerGrid.appendChild(offerCard);
        });
        secondaryOfferWall.appendChild(offerGrid);
        pageElement.appendChild(secondaryOfferWall);
      }
      mockFlow.appendChild(pageElement);
    });
    return mockFlow.outerHTML;
  }, stages.map(({ kind, bodyMarkup, profile, questionId, answerCount, secondaryOffers }) => ({
    kind,
    bodyMarkup,
    profile,
    questionId,
    answerCount,
    secondaryOffers: secondaryOffers?.map(({ bodyMarkup: offerMarkup, offerId, sourceType, actionType }) => ({
      bodyMarkup: offerMarkup,
      offerId,
      sourceType,
      actionType,
    })),
  })));
  assert.ok(combinedBody.includes('data-offer-page="10"'), 'combined offer contains ten page stages');
  assert.equal((combinedBody.match(/<form\b/gi) || []).length, 1, 'only the information-entry page contains a form');
  assert.equal((combinedBody.match(/data-mock-secondary-offer-id=/g) || []).length, selectedSecondaryOffers.length, 'last page contains every captured secondary offer');

  const formStyles = buildSavedFormStyleMarkup(
    informationFormHtml,
    new URL(informationFormAssetContext.sourceBaseUrl),
    new Map(Object.entries(informationFormAssetContext.assetPathsByUrl)),
  );
  const otherStyleSources = [...selectedQuestions.map((question) => question.html), ...selectedSecondaryOffers.map((offer) => offer.html)];
  const otherStyles = [...new Set(otherStyleSources.flatMap((html) => [...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)]
    .map((match) => sanitizeSavedSnapshotForParsing(match[0]))).filter(Boolean))].join('\n');
  const styles = [formStyles, otherStyles].filter(Boolean).join('\n');
  const localBehavior = `<script>
document.addEventListener('submit', (event) => event.preventDefault(), true);
document.addEventListener('click', (event) => {
  const sourceLink = event.target.closest?.('a[href]');
  if (sourceLink) event.preventDefault();
}, true);
const informationForm = document.querySelector('[data-offer-page="1"] form.ai-form');
const formContinueButton = document.querySelector('[data-offer-page="1"] [data-mock-action="next-page"]');
const formSubmitButton = informationForm?.querySelector('#submit-button');
const formValidationMessage = document.querySelector('#mock-form-validation-message');
/**
 * Liệt kê trường bắt buộc còn thiếu, kể cả giá trị ngày vẫn ở dạng mặt nạ.
 * @return {string[]} Tên các trường cần hoàn tất trước khi tiếp tục.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function collectMissingRequiredFields() {
  if (!informationForm) return ['information-form'];
  const requiredFields = [...informationForm.querySelectorAll('input[required], select[required], textarea[required]')]
    .filter((field) => !field.disabled && !field.hidden && field.type !== 'hidden' && !field.readOnly);
  const missingFields = [];
  const requiredRadioNames = new Set(requiredFields.filter((field) => field.type === 'radio').map((field) => field.name));
  for (const radioName of requiredRadioNames) {
    if (!informationForm.querySelector('input[type="radio"][name="' + radioName + '"]:checked')) missingFields.push(radioName || 'radio');
  }
  for (const field of requiredFields) {
    if (field.type === 'radio') continue;
    const fieldValue = String(field.value || '').trim();
    const isUnansweredMask = fieldValue.includes('_') && /^[\\s_./-]+$/.test(fieldValue);
    if (field.type === 'checkbox' ? !field.checked : !fieldValue || isUnansweredMask || !field.checkValidity()) {
      missingFields.push(field.id || field.name || field.tagName.toLowerCase());
    }
  }
  const disclaimer = informationForm.querySelector('#ai-disclaimer-container input[type="checkbox"]');
  if (disclaimer && !disclaimer.checked) missingFields.push('ai-disclaimer');
  return missingFields;
}
function updateInformationFormValidation() {
  const missingFields = collectMissingRequiredFields();
  const isValid = missingFields.length === 0;
  if (informationForm) {
    informationForm.dataset.mockFormValid = String(isValid);
    informationForm.dataset.mockMissingRequiredCount = String(missingFields.length);
  }
  if (formContinueButton) formContinueButton.disabled = !isValid;
  if (formSubmitButton) formSubmitButton.disabled = !isValid;
  if (formValidationMessage) formValidationMessage.hidden = isValid;
  return isValid;
}
informationForm?.addEventListener('input', updateInformationFormValidation, true);
informationForm?.addEventListener('change', updateInformationFormValidation, true);
informationForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (updateInformationFormValidation()) formContinueButton?.click();
}, true);
document.addEventListener('click', (event) => {
  const offerCta = event.target.closest?.('[data-mock-secondary-offer-action]');
  if (offerCta) {
    event.preventDefault();
    const offerCard = offerCta.closest('[data-mock-secondary-offer-id]');
    if (!offerCard || offerCard.dataset.mockOfferStatus === 'completed') return;
    const offerChoice = offerCta.dataset.mockSecondaryOfferAction;
    offerCard.dataset.mockOfferStatus = 'completed';
    offerCard.dataset.mockOfferChoice = offerChoice;
    offerCard.querySelectorAll('[data-mock-secondary-offer-action]').forEach((cta) => {
      cta.setAttribute('aria-disabled', 'true');
      cta.setAttribute('tabindex', '-1');
    });
    offerCta.setAttribute('aria-pressed', 'true');
    const offerStatus = offerCard.querySelector('.mock-secondary-offer-status');
    if (offerStatus) {
      offerStatus.textContent = offerChoice === 'decline'
        ? 'Offer declined locally'
        : offerChoice === 'answer'
          ? 'Captured answer selected locally'
          : 'Primary offer selected locally';
    }
    return;
  }
  const nextButton = event.target.closest?.('[data-mock-action="next-page"]');
  if (!nextButton) return;
  const currentPage = nextButton.closest('[data-offer-page]');
  if (currentPage.dataset.offerPage === '1' && !updateInformationFormValidation()) return;
  const nextPageNumber = Number(currentPage.dataset.offerPage) + 1;
  if (nextPageNumber > 10) return;
  const nextPage = document.querySelector('[data-offer-page="' + nextPageNumber + '"]');
  if (!nextPage) return;
  if (currentPage.dataset.offerPage === '1') {
    document.querySelectorAll('[data-mock-form-source-style]').forEach((styleElement) => {
      styleElement.disabled = true;
    });
  }
  currentPage.hidden = true;
  currentPage.inert = true;
  currentPage.style.setProperty('display', 'none', 'important');
  nextPage.hidden = false;
  nextPage.inert = false;
  nextPage.style.removeProperty('display');
}, true);
updateInformationFormValidation();
</script>`;
  const safeBodyMarkup = `<body>${combinedBody}${localBehavior}</body>`;
  const localStyles = '<style>#mock-offer-flow{width:100%;flex:0 0 100%}.mock-offer-page{display:block!important;width:100%!important;min-width:0!important;flex:0 0 100%!important;box-sizing:border-box!important}#mock-offer-flow [data-offer-page="1"] .ai-progress-bar-inner{width:var(--progressPercentage,0%)!important}.mock-offer-controls{margin:1rem 0}.mock-offer-controls[hidden]{display:none!important}.mock-offer-next{padding:.65rem 1rem;cursor:pointer}.mock-offer-next:disabled,#submit-button:disabled{opacity:.55;cursor:not-allowed}.mock-form-validation-message{color:#a11;font-weight:600}.ai-disclaimer-container label.tcpa-text{display:flex;align-items:flex-start;gap:.55rem}.ai-disclaimer-container input.ai-disclaimer-hidden[type="checkbox"]{appearance:auto!important;-webkit-appearance:checkbox!important;position:relative!important;z-index:10!important;pointer-events:auto!important;display:inline-block!important;visibility:visible!important;opacity:1!important;width:1.15rem!important;height:1.15rem!important;min-width:1.15rem!important;margin:.15rem .35rem 0 0!important;clip:auto!important;clip-path:none!important;overflow:visible!important;accent-color:#15803d;cursor:pointer}.mock-secondary-offers{max-width:1280px;margin:2rem auto;padding:1rem}.mock-secondary-offers-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem}.mock-secondary-offer-card{min-width:0;padding:1rem;border:1px solid #d1d5db;border-radius:.5rem;background:#fff}.mock-secondary-offer-card h3{margin:.25rem 0 .75rem}.mock-secondary-offer-card[data-mock-offer-status="completed"]{border-color:#15803d}.mock-secondary-offer-card [data-mock-secondary-offer-action][aria-pressed="true"]{outline:3px solid #15803d;outline-offset:2px}.mock-secondary-offer-card [data-mock-secondary-offer-action][aria-disabled="true"]{pointer-events:none;opacity:.6}.mock-secondary-offer-status{font-weight:600}.mock-secondary-offer-card[data-mock-offer-status="completed"] .mock-secondary-offer-status{color:#15803d}.mock-secondary-offer-card[data-mock-offer-status="informational"] .mock-secondary-offer-status{color:#475569}[data-offer-page][hidden]{display:none!important}</style>';
  const mockHtml = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>10-page offline offer mock</title>${styles}${localStyles}</head>${safeBodyMarkup}</html>\n`;
  await writeFile(join(mockDirectory, 'offer-sample.html'), mockHtml, 'utf8');
  await Promise.all(['offer-question.html', 'alpha-intent.html'].map((fileName) => unlink(join(mockDirectory, fileName)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  })));
  return {
    pageCount: stages.length,
    questionProfiles: [...selectedProfiles].sort(),
    secondaryOfferCount: selectedSecondaryOffers.length,
    secondaryOfferIds: selectedSecondaryOffers.map((offer) => offer.offerId),
    actionableSecondaryOfferCount: offerCatalog.uniqueActionableOfferCount,
    informationalSecondaryOfferCount: offerCatalog.uniqueInformationalOfferCount,
    sourceScan: offerCatalog,
    formVisualSource: basename(informationFormSnapshotPath),
    formLocalAssetCount: informationFormAssetContext.assetPathCount,
    formLocalStylesheetCount: informationFormAssetContext.stylesheetPaths.length,
  };
}

/**
 * Ghi một hành động giả lập vào JSONL tạm để kiểm tra lại thứ tự trang.
 *
 * @param {string} actionLogPath Đường dẫn file log tạm.
 * @param {object} action Thông tin hành động, không gồm dữ liệu nhập.
 * @return {Promise<void>} Hoàn tất ghi một dòng JSON.
 * @throws {Error} Khi không ghi được file log.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function recordTemporaryOfferAction(actionLogPath, action) {
  await appendFile(actionLogPath, `${JSON.stringify({ at: new Date().toISOString(), ...action })}\n`, 'utf8');
}

/**
 * Đọc lại log hành động và xác nhận luồng form, câu hỏi và từng offer phụ đã hoàn tất.
 *
 * @param {string} actionLogPath Đường dẫn file JSONL tạm đã ghi.
 * @return {Promise<object>} Kết quả audit trang, cấu trúc câu hỏi và offer phụ.
 * @throws {Error} Khi log thiếu bước, sai thứ tự hoặc còn offer phụ chưa xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function reviewTemporaryOfferActionLog(actionLogPath) {
  const logContents = await readFile(actionLogPath, 'utf8');
  const actions = logContents.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const shownPages = actions.filter((action) => action.event === 'page_shown');
  const selectedAnswers = actions.filter((action) => action.event === 'answer_selected');
  const pageTransitions = actions.filter((action) => action.event === 'page_advanced');
  const inputFields = actions.filter((action) => action.event === 'form_field_filled' && action.page === 1);
  const disclaimerSelection = actions.find((action) => action.event === 'disclaimer_checked' && action.page === 1);
  const formValidationBlocked = actions.find((action) => action.event === 'form_validation_blocked' && action.page === 1);
  const formValidationPassed = actions.find((action) => action.event === 'form_validation_passed' && action.page === 1);
  const secondaryOfferWall = actions.find((action) => action.event === 'secondary_offer_wall_shown');
  const completedSecondaryOffers = actions.filter((action) => action.event === 'secondary_offer_completed');
  const informationalSecondaryOffers = actions.filter((action) => action.event === 'secondary_offer_informational');
  const expectedPages = Array.from({ length: 10 }, (_, index) => index + 1);
  assert.deepEqual(shownPages.map((action) => action.page), expectedPages, 'log shows all ten pages in sequence');
  assert.equal(shownPages[0].kind, 'information_form', 'page one is the information form');
  assert.ok(shownPages.slice(1).every((action) => action.kind === 'question'), 'pages two through ten are answer pages');
  assert.deepEqual(selectedAnswers.map((action) => action.page), expectedPages.slice(1), 'each answer page records one selected answer');
  assert.equal(pageTransitions.length, 9, 'nine transitions connect the ten pages');
  assert.ok(inputFields.length >= 3, 'the first information form recorded at least three filled fields');
  assert.equal(disclaimerSelection?.checked, true, 'the AI disclaimer checkbox was selected on page one');
  assert.ok(formValidationBlocked?.missingFieldCount > 0, 'the form blocks continuation while required information is missing');
  assert.equal(formValidationPassed?.missingFieldCount, 0, 'the form passes validation after required information and disclaimer are entered');
  assert.ok(actions.indexOf(formValidationBlocked) < actions.indexOf(formValidationPassed), 'form validation passes only after the blocked state');
  const questionProfiles = [...new Set(selectedAnswers.map((action) => action.profile))];
  assert.ok(questionProfiles.length >= 5, 'the run covers five distinct saved question structures');
  assert.ok(secondaryOfferWall?.offerCount >= 2, 'the final page shows multiple secondary offers');
  assert.equal(completedSecondaryOffers.length, secondaryOfferWall.actionableOfferCount, 'every actionable secondary offer is completed');
  assert.equal(informationalSecondaryOffers.length, secondaryOfferWall.informationalOfferCount, 'every static informational offer is recorded without inventing a CTA');
  assert.equal(completedSecondaryOffers.length + informationalSecondaryOffers.length, secondaryOfferWall.offerCount, 'every captured secondary offer is accounted for');
  assert.deepEqual(completedSecondaryOffers.map((action) => action.ordinal), Array.from({ length: secondaryOfferWall.actionableOfferCount }, (_, index) => index + 1), 'actionable offers are processed in order');
  assert.ok(completedSecondaryOffers.every((action) => action.sourceActionId && (
    action.actionType === 'question_answer'
      ? action.status === 'answered_locally' && action.choice === 'question_answer'
      : action.status === 'accepted_locally' && action.choice === 'primary_cta'
  )), 'each actionable offer records a captured answer or primary CTA');
  return {
    passed: true,
    pageCount: shownPages.length,
    firstPage: shownPages[0].kind,
    answerPages: selectedAnswers.length,
    transitions: pageTransitions.length,
    distinctQuestionProfiles: questionProfiles.length,
    disclaimerChecked: disclaimerSelection.checked,
    formValidationBlockedUntilComplete: true,
    secondaryOffersShown: secondaryOfferWall.offerCount,
    secondaryOffersCompleted: completedSecondaryOffers.length,
    informationalOffersRecorded: informationalSecondaryOffers.length,
  };
}

/**
 * Chặn request mạng ra ngoài để phiên mô phỏng chỉ dùng fixture local.
 *
 * @param {import('playwright').Route} route Request cần hủy nếu dùng HTTP hoặc HTTPS.
 * @return {Promise<void>} Hoàn tất hủy request.
 * @throws {Error} Khi Playwright không hủy được request.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function blockExternalRequest(route) {
  await route.abort();
}

/**
 * Báo lỗi mô phỏng ở dạng ngắn, không in nội dung snapshot.
 *
 * @param {Error} error Lỗi quét log hoặc chạy trang giả lập.
 * @return {void} Ghi lỗi tổng quát và đặt mã thoát khác 0.
 * @throws {never} Không ném thêm lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function reportSimulationFailure(error) {
  console.error(`[mock-html-simulator] ${error.message}`);
  process.exitCode = 1;
}

/**
 * Chạy solver trên một trang câu hỏi thật lấy từ log và ghi lựa chọn vào log tạm.
 *
 * @param {import('playwright').Page} page Trang Playwright đang chạy offer mẫu.
 * @param {number} pageNumber Số trang câu hỏi từ hai đến mười.
 * @param {string} actionLogPath Đường dẫn file log tạm.
 * @return {Promise<object>} ID và số lựa chọn của câu hỏi vừa xử lý.
 * @throws {Error} Khi trang không có cấu trúc câu hỏi hoặc không chọn được đáp án.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function simulateSavedQuestionStage(page, pageNumber, actionLogPath) {
  const stage = page.locator(`[data-offer-page="${pageNumber}"]`);
  const question = stage.locator('.ai-content--question');
  const questionId = await question.getAttribute('id');
  const answerButtons = question.locator('#question-answers button.question-answer-button');
  const answerCount = await answerButtons.count();
  const expectedAnswerCount = Number(await stage.getAttribute('data-answer-count'));
  const profile = await stage.getAttribute('data-question-profile');
  assert.equal(await stage.isVisible(), true, `page ${pageNumber} is visible`);
  assert.equal(await question.count(), 1, `page ${pageNumber} has one captured question section`);
  assert.equal(await stage.locator('form').count(), 0, `question page ${pageNumber} does not use a form`);
  assert.match(questionId || '', /^question-\d+$/, `page ${pageNumber} retains its captured question ID`);
  assert.equal(answerCount, expectedAnswerCount, `page ${pageNumber} keeps its captured answer count`);

  if (pageNumber === 10) {
    await stage.locator('#mock-secondary-offers').evaluate((offerWall) => {
      window.__savedSecondaryOfferWall = offerWall;
      offerWall.remove();
    });
  }
  await page.locator('[data-offer-page]').evaluateAll((pages, activePageNumber) => {
    window.__savedOfferStageOrder = [...pages];
    for (const offerPage of pages) {
      if (offerPage.dataset.offerPage !== String(activePageNumber)) offerPage.remove();
    }
  }, pageNumber);
  let answeredCount;
  try {
    answeredCount = await handleRadioAndSurveyOptions(page, {});
  } finally {
    await page.locator('#mock-offer-flow').evaluate((offerFlow) => {
      for (const offerPage of window.__savedOfferStageOrder || []) offerFlow.appendChild(offerPage);
      delete window.__savedOfferStageOrder;
      if (window.__savedSecondaryOfferWall) {
        offerFlow.querySelector('[data-offer-page="10"]').appendChild(window.__savedSecondaryOfferWall);
        delete window.__savedSecondaryOfferWall;
      }
    });
  }

  let selectionMethod = 'survey-solver';
  let selectedAnswerIds = await question.locator('#question-answers button.question-answer-button.selected, #question-answers button.question-answer-button.active')
    .evaluateAll((buttons) => buttons.map((button) => button.id));
  if (answeredCount < 1 || selectedAnswerIds.length === 0) {
    selectionMethod = answeredCount < 1 ? 'local-fixture-fallback' : 'local-selection-repair';
    const fallbackIndex = Math.floor(Math.random() * answerCount);
    const fallbackAnswer = answerButtons.nth(fallbackIndex);
    await fallbackAnswer.click();
    await fallbackAnswer.evaluate((button) => button.classList.add('selected', 'active'));
    answeredCount = 1;
  }

  selectedAnswerIds = await question.locator('#question-answers button.question-answer-button.selected, #question-answers button.question-answer-button.active')
    .evaluateAll((buttons) => buttons.map((button) => button.id));
  assert.ok(answeredCount >= 1, `page ${pageNumber} selects an answer`);
  assert.ok(selectedAnswerIds.length >= 1, `page ${pageNumber} displays a selected answer`);
  await recordTemporaryOfferAction(actionLogPath, {
    event: 'answer_selected',
    page: pageNumber,
    questionId,
    profile,
    answerCount,
    selectedAnswerIds,
    selectionMethod,
  });
  return { questionId, profile, answerCount, selectedAnswerIds };
}

/**
 * Xử lý mọi offer phụ được lưu, chọn CTA nguồn và ghi nhận riêng nội dung không có CTA.
 *
 * @param {import('playwright').Page} page Trang Playwright đang mở offer mẫu.
 * @param {string} actionLogPath File JSONL tạm ghi thao tác offer.
 * @param {object} [options={}] Tùy chọn hiển thị chậm khi chạy Chrome có giao diện.
 * @param {boolean} [options.headed=false] Cho biết người dùng đang xem Chrome.
 * @param {number} [options.pauseMs=0] Thời gian dừng để người dùng xem từng offer.
 * @return {Promise<object>} Số lượng offer có hành động, thông tin tĩnh và ID đã xử lý.
 * @throws {Error} Khi offer thiếu cấu trúc nguồn hoặc còn offer chưa được ghi nhận.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function simulateSecondaryOffers(page, actionLogPath, { headed = false, pauseMs = 0 } = {}) {
  const secondaryOfferWall = page.locator('#mock-secondary-offers');
  const offerCards = secondaryOfferWall.locator('[data-mock-secondary-offer-id]');
  const offerCount = await offerCards.count();
  assert.ok(offerCount >= 2, 'final page contains multiple captured secondary offers');
  assert.equal(await secondaryOfferWall.locator('form').count(), 0, 'secondary offer cards contain no form elements');
  const offersBeforeProcessing = await offerCards.evaluateAll((cards) => cards.map((card) => ({
    offerId: card.dataset.mockSecondaryOfferId,
    status: card.dataset.mockOfferStatus,
    actionType: card.dataset.mockOfferActionType,
    sourceType: card.dataset.mockSecondaryOfferType,
    actionable: card.dataset.mockOfferActionType !== 'informational',
  })));
  const actionableOffers = offersBeforeProcessing.filter((offer) => offer.actionable);
  const informationalOffers = offersBeforeProcessing.filter((offer) => !offer.actionable);
  assert.ok(actionableOffers.every((offer) => offer.status === 'pending'), 'actionable secondary offers start pending');
  assert.ok(informationalOffers.every((offer) => offer.status === 'informational'), 'static secondary offers are marked as informational');
  await recordTemporaryOfferAction(actionLogPath, {
    event: 'secondary_offer_wall_shown',
    page: 10,
    offerCount,
    actionableOfferCount: actionableOffers.length,
    informationalOfferCount: informationalOffers.length,
  });

  const completedOfferIds = [];
  let actionableOrdinal = 0;
  for (let offerIndex = 0; offerIndex < offersBeforeProcessing.length; offerIndex += 1) {
    const offer = offersBeforeProcessing[offerIndex];
    const offerId = offer.offerId;
    const offerCard = secondaryOfferWall.locator('[data-mock-secondary-offer-id="' + offerId + '"]');
    assert.equal(await offerCard.count(), 1, 'each secondary offer has a unique card');
    assert.ok(offerId, `secondary offer ${offerIndex + 1} keeps its captured ID`);
    assert.equal(await offerCard.getAttribute('data-mock-offer-status'), offer.status, 'each secondary offer keeps its initial status');
    await offerCard.scrollIntoViewIfNeeded();
    if (headed) {
      console.log(`[mock-html-simulator] Trang 10/10: đang xử lý offer phụ ${offerIndex + 1}/${offerCount} (${offerId}).`);
      await page.waitForTimeout(pauseMs);
    }
    if (!offer.actionable) {
      await recordTemporaryOfferAction(actionLogPath, {
        event: 'secondary_offer_informational',
        page: 10,
        ordinal: offerIndex + 1,
        offerId,
        sourceType: offer.sourceType,
        status: 'informational_only',
      });
      continue;
    }

    const actionSelector = offer.actionType === 'question_answer' ? 'answer' : 'accept';
    const offerAction = offerCard.locator('[data-mock-secondary-offer-action="' + actionSelector + '"]').first();
    assert.equal(await offerAction.count(), 1, `secondary offer ${offerIndex + 1} has a captured local action`);
    await offerAction.click();
    assert.equal(await offerCard.getAttribute('data-mock-offer-status'), 'completed', `secondary offer ${offerIndex + 1} completes locally`);
    const expectedChoice = offer.actionType === 'question_answer' ? 'answer' : 'accept';
    assert.equal(await offerCard.getAttribute('data-mock-offer-choice'), expectedChoice, `secondary offer ${offerIndex + 1} selects a captured source action`);
    assert.equal(await offerAction.getAttribute('aria-pressed'), 'true', `secondary offer ${offerIndex + 1} shows the selected CTA`);
    actionableOrdinal += 1;
    completedOfferIds.push(offerId);
    await recordTemporaryOfferAction(actionLogPath, {
      event: 'secondary_offer_completed',
      page: 10,
      ordinal: actionableOrdinal,
      offerId,
      sourceType: offer.sourceType,
      actionType: offer.actionType,
      choice: offer.actionType === 'question_answer' ? 'question_answer' : 'primary_cta',
      sourceActionId: await offerAction.getAttribute('data-mock-source-action-id'),
      status: offer.actionType === 'question_answer' ? 'answered_locally' : 'accepted_locally',
    });
    if (headed) await page.waitForTimeout(pauseMs);
  }

  const finalOfferStatuses = await offerCards.evaluateAll((cards) => cards.map((card) => ({
    status: card.dataset.mockOfferStatus,
    actionType: card.dataset.mockOfferActionType,
  })));
  assert.ok(finalOfferStatuses.every((offer) => offer.actionType === 'informational'
    ? offer.status === 'informational'
    : offer.status === 'completed'), 'every captured secondary offer is completed or recorded as informational');
  return {
    secondaryOfferCount: offerCount,
    actionableOfferCount: actionableOffers.length,
    informationalOfferCount: informationalOffers.length,
    completedOfferIds,
  };
}

/**
 * Chạy mười trang, sau đó xử lý từng offer phụ trên trang cuối.
 *
 * @param {object} [options={}] Tùy chọn trình duyệt và nguồn log.
 * @param {boolean} [options.headed=false] Mở Chrome và dừng từng bước để người dùng xem.
 * @param {string} options.logDirectory Thư mục snapshot HTML nguồn.
 * @param {string} options.actionLogPath File JSONL tạm ghi hành động.
 * @return {Promise<object>} Kết quả mô phỏng trang, offer phụ và audit log.
 * @throws {Error} Khi Chromium không khởi chạy, bước test sai hoặc audit log thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function simulateOfflineMockPages({ headed = false, logDirectory, actionLogPath } = {}) {
  const headedReviewPause = headed ? 1800 : 0;
  const browser = await chromium.launch({
    headless: !headed,
    channel: headed ? 'chrome' : undefined,
    slowMo: headed ? 700 : 0,
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await context.route(/^https?:\/\//, blockExternalRequest);
    const page = await context.newPage();
    await mkdir(mockDirectory, { recursive: true });
    await writeFile(actionLogPath, '', 'utf8');
    await recordTemporaryOfferAction(actionLogPath, { event: 'run_started', expectedPages: 10 });
    const buildSummary = await buildMockPagesFromSavedHtml(page, logDirectory);

    await page.goto(pathToFileURL(join(mockDirectory, 'offer-sample.html')).href);
    await page.evaluate(async () => {
      await document.fonts.ready;
      document.body.scrollTop = 100;
    });
    const progressMeasurements = await page.evaluate(() => {
      const formPage = document.querySelector('[data-offer-page="1"]');
      const progressTrack = formPage.querySelector('.ai-progress-bar');
      const progressFill = formPage.querySelector('.ai-progress-bar-inner');
      return {
        expectedFillWidth: progressTrack.getBoundingClientRect().width
          * Number.parseFloat(getComputedStyle(formPage).getPropertyValue('--progressPercentage')) / 100,
        actualFillWidth: progressFill.getBoundingClientRect().width,
        label: getComputedStyle(formPage.querySelector('.ai-progress-bar-counter'), '::before').content,
      };
    });
    assert.ok(Math.abs(progressMeasurements.actualFillWidth - progressMeasurements.expectedFillWidth) < 1, 'form progress bar matches the percentage saved in the source HTML');
    assert.equal(progressMeasurements.label, '"10%"', 'form progress bubble preserves the source completion label');
    assert.equal(await page.locator('[data-offer-page]').count(), 10, 'combined offer has ten page stages');
    assert.equal(await page.locator('[data-offer-page="1"] form.ai-form').count(), 1, 'page one is the captured information form');
    assert.equal(await page.locator('[data-offer-page]:not([data-offer-page="1"]) form').count(), 0, 'only the information-entry page contains a form');
    assert.equal(await page.locator('[data-offer-page="1"]').isVisible(), true, 'offer starts on the information form');
    await recordTemporaryOfferAction(actionLogPath, { event: 'page_shown', page: 1, kind: 'information_form' });
    if (headed) {
      console.log('[mock-html-simulator] Trang 1/10: form nhập thông tin đang mở.');
      await page.waitForTimeout(headedReviewPause);
    }

    const capturedForm = page.locator('[data-offer-page="1"] form.ai-form.form-object');
    const formContinueButton = page.locator('[data-offer-page="1"] [data-mock-action="next-page"]');
    const formSubmitButton = capturedForm.locator('#submit-button');
    assert.equal(await formContinueButton.isDisabled(), true, 'continue stays disabled while required form values are missing');
    assert.equal(await formSubmitButton.isDisabled(), true, 'captured form submit stays disabled while required values are missing');
    const missingRequiredCount = Number(await capturedForm.getAttribute('data-mock-missing-required-count'));
    assert.ok(missingRequiredCount > 0, 'incomplete form reports missing required information');
    await formContinueButton.evaluate((button) => button.click());
    assert.equal(await page.locator('[data-offer-page="2"]').isVisible(), false, 'an incomplete form cannot advance to page two');
    await recordTemporaryOfferAction(actionLogPath, {
      event: 'form_validation_blocked',
      page: 1,
      missingFieldCount: missingRequiredCount,
      continueDisabled: true,
    });

    const fullnameFilled = await fillAlphaIntentFullName(page, { firstname: 'Morgan', lastname: 'Example' });
    assert.equal(fullnameFilled, true, 'page one accepts a synthetic full name');
    assert.equal(await page.locator('#input-fullname').inputValue(), 'Morgan Example', 'hidden required field receives the synthetic name');
    assert.equal(await capturedForm.locator('#fullname-container.ai-input-container-fullname input#name.ai-input').count(), 1, 'captured full-name selectors are retained');
    await recordTemporaryOfferAction(actionLogPath, { event: 'form_field_filled', page: 1, field: 'full_name' });

    await capturedForm.locator('input#address').fill('123 Example Street');
    await recordTemporaryOfferAction(actionLogPath, { event: 'form_field_filled', page: 1, field: 'address' });
    await capturedForm.locator('input#date').fill('01/01/1985');
    await recordTemporaryOfferAction(actionLogPath, { event: 'form_field_filled', page: 1, field: 'date_of_birth' });
    const syntheticPhoneNumber = '8145550100';
    const phoneInput = capturedForm.locator('input#phone[type="tel"]');
    await phoneInput.fill(syntheticPhoneNumber);
    const enteredPhoneDigits = (await phoneInput.inputValue()).replace(/\D/g, '');
    assert.match(enteredPhoneDigits, /^(?:814|817)\d{7}$/, 'synthetic phone begins with 814 or 817 and contains ten digits');
    await recordTemporaryOfferAction(actionLogPath, { event: 'form_field_filled', page: 1, field: 'phone' });
    await capturedForm.locator('input[type="radio"].ai-input-gender').first().check();
    await recordTemporaryOfferAction(actionLogPath, { event: 'form_choice_selected', page: 1, field: 'gender_radio' });

    const disclaimerCheckbox = capturedForm.locator('#ai-disclaimer-container input.ai-disclaimer-hidden[type="checkbox"]');
    assert.equal(await disclaimerCheckbox.count(), 1, 'page one retains the captured AI disclaimer checkbox');
    const disclaimerId = await disclaimerCheckbox.getAttribute('id');
    assert.equal(await capturedForm.locator(`label.tcpa-text[for="${disclaimerId}"]`).count(), 1, 'captured disclaimer label remains linked');
    assert.equal(await disclaimerCheckbox.isVisible(), true, 'the captured disclaimer checkbox is visible in the offline form');
    await disclaimerCheckbox.check();
    assert.equal(await disclaimerCheckbox.isChecked(), true, 'page one selects the AI disclaimer checkbox');
    await recordTemporaryOfferAction(actionLogPath, { event: 'disclaimer_checked', page: 1, checked: true });
    assert.equal(await capturedForm.getAttribute('data-mock-form-valid'), 'true', 'all visible required fields and the disclaimer pass local validation');
    assert.equal(await capturedForm.getAttribute('data-mock-missing-required-count'), '0', 'complete form has no missing required values');
    assert.equal(await formContinueButton.isEnabled(), true, 'continue is enabled only after all required information is entered');
    assert.equal(await formSubmitButton.isEnabled(), true, 'captured submit is enabled only after all required information is entered');
    await recordTemporaryOfferAction(actionLogPath, { event: 'form_validation_passed', page: 1, missingFieldCount: 0, continueEnabled: true });
    if (headed) {
      console.log('[mock-html-simulator] Form hợp lệ; checkbox disclaimer đang hiển thị dấu tick.');
      await page.waitForTimeout(5000);
    }
    await recordTemporaryOfferAction(actionLogPath, { event: 'page_completed', page: 1 });

    await formSubmitButton.click();
    assert.equal(await page.locator('[data-offer-page="2"]').isVisible(), true, 'page one advances to the first answer page');
    await recordTemporaryOfferAction(actionLogPath, { event: 'page_advanced', from: 1, to: 2 });
    await recordTemporaryOfferAction(actionLogPath, { event: 'page_shown', page: 2, kind: 'question', profile: await page.locator('[data-offer-page="2"]').getAttribute('data-question-profile') });

    for (let pageNumber = 2; pageNumber <= 10; pageNumber += 1) {
      const currentPage = page.locator(`[data-offer-page="${pageNumber}"]`);
      if (headed) {
        console.log(`[mock-html-simulator] Trang ${pageNumber}/10: ${await currentPage.getAttribute('data-question-profile')} đang hiển thị.`);
        await page.waitForTimeout(headedReviewPause);
      }
      await simulateSavedQuestionStage(page, pageNumber, actionLogPath);
      if (pageNumber < 10) {
        await currentPage.locator('button[data-mock-action="next-page"]').click();
        const nextPageNumber = pageNumber + 1;
        assert.equal(await page.locator(`[data-offer-page="${nextPageNumber}"]`).isVisible(), true, `page ${pageNumber} advances to page ${nextPageNumber}`);
        await recordTemporaryOfferAction(actionLogPath, { event: 'page_advanced', from: pageNumber, to: nextPageNumber });
        await recordTemporaryOfferAction(actionLogPath, {
          event: 'page_shown',
          page: nextPageNumber,
          kind: 'question',
          profile: await page.locator(`[data-offer-page="${nextPageNumber}"]`).getAttribute('data-question-profile'),
        });
      }
    }

    const secondaryOfferSummary = await simulateSecondaryOffers(page, actionLogPath, {
      headed,
      pauseMs: headedReviewPause,
    });
    const audit = await reviewTemporaryOfferActionLog(actionLogPath);
    await recordTemporaryOfferAction(actionLogPath, { event: 'review_completed', ...audit });
    console.log(JSON.stringify({ offerBuild: buildSummary, secondaryOfferRun: secondaryOfferSummary, actionLogReview: audit, actionLogPath }, null, 2));
    if (headed) {
      await page.bringToFront();
      console.log(`[mock-html-simulator] Trang 10/10 và ${secondaryOfferSummary.secondaryOfferCount}/${secondaryOfferSummary.secondaryOfferCount} offer phụ đều đạt. Đóng tab để kết thúc.`);
      await page.waitForTimeout(headedReviewPause);
      await page.waitForEvent('close', { timeout: 0 });
    }

    await context.close();
    return { ...audit, ...secondaryOfferSummary, actionLogPath };
  } finally {
    await browser.close();
  }
}

/**
 * Quét log, ghi báo cáo cấu trúc và chạy mô phỏng HTML offline.
 *
 * @return {Promise<void>} In kết quả tổng hợp an toàn cho người dùng.
 * @throws {Error} Khi quét log hoặc mô phỏng thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
async function main() {
  const commandArguments = process.argv.slice(2);
  const headed = commandArguments.includes('--headed');
  const requestedLogDirectory = commandArguments.find((argument) => !argument.startsWith('--'));
  const logDirectory = resolve(requestedLogDirectory || defaultLogDirectory);
  const structureSummary = await summarizeSavedHtmlLogs(logDirectory);
  await mkdir(mockDirectory, { recursive: true });
  await writeFile(join(mockDirectory, 'log-structure-summary.json'), `${JSON.stringify(structureSummary, null, 2)}\n`, 'utf8');
  const simulation = await simulateOfflineMockPages({ headed, logDirectory, actionLogPath: temporaryActionLogPath });
  console.log(JSON.stringify({ logStructure: structureSummary, offlineSimulation: simulation }, null, 2));
}

main().catch(reportSimulationFailure);
