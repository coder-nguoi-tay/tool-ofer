# AutoLeadPC Mac — Chrome

Nút **Tạo profile và mở** dùng các ứng dụng Google Chrome đã cài trên máy. Mỗi cửa sổ có phiên bản, thư mục profile và proxy riêng; nếu thiếu phiên bản, app báo lỗi trước khi mở. User-Agent theo profile thiết bị đã chọn và mang số phiên bản đầy đủ của bản Chrome đang mở (ví dụ `Chrome/154.0.8037.98`), khớp với Client Hints.

### Giả lập thiết bị và chống fingerprint

Phần này nằm trong `stealth.mjs`:

- **Đổi tận gốc qua CDP** cho từng tab và iframe khác site: User-Agent, Client Hints (brand GREASE giống Chrome, `platformVersion`, kiến trúc, model), `navigator.platform`, số nhân CPU, `navigator.languages` và header `Accept-Language`. Ngôn ngữ và múi giờ lấy theo quốc gia của IP proxy.
- **Script vá trong trang**: một script duy nhất chạy ở mọi frame và trong Web Worker tạo từ blob. Hàm vá trả `[native code]` khi gọi `toString`, giữ đúng `name` và `length`. Các phần được vá: chuỗi GPU và giới hạn WebGL theo profile, `deviceMemory`, `screen.avail*` và `outerWidth/outerHeight`. Với profile iOS, script xoá thêm Client Hints và `window.chrome`.
- **Mỗi cửa sổ là một máy khác nhau**: mỗi phiên có một seed riêng. Từ seed, app chọn ngẫu nhiên một cấu hình có thật trong profile, gồm chip/GPU, số nhân CPU, RAM, độ phân giải và tỉ lệ màn hình, phiên bản hệ điều hành. Ví dụ `macOS 15.6.1 · Apple M4 Pro · 14 nhân · 1512x982@2x`. Cấu hình này hiện khi rê chuột vào biểu tượng thiết bị trong tab **Trình duyệt**.
- **Nhiễu Canvas, ClientRects, WebGL, Audio luôn bật** theo seed của phiên: đọc lại nhiều lần vẫn ra cùng kết quả, khác phiên thì khác nhau. Tuỳ chọn Fonts vẫn bật/tắt riêng. Canvas xuất ảnh từ một bản sao có nhiễu, không đụng vào canvas của trang. ClientRects nhân một hệ số cố định nên `right - left` vẫn bằng `width`. Audio được thêm nhiễu một lần cho mỗi buffer.
- **WebRTC** luôn chạy với `--webrtc-ip-handling-policy=disable_non_proxied_udp` nên không lộ IP thật qua UDP. **ApiFakeIP** đặt toạ độ theo IP qua `geolocation` của Playwright và cấp luôn quyền geolocation.
- App không chèn badge, không sửa tiêu đề trang và không tạo biến toàn cục trong trang đích. IP và trạng thái lead hiển thị trong giao diện AutoLead.

Giới hạn còn lại: worker nạp từ URL thường (không phải blob) và service worker vẫn thấy `navigator.platform` thật. Danh sách font hệ thống vẫn là của máy đang chạy. Profile iPad/iPhone chạy trên Blink nên chỉ giả lập được bề mặt. Để ít lệch nhất, chọn profile trùng hệ điều hành của máy (`macos` trên Mac).

Giao diện có ba tab: **Thiết lập** chứa số cửa sổ, loại proxy, website đích và dữ liệu tự điền; **Proxy** chứa danh sách và công cụ kiểm tra/xuất lịch sử; **Trình duyệt** chứa nút mở/đóng profile cùng mục tải phiên bản Chrome for Testing.

Khi mở trình duyệt, app xác minh IP exit và kiểm tra trang đích. App lưu trạng thái của từng proxy trong lịch sử để tránh dùng lại; nếu dịch vụ xác minh IP lỗi, lượt mở và tự bù tạm dừng. Lịch sử nằm trong dữ liệu AutoLeadPC, có thể xuất CSV ở tab Proxy và xem danh sách IP đã dùng.

