# Các khoảng trống trong core Rust Obscura

Cập nhật triển khai: [đợt 1 sửa policy quyền native](obscura-native-permissions-2026-11-19.md). Các kết quả audit bên dưới ghi lại trạng thái trước đợt sửa này.

Ngày kiểm tra: 19/11/2026. Tác giả: ductv <ductv@getflycrm.com>.

Phạm vi: tiếp tục kiểm tra sau đợt sửa loader script/CSS; ưu tiên tương tác form, lifecycle, quyền và vòng đời dữ liệu. Đây là kết quả kiểm tra mã nguồn và fixture offline, chưa phải thay đổi triển khai. Không đóng phiên người dùng, không gửi form thật, không thay đổi cấu hình proxy hoặc log vận hành.

## 1. Quyền: lỗi đã tái hiện, trạng thái native chưa thực sự tồn tại

- `crates/obscura-cdp/src/domains/browser.rs`: `grantPermissions` và `resetPermissions` chỉ trả `{}`; `setPermission` chưa được xử lý.
- `crates/obscura-cdp/src/dispatch.rs`: handler Browser chỉ nhận method/params, chưa nhận context chứa policy.
- `crates/obscura-js/src/browser_identity.rs::permission`: các tên hỗ trợ đều trả hằng `prompt`.
- `crates/obscura-js/src/ops.rs::op_browser_permission`: đọc identity, chưa xét origin của realm hoặc chính sách BrowserContext.
- `js/bootstrap.js`: `PermissionStatus` giữ snapshot trong WeakMap; `Notification.permission` được gán `default`. Binding geolocation đọc tọa độ mà chưa kiểm tra quyền bị từ chối.

Fixture trên binary hiện có, dữ liệu giả ở loopback:

| Thao tác | Obscura | Chromium đối chiếu |
| --- | --- | --- |
| Query geolocation ban đầu | `prompt` | `prompt` |
| Grant geolocation qua CDP rồi query | **vẫn `prompt`** | `granted` |
| Reset rồi query | `prompt` | `prompt` |
| `Browser.setPermission` | `Unknown Browser method: setPermission` | Không đối chiếu lệnh này trong lượt probe |

Notifications trong Permissions API cũng không chuyển sang `granted` ở Obscura. Không lấy giá trị `Notification.permission` của fixture Chromium làm chuẩn tổng quát vì còn phụ thuộc môi trường/chính sách browser.

Ảnh hưởng: client nhận thông báo grant thành công nhưng website quan sát trạng thái khác. Chưa có bằng chứng đây là nguyên nhân của tất cả màn hình kẹt.

Cách xử lý đúng: policy Rust theo BrowserContext và origin, dùng chung cho CDP, Window và iframe/worker có API tương ứng. Grant/reset/set phải cập nhật một nguồn trạng thái; `PermissionStatus`, Notification và geolocation chỉ đọc policy qua bindings. Cần xử lý descriptor không hỗ trợ rõ ràng, thay đổi trạng thái và sự kiện `change`; không gán đè `navigator.permissions` bằng init script.

Nghiệm thu: grant/deny/reset đúng origin; không rò sang context khác; status đã tạo cập nhật đúng; geolocation bị deny không trả tọa độ; worker/frame không đọc nhầm policy của trang cha. Test hiện có `tests/obscura-native-configuration.test.mjs` mới kiểm tra trạng thái mặc định/prototype, chưa bắt được lỗi grant bị bỏ qua.

## 2. Input: đặt code trong file Rust chưa có nghĩa nghiệp vụ đã chạy native

`crates/obscura-cdp/src/domains/input.rs::insert_text_js` tạo chuỗi JavaScript để tìm `document.activeElement`, đọc selection, sửa value và phát sự kiện. Nhánh `Input.insertText` gọi `evaluate_input` với chuỗi đó. Focus document cũng được tìm thông qua trạng thái ở realm JavaScript.

Đây là đường thực thi trong engine, khác với init script ở app; tuy nhiên trạng thái editor và thuật toán nhập vẫn chưa hoàn toàn thuộc Rust. Chỉ chuyển chuỗi này sang file `.rs` khác không giải quyết gốc vấn đề.

Hướng xử lý: xác định nơi sở hữu focus/selection/value của control, đưa thao tác chỉnh sửa và default action về Rust; bindings giữ vai trò chuyển đổi Web IDL và gọi listener JS. Phải bảo toàn thứ tự `beforeinput` có thể cancel, kiểm tra lại readonly/disabled sau listener, cập nhật value/caret rồi phát `input`. Listener có thể đổi focus/selection hoặc xóa control ngay giữa thao tác, nên không giữ tham chiếu DOM cũ qua callback.

Đây là khoảng trống kiến trúc, **chưa khẳng định mọi nhánh input hiện tại sai**. Không viết lại toàn bộ DOM trước khi có fixture thất bại. Ma trận cần kiểm tra: input/email/tel/textarea, selection UTF-16, IME, readonly/disabled, iframe focus, listener đổi/xóa field và form có state điều khiển bằng JS. Các lỗi cụ thể được sửa tại editor/event pipeline chung, không tăng delay hoặc thêm một tầng autofill khác.

## 3. Lifecycle/CDP: còn điểm gây cảm giác chờ dù form đã hiện

