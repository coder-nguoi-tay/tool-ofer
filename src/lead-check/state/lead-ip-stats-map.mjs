/**
 * Lưu trữ tiến trình (số màn và số lần nhảy trang) của các IP đã có lead.
 * Map: normalizedIp -> { ip, screen, completedScreens, jumpCount, offerNumber, offerName, proxy, websiteUrl, confirmedAt, lastUpdated, details }
 */
const leadIpStatsMap = new Map();
export { leadIpStatsMap };
