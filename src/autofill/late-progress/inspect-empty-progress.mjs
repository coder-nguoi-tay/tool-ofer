/**
 * Nhận diện mốc 80–99% và câu hỏi/form thực sự hiển thị trong một document.
 * @return {object} progress, hasWork, challenge, readyState và số iframe để chẩn đoán.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function inspectEmptyProgress() {
  const visible = element => {
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || node.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    return element.getClientRects().length > 0;
  };
  const text = document.body?.innerText || '';
  const progress = Number(text.match(/\b(8\d|9\d)\s*%/)?.[1] || 0);
  const fields = Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea,[role=radio],[role=checkbox]'));
  const buttons = Array.from(document.querySelectorAll('button,[role=button],input[type=submit],input[type=button],a.btn,a.button,.btn-option'));
  const hasWork = fields.some(element => visible(element) || Array.from(element.labels || []).some(visible)) || buttons.some(element => visible(element) && !/^(close|cancel|privacy|terms|menu|back|đóng|hủy)$/i.test((element.textContent || element.value || '').trim()));
  return { progress, hasWork, challenge: /just a moment|checking your browser|verify you are human/i.test(document.title + ' ' + text.slice(0, 250)), readyState: document.readyState, iframeCount: document.querySelectorAll('iframe').length };
}
