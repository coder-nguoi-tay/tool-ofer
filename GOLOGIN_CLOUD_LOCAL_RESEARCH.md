# GoLogin Local và Cloud cho AutoLeadPC

Ngày đối chiếu: 2026-11-15. Phạm vi: tài liệu chính thức và source hiện tại; chưa chạy phiên Cloud, chưa thay đổi runtime hoặc gói dịch vụ.

## Kết luận cho nhu cầu giảm tải Mac

Cloud phù hợp để chuyển việc render trang, chạy JavaScript website và giữ các tab khỏi Mac. Đây là suy luận từ kiến trúc browser từ xa, chưa phải số đo CPU/RAM của app. Node điều phối, autofill, kiểm lead, AI client và giao diện vẫn chạy trên Mac nếu chỉ tích hợp Cloud Browser endpoint. Mac ngủ hoặc app tắt thì phần điều khiển đó ngừng.

Không có cơ sở hứa giảm một tỷ lệ tài nguyên cụ thể hoặc tăng tỷ lệ hoàn thành offer. Lỗi logic website/iframe vẫn cần xử lý riêng.

## Đường đi của hệ thống

```text
Local: Mac [Node + Orbita + render/JS] → proxy → website
Cloud: Mac [Node] ⇄ CDP qua Internet ⇄ GoLogin [Orbita + render/JS] → proxy → website
Xem Cloud: hình ảnh từ browser từ xa → Mac [giải mã/hiển thị]
```

