// Công cụ tab 📺 Màn hình: điều hướng URL, DevTools, xem HTML, mở ra Desktop.
(() => {
  const on = (id, type, handler) => document.getElementById(id)?.addEventListener(type, handler);
  on('urlDisplay', 'click', () => miniScreenToggleUrlRow());
  on('scrBtnUrl', 'click', () => miniScreenToggleUrlRow());
  on('scrUrlGo', 'click', () => miniScreenNavigate());
  on('scrUrlInput', 'keydown', event => { if (event.key === 'Enter') miniScreenNavigate(); });
  on('scrUrlCopy', 'click', () => miniScreenCopyUrl());
  on('scrBtnDevtools', 'click', () => miniScreenOpenDevtools());
  on('scrBtnHtml', 'click', () => miniScreenOpenHtml(0));
  on('scrBtnPopOut', 'click', () => miniScreenPopOut());
  on('scrHtmlFrame', 'change', event => miniScreenOpenHtml(event.target.value));
  on('scrHtmlReload', 'click', () => miniScreenOpenHtml(document.getElementById('scrHtmlFrame').value || 0));
  on('scrHtmlCopy', 'click', () => miniScreenCopyHtml());
  on('scrHtmlDownload', 'click', () => miniScreenDownloadHtml());
  on('scrHtmlClose', 'click', () => miniScreenCloseHtml());
  on('scrHtmlBackdrop', 'click', () => miniScreenCloseHtml());
})();
