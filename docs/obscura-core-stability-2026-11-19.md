# Kiểm tra ổn định core Obscura — 19/11/2026

Phạm vi: đường tải/thực thi script và CSS trong core Rust, lifecycle document, transport của page, giới hạn tài nguyên và tương tác qua CDP. Dùng dữ liệu giả trên loopback; không đóng hoặc gửi form trong phiên người dùng đang làm việc. Đây là báo cáo các đường đã kiểm tra, không phải chứng nhận tương thích toàn bộ Chrome.

## Lỗi đã sửa

| Vấn đề | Hậu quả trước sửa | Thay đổi |
| --- | --- | --- |
| Timeout cả lô script trả `Vec::new()` | Script đã tải cũng bị bỏ; form không khởi tạo | Giữ kết quả từng request trong hàng đợi Rust; kết quả thành công vẫn dùng được sau khi request khác quá hạn |
| Chờ tất cả script trước khi chạy parser | Script async chậm giữ inline/defer/form | Prefetch tối đa 16 request; parser chỉ đợi script thực sự chặn nó; async đang chờ được xử lý riêng theo thứ tự hoàn tất |
| Hết thời gian mạng đồng thời hết thời gian thực thi | Đã tải được script nhưng không còn lượt chạy | Dự phòng thực thi tối đa 5 giây sau hạn mạng; watchdog vẫn chặn vòng lặp và tổng thời gian vô hạn |
| Thiếu `load`/`error` trên script parser/module | Callback website không mở khóa bước tiếp theo hoặc không chạy fallback | Phát callback đúng element; HTTP lỗi không thực thi body; lỗi thực thi classic không ngăn script sau và không biến thành lỗi tải |
| DCL được tạo hai lần, một lần có target window | Listener nhận sai target/bubbles | Phát một sự kiện trên document và bubble tới window |
| CSS chờ theo lô/thứ tự request và không có hạn tổng cho các tầng import | Một request chậm kéo dài toàn bộ khởi tạo | Nhận kết quả theo thứ tự hoàn tất, giữ hạn chung 30 giây cho các tầng import và giữ CSS đã tải; cascade vẫn theo thứ tự document |
| Body HTTP 4xx/5xx vẫn có thể được phân tích như CSS | Rule của phản hồi lỗi tác động giao diện/form | Chỉ áp dụng stylesheet có HTTP 2xx |
| Script classic parser dùng transport thường dù page có transport riêng | Document/CSS/script không nhất quán đường HTTP | Dùng cùng transport đã cấu hình cho page; giữ cookie, policy và callback hiện hữu |
| Request script/CSS thất bại thiếu bằng chứng network | Chỉ thấy “không có form”, khó biết request nào hỏng | Ghi failure vào `NetworkEvent` hiện có để CDP nhận lý do; không bật log HTML/thao tác hàng loạt |

`ParserScriptFetches` thuộc vòng đời document; khi bị hủy/thoát, worker cũng bị hủy. Channel có sức chứa 16 kết quả, số request đồng thời tối đa 16. Kết quả không còn cần dùng được giải phóng cùng document. Không tăng số tab/process hoặc cài timer polling để đổi lấy tốc độ.

## Kiểm chứng

- Test Rust chạy bằng `nextest`, mỗi test có process riêng cho V8. Gỡ biến proxy môi trường chỉ trong tiến trình test loopback; không sửa proxy của app.
- Fixture Rust tái hiện: async chậm/nhanh, timeout còn script thành công, classic/defer, callback HTTP lỗi và JS ném lỗi, module callbacks, DCL target/bubbles, CSS timeout/HTTP 500, lựa chọn transport.
- Fixture Playwright chạy cùng HTML/HTTP server trên Chromium và Obscura, so sánh thứ tự sự kiện, input tạo được và trạng thái `document.currentScript`.
- Test cũ yêu cầu async chặn import map đã được sửa: Chromium 156.0.8078.4 trả `later-map` trong cả ba lượt fixture mới; binary cũ Obscura xử lý khác Chromium. Test không được giữ kỳ vọng cũ chỉ để tránh sửa hành vi.
- Binary trước sửa làm test đối chiếu lifecycle thất bại: `slow, fast, inline, dcl, load`; Chromium xử lý `inline, dcl, fast, fast-load, slow, slow-load, load`.

Kết quả suite và số đo cuối được ghi bên dưới sau khi chạy đủ.

## Giới hạn và các đợt kiểm tra tiếp theo

