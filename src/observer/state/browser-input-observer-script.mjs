/** Script chạy trong closure observer, ghi tiến độ nhập và cuộn với tần suất giới hạn. */
export const BROWSER_INPUT_OBSERVER_SCRIPT = `
  const inputReportedAt = new WeakMap();
  document.addEventListener('input', event => {
    if (Date.now() - (inputReportedAt.get(event.target) || 0) < 500) return;
    inputReportedAt.set(event.target, Date.now());
    emit({ kind: 'input', trusted: event.isTrusted, el: describe(event.target) });
  }, true);
  let scrollReportedAt = 0;
  document.addEventListener('scroll', event => {
    if (Date.now() - scrollReportedAt < 500) return;
    scrollReportedAt = Date.now();
    emit({ kind: 'scroll', trusted: event.isTrusted, scrollX: event.target === document ? window.scrollX : event.target.scrollLeft, scrollY: event.target === document ? window.scrollY : event.target.scrollTop });
  }, { capture: true, passive: true });
`;
