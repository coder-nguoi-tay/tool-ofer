# Cứu kẹt tải iframe Adsmith trên FinancialHelpFinder

Cập nhật ngày 2026-11-19 cho trình duyệt chạy trên máy.

## Kết quả tối ưu

Phân biệt ba lỗi tải và ưu tiên phục hồi này trước autofill, AI hoặc các watchdog F5 khác. Chỉ thao tác trên trang cha FinancialHelpFinder và iframe `#AS_SURVEY iframe#AS_IFRAME`; không dùng lỗi của iframe tracking để kết luận khảo sát hỏng.

| Trạng thái | Bằng chứng | Chờ liên tục | Hành động |
| --- | --- | --- | --- |
| `spinner_stuck` | `#AS_SURVEY` hiển thị, có `load-spin-02.svg`, chưa tạo iframe | 25 giây | GET lại URL trang cha |
| `frame_blank` | Iframe mục tiêu đã có nhưng document chưa có câu hỏi, control, nội dung hoặc ảnh thực sự hiển thị | 20 giây | GET lại URL trang cha |
| `chrome_error` | Chính frame mục tiêu có URL `chrome-error:` hoặc `about:neterror` | 4 giây | GET lại URL trang cha |
| `normal` | Có công việc hoặc nội dung hợp lệ, kể cả màn hoàn tất không có `.Qst` | Không phục hồi | Tiếp tục luồng cũ |
| `unavailable` | DOM đang điều hướng/không đọc được; chưa có bằng chứng trắng | Chờ quan sát lại | Không suy đoán frame chết |
| Hết lượt | Cùng URL đã phục hồi 5 lần và vẫn lỗi sau thời gian chờ lượt cuối | Không F5 thêm | Ghi `iframe_load_exhausted`, giữ browser |

Các mốc trong bảng tính từ khi quan sát thấy lỗi liên tục trong cùng một tài liệu. Khi trang còn chờ dữ liệu, app giữ tab. Request định kỳ đến cùng một endpoint không đặt lại cả khoảng chờ sau mỗi phản hồi. Request đã hủy của trang trước không giữ trang mới ở trạng thái đang tải.

Trước khi tải lại riêng iframe, app kiểm tra tài liệu cha, URL và nội dung hiện tại của tài liệu con. Nếu iframe đã tự chuyển bước hoặc vừa hiển thị ô nhập, app giữ nguyên nội dung đó. Với popup `about:blank`, app đọc cả iframe con trước khi quyết định đóng tab.

Trần năm lần tải lại trang cha áp dụng cho từng URL trên cùng tab, kể cả khi phiên đã xác nhận lead. Bộ đếm được giữ qua reload, đổi hash và quay lại URL cũ. Khi đạt trần, app ghi lý do dừng và giữ phiên để kiểm tra.

## Các điểm sửa so với bản đề xuất

1. **Không tìm frame chỉ bằng URL Adsmith.** Khi mới tạo, URL có thể là `about:blank`. Lấy `contentFrame()` từ đúng element để nhận diện cả blank và Chrome error.
2. **Không dùng `.Survey`/`.Qst` làm điều kiện duy nhất.** `.Survey` rỗng vẫn có thể đang tải; ngược lại màn hoàn tất có thể không còn câu hỏi. Kiểm tra nội dung/control thực sự hiển thị, bỏ trạng thái loading đơn giản.
3. **Không coi lỗi đọc DOM là blank.** Tái sử dụng `readEvidenceWithTimeout`: giới hạn chờ 3 giây, không phát lặp lệnh vào renderer còn treo. Nếu đã biết đây là placement Adsmith nhưng chưa đọc được document thì giữ quyền chờ, không nhường AI đoán control.
4. **Không F5 khi form chính còn thao tác được.** Nếu có input/nút chính ngoài vùng khảo sát thì ưu tiên hoàn thành luồng đó. Header/footer/sidebar không được xem là form chính.
5. **GET lại URL thay vì gửi lại POST.** Phục hồi document trang cha theo cách điều hướng GET đang dùng trong dự án; không gọi submit, không chấp nhận gửi lại dữ liệu form. Không xóa cookie/localStorage của phiên.
6. **Không cộng dồn hai bộ cứu kẹt.** Trong lúc chờ Adsmith, phục hồi hoặc hết lượt, handler trả quyền sở hữu tab cho watcher; bỏ qua `recoverEmptyProgress`, `reloadStuckPage` và AI ở lượt đó.
7. **Không F5 dồn sau tạm dừng.** Đổi loại lỗi, có document trang cha mới, tạm mất DOM hoặc bỏ quan sát quá 15 giây đều chờ lại. Bộ đếm F5 vẫn giữ nguyên. `performance.timeOrigin` giúp nhận ra reload thủ công cùng URL.
8. **Không F5 chồng nhau.** Khóa theo tab được đặt trước await. Mỗi lần GET thất bại cũng tiêu một lượt, sau đó chờ đủ thời gian trước lượt kế tiếp.