- Bộ obstacle course 33 bước nằm ở repository đồng hành `obscura-benchmark`, hiện không có trong các workspace/Downloads đã kiểm tra. Không tuyên bố đạt 33/33 hoặc WPT khi chưa có bộ đó.
- CDP hiện vẫn gom một số lifecycle event ở cuối điều hướng. Thời điểm form được khởi tạo sớm hơn không đồng nghĩa mọi lệnh `page.goto({waitUntil:'domcontentloaded'})` đều trả sớm như Chromium. Cần một đợt sửa bộ điều phối điều hướng/lifecycle với test streaming riêng để loại bỏ giới hạn này.
- Graph module async vẫn được chuẩn bị qua runtime V8 của page; chưa chứng nhận lịch chuẩn bị graph đồng thời giống Chromium cho mọi thứ tự import map/top-level await. Không thay bằng việc bỏ script/module hoặc bỏ watchdog.
- Chưa kiểm chứng đầy đủ CORS/SRI/CSP/MIME enforcement, streaming HTML parser, Service Worker, WebGL, Web Audio, codec, WebRTC hoặc mọi API của Blink. Một số backend hiện chưa tồn tại; không tạo giá trị giả để báo tương thích.
- HTTP 401 với nội dung “Offer not available for your Country” là phản hồi từ server. Sửa loader không thay đổi điều kiện cung cấp offer của server.
- Các phiên đã mở vẫn giữ binary cũ trong bộ nhớ. Đóng gói bằng `./build-app.sh` và mở phiên mới mới nhận engine mới; không tự tắt phiên đang có lead để kiểm tra bản build.

## Kết quả đã đo

- Suite Rust workspace release, render + stealth: **2.731 passed, 0 failed, 5 skipped**, 79,292 giây chạy test (không tính build).
- Test Playwright đối chiếu Chromium 156.0.8078.4 và Obscura: **đạt** cả bốn fixture async, defer, HTTP/JS error và async import map; cùng input, callback và DCL target/bubbles.
- Các kết quả benchmark dưới đây là ba lượt đo sau một lượt warmup, chạy xen kẽ hai binary; seed/viewport/cấu hình giống nhau; fixture có script async 600 ms và script tạo form 15 ms.

| Chỉ số | Trước sửa | Sau sửa |
| --- | --- | --- |
| Form khởi tạo, từng lượt | 609 / 608 / 604 ms | 21 / 21 / 20 ms |
| Trung vị thời điểm form khởi tạo | 608 ms | 21 ms |
| Tổng navigation, từng lượt | 619 / 613 / 609 ms | 623 / 611 / 610 ms |
| Trung vị tổng navigation | 613 ms | 611 ms |
| RSS process sau tải, trung vị | 36.016 KiB | 34.144 KiB |
| CPU process sau tải, gồm khởi động | 0,04 / 0,03 / 0,02 s | 0,02 / 0,02 / 0,02 s |

Form được khởi tạo sớm hơn khoảng 96,5% trên fixture này. Không diễn giải thành “mọi trang nhanh hơn 29 lần”: navigation vẫn chờ tài nguyên async và CDP chưa streaming đầy đủ. Chênh lệch RSS khoảng 5,2% nằm trong ngưỡng nhiễu 10%, nên chỉ kết luận chưa thấy tăng RAM ở fixture; không tuyên bố tối ưu RAM đã được chứng minh. CPU ở độ phân giải quá thấp để suy ra tỷ lệ tăng tốc chắc chắn. Chưa đo proxy/website thật với cùng seed/network/viewport theo cặp baseline.

Kiểm tra bổ sung sau lượt workspace: test hủy hàng đợi/worker đang tải **đạt 1/1**. Suite app chính thức `npm test`: **1.034/1.034 passed, 0 skipped**. CLI release render + stealth và binary `obscura_antidetect_demo` đều build thành công. Test đối chiếu Chromium đã được đăng ký trong `TEST_FILES` để tiếp tục kiểm tra ở các lượt sau.

## Artifact đã cài

Đã xác nhận app không có slot và tự bù tắt trước khi chạy `./build-app.sh`. App duy nhất tại `/Applications/AutoLeadPC Mac 2 AdsPower.app` đã được cập nhật và mở lại, phiên bản 1.3.3/build 74. Verify chữ ký `codesign --verify --deep --strict` thành công; SHA-256 binary nguồn và binary trong app cùng là `7725b4f3b4c9c9a382e9d68f1937702d7dd7c9be643460dd9557343a56c907f0`. API sau khởi động trả active=0, enabled=false, target=0. Chạy lại fixture đối chiếu Chromium bằng chính binary đã đóng gói cũng đạt.
