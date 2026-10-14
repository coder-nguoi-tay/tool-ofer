# AutoLeadPC Mac — Chrome và GoLogin

Nút **Tạo profile và mở** dùng các ứng dụng Google Chrome thường từ bản 150 trở lên đã cài trên máy. Mỗi cửa sổ có một số phiên bản đầy đủ khác nhau, một thư mục profile và một proxy riêng; nếu thiếu phiên bản, app báo lỗi trước khi mở. User-Agent theo mẫu Windows và mang đúng số phiên bản đầy đủ của Chrome đang chạy. Nút **Tạo profile GoLogin và mở** trong mục Orbita giữ đường GoLogin khi cần fingerprint riêng.

Giao diện có ba tab: **Thiết lập** chứa token, số cửa sổ, loại proxy, website đích và dữ liệu tự điền; **Proxy** chứa danh sách và công cụ kiểm tra/xuất lịch sử; **Trình duyệt** chứa nút mở/đóng profile cùng mục QA có thể thu gọn.

Khi mở trình duyệt, app lấy IP exit trong profile, thử URL đích và chỉ giữ browser nếu URL tải thành công, không trả HTTP lỗi và không bị chuyển sang đường dẫn khác. Nếu proxy không kết nối, IP đã dùng, hoặc trang đích lỗi/chuyển hướng, app đóng profile và tự thử proxy kế tiếp. App ghi trạng thái `attempting` trước khi bắt đầu và lưu IP ngay khi phát hiện; nếu app bị dừng giữa chừng, proxy vẫn bị đánh dấu đã thử để tránh dùng lại. Nếu dịch vụ xác minh IP trả lỗi hoặc dữ liệu không hợp lệ, app ghi `verification_error`, dừng lượt và tạm tắt tự bù; proxy đó có thể thử lại sau khi dịch vụ hoạt động. Nếu GoLogin API chặn tốc độ hoặc hết quota, app ghi `service_error`, dừng lượt và tạm tắt tự bù; các proxy đó không bị coi là đã dùng vì chưa lấy được IP nào. Bản ghi `failed` cũ chỉ chứa lỗi JSON của GoLogin và không có `exitIp` cũng được mở lại theo cùng quy tắc, còn bản ghi đã có `exitIp` thì vẫn bị loại vì IP đó đã dùng thật. Lịch sử nằm ở `~/Library/Application Support/AutoLeadPC/proxy-usage.json`; bản ghi còn `attempting` sau khi app bị dừng cũng sẽ bị bỏ qua. Khóa lịch sử dựa trên máy chủ và username; IP exit cũng được ghi để tránh dùng trùng IP qua proxy khác. Tab **Proxy** có nút **Tải CSV lịch sử** để xuất các lần thử qua nhiều phiên, không chứa mật khẩu proxy. Nút **Xem IP đã dùng** ở cùng tab hiện bảng các IP exit đã tiêu: IP, proxy đã dùng nó, trạng thái lần cuối, thời điểm và số lần xuất hiện — đúng tập IP mà lượt mở sau sẽ từ chối dùng lại.

Mục **Kịch bản QA form** trong tab **Trình duyệt** mở đúng số profile đặt ở tab **Thiết lập**, rồi chạy kịch bản JSON trên toàn bộ profile của lượt đó. Số cửa sổ phải nằm trong giới hạn đồng thời của app, đủ proxy chưa dùng và đủ fixture riêng cho từng profile; nếu không mở đủ số, app đóng các profile mở dở và không chạy QA. Kịch bản chỉ chạy trong origin khớp website đích. Mỗi bước nhận diện màn theo URL hoặc nội dung, rồi dùng fixture tường minh cho `fill`, radio `answer`, `select` và `click`; trước lượt nhiều profile, app xác nhận mỗi trường có đủ giá trị riêng để không cửa sổ nào lặp dữ liệu. Dùng mảng `values`/`options` có ít nhất một giá trị duy nhất cho từng cửa sổ, hoặc value đơn chứa `{{profileNumber}}` (ví dụ `qa-user-{{profileNumber}}`). Fixture có thể dùng `{{qaRunId}}` và `{{profileNumber}}` để đánh dấu bản ghi test ở backend. Giới hạn là 12 bước và 48 hành động mỗi profile. Báo cáo lượt tự chạy có thời điểm bắt đầu/kết thúc, số profile đạt từng màn, số đáp án và số trường đã điền; JSON tổng hợp được lưu trong `~/Library/Application Support/AutoLeadPC/logs/qa-reports`. Tự bù bị tắt trong lượt đo để giữ ổn định cỡ mẫu. App dừng khi origin đổi, điều kiện màn hình sai hoặc phát hiện CAPTCHA/OTP; ảnh chụp lỗi lưu trong `~/Library/Application Support/AutoLeadPC/logs/qa-captures`. Chỉ dùng tài khoản và dữ liệu QA được phép; app không tự tạo câu trả lời và không vượt challenge bảo vệ.

