import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { stopGoLoginBrowserProcess } from './stop-browser-process.mjs';

/**
 * Dừng Orbita rồi xóa dữ liệu tạm trên máy. Không gọi gl.stop() vì SDK sẽ tải cookie/profile lên mây và chờ thêm 3 giây,
 * trong khi profile luôn bị xóa ngay sau khi phiên đóng: bỏ bước đó giúp đóng/bù phiên nhanh hơn khoảng 8–10 giây.
 *
 * @param {object} gl Instance của GoLogin.
 * @return {Promise<void>} Orbita đã thoát và thư mục profile tạm đã xóa.
 * @throws {Error} Khi không dừng được Orbita; caller giữ khóa profile.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function stopGoLoginProfile(gl) {
  if (!gl) return;
  await stopGoLoginBrowserProcess(gl.processSpawned);
  gl.is_active = false;
  // ponytail: dựa vào clearProfileFiles/tmpdir/profile_id của SDK gologin 3.0.8; kiểm lại khi nâng SDK.
  await gl.clearProfileFiles?.().catch(() => {});
  if (gl.tmpdir && gl.profile_id) await rm(join(gl.tmpdir, `gologin_${gl.profile_id}.zip`), { force: true }).catch(() => {});
}