Cloud Browser là Orbita chạy từ xa và kết nối được bằng Playwright/CDP, với profile/proxy cấu hình qua REST API. [Getting Started](https://gologin.com/docs/api-reference/cloud-browser/getting-started)

| Nội dung | Local trong source hiện tại | Cloud dự kiến |
|---|---|---|
| CPU/RAM dựng trang | Mac chịu toàn bộ | Máy chủ GoLogin chịu; Mac còn điều phối và xem màn hình |
| Mở nhiều tab | Tăng tải browser trên Mac | Tăng tải browser từ xa; chưa biết quota RAM/tab mỗi phiên |
| Chuột, nhập liệu | CDP loopback, độ trễ thấp | CDP qua mạng; phải đo thời gian lệnh |
| Autofill, AI, check lead | Node trên Mac | Vẫn Node trên Mac nếu không chuyển worker đi nơi khác |
| Hiển thị | Screen View hoặc cửa sổ local | Live View chính thức hoặc thử lại Screen View qua CDP |
| Proxy | Có relay local để đếm byte thật | Proxy public truy cập được từ cloud, cấu hình trên profile |
| Ngắt kết nối | Có thể kiểm tra process SDK local | Không có process local; phải kiểm chứng trạng thái phiên cloud |
| Đóng phiên | Dừng process SDK, cleanup | API dừng cloud và xác nhận đã nhả concurrency |
| Chi phí | Máy, điện, proxy và gói GoLogin | Thêm giờ cloud, concurrency và lưu lượng áp dụng |

## Những điểm phải sửa nếu triển khai

### 1. Launcher và vòng đời

- `src/gologin-profile/start-gologin-profile.mjs`: hiện dùng SDK `gl.start()` để spawn Orbita trên Mac.
- `src/browser/actions/open-gologin-browser.mjs`: orchestration IP/geo, record, lead, runtime và cleanup; có phụ thuộc SDK như `_tz`, processSpawned và rename/delete profile.
- `src/browser/gologin/attach-session-lifecycle.mjs`: xác định browser sống bằng child PID; cách đó không dùng được cho cloud.
- `src/browser/gologin/initialize-runtime.mjs`: có phần tái sử dụng autofill/tab guards/watchers, nhưng phải kiểm thử riêng lệnh CDP và cửa sổ.
- Cần lựa chọn Local/Cloud rõ ràng; không tự fallback sang local khi cloud lỗi, vì sẽ làm Mac lại đầy browser.
- Mỗi slot giữ một kết nối trong suốt công việc; không connect lại cho mỗi bước.

Tài liệu quản lý phiên cảnh báo connect mới khởi tạo phiên, yêu cầu tái sử dụng kết nối và tránh nhiều process cùng điều khiển một profile. Vì vậy reconnect phải phân biệt nối lại phiên đang sống với mở lại profile; không hứa giữ nguyên DOM/tab sau mất mạng. [Manage a Browser Session](https://gologin.com/docs/api-reference/cloud-browser/manage-a-browser-session)

### 2. Persistent profile không phải checkpoint nghiệp vụ

Source hiện tại `stop-gologin-profile.mjs` bỏ upload profile; opener/launcher xóa profile khi đóng. Đây là chủ đích tạo profile mới cho phiên sau. Nếu giữ chính sách này trên cloud thì vẫn giảm tải Mac, nhưng không tận dụng được tính lưu profile lâu dài.

Nếu muốn persistent, cần xác định profile nào gắn với record/proxy nào. Không tái sử dụng profile chứa dữ liệu người trước cho record người sau. Profile lưu cookies/storage không thay thế confirmedLeadIp, record đã chọn, danh sách offer đã mở, trạng thái Yes/No/Save và bộ đếm phục hồi của app. Trạng thái JavaScript/DOM chưa lưu không được coi là đã bền vững.

### 3. Proxy, IP và băng thông

Launcher hiện chuyển HTTP proxy có auth qua `startAuthenticatedHttpRelay()` local rồi đưa relay vào profile. Cloud không truy cập được loopback của Mac: cần dùng proxy upstream trực tiếp, không public hóa relay hiện tại.

GoLogin cho phép proxy riêng HTTP/HTTPS/SOCKS5 và gắn proxy theo profile. Proxy không truy cập được sẽ làm khởi tạo cloud lỗi. [Using Proxies](https://gologin.com/docs/api-reference/cloud-browser/using-proxies-with-cloud-browser)

App phải xác minh IP bên trong browser cloud. Với proxy xoay, probe từ Mac và browser cloud có thể ra IP khác; không coi việc dùng cùng credentials là bằng chứng cùng IP. Cần giữ chính sách chống trùng IP/offer, lead và kiểm timezone từ IP quan sát được. Không có proxy thì không còn là IP Mac, nên không được dùng logic Direct hiện tại một cách máy móc.

Lưu lượng website chuyển sang đường cloud–proxy; Mac vẫn nhận CDP, ảnh màn hình, HTML khi lấy và log. Bộ đếm byte socket của relay local không đo được lưu lượng đó nữa. Phải phân biệt ước lượng CDP với số byte tính phí của nhà proxy.

### 4. Chuột và Screen View

`src/autofill/human-mouse-move.mjs` await 7–22 bước move, mỗi bước còn cập nhật con trỏ DOM. Qua cloud các thao tác tuần tự có thể bị cộng độ trễ mạng. Ví dụ giả định 20 lệnh tuần tự, mỗi lệnh mất 80ms, đã là 1,6 giây chưa kể các evaluate/click: đây chỉ là phép minh họa, không phải benchmark GoLogin.

Không tự bỏ chuột mà người dùng yêu cầu. Cần đo đường chuột, click/nhập, select Android và tốc độ render; giảm số lần trao đổi dư thừa nếu kết quả đo yêu cầu.

GoLogin có Live View cho phiên đang chạy. Tài liệu lưu ý việc đóng kết nối automation có thể kết thúc phiên tùy workflow/gói, nên Live View không thay cho quản lý phiên. [Session Live View](https://gologin.com/docs/api-reference/cloud-browser/live)

Screen View hiện dùng `Page.startScreencast` trong `src/browser/screencast/attach-screencast-session.mjs`: phải thử endpoint cloud có hỗ trợ thực tế và chất lượng/độ trễ ra sao. Live View chính thức là lựa chọn khác; nhúng vào WKWebView cần kiểm CSP, đăng nhập và quyền truy cập. Chỉ stream ô đang xem, không mở hàng loạt Live View vì Mac vẫn chịu giải mã ảnh.

### 5. OS, phiên bản và giới hạn nền tảng

GoLogin nói cloud chạy trên Linux và khuyến nghị profile Linux; video remote có thể có độ trễ. Tài liệu web app còn mô tả timeout sau 15 phút không hoạt động. Không áp cứng mô tả đó cho mọi API plan nếu chưa thử. [Key things to note](https://gologin.com/docs/key-things-to-note)

Không mặc định sáu lựa chọn OS và các Orbita version hiện dùng local đều có cùng khả năng trên cloud. Bắt đầu thử Linux; Windows/Mac/Android là các ca kiểm chứng riêng. Cloud Browser không biến thành Safari/iOS. Cloud Android là sản phẩm riêng, không đồng nghĩa endpoint CDP Cloud Browser hỗ trợ điện thoại thật.

## Dự toán sử dụng

Giờ cloud cộng theo số browser profile đang chạy, không phải số giờ Mac bật:

| Số phiên song song | 8 giờ/ngày × 30 ngày | 24 giờ/ngày × 30 ngày |
|---|---:|---:|
| 10 | 2.400 browser-giờ | 7.200 browser-giờ |
| 20 | 4.800 browser-giờ | 14.400 browser-giờ |

Tài liệu Usage công bố giá giờ bổ sung Professional $0,09; Business $0,08; Enterprise $0,07; Custom $0,05 và concurrency thêm $2/phiên/tháng. Phải xem quota/entitlement trong tài khoản. [Cloud Browser Usage](https://gologin.com/docs/general/account-and-billing/cloud-browser-usage)

Ví dụ GIẢ ĐỊNH tài khoản có 200 giờ/tháng, 3 phiên song song và rate $0,07: 10 browser × 8 giờ/ngày cần 2.200 giờ bổ sung = $154 và 7 concurrency = $14, tổng PHẦN BỔ SUNG $168/tháng; 24/7 là $490 + $14 = $504. Chưa cộng gói nền, proxy, thuế và điều kiện mua thêm giờ. Đây không phải báo giá hay quyền đã xác nhận của tài khoản.

Trang giới thiệu Cloud có thông tin trial/gói khác với tài liệu Usage nói cloud chỉ cho paid; phải xác nhận trong dashboard trước thử. Không kết luận token GoLogin local đồng nghĩa có đủ cloud quota. [Cloud Browser](https://gologin.com/cloud-browser/)

Giữ IP có lead đồng nghĩa giữ tài nguyên đang tính giờ nếu không dừng cloud; không tự đóng để tiết kiệm trái yêu cầu. Nên hiển thị rõ phiên đang sống và giờ đã dùng.

## Thử nghiệm cần làm trước khi chọn cloud

1. Kiểm tra quyền cloud, quota giờ/concurrency và giá thực tế trong tài khoản; không mua gói hoặc tăng hạn mức tự động.
2. Một profile Linux QA riêng, proxy truy cập được từ Internet, form giả không chứa dữ liệu thật.
3. So cùng kịch bản local/cloud: CPU/RAM của Mac, byte Mac nhận, thời gian mở, RTT CDP, thời gian chuột/click/fill/select, ảnh preview, popup và iframe.
4. Giả lập lead: reload, lỗi trang, dừng sau lead và chống duplicate vẫn đúng; không gửi lead thật.
5. Ngắt mạng/CDP, đóng Live View, khởi động lại app: ghi rõ phiên cũ còn sống hay mở phiên mới, dữ liệu gì còn lại; không tự bù trùng IP/profile.
6. Gọi stop cloud, kiểm chứng phiên đã dừng và quota đã nhả; xóa chỉ profile QA. Giữ token/Live View URL ngoài log.
7. Sau một phiên đạt, tăng 3 rồi 10 phiên trong thời gian giới hạn; tránh mặc định 20 phiên hoặc soak dài gây phí.

Tiêu chí chọn: giảm tải Mac đo được, điều khiển ổn định, proxy/IP đúng, không mất bảo vệ lead và giá thực tế chấp nhận được. Nếu độ trễ chuột/CDP là nút thắt, cân nhắc chuyển Node worker sang máy chủ gần browser; đây là giai đoạn khác, không phải tính năng tự có của Cloud Browser.

## Điều chưa xác minh

- Quota/giá tài khoản thật; chưa tạo phiên có thể tính phí.
- CPU/RAM cloud cấp cho mỗi phiên, số tab thực tế, vùng máy chủ và RTT từ máy này.
- Khả năng dùng các OS/version ngoài Linux và screencast CDP với app.
- Hành vi reconnect/idle timeout/stop và persistence khi process cloud bị lỗi.
- Tỷ lệ hoàn thành offer hoặc khả năng tránh challenge; built-in stealth không phải bảo đảm không bị phát hiện.

Tài liệu này không thay đổi source runtime, cài đặt người dùng hoặc app đang chạy.
