# GoLogin trên AutoLeadPC Mac 2

Mac 2 tạo một profile GoLogin cloud cho mỗi luồng, gắn proxy và tùy chọn fingerprint, rồi yêu cầu GoLogin Desktop khởi chạy Orbita. Desktop cấp run token cho Orbita; app kết nối Playwright qua CDP để kiểm tra IP, mở trang đích và chạy autofill/script. Windows PC dùng `Security.dll` để khởi chạy Orbita trực tiếp; DLL đó chỉ chạy trên Windows nên Mac dùng API và daemon desktop của GoLogin cho phần khởi chạy.

## Chuẩn bị

- Đăng nhập GoLogin Desktop trên Mac và để ứng dụng chạy.
- Mở **Settings > Browser** trong AutoLeadPC Mac 2, nhập GoLogin API token rồi lưu.
- Chọn proxy và số luồng như bình thường. Mỗi luồng được gắn một proxy đã kiểm tra; profile GoLogin được tạo riêng cho luồng.

Token được lưu riêng trong `~/Library/Application Support/AutoLeadPC-2/gologin-api-token.txt` với quyền đọc/ghi chỉ cho tài khoản hiện tại. Settings.ini không lưu bản sao token.

## Luồng và dọn dẹp

1. App xác nhận token đã cấu hình và GoLogin Desktop phản hồi trên cổng localhost `36912`.
2. App kiểm tra các proxy, phân luồng proxy và cấu hình OS/fingerprint.
3. App gọi GoLogin API tạo profile cho từng slot, sau đó gọi Desktop `browser/start-profile` để nhận CDP URL.
4. Playwright kết nối Orbita, áp dụng các override được Mac hỗ trợ, kiểm tra IP exit trong trình duyệt rồi mở trang đích.
5. Khi đóng phiên, app yêu cầu Desktop dừng profile rồi xóa profile tạm qua API. Nếu khởi chạy lỗi, app cũng cố gắng dừng và xóa profile vừa tạo.

Canvas, ClientRects, WebGL, WebRTC và Fonts được chuyển vào cấu hình profile/stealth. Tuỳ chọn Api Fake IP bật geolocation theo IP proxy trong GoLogin; khi tắt, profile không cấp vị trí cho trang web. Timezone và ngôn ngữ vẫn tự khớp IP qua GoLogin. OS được ánh xạ từ Settings sang mã GoLogin (`win`, `mac`, `lin`, `android`).

## Giới hạn

Luồng khởi chạy, profile riêng, proxy và tự động hóa được giữ tương ứng với chức năng PC. Cơ chế fingerprint của `Security.dll` không thể chạy trên macOS; Mac dùng thiết lập GoLogin profile cùng CDP/Playwright. Bài kiểm tra/build không tạo profile thật trên tài khoản GoLogin.