Nút chính mở Chrome Stable từ `/Applications/Google Chrome.app`, các bản Chrome cũ trong `~/Library/Application Support/AutoLeadPC/chrome-regular-builds` và các kênh Beta, Dev, Canary trong `chrome-channels`. Bản cũ đặt tên `Google Chrome 154.0.8037.98.app` hoặc `Google Chrome Beta 156.0.8078.4.app` theo kênh và phiên bản thực tế. Profile được lưu trong `chrome-profiles`; lịch sử proxy dùng chung với GoLogin. Mỗi proxy được xác minh IP ngay trong Chrome; IP trùng hoặc website lỗi sẽ đóng cửa sổ và thử proxy kế tiếp. SOCKS5 có user/password đi qua relay cục bộ của app. Tự bù và kịch bản QA cũng dùng các bản Chrome này. Kho `chrome-builds` chứa Chrome for Testing đã tải trước, tách khỏi nút chính.

Ô **Dữ liệu tự điền** nhận CSV có hàng tiêu đề hoặc mảng JSON gồm các object cùng cột. Ví dụ CSV: `Họ tên,Địa chỉ,Số điện thoại` ở dòng đầu, các bản ghi ở những dòng tiếp theo. Tên cột được ghép với nhãn, `name`, `id` hoặc placeholder của ô trên form. Khi form hiện trong Chrome ở đúng origin website đích, app chọn ngẫu nhiên một bản ghi cho form đó rồi điền tối đa một lượt vào các ô trống khớp tên cột. Khi form đóng rồi mở lại, app có thể chọn bản ghi mới. App không tự gửi form, không điền trang ở origin khác và không hiện giá trị dữ liệu trong bảng trạng thái. Dữ liệu đã lưu tiếp tục được dùng cho profile tự bù. Mục QA có fixture riêng nên tắt tự điền trong lượt QA. Bảng phân tách bằng tab và các cột email, SSN hoặc thông tin tài khoản/ngân hàng bị từ chối.

Nếu một tab hiển thị `Traffic Blocked!`, app tự động đánh dấu proxy đó bị lỗi, đóng cửa sổ Chrome/GoLogin đó và tự động mở profile/tab khác với proxy và IP mới để thay thế.

Khi người dùng đóng tab cuối cùng của một phiên Chrome bằng dấu X, app cũng kết thúc tiến trình Chrome của phiên đó và cập nhật số cửa sổ đang mở. Phiên đóng theo cách này không được tự bù bằng proxy khác.

Tab **Trình duyệt** hiển thị phiên bản, IP exit đã xác minh và số trường tự điền của từng cửa sổ Chrome đang mở. Để mọi profile mới có sẵn RoboForm, bấm **Cài RoboForm cho profile mới** trong tab **Trình duyệt**. App mở profile mẫu `~/Library/Application Support/AutoLeadPC/chrome-template-profile` bằng bản Chrome thấp nhất trên máy, không qua proxy, tại trang RoboForm trên Chrome Web Store. Cài extension, đăng nhập RoboForm, rồi đóng cửa sổ đó. Mỗi khi app tạo một profile Chrome mới (kể cả tự bù và QA), nó chép profile mẫu sang, trừ khóa tiến trình, cache và phiên tab. Profile đã tạo trước đó không bị thay đổi. Mọi extension cài trong profile mẫu đều được chép, và dòng trạng thái của từng cửa sổ Chrome ghi tên extension có trong profile đó hoặc lý do không có. Khi cửa sổ profile mẫu còn mở, app từ chối tạo profile Chrome mới. Cookie và phiên đăng nhập trong profile mẫu cũng được chép, nên chỉ dùng profile mẫu cho RoboForm. Nếu sau này cài thêm một bản Chrome thấp hơn bản đã mở profile mẫu, profile mới cho bản đó sẽ mở không có RoboForm; muốn khắc phục, xóa thư mục profile mẫu rồi cài lại.

Mục **Tải các bản Orbita cho chế độ nhiều phiên bản** phục vụ nút GoLogin riêng. App tải các bản Orbita vào `~/.gologin/browser`, gán mỗi slot một binary và đặt User-Agent của profile khớp major của Orbita trước khi mở. Lịch sử proxy, xác minh IP, tự bù và Đóng tất cả dùng chung với Chrome. Nếu thiếu bản Orbita, app cảnh báo hoặc để GoLogin tự chọn như trước.

Nút **Nạp mẫu form DemoQA** đặt website đích thành `https://demoqa.com/automation-practice-form`, chọn một profile và dùng dữ liệu tổng hợp cố định để hoàn tất form thực hành. Mẫu để trống ảnh, chỉ chạy đúng origin/path đó và kiểm tra bảng kết quả sau khi gửi.

## Cách dùng

1. Nhập số cửa sổ và website ở tab **Thiết lập**, dán danh sách proxy ở tab **Proxy**. GoLogin API token chỉ cần khi dùng nút GoLogin.
2. Bấm **Tạo profile và mở** để mở các ứng dụng Google Chrome thường đã cài. Các bản Chrome for Testing trong kho riêng không được nút này sử dụng.
3. Dùng **Xem IP đã dùng** để xem lịch sử, **Tự bù** để bù cửa sổ đóng, hoặc **Đóng tất cả** để dừng lượt.
4. Khi cần GoLogin, nhập token và bấm **Tạo profile GoLogin và mở** trong mục Orbita.

