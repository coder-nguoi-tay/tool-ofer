# Test cases thủ công

Chạy `npm test` để chạy self-check và test bộ cài các phiên bản Chrome. Các ca dưới đây chạy tay trên app.

## Nút Tạo profile và mở bằng Chrome thật

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

## Danh sách IP đã dùng

| ID | Thao tác | Kết quả mong đợi |
|---|---|---|
| IP-01 | Tab **Proxy** → **Xem IP đã dùng** | Bảng hiện mỗi IP exit một dòng, mới nhất trước, kèm proxy, trạng thái, thời điểm và số lần; dòng trạng thái ghi tổng số IP. |
| IP-02 | Mở thêm một profile thành công rồi bấm lại | IP mới xuất hiện ở đầu bảng. |
| IP-03 | Hai proxy khác nhau cùng trả một IP | Bảng chỉ một dòng cho IP đó, cột Số lần là 2, cột Proxy là proxy dùng gần nhất. |

## Mỗi profile GoLogin một phiên bản Orbita khác nhau

Cần GoLogin token, đủ proxy chưa dùng và các bản Orbita đã tải.

| ID | Thao tác | Kết quả mong đợi |
|---|---|---|
| OV-01 | Đặt số bản Orbita là 10, bấm **Tải các bản Orbita thật** | App dò CDN GoLogin từ Chrome Stable đi xuống, tải các major còn phát hành vào `~/.gologin/browser`; bản GoLogin đã có sẵn không bị tải lại; lần bấm thứ hai báo không cần tải thêm. |
| OV-02 | Nhập GoLogin token, số cửa sổ 10, bấm **Tạo profile GoLogin và mở** | 10 profile mở song song, mỗi dòng kết quả ghi `[Orbita <major>]` khác nhau nếu đã tải đủ bản. |
| OV-03 | Số cửa sổ nhiều hơn số bản Orbita đã tải | Các bản được dùng lại theo vòng, mọi cửa sổ vẫn có nhãn `[Orbita ...]`, kèm cảnh báo nên tải thêm; không profile nào bị chặn. |
| OV-04 | Đóng tay một cửa sổ khi tự bù đang bật | Profile thay thế vào đúng slot đó và dùng lại đúng bản Orbita của slot, kể cả khi lượt bù chạy sau nhiều phút. |
| OV-05 | Đổi tên thư mục `~/.gologin/browser` sang chỗ khác rồi mở lại | App cảnh báo chưa có bản Orbita nào và để GoLogin tự chọn engine; không có nhãn `[Orbita ...]`; không lỗi. |
