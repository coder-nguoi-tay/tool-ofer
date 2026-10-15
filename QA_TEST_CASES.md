# Test cases: QA form DemoQA

## Chạy tự động

Từ thư mục `AutoLeadPC-mac`, chạy:

```sh
npm test
```

`demoqa.test.mjs` dùng Chromium và fixture HTML cục bộ; toàn bộ request của trang giả lập được chặn khỏi Internet.

| ID | Nội dung | Kết quả mong đợi |
|---|---|---|
| DQA-01 | Bấm nút nạp preset trong giao diện | URL DemoQA, một profile, bật tự chạy QA và nạp đúng plan. |
| DQA-02 | Điền và gửi form giả lập | Các trường/tuỳ chọn được thao tác; dữ liệu tổng hợp và thông báo thành công khớp; bộ đếm là 9 trường, 2 câu trả lời. |
| DQA-03 | Chạy helper với host hoặc path khác | Bị từ chối trước khi thao tác form. |
| DQA-04 | Phân tích plan và số profile | Chỉ chấp nhận origin/path DemoQA; preset bị chặn nếu số profile khác 1, trước khi mở profile. |
| DQA-05 | Hiển thị OTP/xác minh người dùng | Bộ nhận diện trả về challenge để lượt QA dừng. |

Để mở đúng website công khai và gửi một lần dữ liệu tổng hợp, chạy riêng `npm run test:demoqa-live`. Test này không nằm trong `npm test`; nó cần mạng và có thể tạo bản ghi trên trang demo. Test tự dừng nếu phát hiện CAPTCHA/OTP.

Lần chạy trực tiếp gần nhất (2026-10-11) đạt: form được gửi và DemoQA hiển thị thông báo xác nhận.

### Nút Tạo profile và mở bằng Chrome thật

`chrome-versions.test.mjs` kiểm dải major và việc chọn patch mới nhất từ đúng kho của Google. Các bước dưới đây cần tải thật từ mạng.

| ID | Thao tác | Kết quả mong đợi |
|---|---|---|
| CV-01 | Đặt số phiên bản 10, bấm **Tải các bản Chrome thật** | Tải 10 major liền nhau dưới bản Stable mới nhất, mỗi version một thư mục trong `chrome-builds`; lần bấm thứ hai báo không cần tải thêm. |
| CV-02 | Số cửa sổ 4, 4 proxy mới, bấm **Tạo profile và mở** | App mở tối đa 4 cửa sổ Chrome thường, mỗi cửa sổ dùng một phiên bản đầy đủ và IP thoát khác nhau. |
| CV-03 | Gửi yêu cầu mở 5 cửa sổ qua API | App báo giới hạn 4 cửa sổ trước khi mở trình duyệt. |
| CV-04 | Trong một cửa sổ, mở `chrome://version` | Version khớp nhãn ở dòng kết quả; `navigator.userAgent` cùng major, không cần đồng bộ UA. |
| CV-05 | Đăng nhập một site ở một cửa sổ rồi xem cửa sổ khác trong cùng lượt | Cửa sổ khác không có cookie hay phiên đăng nhập đó; profile Chrome được tách theo proxy. |
| CV-06 | Bỏ trống danh sách proxy rồi mở | App yêu cầu nhập proxy; không mở cửa sổ hoặc ghi lịch sử mới. |
| CV-07 | Dùng proxy trả IP đã có trong **Xem IP đã dùng** | Cửa sổ đó đóng; lịch sử ghi IP và app thử proxy kế tiếp. |
| CV-08 | Dùng SOCKS5 có user/password | Chrome đi qua relay local, trang đích hiện IP proxy; **Đóng tất cả** đóng cả cửa sổ và relay. |

### Danh sách IP đã dùng

| ID | Thao tác | Kết quả mong đợi |
|---|---|---|
| IP-01 | Tab **Proxy** → **Xem IP đã dùng** | Bảng hiện mỗi IP exit một dòng, mới nhất trước, kèm proxy, trạng thái, thời điểm và số lần; dòng trạng thái ghi tổng số IP. |
| IP-02 | Mở thêm một profile thành công rồi bấm lại | IP mới xuất hiện ở đầu bảng. |
| IP-03 | Hai proxy khác nhau cùng trả một IP | Bảng chỉ một dòng cho IP đó, cột Số lần là 2, cột Proxy là proxy dùng gần nhất. |

## Chạy thủ công trên app

Các ca này dùng trang demo công khai và dữ liệu tổng hợp cố định của app. Chỉ chạy trên trang demo, không thay URL sang website production.

| ID | Thao tác | Kết quả mong đợi |
|---|---|---|
| DQA-M01 | Mở app, vào **Trình duyệt** → **Nạp mẫu form DemoQA** | URL là `https://demoqa.com/automation-practice-form`; số cửa sổ là 1; plan QA được nạp. |
| DQA-M02 | Chuẩn bị Chrome và một proxy chưa dùng, xác nhận chưa có profile mở; bấm **Mở đủ cửa sổ và chạy QA** rồi xác nhận hộp thoại | Một profile mở; form được điền; kết quả có “Thanks for submitting the form”; báo cáo QA được lưu trong `~/Library/Application Support/AutoLeadPC/logs/qa-reports`. |
| DQA-M03 | Nạp preset, đổi số cửa sổ thành 2, bấm chạy và xác nhận | App báo preset chỉ chạy một profile; không mở thêm cửa sổ Chrome. |
| DQA-M04 | Nạp preset rồi đổi website đích sang origin khác, bấm chạy | App báo origin trong plan không khớp website đích; không gửi yêu cầu mở profile. |

Nếu DQA-M02 thất bại, giữ lại nội dung trạng thái và báo cáo QA để biết selector nào không còn khớp. Test tự động hiện kiểm tra hợp đồng selector trên fixture; nó không xác nhận DOM trực tiếp của DemoQA đang hoạt động.
