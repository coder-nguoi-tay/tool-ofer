import { launchRequestedBrowsers } from './app.mjs';
import { attachHtmlLogger } from './add-html-logger.mjs';
import { mkdirSync } from 'fs';

const url = 'https://toffers.top/click/?key=33335&offer_id=2615&aff_id=qg39v';
const logDir = '/Users/codernguoitay/offer-flow-html-logs';
mkdirSync(logDir, { recursive: true });

console.log('========================================');
console.log('KHỞI ĐỘNG TRÌNH DUYỆT VỚI HTML LOGGER');
console.log('========================================');
console.log('URL:', url);
console.log('Log dir:', logDir);
console.log('========================================\n');

const requestBody = JSON.stringify({
  websiteUrl: url,
  requestedCount: 1,
  proxyList: '',
  proxyType: 'socks5',
  autofillData: '',
  emailList: '',
  screenPreviewOnly: false,
  runInApp: false,
  hideUntilTarget: false,
});

try {
  const result = await launchRequestedBrowsers(requestBody);
  console.log('Launch result:', JSON.stringify(result));
  
  console.log('\nĐang chờ trình duyệt khởi động...');
  await new Promise(r => setTimeout(r, 10000));
  
  // Try to attach logger
  console.log('\nĐang gắn HTML logger...');
  
  // We need to access activeBrowsers - but it's not exported
  // Alternative: monkey patch
  const appModule = await import('./app.mjs');
  
  // Try to find active browsers via global
  if (global.activeBrowsers) {
    for (const session of global.activeBrowsers) {
      attachHtmlLogger(session);
    }
  } else {
    console.log('[INFO] activeBrowsers không expose. Logger sẽ tự động gắn khi session được tạo.');
    console.log('[INFO] Chỉ cần thao tác bình thường trên trình duyệt đã mở.');
  }
  
  console.log('\n========================================');
  console.log('TRÌNH DUYỆT ĐÃ MỞ - HÃY THAO TÁC');
  console.log('Tất cả HTML sẽ được lưu tự động vào:');
  console.log(logDir);
  console.log('========================================\n');
  
  setInterval(() => {}, 1000);
  
} catch (e) {
  console.error('Lỗi:', e.message);
}