Nút chính mở Chrome Stable từ `/Applications/Google Chrome.app`, các bản Chrome cũ trong `~/Library/Application Support/AutoLeadPC/chrome-regular-builds` và các kênh Beta, Dev, Canary trong `chrome-channels`. Bản cũ đặt tên `Google Chrome 154.0.8037.98.app` hoặc `Google Chrome Beta 156.0.8078.4.app` theo kênh và phiên bản thực tế. Profile được lưu trong `chrome-profiles` và **tự xoá ngay khi cửa sổ đóng** — mỗi profile là một bản chép đầy đủ của profile mẫu (~179 MB) nên để lại thì đĩa phình thêm bấy nhiêu cho mỗi proxy đã thử; lệnh xoá chỉ chấp nhận đường dẫn nằm trong `chrome-profiles`. Phiên đăng nhập của một cửa sổ vì vậy không còn lại sau khi đóng, trừ phần được chép lại từ profile mẫu ở lần mở sau; lịch sử proxy được lưu trong dữ liệu AutoLeadPC. Mỗi proxy được xác minh IP ngay trong Chrome; IP trùng hoặc website lỗi sẽ đóng cửa sổ và thử proxy kế tiếp. SOCKS5 có user/password đi qua relay cục bộ của app. Tự bù cũng dùng các bản Chrome này. Kho `chrome-builds` chứa Chrome for Testing đã tải trước, tách khỏi nút chính.

Ô **Dữ liệu tự điền** nhận CSV có hàng tiêu đề hoặc mảng JSON gồm các object. Ví dụ CSV: `Họ tên,Địa chỉ,Số điện thoại` ở dòng đầu, các bản ghi ở những dòng tiếp theo; hoặc JSON chứa các trường lead (`Full Name`, `Address`, `City`, `State`, `Zipcode`, `Phonenumber`, `Năm Sinh`, `SSN`, `Routing`, `Name bank`, `Number`...). App tự động đối sánh thông minh tên trường (Anh - Việt, tên gộp hoặc tách rời First/Last Name, Month/Day/Year, Area/Prefix/Line, SSN1-3...), hỗ trợ form nằm trong iframe và các trang chuyển hướng. App tự phục hồi nếu chuỗi JSON bị cắt cụt đuôi. Dữ liệu đã lưu tiếp tục được dùng cho profile tự bù.

Nếu một tab hiển thị `Traffic Blocked!`, app tự động đánh dấu proxy đó bị lỗi, đóng cửa sổ Chrome đó và tự động mở profile/tab khác với proxy và IP mới để thay thế.

Khi người dùng đóng tab cuối cùng của một phiên Chrome bằng dấu X, app cũng kết thúc tiến trình Chrome của phiên đó và cập nhật số cửa sổ đang mở. Phiên đóng theo cách này không được tự bù bằng proxy khác.

Tab **Trình duyệt** hiển thị phiên bản, IP exit đã xác minh và số trường tự điền của từng cửa sổ Chrome đang mở. Để mọi profile mới có sẵn RoboForm, bấm **Cài RoboForm cho profile mới** trong tab **Trình duyệt**. App mở profile mẫu `~/Library/Application Support/AutoLeadPC/chrome-template-profile` bằng bản Chrome thấp nhất trên máy, không qua proxy, tại trang RoboForm trên Chrome Web Store. Cài extension, đăng nhập RoboForm, rồi đóng cửa sổ đó. Mỗi khi app tạo một profile Chrome mới (kể cả tự bù), nó chép profile mẫu sang, trừ khóa tiến trình, cache và phiên tab. Profile đã tạo trước đó không bị thay đổi. Mọi extension cài trong profile mẫu đều được chép, và dòng trạng thái của từng cửa sổ Chrome ghi tên extension có trong profile đó hoặc lý do không có. Khi cửa sổ profile mẫu còn mở, app từ chối tạo profile Chrome mới. Cookie và phiên đăng nhập trong profile mẫu cũng được chép, nên chỉ dùng profile mẫu cho RoboForm. Nếu sau này cài thêm một bản Chrome thấp hơn bản đã mở profile mẫu, profile mới cho bản đó sẽ mở không có RoboForm; muốn khắc phục, xóa thư mục profile mẫu rồi cài lại.

## Cách dùng

1. Nhập số cửa sổ và website ở tab **Thiết lập**, dán danh sách proxy ở tab **Proxy**.
2. Bấm **Tạo profile và mở** để mở các ứng dụng Google Chrome thường đã cài. Các bản Chrome for Testing trong kho riêng không được nút này sử dụng.
3. Dùng **Xem IP đã dùng** để xem lịch sử, **Tự bù** để bù cửa sổ đóng, hoặc **Đóng tất cả** để dừng lượt.

Proxy (kể cả user/password), URL, số cửa sổ và dữ liệu tự điền được lưu trong SQLite cục bộ `~/Library/Application Support/AutoLeadPC/preferences.sqlite` khi bấm **Lưu cấu hình**. Database này không mã hóa; chỉ đưa vào dữ liệu mà bạn muốn lưu trên máy này.

## Chạy từ mã nguồn

Yêu cầu Node.js 20 trở lên.

```sh
npm install
npm start
```

## Chạy test

Chạy `npm test` để chạy self-check và test bộ cài các phiên bản Chrome. Test không mở browser hay gửi request ra Internet.
