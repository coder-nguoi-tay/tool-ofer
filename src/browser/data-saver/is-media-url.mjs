/**
 * Kiểm tra xem URL có phải là file media nặng (video, audio, streaming video chunks) không.
 *
 * @param {string} url
 * @return {boolean} True nếu URL thuộc nhóm tài nguyên tương ứng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function isMediaUrl(url) {
  if (!url) return false;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(mp4|webm|m3u8|ts|ogg|mp3|wav|flv|avi|mkv|m4s|mov|aac|f4v|mpd)$/i.test(pathname);
  } catch {
    return /\.(mp4|webm|m3u8|ts|ogg|mp3|wav|flv|avi|mkv|m4s|mov|aac|f4v|mpd)($|\?)/i.test(url);
  }
}
export { isMediaUrl };
