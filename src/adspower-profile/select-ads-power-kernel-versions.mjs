/**
 * Chia kernel AdsPower như Chrome thường: bỏ bản đang chạy và xoay vòng phần còn lại.
 *
 * @param {string[]} installedVersions Các kernel đã cài theo thứ tự ưu tiên.
 * @param {Set<string>} occupiedVersions Kernel của các phiên đang chạy.
 * @param {number} rotationCount Bộ đếm xoay vòng dùng chung với Chrome thường.
 * @param {number} requestedCount Số slot cần cấp kernel.
 * @return {string[]} Kernel khác nhau cho các slot có thể mở.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function selectAdsPowerKernelVersions(installedVersions, occupiedVersions, rotationCount, requestedCount) {
  const availableVersions = installedVersions.filter(version => !occupiedVersions.has(version));
  if (availableVersions.length > 1) {
    const rotationOffset = rotationCount % availableVersions.length;
    availableVersions.push(...availableVersions.splice(0, rotationOffset));
  }
  return availableVersions.slice(0, requestedCount);
}
export { selectAdsPowerKernelVersions };
