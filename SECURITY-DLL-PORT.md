# Security.dll: bản dịch hành vi và khả năng port sang macOS

Ngày phân tích: 2026-10-20 00:16 +07
Artifact: `/Users/codernguoitay/Downloads/AutoLeadPC/Security.dll`
SHA-256: `80f5175e78f78d60bc387110672cfa950a333ef17639ce6d0919f3302fd8dce2`
Kiến trúc: PE x64 (Windows). Pseudocode từ Hopper/REA là kết quả decompile, không phải mã nguồn gốc và không biên dịch được.

## Bản dịch các export được app PC gọi

| Export | Hành vi quan sát được | Tương ứng Mac |
|---|---|---|
| `Security_Initialize(chromeExePath)` | Nhận đường dẫn Orbita; tìm vị trí cần sửa trong executable và lưu trạng thái/byte liên quan để dùng cho bước patch/restore. | Không có tương đương an toàn trong app Mac hiện tại. |
| `Security_Patch()` | Gọi routine ghi byte vào file executable tại offset đã tìm. | Không port phần ghi đè executable Orbita. |
| `Run(...)` / `RunBrowser(...)` | Nhận proxy host/port/user/password/type, tọa độ, timezone, UA, URL, tên profile/icon, bookmarks, đường dẫn browser, OS và các cờ fingerprint. Kiểm tra trạng thái license; sau đó dựng cấu hình profile/khởi chạy browser và trả JSON session. | Mac đã có xử lý profile/proxy/fingerprint qua `local-profile-engine.mjs`; luồng Orbita hiện khởi chạy qua GoLogin Desktop và CDP. |
| `Security_Restore()` | Ghi lại byte đã lưu vào executable, hoàn tất vòng patch/restore. | Không áp dụng vì Mac không patch executable. |
| `VerifyLicense`, `IsLicenseValid`, `FreeMemory` | API kiểm tra license và giải phóng bộ nhớ do DLL cấp phát. `RunBrowser` trả nhánh lỗi `License invalid` khi trạng thái license nội bộ không hợp lệ. | Không thay thế hoặc bỏ qua cơ chế license của DLL. |

Luồng PC trong mã đọc được là: `Security_Initialize(Part_Gologin)` → `Security_Patch()` → `Security.Run(...)` → `Security_Restore()`. Phần UI gọi `Run` truyền proxy, tọa độ, timezone, user agent, URL, bookmarks, đường dẫn Orbita và các tùy chọn Canvas/ClientRects/WebRTC/WebGL/Fonts.

## Access token trong bản PC

Giao diện PC có ô **Access tokens** (`TokensGologin`). Mã C# đọc giá trị này từ `Settings.ini`, hiển thị và lưu lại. Trong source C# đã decompile, mọi chỗ tham chiếu `TokensGologin` đều thuộc các bước đọc/lưu/hiển thị; lời gọi `Security.Run`, `Security_Initialize` và `Security_Patch` không nhận giá trị đó. `txtKeyActive` dùng với `Security.Verify` là khóa kích hoạt riêng của `Security.dll`.

Điều này chỉ chứng minh access token có trong cấu hình PC và không được truyền trực tiếp qua các lời gọi DLL đã thấy. Chưa có bằng chứng runtime rằng token không được thành phần khác sử dụng. Kết luận “PC không dùng token” là quá rộng.

### Thử chạy bản PC trên macOS (Wine 11.0, 2026-10-20)

`AutoLeadPC.exe` mở được giao diện trong Wine. `Settings.ini` có trường `TokensGologin` với giá trị không rỗng (không đọc hoặc ghi giá trị ra báo cáo). Giao diện hiển thị “Đang kiểm tra License…” và ngày hết hạn 17-10-2022; sau khi bấm Start không có trình duyệt hay session mới. Thư mục bản PC trên máy này thiếu `Gologin/orbita-browser/chrome.exe`, là đường dẫn mặc định được mã C# gán cho `Part_Gologin`. Vì vậy lần chạy này **chưa đi tới `Security.Run`** và không thể xác định access token có được dùng lúc chạy browser hay không. Tiến trình Wine thử nghiệm đã được đóng; `Settings.ini` không thay đổi thời gian sửa đổi.

## Ranh giới port

Mac có thể tái triển khai các phần nghiệp vụ thông thường: tạo profile cô lập, ghi Preferences/Bookmarks, áp proxy và locale, mở browser, chờ `DevToolsActivePort` rồi trả session cho Playwright. Những bước đó đã có trong local profile engine.

Không thể chuyển trực tiếp PE x64 sang macOS: DLL phụ thuộc Win32 và mã Windows. Quan trọng hơn, patch file Orbita là hành vi riêng của binary đã phân tích; tác dụng đầy đủ của patch chưa được chứng minh chỉ từ pseudocode. GoLogin Orbita trên Mac hiện từ chối chạy trực tiếp nếu thiếu `gologin.run_token`. Vì vậy không thể gọi Orbita trực tiếp theo đúng luồng PC mà không tái tạo patch/cơ chế cấp quyền. Mac đang dùng GoLogin Desktop/API để nhận run token và profile; API trả 403 khi tài khoản hết quota tạo request.

Để đạt luồng Orbita được GoLogin hỗ trợ, app Mac cần profile đã tồn tại và GoLogin Desktop khởi chạy profile đó, hoặc API GoLogin còn quota để tạo profile. Bản dịch này không tái tạo phần patch executable hay bỏ qua license/token. `local-profile-engine.mjs` vẫn chạy Chrome/Chromium thường, không phải Orbita.

## Bằng chứng và giới hạn

- Static analysis nhận diện export `exp_RunBrowser`, `exp_Security_Initialize`, `exp_Security_Patch`, `exp_Security_Restore`, `exp_VerifyLicense`, `exp_IsLicenseValid` và `exp_FreeMemory`.
- `Security_Initialize` giữ offset/trạng thái sau khi tìm byte trong file được truyền vào.
- `Security_Patch` và `Security_Restore` dùng `CreateFileA`, `SetFilePointerEx`, `WriteFile` để ghi các byte tại offset rồi khôi phục byte lưu trước đó.
- `RunBrowser` kiểm tra trạng thái license trước khi tiếp tục. Pseudocode decompiler dài và không đủ để khẳng định mọi chi tiết cấu hình/flags của browser; bảng trên chỉ nêu phần có bằng chứng từ wrapper, call site PC, strings và các nhánh decompile đã kiểm tra.

Đây là bản dịch hành vi ở mức export/luồng, không phải bản dịch nguyên văn toàn bộ DLL (DLL có hàng nghìn hàm thư viện/runtime được decompiler nhận diện).
