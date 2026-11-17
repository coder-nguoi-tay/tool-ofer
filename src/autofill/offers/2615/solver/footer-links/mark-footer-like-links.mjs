// Bản giải riêng của offer 2615, chép từ src/autofill/footer-links/mark-footer-like-links.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
/**
 * Chạy TRONG trang: đánh dấu `data-ux-footer-link="1"` lên các link kiểu footer (giới thiệu, policy, contact, home, blog...)
 * để mọi nhánh bấm của autofill bỏ qua. Nhiều trang không có thẻ <footer> mà đặt các link này ở section/div cuối
 * (hoặc một thanh link trên đầu), nên nhận diện theo NỘI DUNG CỦA CỤM chứ không theo thẻ:
 *   - cụm = tổ tiên gần nhất chứa từ 2 link trở lên (không phải body/html), không có ô nhập;
 *   - cụm là footer khi có ít nhất 2 link footer và các link đó chiếm từ một nửa số link trong cụm.
 * Vì xét cả cụm, một đáp án thật trùng chữ (vd. "Home" trong "Home / Auto / Life") không bị chặn nhầm.
 * Link nằm trong container có class/id kiểu footer/legal/copyright cũng được đánh dấu.
 * Hàm tự chứa (không dùng biến ngoài) để truyền thẳng vào frame.evaluate.
 *
 * @return {number} Số link được đánh dấu trong lượt này.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function markFooterLikeLinks() {
  const TEXT = /^(?:home(?:\s*page)?|about(?:\s+(?:us|me))?|our\s+(?:story|team|mission|company)|who\s+we\s+are|how\s+it\s+works|contact(?:\s+us)?|get\s+in\s+touch|blog|news(?:room)?|press|careers?|jobs|advertis\w*|partners?|affiliates?|site\s*map|faqs?|help(?:\s+cent(?:er|re))?|support|privacy(?:\s+(?:policy|notice|rights|center))?|terms(?:\s+(?:of\s+(?:use|service)|(?:and|&)\s+conditions))?|(?:[\w-]+\s+){0,2}polic(?:y|ies)|legal(?:\s+notice)?|disclaimers?|cookies?(?:\s+(?:policy|settings|preferences))?|accessibility|do\s+not\s+sell.*|unsubscribe|imprint|trang\s+chủ|giới\s+thiệu|về\s+chúng\s+tôi|liên\s+hệ|chính\s+sách.*|điều\s+khoản.*)$/i;
  const HREF = /\/(?:about(?:-us)?|contact(?:-us)?|privacy(?:-policy)?|terms(?:-of-(?:use|service)|-and-conditions)?|polic(?:y|ies)|legal|disclaimer|cookies?(?:-policy)?|careers?|advertise|sitemap|faqs?|help|support|blog|our-story|who-we-are|how-it-works|get-in-touch)(?:\.\w+)?(?:[/?#]|$)/i;
  const CONTAINER = /(?:^|[\s_-])(?:footer|legal|copyright|site-?info|bottom-?links?)(?:[\s_-]|$)/i;
  const FIELDS = 'input:not([type="hidden"]), select, textarea';
  const footerish = link => {
    const text = (link.innerText || link.textContent || '').replace(/\s+/g, ' ').replace(/^[\s|·•©-]+|[\s|·•-]+$/g, '').trim();
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#') || /^javascript:/i.test(href)) return false; // link tại chỗ: là nút/đáp án, không phải link footer
    return TEXT.test(text) || HREF.test(href.split(/[?#]/)[0]);
  };
  const groups = new Map();
  let marked = 0;
  for (const link of document.querySelectorAll('a[href]')) {
    if (link.hasAttribute('data-ux-footer-link')) continue;
    let group = link.parentElement;
    while (group && group !== document.body && group !== document.documentElement && group.querySelectorAll('a[href]').length < 2) group = group.parentElement;
    let isFooter = false;
    for (let node = link.parentElement; node && node !== document.body; node = node.parentElement) {
      if (CONTAINER.test(`${typeof node.className === 'string' ? node.className : ''} ${node.id || ''}`)) { isFooter = true; break; }
    }
    if (!isFooter && group && group !== document.body && group !== document.documentElement) {
      if (!groups.has(group)) {
        const members = [...group.querySelectorAll('a[href]')];
        const hits = members.filter(footerish).length;
        groups.set(group, members.length <= 40 && !group.querySelector(FIELDS) && hits >= 2 && hits * 2 >= members.length);
      }
      isFooter = groups.get(group);
    }
    if (isFooter) { link.setAttribute('data-ux-footer-link', '1'); marked += 1; }
  }
  return marked;
}