`crates/obscura-cdp/src/domains/page.rs::emit_navigation_events` dựng DCL và load cùng một `ts` trong lô sự kiện hoàn tất điều hướng. Điều này chưa phản ánh từng thời điểm thực của document và có thể làm client chờ tài nguyên chậm trước khi nhận mốc cần thiết.

Đợt loader trước đã giúp script tạo form chạy sớm; điều đó không chứng minh CDP đã thông báo DCL sớm tương ứng. Kết quả benchmark cũ cũng thể hiện form khởi tạo sớm hơn nhưng tổng navigation gần như không đổi.

Hướng xử lý: Page phát các mốc commit/DCL/load theo loader/document generation trong Rust; CDP chuyển tiếp khi mốc xảy ra. Không phát `load`/networkIdle sớm giả để làm `goto` trả về. Điều hướng mới phải hủy tác vụ cũ, không phát event của document trước sang document sau; watchdog vẫn giữ nguyên.

Nghiệm thu: fixture async chậm, module top-level await, iframe chậm, hủy điều hướng và reconnect; đo riêng thời gian form sẵn sàng, DCL mà client nhận, load và CPU/RAM. Không dùng riêng tổng thời gian `goto` để kết luận tốc độ tương tác.

## 4. IndexedDB: hoạt động trong process, chưa có đường lưu bền profile

Đã kiểm tra thực tế: ghi transaction rồi reload cùng process đọc lại được `fixture-value`. Vì vậy nhận định “IndexedDB mất khi reload” là không đúng với fixture này.

Các điểm thiếu trong source:

1. `crates/obscura-js/src/indexed_db.rs`: records/transactions thuộc `Mutex<Inner>` trong RAM, chưa có load/save đĩa.
2. `crates/obscura-browser/src/context.rs`: constructor và `connection_copy()` tạo kho IndexedDB mặc định mới; persistent copy và incognito có quy tắc riêng cần giữ rõ.
3. `BrowserContext::save_storage()` chỉ lưu localStorage và cookie.
4. `crates/obscura-cdp/src/server.rs`: shutdown hợp nhất delta cookie/localStorage; chưa có snapshot/delta IndexedDB. Các client CDP thông thường được cách ly; riêng chế độ persistent của AutoLeadPC tái dùng renderer khi nối lại cùng process.
5. `demo-obscura-antidetect/src/main.rs`: nhánh `serve` của app truyền `storage_dir = None`. Cờ `AUTOLEADPC_OBSCURA_PERSISTENT=1` giữ processor/renderer, **không đồng nghĩa lưu profile ra đĩa**.

Vì app chủ động tạo profile mới cho phiên mới, không tự bật lưu bền cho mọi phiên: có thể thay đổi mục tiêu cách ly và chính sách dọn dữ liệu. Chỉ triển khai khi cần khôi phục cùng profile sau restart. Khi triển khai phải đi hết đường cấu hình thư mục profile → context → kho Rust → commit/durability → CDP reconnect/shutdown; thêm `save()` đơn lẻ sẽ chưa đủ.

Nghiệm thu: chỉ transaction commit được khôi phục; abort/pending không xuất hiện; delete không sống lại; lỗi đĩa không mất bản tốt hoặc báo thành công sai; profile/origin/incognito cách ly; snapshot có giới hạn và quyền file phù hợp. Cần đo chi phí ghi đĩa, không serialize toàn kho trên mỗi lần đọc.

## 5. Thứ tự công việc tối thiểu

1. Tái hiện và sửa lỗi input/lifecycle gây kẹt form tại core, kiểm tra trên cùng fixture Chromium. Đây là phần liên quan trực tiếp triệu chứng hiện tại.
2. Sửa policy quyền native đã xác nhận lỗi, gồm CDP và các API tiêu thụ quyền; không dừng ở việc query trả chuỗi mong muốn.
3. Chỉ thêm IndexedDB durability nếu cần phục hồi cùng profile sau khi process thoát. Trong phiên chạy liên tục, ưu tiên transaction/lifecycle/reconnect trước.

Chưa đưa WebGL, DSP audio, WebRTC hay thay toàn bộ engine vào phạm vi. Các lớp Web IDL/listener JavaScript vẫn cần tồn tại với V8; mục tiêu là Rust sở hữu trạng thái và thuật toán nền, không phải xóa mọi dòng JavaScript bằng mọi giá.

## 6. Bằng chứng và giới hạn lượt kiểm tra

- Probe Obscura: `/tmp/autolead-core-permission-audit.json` và `/tmp/autolead-core-permission-audit.log`.
- Probe Chromium: `/tmp/autolead-core-permission-chromium.log`.
- Các probe chỉ tạo process test riêng, server loopback và data dir thử nghiệm; đóng process test khi kết thúc. Không dùng proxy, record hay form thật.
- Graph tìm code Rust không đủ kết quả, đã đối chiếu implementation trực tiếp. Không thay source runtime hay build app trong lượt kiểm tra này.
- Không chạy lại toàn suite cho thay đổi tài liệu; kết quả suite ở báo cáo ổn định trước thuộc đợt sửa loader, không phải bằng chứng các khoảng trống trên đã được khắc phục.
- Chưa có fixture tái hiện màn kẹt cụ thể của phiên người dùng trong lượt này; chưa kết luận một nguyên nhân duy nhất hoặc tuyên bố tương thích toàn bộ Chrome.
