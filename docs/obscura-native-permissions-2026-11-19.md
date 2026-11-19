# Đợt 1: policy quyền trong Rust

Ngày: 19/11/2026. Tác giả: ductv <ductv@getflycrm.com>.

## Thay đổi

Lỗi trước sửa: CDP nhận `Browser.grantPermissions` nhưng query trên website vẫn trả `prompt`; `Browser.setPermission` chưa được hỗ trợ.

- `obscura-js/src/permissions.rs` giữ policy theo origin, thuộc `BrowserContext`, dùng chung qua `Arc`. Context mới có policy riêng; policy không bị thay bởi cấu hình identity hoặc reload document.
- `Browser.grantPermissions` cấp danh sách đã kiểm tra và deny các quyền còn lại trong phạm vi đó. `setPermission` cập nhật một tên quyền; `resetPermissions` xóa override của đúng context. Origin, context ID, setting và toàn bộ danh sách được kiểm tra trước khi cập nhật.
- Wildcard áp dụng khi CDP không truyền origin; override theo origin thắng wildcard. Có giới hạn 1.024 phạm vi để chặn tăng dữ liệu vô hạn. Origin opaque không được nhận quyền mạnh.
- Native op đọc origin của realm đang gọi API, thay vì lấy origin main frame. Geolocation chỉ đọc tọa độ CDP của page sở hữu khi quyền của origin gọi là `granted`; `prompt`, `denied` và reset trả lỗi code 1. Override tọa độ không đồng nghĩa cấp quyền.
- `PermissionStatus.state` và `Notification.permission` đọc policy native. Runtime kiểm tra generation tại task boundary, chỉ đánh thức binding khi policy thay đổi; không thêm vòng timer polling.
- Binding JS chỉ chuyển đổi Web IDL, giữ tham chiếu status và đăng ký listener `change`/`onchange`. Trạng thái grant/deny/reset không được lưu vào object JS của website. Status có listener được giữ sống; remove/once/abort/xóa `onchange` nhả tham chiếu khi hết listener. Status đã thu gom được dọn qua `FinalizationRegistry`; notification chạy dưới watchdog native.
- Watch vị trí bị từ chối được giải phóng trước khi gọi error callback; callback ném lỗi hoặc tạo watch mới không giữ handle cũ. Giữ cơ chế hủy bằng `clearWatch`, không thêm timer polling hay backend vị trí giả.
- Geolocation giữ cả `accuracy` trong Rust. Tham số sai bị từ chối trước mutation; nhóm tọa độ không đầy đủ đặt trạng thái unavailable thay vì dùng lại giá trị cũ. Clear khôi phục cấu hình nền hoặc unavailable, cập nhật cả realm đang sống và document sau reload.
- Không thêm init script hoặc sửa prototype của website ở app. Không sửa luồng autofill, dọn profile, bảo vệ lead hay cấu hình proxy.

## Kiểm tra

Test Rust kiểm tra origin, wildcard theo từng quyền, context độc lập, reset, quota 1.024 phạm vi và lỗi không được cập nhật một phần policy. Integration test Rust dùng full GC của V8 để kiểm tra giữ/nhả listener và dọn watch. Các test tích hợp `tests/obscura-permissions.test.mjs` và `tests/obscura-permission-validation.test.mjs` đã đăng ký trong `TEST_FILES`, chạy binary thật trên fixture loopback.

Test tích hợp kiểm tra: grant/deny/reset, status cũ được cập nhật, `change` và `onchange`, nhận event qua console khi client không poll/evaluate trang, iframe khác origin, hai page cùng context, context độc lập, reload và Notification. Ma trận CDP sai kiểu/context/descriptor phải giữ nguyên policy ở cả origin và context khác. Geolocation kiểm tra prompt/granted/denied/reset, accuracy, clear, input không hợp lệ và iframe/reload.

Các số liệu đã ghi trong báo cáo trước lượt hoàn tất bổ sung này (Rust `render,stealth` 2.733 đạt/5 bỏ qua, Node 1.035 đạt) không phải kết quả của tree hiện tại và không được dùng làm gate cho các thay đổi bên dưới.

