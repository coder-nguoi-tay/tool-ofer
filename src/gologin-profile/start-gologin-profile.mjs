import { stopGoLoginProfile } from './stop-gologin-profile.mjs';
import { GoLogin } from 'gologin';

/**
 * Khởi chạy profile GoLogin cục bộ bằng nhân Orbita và trả về WebSocket URL để Playwright kết nối CDP.
 *
 * @param {string} token API token GoLogin.
 * @param {string} profileId ID profile cần khởi chạy.
 * @param {object} [extraOptions={}] Tuỳ chọn bổ sung cho GoLogin instance; mobileScreen {width,height,devicePixelRatio}
 *   là màn hình điện thoại Orbita phải dùng (API GoLogin không lưu screenWidth/screenHeight và làm tròn tỉ lệ điểm ảnh).
 * @param {Function} onFailure Ghi lỗi trước khi SDK dừng tiến trình dở dang.
 * @return {Promise<{wsUrl: string, gl: GoLogin}>} Kết quả khởi chạy GoLogin.
 * @throws {Error} Khi SDK không khởi chạy được profile, đã thử dừng tài nguyên dở dang.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function startGoLoginProfile(token, profileId, extraOptions = {}, onFailure = () => {}) {
  if (!token) throw new Error('Thiếu GoLogin API Token.');
  if (!profileId) throw new Error('Thiếu ID profile GoLogin.');

  const { mobileScreen, ...sdkOptions } = extraOptions;
  const gl = new GoLogin({
    token,
    profile_id: profileId,
    ...sdkOptions
  });
  if (mobileScreen) {
    // ponytail: bọc hàm nội bộ của SDK gologin 3.0.8 (mobile.width = screenWidth || 1920); kiểm lại khi nâng SDK.
    const buildPreferences = gl.getGologinPreferences.bind(gl);
    gl.getGologinPreferences = profileData => buildPreferences({ ...profileData,
      screenWidth: mobileScreen.width, screenHeight: mobileScreen.height, devicePixelRatio: mobileScreen.devicePixelRatio });
  }

  try {
    const { status, wsUrl } = await gl.start();
    if (!wsUrl) throw new Error(`Khởi chạy Orbita thất bại: status=${status}`);
    return { wsUrl, gl };
  } catch (error) {
    onFailure(error);
    await stopGoLoginProfile(gl).catch(() => { error.goLoginStopUnconfirmed = true; });
    throw error;
  }
}
