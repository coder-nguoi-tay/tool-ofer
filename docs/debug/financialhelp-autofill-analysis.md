# Phân tích FinancialHelpFinder và hàng đợi AI

Nguồn phân tích: hai file `autoleadpc-slot-1-frame-0.html` và `autoleadpc-slot-1-frame-1.html` người dùng xuất ngày 12/11/2026. Không sao chép HTML, dữ liệu điền hoặc token thật vào repository.

## Cấu trúc thu được

- Frame 0 là trang bao, có `form#AS_LOAD_FORM` với trường ẩn và `iframe#AS_IFRAME` tới Adsmith. Phần nhập liệu không nằm trực tiếp trong trang cha.
- Frame 1 có `form#reg-data`, gồm các vùng `sign_up_step1`, `sign_up_step2`, `sign_up_step3`, `sign_up_step4`, `sign_up_step4a`, `sign_up_step5`, `sign_up_step6`.
- Các bước tương ứng tên/xưng hô, ngày sinh, các nhóm Yes/No, địa chỉ/zip, email/điện thoại.
- Nút `Start Your Search`, các nút `Continue` và `Find Your Grants` đều có `type=button`, class `sign_up_btn`, gọi `nextFormWithValidation`, `nextForm` hoặc `formSubmit`.
- Frame 1 còn chứa iframe Twyne và các iframe theo dõi. HTML của các iframe này không nằm trong hai file đã gửi.

## Điểm đã sửa

1. Scope trước đây lấy cả `form#reg-data`, chưa tách nhóm `sign_up_step*`. Khi CSS chưa tải hoặc nhiều bước còn thấy, nút Continue của bước sau có thể chiếm ưu tiên trước `Start Your Search`. Scope mới giữ từng bước đang thấy; các bước cùng form không bị đánh dấu deferred như form phụ.
2. Bộ tìm nút scoped nhận thêm kiểu class `sign_up_btn`/id `sign_upbtn`, vẫn giữ kiểm tra visibility/disabled/busy và không mượn nút trang cha.
3. Hàng đợi AI trước đây tranh chỗ theo nhịp poll. Nay dùng một hàng đợi chung: IP đã xác nhận lead trước, FIFO trong mỗi nhóm; trạng thái vừa có lead được nâng ưu tiên ngay. Không hủy lượt AI đang thực hiện, giữ trần bốn lượt.
4. Nhánh AI sửa form trước đây bỏ qua AI khi đủ bốn chỗ. Nay SDK/CLI cùng đặt chỗ qua hàng đợi; chờ hết 15 giây thì nhả khóa, không mất lượt retry hoặc giảm nhầm bộ đếm.
5. Phiên có lead vẫn thử thư viện/record trước; nếu kẹt được xét AI sớm hơn. Khi mới có lead có một lần mở lại trạng thái AI đã bị khóa sau thất bại, không lặp vô hạn trên giao diện không đổi.
6. Mốc chờ AI nêu vị trí, mức ưu tiên và số lượt đang sử dụng. Hết hạn hàng hoặc trang đổi có thông báo riêng. Dropdown không khớp record chỉ ghi lại khi trạng thái liên quan thay đổi.

## Giới hạn bằng chứng

Hai HTML không chứa CSS và JavaScript tương đối của website, nên không thể kết luận chỉ từ file rằng mọi bước đều đang hiển thị trên trang thật. Fixture kiểm tra cả trường hợp CSS ẩn đúng và trường hợp nhiều bước hiện cùng lúc; không tải website/tracker thật.

Log đã ghi `select_value_unmatched` ở `cq2`. Hai file này không có dropdown `cq2`; có thể cần HTML của iframe Twyne chứa câu hỏi đó để đối chiếu option và record. Không tự gán một đáp án không có trong dữ liệu chỉ để vượt validation.

## Điều kiện hoàn tất mới

Riêng HTTPS `financialhelpfinder.com/thankyou.php` (kể cả www và query), browser được đóng khi các tab đã ổn định và không còn form/câu hỏi/challenge, offerwall chưa mở, AI hoặc popup đang xử lý. Phiên vừa có thao tác vẫn được giữ theo cửa sổ bảo vệ hoạt động hiện có. Đây là ngoại lệ hoàn tất được người dùng yêu cầu cho cả IP có lead; lỗi mạng/HTTP vẫn giữ và phục hồi bằng Back. Renderer không đọc được hoặc tab mới đang tải thì giữ browser.
