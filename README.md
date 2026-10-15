# AutoLeadPC Mac — Chrome

Nút **Tạo profile và mở** dùng các ứng dụng Google Chrome đã cài trên máy. Mỗi cửa sổ có phiên bản, thư mục profile và proxy riêng; nếu thiếu phiên bản, app báo lỗi trước khi mở. User-Agent dùng mẫu Windows và số phiên bản đầy đủ của Chrome đang chạy.

Giao diện có ba tab: **Thiết lập** chứa số cửa sổ, loại proxy, website đích và dữ liệu tự điền; **Proxy** chứa danh sách và công cụ kiểm tra/xuất lịch sử; **Trình duyệt** chứa nút mở/đóng profile cùng mục QA có thể thu gọn.

Khi mở trình duyệt, app xác minh IP exit và kiểm tra trang đích. App lưu trạng thái của từng proxy trong lịch sử để tránh dùng lại; nếu dịch vụ xác minh IP lỗi, lượt mở và tự bù tạm dừng. Lịch sử nằm trong dữ liệu AutoLeadPC, có thể xuất CSV ở tab Proxy và xem danh sách IP đã dùng.

Mục **Kịch bản QA form** trong tab **Trình duyệt** mở đúng số profile đặt ở tab **Thiết lập**, rồi chạy kịch bản JSON trên toàn bộ profile của lượt đó. Số cửa sổ phải nằm trong giới hạn đồng thời của app, đủ proxy chưa dùng và đủ fixture riêng cho từng profile; nếu không mở đủ số, app đóng các profile mở dở và không chạy QA. Kịch bản chỉ chạy trong origin khớp website đích. Mỗi bước nhận diện màn theo URL hoặc nội dung, rồi dùng fixture tường minh cho `fill`, radio `answer`, `select` và `click`; trước lượt nhiều profile, app xác nhận mỗi trường có đủ giá trị riêng để không cửa sổ nào lặp dữ liệu. Dùng mảng `values`/`options` có ít nhất một giá trị duy nhất cho từng cửa sổ, hoặc value đơn chứa `{{profileNumber}}` (ví dụ `qa-user-{{profileNumber}}`). Fixture có thể dùng `{{qaRunId}}` và `{{profileNumber}}` để đánh dấu bản ghi test ở backend. Giới hạn là 12 bước và 48 hành động mỗi profile. Báo cáo lượt tự chạy có thời điểm bắt đầu/kết thúc, số profile đạt từng màn, số đáp án và số trường đã điền; JSON tổng hợp được lưu trong `~/Library/Application Support/AutoLeadPC/logs/qa-reports`. Tự bù bị tắt trong lượt đo để giữ ổn định cỡ mẫu. App dừng khi origin đổi, điều kiện màn hình sai hoặc phát hiện CAPTCHA/OTP; ảnh chụp lỗi lưu trong `~/Library/Application Support/AutoLeadPC/logs/qa-captures`. Chỉ dùng tài khoản và dữ liệu QA được phép; app không tự tạo câu trả lời và không vượt challenge bảo vệ.

Nút chính mở Chrome Stable từ `/Applications/Google Chrome.app`, các bản Chrome cũ trong `~/Library/Application Support/AutoLeadPC/chrome-regular-builds` và các kênh Beta, Dev, Canary trong `chrome-channels`. Bản cũ đặt tên `Google Chrome 154.0.8037.98.app` hoặc `Google Chrome Beta 156.0.8078.4.app` theo kênh và phiên bản thực tế. Profile được lưu trong `chrome-profiles`; lịch sử proxy được lưu trong dữ liệu AutoLeadPC. Mỗi proxy được xác minh IP ngay trong Chrome; IP trùng hoặc website lỗi sẽ đóng cửa sổ và thử proxy kế tiếp. SOCKS5 có user/password đi qua relay cục bộ của app. Tự bù và kịch bản QA cũng dùng các bản Chrome này. Kho `chrome-builds` chứa Chrome for Testing đã tải trước, tách khỏi nút chính.

