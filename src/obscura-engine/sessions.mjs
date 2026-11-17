/** Phiên native đang khởi tạo, chưa được xác minh IP để đưa vào activeBrowsers. */
export const pendingObscuraSessions = new Set();

/** Metadata thuần của phiên đã dừng gần nhất theo slot; không giữ context/cookie/storage cũ. */
export const lastClosedObscuraIdentities = new Map();
