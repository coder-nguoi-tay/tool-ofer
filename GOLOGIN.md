# Tích hợp GoLogin trên AutoLeadPC Mac 2

Tài liệu này mô tả cách dùng chế độ GoLogin trong AutoLeadPC Mac 2 để tạo profile từ proxy đã mua, mở bằng Orbita và chạy luồng tự động hóa của app.

## Yêu cầu

- GoLogin desktop đã cài, đang chạy và đã đăng nhập.
- Orbita đã được GoLogin tải/cài về máy.
- GoLogin API token có quyền tạo và xóa profile.
- Proxy hoạt động và có thông tin host, port; thêm username/password nếu proxy yêu cầu.
- App có thể kết nối đến `api.gologin.com` và daemon GoLogin cục bộ tại `127.0.0.1:36912`.

Profile được tạo trong tài khoản GoLogin bằng API. Không cần tạo profile thủ công trước. Proxy phải được mua/cấp riêng; app không thực hiện giao dịch mua proxy.

## Cấu hình trong giao diện

1. Mở GoLogin desktop và đăng nhập.
2. Trong AutoLeadPC Mac 2, chọn **Chrome Gologin** ở phần Browser.
3. Nhập **GoLogin API token** trong phần Thiết lập. Lưu cấu hình để dùng lại.
4. Chọn loại proxy:
   - **HTTP/HTTPS** cho proxy HTTP/HTTPS như proxy mua từ 711Proxy.
   - **SOCKS5** cho proxy SOCKS5.
5. Nhập số luồng, website đích và danh sách proxy, sau đó bấm **Tạo profile và mở**.

App kiểm tra proxy trước. Mỗi proxy hợp lệ được gán cho một slot và dùng để tạo một profile riêng. Nếu danh sách có proxy mà không proxy nào hợp lệ, app dừng thay vì mở bằng IP trực tiếp của máy.

## Định dạng proxy

Mỗi dòng là một proxy. Có thể dùng các dạng sau:

```text
host:port
host:port:username:password
http://username:password@host:port
https://username:password@host:port
socks5://username:password@host:port
```

Với dạng `host:port`, app dùng giao thức đã chọn trên giao diện. Với URL `https://`, profile GoLogin nhận proxy ở chế độ `http`; đây là cấu hình proxy HTTP qua kết nối TLS của endpoint. Dấu `:` trong username/password không được hỗ trợ ở dạng bốn trường; hãy dùng URL có credentials nếu cần ký tự phân cách.

Ví dụ dạng danh sách TXT của proxy có username/password:

```text
us.rotgbapi.trustsource.live:10000:customer-zone-us-session-a1:proxy-password
us.rotgbapi.trustsource.live:10000:customer-zone-us-session-a2:proxy-password
```

Hãy thay host, port và credentials bằng giá trị nhà cung cấp cấp cho tài khoản của bạn. Không đưa proxy credentials hoặc API token thật vào tài liệu, Git hay log chia sẻ.

## Các trường profile gửi lên GoLogin

App gọi `POST https://api.gologin.com/browser/custom` với Bearer token. Payload hiện gồm:

| Trường | Giá trị/ý nghĩa |
| --- | --- |
| `name` | `AutoLeadPC Mac 2 - Slot N`, tên profile theo slot. |
| `os` | `mac`, vì app chạy Orbita trên macOS. |
| `autoLang` | `true`, GoLogin chọn ngôn ngữ theo vị trí/proxy. |
| `timezone` | Bật và tự lấy múi giờ theo IP. |
| `geolocation` | Cho phép website hỏi vị trí và lấy vị trí theo IP. |
| `proxy` | `mode`, `host`, `port`, `username`, `password` của proxy đã chọn. Bỏ trường này nếu không có proxy. |
| `canvas.mode` | `noise` nếu bật chống fingerprint Canvas; nếu không thì `off`. |
| `clientRects.mode` | `noise` nếu bật chống fingerprint ClientRects; nếu không thì `off`. |
| `webGL.mode` | `noise` nếu bật chống fingerprint WebGL; nếu không thì `off`. |
| `webRTC.mode` | `public` khi bật tùy chọn WebRTC; nếu không thì `disabled`. |
| `startUrl` | Website đích của slot, chỉ gửi khi có URL. |

Đây là payload minh họa; thông tin nhạy cảm được thay bằng giá trị mẫu:

```json
{
  "name": "AutoLeadPC Mac 2 - Slot 1",
  "os": "mac",
  "autoLang": true,
  "timezone": { "enabled": true, "fillBasedOnIp": true },
  "geolocation": { "mode": "allow", "enabled": true, "fillBasedOnIp": true },
  "canvas": { "mode": "noise" },
  "clientRects": { "mode": "noise" },
  "webGL": { "mode": "noise" },
  "webRTC": { "mode": "disabled" },
  "startUrl": "https://example.com",
  "proxy": {
    "mode": "http",
    "host": "us.rotgbapi.trustsource.live",
    "port": 10000,
    "username": "proxy-user",
    "password": "proxy-password"
  }
}
```

