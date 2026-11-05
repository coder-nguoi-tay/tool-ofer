import { chromium } from 'playwright';
import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const url = 'https://toffers.top/click/?key=33335&offer_id=2615&aff_id=qg39v';
const outDir = '/Users/codernguoitay/record-offer-session';
mkdirSync(outDir, { recursive: true });

const logFile = join(outDir, `actions-${Date.now()}.jsonl`);
const screenshotDir = join(outDir, 'screenshots');
mkdirSync(screenshotDir, { recursive: true });

const browser = await chromium.launch({ 
  headless: false,
  args: ['--start-maximized']
});
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();

let stepCounter = 0;

function logAction(type, data) {
  const entry = {
    step: ++stepCounter,
    timestamp: new Date().toISOString(),
    type,
    url: page.url(),
    ...data
  };
  appendFileSync(logFile, JSON.stringify(entry) + '\n');
  console.log(`[${stepCounter}] ${type}:`, data.selector || data.text || data.url || '');
}

page.on('load', async () => {
  logAction('page_load', { title: await page.title().catch(()=>'') });
  try {
    await page.screenshot({ path: join(screenshotDir, `step-${stepCounter}.png`) });
  } catch {}
});

page.on('framenavigated', async (frame) => {
  if (frame === page.mainFrame()) {
    logAction('navigation', { url: frame.url() });
  }
});

await page.exposeFunction('logUserAction', (type, data) => {
  logAction(type, data);
});

// Inject event listeners
await page.addInitScript(() => {
  const log = (type, data) => {
    window.logUserAction?.(type, { ...data, xpath: getXPath(event.target) });
  };
  
  function getXPath(el) {
    if (!el) return null;
    if (el.id) return `//*[@id="${el.id}"]`;
    const parts = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let idx = 0;
      let sib = el.previousSibling;
      while (sib) {
        if (sib.nodeType === Node.ELEMENT_NODE && sib.nodeName === el.nodeName) idx++;
        sib = sib.previousSibling;
      }
      const tag = el.nodeName.toLowerCase();
      parts.unshift(`${tag}[${idx + 1}]`);
      el = el.parentNode;
    }
    return parts.length ? '/' + parts.join('/') : null;
  }
  
  document.addEventListener('click', (e) => {
    const t = e.target;
    log('click', {
      tag: t.tagName,
      id: t.id,
      class: t.className,
      text: (t.innerText || '').slice(0, 100),
      href: t.href,
      selector: t.id ? `#${t.id}` : t.className ? `.${t.className.split(' ')[0]}` : t.tagName
    });
  }, true);
  
  document.addEventListener('input', (e) => {
    const t = e.target;
    log('input', {
      tag: t.tagName,
      type: t.type,
      name: t.name,
      id: t.id,
      value: t.type === 'password' ? '***' : (t.value || '').slice(0, 50)
    });
  }, true);
  
  document.addEventListener('change', (e) => {
    const t = e.target;
    log('change', {
      tag: t.tagName,
      type: t.type,
      name: t.name,
      id: t.id,
      checked: t.checked
    });
  }, true);
  
  document.addEventListener('submit', (e) => {
    log('submit', { formId: e.target.id, action: e.target.action });
  }, true);
});

console.log('Đang mở trình duyệt...');
console.log('URL:', url);
console.log('Log sẽ lưu tại:', logFile);
console.log('Screenshots tại:', screenshotDir);
console.log('\nHãy thao tác bình thường. Đóng trình duyệt khi hoàn tất để kết thúc ghi nhận.\n');

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

try {
  await page.waitForEvent('close', { timeout: 0 });
} catch {
  // browser closed
}

console.log('\nĐã ghi nhận xong!');
console.log('Log:', logFile);
console.log('Tổng số thao tác:', stepCounter);
