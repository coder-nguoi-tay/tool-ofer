/**
 * Xuất HTML đang xem thành file trên máy theo yêu cầu, không lưu vào thư mục log của app.
 * @return {void} Bắt đầu tải file HTML của đúng slot/frame vừa chụp.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
function _downloadScreenHtml() {
  const panel = document.getElementById('screenHtmlPanel');
  if (panel.dataset.ready !== 'true') return;
  const content = document.getElementById('screenHtmlContent').value;
  const filename = `autoleadpc-slot-${panel.dataset.slot}-frame-${panel.dataset.frame}.html`;
  const nativeSave = window.webkit?.messageHandlers?.autoleadDebugHtml;
  if (nativeSave) { nativeSave.postMessage({ html: content, filename }); return; }
  const url = URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
