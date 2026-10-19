# GoLogin mode trên AutoLeadPC Mac 2

Chế độ **Chrome GoLogin (profile cục bộ)** dùng vòng đời profile của bản PC gốc: kiểm tra proxy, sao chép `zero_profile`, chỉnh Preferences/Bookmarks, mở trình duyệt với thư mục dữ liệu riêng và cổng CDP động, chạy automation, rồi xóa profile tạm khi đóng. Mỗi slot có profile và proxy riêng. Không cần GoLogin API token hay GoLogin desktop.

## Chuẩn bị

- Cài Google Chrome hoặc Chromium trên Mac.
- Giữ `Config/Browser/zero_profile/Default/Preferences` trong thư mục launcher của app. Thiếu mẫu này, app báo lỗi và không mở profile rỗng.
- Nhập proxy trong tab **Proxy**, chọn đúng loại HTTP hoặc SOCKS5. Dòng có thể theo dạng `host:port:user:pass` hoặc `host:port|user|pass`; app dùng relay loopback cho proxy có xác thực. Nếu không nhập proxy, app sẽ chạy Direct bằng IP của máy.

## Luồng chạy

1. Chọn **Chrome GoLogin (profile cục bộ)** và nhập URL, số cửa sổ, danh sách proxy.
2. App kiểm tra IP exit và tránh dùng trùng proxy/IP theo thiết lập hiện có.
3. Mỗi slot sao chép `zero_profile` vào `~/.autoleadpc/Profiles/gologin_*`, cập nhật ngôn ngữ, bookmark và các Preferences cần thiết.
4. App mở Chrome bằng `--user-data-dir` và `--remote-debugging-port=0`, đọc `DevToolsActivePort`, rồi gắn Playwright qua CDP.
5. App kiểm tra IP **trong Chrome** trước khi mở URL đích. Nếu IP khác IP proxy đã kiểm tra hoặc không xác minh được, phiên bị đóng.
6. Khi đóng cửa sổ hoặc chọn **Đóng tất cả**, app dừng Chrome, relay proxy và xóa thư mục profile tạm.

## Giới hạn trên Mac

Bản Windows gốc dùng `Security.dll` và trình duyệt Orbita riêng. Mac hiện chạy Chrome/Chromium đã cài, nên phần fingerprint do DLL/Orbita cung cấp không thể giống tuyệt đối. `orbita.config` được lưu cùng profile nhưng Chrome không đọc file này; các tùy chọn fingerprint mà app hỗ trợ được áp dụng qua CDP và script. Đây là cùng **luồng quản lý profile cục bộ**, không phải cùng engine trình duyệt.

Profile này chỉ tồn tại trong thời gian chạy. GoLogin Cloud API và tài khoản GoLogin không tham gia luồng mua proxy hay mở profile này.