Kết quả lượt hoàn tất trên working tree đã có sẵn thay đổi chưa commit:

- `npm test`: **1.039 đạt, 0 lỗi, 0 hủy, 0 bỏ qua** trên binary nguồn cuối, thời gian runner 143,516 giây.
- `cargo nextest run --release --locked --features render,stealth --no-fail-fast`: **2.744 đạt, 0 lỗi, 5 bỏ qua**, thời gian chạy test 24,625 giây (không tính build).
- Filter `test(permission) | test(geolocation)` cùng feature/workspace: **16/16 đạt**, trong đó có quota, forced GC/reentrancy, terminal watch và quyền từng origin/iframe. Số test còn lại bị lọc không phải kết quả chạy full suite.
- CLI release build với `render` và `render,stealth`, cùng build binary ứng dụng qua `node scripts/build-obscura.mjs`, đã hoàn tất. Không chạy đóng gói/cài lại app. SHA-256 binary nguồn cuối: `f55bc28ea3c865cd1c3c68db764f6338e0dbc79a92d7d33a72b72d1a00842948`.
- `cargo nextest run --release --locked --features render --no-fail-fast` không bật stealth: **2.702 đạt, 0 lỗi, 5 bỏ qua**, thời gian chạy test 29,486 giây. CLI release `render` cũng được build lại sau lượt này.

Các lượt đầu phát hiện lỗi cú pháp trong probe geolocation mới, race nhận frame sau reload và khác biệt biểu diễn JSON số nguyên/số thực. Đã sửa probe, chờ frame bounded nhưng vẫn kiểm đủ quan hệ cha–con và dùng assertion số có kiểu trong các fixture mới. Test GC reentrancy dùng lý do abort dạng chuỗi để tránh status bị root bởi stack của Error, vẫn giữ controller và assertion giữ/nhả object. Có thay đổi evaluator ngoài phạm vi permissions trong working tree; không quy kết việc sửa các test cũ hoặc toàn bộ kết quả workspace cho đợt quyền này.

Review sau từng bước và cross-layer không còn finding bắt buộc trong phạm vi quyền; các class/field/method mới hoặc sửa đã đối chiếu docblock. Cú pháp JavaScript và `git diff --check` của cả repository chính và nested repo đạt. Chưa có repository đồng hành `obscura-benchmark`, nên chưa chạy obstacle course 33 bước hoặc tuyên bố WPT/Orbita parity.

## Giới hạn của đợt này

- Đây là policy override CDP cơ bản, chưa phải toàn bộ Permissions/Permissions Policy của Chromium. Chưa triển khai prompt UI, policy theo embedding origin, các descriptor mở rộng như MIDI sysex/camera pan-tilt-zoom hoặc worker global đầy đủ. CDP yêu cầu descriptor/phạm vi chưa hỗ trợ sẽ nhận lỗi rõ ràng.
- Chưa có prompt UI nên geolocation fail closed khi quyền còn `prompt`, thay cho hành vi cũ trả tọa độ nếu host đã cấu hình. Client thử nghiệm phải grant đúng origin/context qua CDP; không tự thêm grant vào launcher ứng dụng. Các trường tọa độ mở rộng như altitude/heading/speed chưa hỗ trợ sẽ nhận lỗi rõ ràng.
- Grant camera/microphone không tự bổ sung backend media còn thiếu. Không dựng camera/microphone hoặc dữ liệu giả để báo API hoạt động.
- `watchPosition` vẫn giữ hành vi single-delivery legacy và hỗ trợ hủy; đợt này chỉ sửa kiểm quyền/giải phóng handle, chưa triển khai luồng theo dõi vị trí liên tục.
- Chưa chuyển editor input sang Rust hoặc sửa CDP lifecycle streaming trong đợt này. IndexedDB durability vẫn là hạng mục có điều kiện theo nhu cầu khôi phục profile.
- Build binary nguồn không thay binary đã nạp trong các process đang chạy. Chưa đóng gói/cài lại app trong đợt này; không đóng phiên làm việc để triển khai bản sửa.
