import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const logDir = '/Users/codernguoitay/offer-flow-html-logs';
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, `html-capture-${Date.now()}.jsonl`);

export function attachHtmlLogger(session) {
  console.log('[HTML-LOGGER] Đang gắn bộ ghi nhận HTML vào session slot:', session.slot);
  
  const attachToPage = async (page) => {
    if (page._htmlLoggerAttached) return;
    page._htmlLoggerAttached = true;
    
    const capture = async (reason) => {
      try {
        const html = await page.content();
        const entry = {
          timestamp: new Date().toISOString(),
          reason,
          url: page.url(),
          title: await page.title().catch(() => ''),
          slot: session.slot,
          htmlLength: html.length,
          html: html
        };
        appendFileSync(logFile, JSON.stringify(entry) + '\n');
        console.log(`[HTML-LOGGER] Captured [${reason}] | ${page.url().slice(0, 70)} | ${html.length} bytes`);
      } catch (e) {
        console.log('[HTML-LOGGER] Error:', e.message);
      }
    };
    
    page.on('load', () => capture('page_load'));
    page.on('domcontentloaded', () => capture('domcontentloaded'));
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) capture('navigated');
    });
    
    // Capture every 2 seconds
    const interval = setInterval(() => {
      if (page.isClosed()) {
        clearInterval(interval);
        return;
      }
      capture('interval');
    }, 2000);
    
    // Capture immediately
    await capture('attached');
  };
  
  // Attach to existing pages
  try {
    const pages = session.browser?.pages?.() || [];
    for (const p of pages) if (!p.isClosed()) attachToPage(p);
    session.browser?.on('page', attachToPage);
  } catch (e) {
    console.log('[HTML-LOGGER] Error:', e.message);
  }
  
  console.log('[HTML-LOGGER] Log file:', logFile);
  return logFile;
}