## Bốn mắt xích được giám sát

Trang cha khởi tạo placement → Usertrue xác minh và gọi callback → tạo iframe/điều hướng tới Adsmith → script khảo sát dựng nội dung và câu hỏi. Lỗi mạng/proxy có thể làm gián đoạn bất kỳ mắt xích nào; khung trắng không đủ để khẳng định proxy đã chết.

## Điểm tích hợp

- `src/autofill/adsmith/inspect-frame-loading.mjs`: nhận diện trạng thái, giới hạn host và đúng iframe.
- `src/autofill/adsmith/recover-frame-loading.mjs`: đồng hồ, khóa thao tác và budget tối đa năm lượt theo URL.
- `src/autofill/attach-autofill-page-watcher.mjs`: gọi sau kiểm tra challenge, trước lượt autofill/AI và các luồng cứu kẹt cũ.
- `src/logging/attach-session-lifecycle-logger.mjs`: giữ ba loại log phục hồi ngay trong chế độ log tối giản.

Giữ các guard manual/skip/consent-only, chờ lead, dừng sau lead, AI/agent đang xử lý và phục hồi lỗi đang chạy. IP có lead không bị mất/xóa; khi bật dừng sau lead thì không tự tải lại.

## Log

- `adsmith_loading_timeout_reload`: trạng thái và lượt phục hồi `/5`.
- `adsmith_loading_reload_failed`: GET chưa hoàn tất; giữ phiên và chờ lại.
- `iframe_load_exhausted`: cảnh báo một lần cho URL đã hết lượt; không kích hoạt F5/AI khác để lách trần.

Không ghi query chứa dữ liệu form trong các thông báo này.

## Kiểm thử và giới hạn

`tests/adsmith-frame-loading.test.mjs` kiểm tra ngưỡng thời gian bằng đồng hồ ngoài, mạng tự hồi phục, chuyển giai đoạn, DOM tạm mất, reload thủ công, giữ budget qua hash/quay lại URL cũ, GET thất bại, chạy đồng thời và bảo vệ lead/AI. Chromium offline kiểm tra spinner, about:blank, Survey rỗng, câu hỏi, nội dung hoàn tất, form chính và tích hợp watcher.

Các test không dùng proxy thật và không gửi lead. Renderer không đọc được hoặc loader không có dấu hiệu nhận diện rõ được giữ là chưa xác định; không kết luận lỗi mạng để F5 bằng suy đoán.

Kết quả kiểm tra: toàn bộ suite **819/819 đạt**; bộ kiểm tra riêng Adsmith và HTML input **11/11 đạt**, gồm iframe Chrome error thật do chặn request trong Chromium offline và iframe tracking lỗi không liên quan. Thời gian chờ tính từ lần đầu quan sát lỗi, thực thi ở lượt quét kế tiếp; không phải hạn phản hồi cứng kể từ lúc mở browser.
