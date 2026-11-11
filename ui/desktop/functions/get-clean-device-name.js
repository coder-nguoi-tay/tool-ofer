/**
 * Get clean device name.
 * @param {*} entry entry.
 * @return {*} Kết quả xử lý get clean device name.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getCleanDeviceName(entry) {
      let name = entry.deviceVersion || entry.deviceProfile || 'Desktop';
      name = name.split(' · ')[0].trim();
      return name;
    }