Ô **Dữ liệu tự điền** nhận CSV có hàng tiêu đề hoặc mảng JSON gồm các object. Ví dụ CSV: `Họ tên,Địa chỉ,Số điện thoại` ở dòng đầu, các bản ghi ở những dòng tiếp theo; hoặc JSON chứa các trường lead (`Full Name`, `Address`, `City`, `State`, `Zipcode`, `Phonenumber`, `Năm Sinh`, `SSN`, `Routing`, `Name bank`, `Number`...). App tự động đối sánh thông minh tên trường (Anh - Việt, tên gộp hoặc tách rời First/Last Name, Month/Day/Year, Area/Prefix/Line, SSN1-3...), hỗ trợ form nằm trong iframe và các trang chuyển hướng. App tự phục hồi nếu chuỗi JSON bị cắt cụt đuôi. Dữ liệu đã lưu tiếp tục được dùng cho profile tự bù.

Nếu một tab hiển thị `Traffic Blocked!`, app tự động đánh dấu proxy đó bị lỗi, đóng cửa sổ Chrome đó và tự động mở profile/tab khác với proxy và IP mới để thay thế.

Khi người dùng đóng tab cuối cùng của một phiên Chrome bằng dấu X, app cũng kết thúc tiến trình Chrome của phiên đó và cập nhật số cửa sổ đang mở. Phiên đóng theo cách này không được tự bù bằng proxy khác.

Tab **Trình duyệt** hiển thị phiên bản, IP exit đã xác minh và số trường tự điền của từng cửa sổ Chrome đang mở. Để mọi profile mới có sẵn RoboForm, bấm **Cài RoboForm cho profile mới** trong tab **Trình duyệt**. App mở profile mẫu `~/Library/Application Support/AutoLeadPC/chrome-template-profile` bằng bản Chrome thấp nhất trên máy, không qua proxy, tại trang RoboForm trên Chrome Web Store. Cài extension, đăng nhập RoboForm, rồi đóng cửa sổ đó. Mỗi khi app tạo một profile Chrome mới (kể cả tự bù và QA), nó chép profile mẫu sang, trừ khóa tiến trình, cache và phiên tab. Profile đã tạo trước đó không bị thay đổi. Mọi extension cài trong profile mẫu đều được chép, và dòng trạng thái của từng cửa sổ Chrome ghi tên extension có trong profile đó hoặc lý do không có. Khi cửa sổ profile mẫu còn mở, app từ chối tạo profile Chrome mới. Cookie và phiên đăng nhập trong profile mẫu cũng được chép, nên chỉ dùng profile mẫu cho RoboForm. Nếu sau này cài thêm một bản Chrome thấp hơn bản đã mở profile mẫu, profile mới cho bản đó sẽ mở không có RoboForm; muốn khắc phục, xóa thư mục profile mẫu rồi cài lại.


Nút **Nạp mẫu form DemoQA** đặt website đích thành `https://demoqa.com/automation-practice-form`, chọn một profile và dùng dữ liệu tổng hợp cố định để hoàn tất form thực hành. Mẫu để trống ảnh, chỉ chạy đúng origin/path đó và kiểm tra bảng kết quả sau khi gửi.

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

## Chạy test QA

Chạy `npm test` để chạy self-check, test form DemoQA trên fixture cục bộ và test bộ cài các phiên bản Chrome. Test cấu hình không mở browser hay gửi request ra Internet. Nếu máy chưa có Chromium cho Playwright, cài bằng `npx playwright install chromium`.

## Giới hạn

- Hỗ trợ `host:port`, `host:port|user|pass`, và `socks5://user:pass@host:port`.
- App giới hạn tối đa 6 cửa sổ Chrome cùng lúc, mỗi profile dùng một proxy riêng. `AUTOLEADPC_CONCURRENCY` điều chỉnh số lượt khởi chạy song song; `AUTOLEADPC_MAX_ALIVE` chỉ có thể hạ giới hạn 6.
- Tự bù bật mặc định: khi một profile đang mở bị đóng, app dùng proxy chưa thử để bù slot. Nút **Tự bù** bật/tắt cơ chế; **Đóng tất cả** tắt cơ chế và xóa cấu hình phiên khỏi bộ nhớ. App cần còn chạy; profile thay thế đã bắt đầu tạo có thể hoàn tất sau khi tắt tự bù.
- Danh sách proxy chỉ được phân tích tới dòng thứ N theo số cửa sổ yêu cầu, nên dòng sai nằm dưới mức đó không chặn lệnh mở.

## Báo cáo QA

App chỉ lưu báo cáo QA và ảnh chụp lỗi trong thư mục logs của AutoLeadPC; app không tạo interaction log theo từng trình duyệt.
