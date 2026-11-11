import { describeProcess } from './describe-process.mjs';
import { findPortHolderPid } from './find-port-holder-pid.mjs';

/**
 * Dừng tiến trình máy chủ AutoLeadPC cũ đang giữ cổng để bản mới phục vụ được.
 *
 * Chỉ dừng đúng tiến trình `node app.mjs` nằm trong thư mục launcher của AutoLeadPC;
 * tiến trình khác giữ cổng (app khác, công cụ khác) thì để nguyên và báo lỗi.
 *
 * @param {number} port Cổng đang bị chiếm.
 * @return {Promise<{released: boolean, reason: string}>} Kết quả giải phóng cổng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function releaseStalePortHolder(port) {
  const holderPid = await findPortHolderPid(port);
  if (!holderPid) return {
    released: true,
    reason: 'free'
  };
  const {
    command,
    workingDirectory
  } = await describeProcess(holderPid);
  const isAutoLeadServer = /node\s.*app\.mjs/.test(command) && /AutoLeadPC/i.test(workingDirectory);
  if (!isAutoLeadServer) return {
    released: false,
    reason: 'foreign-process'
  };
  console.warn(`[Server] Cổng ${port} đang bị máy chủ AutoLeadPC cũ giữ (PID ${holderPid}) — dừng tiến trình cũ để nạp code mới.`);
  try {
    process.kill(holderPid, 'SIGTERM');
  } catch {
    // Tiến trình đã chết: bỏ qua.
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (!(await findPortHolderPid(port))) return {
      released: true,
      reason: 'terminated'
    };
  }
  try {
    process.kill(holderPid, 'SIGKILL');
  } catch {
    // Tiến trình đã chết: bỏ qua.
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  const stillHeld = await findPortHolderPid(port);
  return {
    released: !stillHeld,
    reason: 'killed'
  };
}