Token, proxy (kể cả user/password), URL, số cửa sổ và dữ liệu tự điền được lưu trong SQLite cục bộ `~/Library/Application Support/AutoLeadPC/preferences.sqlite` khi bấm **Lưu cấu hình**. Database này không mã hóa; chỉ đưa vào dữ liệu mà bạn muốn lưu trên máy này.

Ánh xạ GoLogin profile nằm tại `~/Library/Application Support/AutoLeadPC/profiles.json`. Khóa proxy được băm; file chỉ chứa khóa băm và profile ID. Hai dòng proxy giống hệt nhau vẫn được gán profile riêng theo thứ tự xuất hiện. Khóa chỉ băm `host:port` và username, không băm password, vì nhiều provider xoay password theo phiên. Ánh xạ không dùng quá 90 ngày sẽ bị bỏ khỏi file; profile tương ứng vẫn còn trong tài khoản GoLogin nên muốn dọn hẳn thì phải xóa trong GoLogin.

## Chạy từ mã nguồn

Yêu cầu Node.js 20 trở lên.

```sh
npm install
npm start
```

## Chạy test QA

Chạy `npm test` để chạy self-check, test form DemoQA trên fixture cục bộ và test bộ cài các phiên bản Chrome. Test cấu hình không mở browser hay gửi request ra Internet. Nếu máy chưa có Chromium cho Playwright, cài bằng `npx playwright install chromium`.

## Giới hạn

- GoLogin API token cần có quyền truy cập các profile và API theo gói tài khoản.
- App tạo profile mới trên lần đầu cho từng dòng proxy; profile vẫn còn trong tài khoản GoLogin sau khi đóng browser và được tái sử dụng ở lần sau.
- Hỗ trợ `host:port`, `host:port|user|pass`, và `socks5://user:pass@host:port`.
- Nếu profile đã lưu bị xóa trong GoLogin, app tự tạo profile mới cho dòng proxy đó ở lần chạy sau.
- App giới hạn tối đa 6 cửa sổ Chrome cùng lúc, mỗi profile dùng một proxy riêng. `AUTOLEADPC_CONCURRENCY` điều chỉnh số lượt khởi chạy song song; `AUTOLEADPC_MAX_ALIVE` chỉ có thể hạ giới hạn 6.
- Tự bù bật mặc định: khi một profile đang mở bị đóng, app dùng proxy chưa thử để bù slot. Nút **Tự bù** bật/tắt cơ chế; **Đóng tất cả** tắt cơ chế và xóa cấu hình phiên khỏi bộ nhớ. App cần còn chạy; profile thay thế đã bắt đầu tạo có thể hoàn tất sau khi tắt tự bù.
- Khi bật nhiều phiên bản Orbita, chuỗi User-Agent vẫn do fingerprint của profile GoLogin quyết định, không đổi theo binary. Nếu major của UA khác major của engine thì `Sec-CH-UA` sẽ không khớp `User-Agent`, và GoLogin cũng tính `securedOrbitaVersion` theo major của UA chứ không theo binary đang chạy. Muốn fingerprint nhất quán thì đặt User-Agent của từng profile trong GoLogin cho khớp major của bản Orbita gán cho slot đó.
- Mười bản Orbita chiếm khoảng 4,1 GB trong `~/.gologin/browser`. App không tự xóa bản đã tải; bản do GoLogin tải trước đây cũng được dùng lại chứ không tải trùng.
- GoLogin giữ bộ cài Orbita khoảng vài trăm MB trong `~/.gologin` để không phải tải lại. App không xóa cache này tự động. GoLogin xóa dữ liệu profile tạm khi profile dừng bình thường; interaction logs do app tạo sẽ bị xóa khi bấm **Đóng tất cả**.
- Danh sách proxy chỉ được phân tích tới dòng thứ N theo số cửa sổ yêu cầu, nên dòng sai nằm dưới mức đó không chặn lệnh mở.

## Nhật ký thao tác

Mỗi profile tạo một file JSONL trong `~/Library/Application Support/AutoLeadPC/logs/`. Log ghi điều hướng, tab, click, phím bấm, thay đổi form và vị trí con trỏ (lấy mẫu tối đa 10 lần/giây), chỉ trong khung chính — thao tác trong iframe (thanh toán, captcha) không được ghi. Giá trị các trường nhập và lựa chọn trong `<select>` không được ghi. URL và tên/nhãn/`id` phần tử có thể xuất hiện; riêng nội dung văn bản chỉ lấy với phần tử tương tác (link, nút) và tối đa 40 ký tự. JS của trang không thể bơm dữ liệu tùy ý vào log (chỉ nhận các loại sự kiện đã biết), và mỗi file log bị chặn ở 20 MB. Nút **Đóng tất cả trình duyệt** chỉ xóa các file log do lần chạy hiện tại của app tạo ra; log của lần chạy trước và của tiến trình khác được giữ nguyên.
- Mỗi profile chỉ nên chạy một phiên tại một thời điểm.
