const { networkInterfaces } = require('node:os');

/**
 * Tạo cấu hình autorun chạy server trong phiên người dùng Windows hiện tại.
 * @param {object} app Electron app quản lý đăng ký khởi động.
 * @return {object} Executable và tham số được lưu vào Startup.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function windowsServerStartupOptions(app) {
  return { name: 'AutoLeadPC Server', path: app.getPath('exe'), args: ['--server'] };
}

/**
 * Bật hoặc gỡ autorun của server mà không yêu cầu mật khẩu tài khoản Windows.
 * @param {object} app Electron app.
 * @param {boolean} enabled Có tự khởi chạy server sau đăng nhập hay không.
 * @return {void} Đã cập nhật đăng ký Startup của người dùng hiện tại.
 * @throws {Error} Khi Windows từ chối thay đổi autorun.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function setWindowsServerStartup(app, enabled) {
  app.setLoginItemSettings({ ...windowsServerStartupOptions(app), openAtLogin: enabled });
}

/**
 * Liệt kê địa chỉ IPv4 của máy server để truy cập từ máy khác.
 * @param {number} port Cổng HTTP của AutoLeadPC.
 * @param {object} [interfaces=networkInterfaces()] Các adapter mạng hiện có.
 * @return {string[]} URL truy cập qua từng IPv4, không gồm loopback hoặc link-local.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function windowsServerAddresses(port, interfaces = networkInterfaces()) {
  return [...new Set(Object.values(interfaces).flat().filter(address => address && !address.internal && (address.family === 'IPv4' || address.family === 4) && !address.address.startsWith('169.254.')).map(address => `http://${address.address}:${port}`))];
}

/**
 * Duy trì biểu tượng server với lệnh mở giao diện, xem URL, bật autorun và dừng server.
 * @param {object} options Electron API, port, icon và callback của cửa sổ chính.
 * @return {object} Tray cần được giữ tham chiếu suốt vòng đời server.
 * @throws {Error} Khi không thể tạo biểu tượng hoặc đọc cấu hình Startup.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function createWindowsServerTray({ app, Tray, Menu, nativeImage, clipboard, dialog, port, iconPath, showWindow }) {
  const tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip(`AutoLeadPC Server — cổng ${port}`);
  /**
   * Cập nhật menu từ địa chỉ mạng và trạng thái autorun hiện tại.
   * @return {void} Menu đã phản ánh cấu hình của Windows.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-16
   */
  function updateServerMenu() {
    const startup = app.getLoginItemSettings(windowsServerStartupOptions(app));
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Mở giao diện AutoLeadPC', click: showWindow },
      { label: 'Địa chỉ truy cập từ máy khác', click: () => {
        const addresses = windowsServerAddresses(port);
        if (addresses.length) clipboard.writeText(addresses.join('\n'));
        void dialog.showMessageBox({ type: 'info', title: 'AutoLeadPC Server', message: addresses.length ? addresses.join('\n') : 'Chưa có IPv4 mạng LAN. Kiểm tra kết nối mạng của máy Windows.', detail: 'Địa chỉ đã được sao chép nếu có. Máy khác cần cùng mạng tin cậy và được Windows Firewall cho phép.' });
      } },
      { label: 'Tự chạy sau khi đăng nhập Windows', type: 'checkbox', checked: startup.openAtLogin && startup.executableWillLaunchAtLogin !== false, click: item => {
        try { setWindowsServerStartup(app, item.checked); } catch (error) { dialog.showErrorBox('Không cập nhật được Startup', error.message); }
        updateServerMenu();
      } },
      { type: 'separator' },
      { label: 'Thoát và dừng server', click: () => app.quit() }
    ]));
  }
  tray.on('double-click', showWindow);
  tray.on('right-click', updateServerMenu);
  updateServerMenu();
  return tray;
}

module.exports = { windowsServerStartupOptions, setWindowsServerStartup, windowsServerAddresses, createWindowsServerTray };