## Luồng xử lý

1. App lấy API token từ request giao diện hoặc cấu hình đã lưu.
2. App xác nhận GoLogin desktop đang chạy và Orbita đã được cài.
3. App phân tích danh sách proxy, kiểm tra kết nối và IP exit; bỏ qua proxy chết, proxy đang chạy hoặc IP bị trùng theo chính sách hiện có.
4. App tạo một profile GoLogin cho mỗi slot qua `POST /browser/custom`.
5. App gọi daemon `POST http://127.0.0.1:36912/browser/start-profile` với `profileId` và `sync: true`. GoLogin desktop đồng bộ profile, cấp thông tin chạy Orbita và CDP.
6. App kết nối Playwright qua CDP, kiểm tra IP ngay trong Orbita và so sánh với IP đã kiểm tra trước khi vào website đích.
7. Khi đóng cửa sổ, app dừng profile qua daemon GoLogin rồi xoá profile đó khỏi tài khoản. Mỗi lượt mở (kể cả tự bù) đều tạo profile mới và app không dùng lại profile cũ; nếu giữ lại, số profile sẽ tăng đến giới hạn gói và GoLogin trả HTTP 402.

Nếu tạo profile thành công nhưng không mở/xác minh được phiên, app cũng dừng rồi xoá profile đó. App xoá qua `DELETE https://api.gologin.com/browser` với body `{ "profilesToDelete": ["profile-id"] }`; nếu bị từ chối thì thử lại `DELETE https://api.gologin.com/browser/{profileId}`. Nếu cả hai đều lỗi, cảnh báo sẽ hiển thị profile cần xoá thủ công.

## Xử lý lỗi thường gặp

| Thông báo/tình huống | Cách xử lý |
| --- | --- |
| Thiếu GoLogin API token | Nhập token trong phần Browser của Thiết lập và lưu cấu hình. |
| GoLogin desktop chưa chạy | Mở GoLogin desktop, đăng nhập rồi thử lại. |
| Không tìm thấy Orbita | Để GoLogin tải/cài Orbita xong rồi thử lại. |
| GoLogin từ chối tạo profile (HTTP 402) | Gói GoLogin không cho tạo thêm: gói hết hạn/không có quyền API, hoặc đã chạm giới hạn số profile. Thông báo cho biết tài khoản đang có bao nhiêu profile và bao nhiêu profile do app tạo (tên `AutoLeadPC Mac 2 - Slot …`). Xoá bớt các profile đó trong GoLogin hoặc nâng/gia hạn gói rồi thử lại. |
| Không tạo được profile (mã khác) | Thông báo kèm lời giải thích của GoLogin. Kiểm tra token, quyền tài khoản và kết nối Internet. |
| Proxy không kết nối hoặc trả lỗi 407 | Kiểm tra giao thức, host, port, username/password và quyền truy cập proxy. |
| IP trong Orbita khác IP đã kiểm tra | Proxy có thể đã xoay IP giữa hai lần kiểm tra; thử lại với sticky session hoặc proxy ổn định. |
| Không có CDP URL | Kiểm tra GoLogin desktop và trạng thái profile; app sẽ thử mở lại profile tối đa ba lần. |

## Bảo mật và giới hạn

- API token được lưu theo cơ chế cài đặt hiện có trong `Settings.ini`. Hãy bảo vệ file cấu hình và không commit token lên Git.
- Proxy credentials được gửi đến GoLogin trong cấu hình profile để Orbita dùng proxy đó.
- Profile do app tạo được xoá khi đóng phiên. Profile còn sót lại từ các bản trước (khi app chưa xoá) vẫn nằm trong tài khoản, có tên `AutoLeadPC Mac 2 - Slot …`; hãy xoá thủ công trong GoLogin.
- Việc đóng phiên cần GoLogin desktop cục bộ đang hoạt động để đồng bộ trạng thái profile.
- Tài liệu API chính thức: [GoLogin API docs](https://api.gologin.com/docs).

## Mã nguồn liên quan

- `gologin-profile.mjs`: tạo proxy payload, tạo và xóa profile qua API.
- `app.mjs`: đọc token, kiểm tra proxy, gọi GoLogin desktop, gắn CDP và quản lý phiên.
- `index-pc.html`: lựa chọn GoLogin, token, giao thức proxy và gửi yêu cầu mở luồng.
- `gologin-profile.test.mjs`: kiểm tra payload cùng request tạo/xóa profile bằng HTTP mock.
