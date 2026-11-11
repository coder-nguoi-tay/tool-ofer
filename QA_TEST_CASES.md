# Test cases thủ công

Chạy `npm test` để chạy self-check và test bộ cài các phiên bản Chrome. Các ca dưới đây chạy tay trên app.

## Nút Tạo profile và mở bằng Chrome thật

`tests/chrome-versions.test.mjs` kiểm dải major và việc chọn patch mới nhất từ đúng kho của Google. Các bước dưới đây cần tải thật từ mạng.

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
| TB-01 | Trang hiển thị thông báo "Traffic Blocked!" | App tự động đóng tab đó, đánh dấu proxy bị lỗi trong lịch sử và tự động mở IP khác thay thế. |
| AF-01 | Form đích có chứa các trường lead (Full Name, Address, City, State, Zip, Phone, SSN, Bank...) | Tự động điền đầy đủ và chính xác vào form, bao gồm cả form trong iframe và form trên trang chuyển hướng. |

## Khảo sát ẩn và AI thử lại (1.3.2 build 8)

| ID | Thao tác | Kết quả mong đợi |
|---|---|---|
| AI-UI-01 | Bước cũ có input ID số, radio/Continue bị ẩn bởi tổ tiên | AI chỉ nhận control hiển thị; không click bước ẩn hoặc báo sai ID số là không tồn tại. |
| AI-UI-02 | Câu hỏi Twy có 11 checkbox chung ID, chưa có Continue | Nhận diện cùng một nhóm, chọn có chừng mực; giữ đáp án đã chọn; chờ khi không còn thao tác hợp lệ. |
| AI-UI-03 | AI thử nhưng trạng thái không đổi; watchdog tiếp tục quét | Không tự gọi lại AI vô hạn. Giao diện thay đổi hoặc gọi AI thủ công mới mở lượt thử lại. Tab khác không bị khóa theo. |
| AI-UI-04 | Alpha/MUI đang fade-out, đáp án ngoài form vẫn hiển thị | Không ép opacity/visibility/pointer-events; chỉ chọn đáp án trong form sau khi widget hiển thị. |
| AI-UI-05 | Form đang làm việc nằm trong iframe; click bị chặn hoặc disabled | Tìm đúng frame; không cộng tiến độ cho click thất bại hoặc DOM-click cưỡng ép. |

## Đối chiếu kế hoạch và log — 1.3.3 build 9 (2026-11-11)

Đã đọc 3 nhật ký `manual-ops` gần nhất tại thời điểm kiểm tra: `e7c1c3ae` (134 sự kiện), `1e435b15` (212), `82d10f92` (114). Chỉ lấy cấu trúc control và thao tác để dựng fixture; không chép dữ liệu người dùng, proxy hoặc URL chứa query vào test.

| Nhóm thao tác/tiêu chí | Thực thi và kiểm chứng |
|---|---|
| Danh xưng title_select, DOB, Continue →, YES — Request My Review | `tests/fixtures/recorded-answer-steps.html`, `tests/manual-answer-regression.test.mjs`: chạy hai bước thật qua autofill. |
| Radio Yes/No Twy, custom dropdown cq1, Continue của campaign | `tests/twy-scoped-survey.test.mjs`; handler không click radio/Continue ẩn và chỉ ghi trả lời khi verified. |
| Radio tmgControl$10822$0 và select F_10822_81593 | Regression cục bộ: selector thuộc tính giữ dấu $, chọn radio thật rồi điền select phụ hiện ra. |
| Link Continue/No, các click Cancel và Privacy | Forward fallback loại Cancel/Back/Skip/Privacy; lựa chọn No do survey handler xử lý, không coi là submit mặc định. |
| Click chữ tiến độ 95% hoặc What will I earn? | Không dùng làm đáp án hoặc bằng chứng finished. Trang thiếu control có thể thao tác được giữ unsupported/waiting. |
| Click reject hoặc không thay đổi DOM | Không tăng answered/đặt cờ email-screen; có retry với cooldown. `tests/survey-verification.test.mjs`. |
| Record thiếu hoặc option không khớp | Không tạo email/city/tên/number/textarea mẫu; không chọn index 1. `tests/record-repair-policy.test.mjs`. |
| Semantic nhiều block, checkbox thay đổi và SPA đổi câu cùng URL | Từng block theo record; không dùng checked/value làm bằng chứng chuyển bước; không double Next. |

Giới hạn kiểm chứng: fixture/snapshot cục bộ chặn mạng ngoài; chưa xác nhận gửi form trên website thật sau cập nhật. Snapshot thiếu engine được nghiệm thu ở trạng thái chờ và không tạo cờ thành công giả, tách khỏi test verified trên fixture có hành vi website đầy đủ.

Rà soát bổ sung trước đóng gói: nhánh campaign dùng cùng verification; không cộng accordion/Continue thành đáp án. Generic giữ lựa chọn ARIA pressed/selected/checked qua các lượt quét và dừng ngay sau auto-advance. Regression native label radio kiểm cả tuổi và loại xe theo record.

Kết quả source trước build: selfcheck OK; kiểm cú pháp 863 file không lỗi; `npm test` đạt 300/301, skipped=0. Một lỗi đã tồn tại ở `tests/proxy-stop.test.mjs:69`: test mong targetCount giảm 2→1 khi đóng tab Chrome cuối, trong khi source giữ 2. Không thay lifecycle browser/relay trong phạm vi kế hoạch này; không bỏ hoặc sửa yếu test để che lỗi. Log kiểm tra đầy đủ trên máy: `/tmp/autolead-plan-final-release-tests.log`.

## Thêm proxy thủ công vào hàng đợi desktop

- Dán proxy mới, chọn giao thức rồi bấm **Thêm vào hàng đợi**: giữ proxy sẵn sàng hiện có và lịch sử đã dùng; bộ đếm ready cập nhật sau khi lưu.
- Dán lặp dòng, proxy đã dùng hoặc dòng sai định dạng: không thêm trùng; chỉ có dòng sai thì giữ ô nhập để sửa.
- Để trống hoặc API lỗi: hiện thông báo, giữ nội dung khi lỗi và mở lại nút để thử.
- Regression: `tests/proxy-queue-manual-import.test.mjs`, gồm API thật trong storage cô lập và bấm nút Chromium trên HTML desktop thật. Client đồng bộ cũ không bị đổi hành vi.

Kết quả kiểm tra bổ sung proxy tay: 6/6 test mục tiêu đạt; bộ tổng 304/305, skipped=0. Lỗi duy nhất vẫn là test cũ `proxy-stop.test.mjs:69` về giảm targetCount khi đóng tab cuối. Chỉ cập nhật app sau khi xác nhận không còn phiên hoạt động và tự bù đã tắt.

## Chuột mô phỏng trên mọi màn hình

- Slot 1 và các slot sau: rê tới control, thấy con trỏ riêng; click và điền thành công.
- Checkbox/radio ẩn: rê đến nhãn đang hiển thị, chỉ đổi checked sau click thực sự.
- Trong iframe: AI click/check/select, ô tên/thành phố Alpha Intent và ô ngày đều có mouse down tại đúng control hoặc nhãn.
- Khi click input thất bại: không nhập tiếp vào ô chưa click được. Ô disabled/readonly vẫn bị bỏ qua.
- Renderer không trả lời lệnh vẽ con trỏ: thao tác chuột tiếp tục, không tích lũy thêm lệnh vẽ. Renderer phản hồi lại thì con trỏ tiếp tục cập nhật.
- Mở tab chưa có thao tác, reload hoặc mở popup: con trỏ phải hiện ngay. Chế độ thủ công vẫn có con trỏ nhưng không tự điền.
- Website có CSS ẩn div/svg hoặc xóa lớp con trỏ: hình phải vẫn hiện hoặc được tạo lại, không chặn click.
- Reload/popup giữ quyền chuột theo từng phiên; slot khác đóng không làm mất quyền này.
- Regression nằm trong `tests/first-slot-mouse.test.mjs`, `tests/autofill-stall-recovery.test.mjs` và `tests/survey-verification.test.mjs` với fixture offline.

## Khôi phục form đứng sau khi đã có lead

- Form hiển thị cùng script/widget Cloudflare: thư viện vẫn điền; challenge thật không có form tiếp tục chờ.
- Phiên có confirmedLeadIp nhưng status checking cũ: khôi phục confirmed, cho form tiếp tục xử lý, không đóng hoặc reload browser.
- Form trong iframe có field còn thiếu: watchdog nhận đúng việc cần làm và gọi fallback; không chỉ kiểm tra input ở trang cha.
- Record sửa được field: sửa và verify trước khi gọi AI ngoài, kể cả khi AI đã chặn retry cùng DOM; không submit trong bước repair.
- Không có tiến triển: giãn scan tối đa 5 giây; DOMContentLoaded, điều hướng và trigger chủ động đánh thức scan; không log/capture cùng cảnh báo stalled liên tục.
- Hàng đợi AI hết chỗ: không vượt 4 CLI, chờ hữu hạn; hủy trạng thái cũ khi trang đổi và trả quyền cho autofill.
- Data Saver: chặn engine video/replay và upload nền, giữ form JS/API, captcha, ảnh, iframe và tài nguyên cùng host trang chính. Gắn route lỗi cho phép thử lại.
- Test: `autofill-stall-recovery.test.mjs`, `ai-queue-capacity.test.mjs`, `data-saver-background.test.mjs`, cùng các regression AI, first-slot, record repair và confirmed lead.

Kết quả trước build cho khôi phục form đứng: selfcheck OK; 319/320 test tổng đạt, skipped=0; lỗi duy nhất vẫn là `proxy-stop.test.mjs:69` về target tự bù. Các regression cuối về recovery, queue AI, Data Saver và bảo vệ lead đạt 25/25. Không chạy submit/AI SDK trên website thật và chưa đo phần trăm tiết kiệm băng thông thực tế. Log kiểm tra: `/tmp/autolead-stall-full-tests.log`.

## Tự bù luồng không check lead khi browser đóng

| Thao tác | Kết quả mong đợi |
|---|---|
| Không check lead + tự bù bật, bấm X cửa sổ Chrome/AdsPower | Target giữ nguyên; phiên đóng được dọn, bù đủ số slot. |
| Cùng cấu hình, bấm X trong bảng Screen View | Không giảm target, không đặt suppressAutoRefill chặn phiên thay thế. |
| Browser crash/disconnected và context close cùng phát | Cleanup chỉ một lần; queue bù đúng engine của Start, không reset target/settings. |
| Đóng một tab nhưng còn tab khác trong browser | Không bù cả browser. |
| Bấm Dừng/Đóng tất cả hoặc tắt tự bù | Không tự mở lại, kể cả callback đóng đến muộn. |
| Check lead bật, đóng chủ động một cửa sổ | Giảm target đúng một lần và không bù slot đã đóng. |
| Trang tự đóng nhưng IP đã confirmed và browser còn chạy | Giữ cơ chế bảo vệ lead hiện có, không tự đóng browser để bù. |

Test mới: `tests/no-lead-auto-refill.test.mjs`; queue và launcher thực được chạy trong fixture module tạm với launcher giả, không mở Chrome/AdsPower hoặc dùng proxy thật. Regression cũ `proxy-stop.test.mjs:69` về giảm target của luồng đóng chủ động cũng phải đạt.

Kết quả sửa tự bù không check lead: 39/39 test mục tiêu đạt; `npm test` đạt 328/328, failed=0, skipped=0, selfcheck OK. Lỗi test giảm target cũ tại `proxy-stop.test.mjs:69` đã được xử lý trong chính sách đóng chủ động của luồng check lead, không bỏ/đổi yếu assertion. Log: `/tmp/autolead-refill-full-tests.log`. Chưa cập nhật app hoặc đóng browser thật để thử vì người dùng đang có các phiên hoạt động.

## Nhường slot khi tab phụ không phải offer (2026-11-11)

| Thao tác | Kết quả mong đợi |
|---|---|
| Offer bật popup trang tin/quảng cáo không form, tab chính vẫn mở | Sau ~30s popup tự đóng (log `non_offer_tab_closed`), trình duyệt giữ nguyên. |
| Tab chính đứng ở trang không form bất kỳ thời gian nào | Không bị đóng vì "không phải offer" (phạm vi đã chốt: chỉ xét tab phụ). |
| Tab chính tự đóng, popup còn lại trống, autofill không thao tác > 30s | Đóng cả phiên và bù slot; lịch sử proxy ghi `offer_unavailable`. Cửa sổ đang hiện cũng không bị hiểu là người dùng bấm X. |
| Như trên nhưng đang chờ check lead (`checking`) hoặc autofill vừa thao tác | Giữ phiên. |
| Popup lỗi mạng (chrome-error) khi còn tab chính | Chỉ đóng popup, giữ trình duyệt, không giảm target. |
| Popup quảng cáo đổi `?query`/`#hash` liên tục | Vẫn bị đóng sau 30s (đồng hồ chỉ reset khi đổi domain/đường dẫn). |
| Popup trả HTTP 404/5xx | Đóng sau ~10s. |
| Bị toffers báo duplicate IP | Lịch sử ghi `duplicate_ip`; IP đó không được mở lại cho cùng trang đích ở lượt bù sau. |
| Tab đầu tới thankyou trong khi còn popup | Không đóng riêng tab đầu; hoàn tất cả phiên (proxy ghi `completed`) và bù slot. |
| Popup tới thankyou, tab đầu vẫn mở | Chỉ đóng popup, giữ tab đầu. |
| Chạy 2+ offer, một offer mất slot | Slot bù vào đúng offer đang thiếu (trước đây luôn offer 1). |

Test: `tests/non-offer-slot-release.test.mjs` (20 test, có 1 test Chromium). `npm test` đạt 348/348, failed=0, skipped=0. Chưa thử trên trình duyệt thật với offer thật.

## Giảm tải và nhường slot — 2026-11-11

- Mở offerwall có ít nhất 4 thẻ: chỉ giữ tổng 3 tab; thẻ chưa mở không bị đánh dấu đã mở. Đóng một popup, lượt sau mở thêm đúng một thẻ. Thử hai offerwall cùng context cùng mở để kiểm tra đặt chỗ.
- Cuộn lưới thumbnail: ô ngoài vùng xem không phát request screenshot; cuộn lại thì ảnh cập nhật ở lượt 5 giây tiếp theo. Ẩn giao diện sau khi đã hẹn callback tải ảnh cũng không được gửi request mới.
- Đổi trang/tab lúc đang chụp: không trả ảnh của tài liệu trước. Nhiều client cùng xem không vượt hai lượt thumbnail đang chụp; khi quá tải chưa có cache thì 503 và lượt sau thử lại.
- Trang tĩnh trong Screen View vẫn cập nhật sau khoảng 1,5 giây; chuột/bàn phím và tọa độ tương tác đúng; cửa sổ thu nhỏ không chụp bù gây treo.
- IP đã có lead vẫn được giữ qua reload/lỗi/thankyou. Phiên manual/skip/đang check lead/được giữ tay không nhận cảnh báo im lâu; phiên tự động im 5 phút chỉ cảnh báo một lần, không tự đóng.
- Đo CPU/RAM/độ trễ ở 10 trình duyệt trước; chỉ thử 20 khi máy còn dư tài nguyên. Không dùng kết quả benchmark trang trắng/offline để kết luận website thật.

## Log tiến trình và lỗi (2026-11-11)

| Thao tác | Kết quả mong đợi |
|---|---|
| Chạy 10 trình duyệt, autofill nhập form | Không có log/ảnh cho từng ký tự, cuộn, click nhỏ; vẫn có log submit, chuyển màn, mở tab. |
| Trang có lỗi mới (HTTP lỗi, autofill đứng, Traffic Blocked) | Một bản ghi lỗi kèm ảnh/HTML và tối đa 100 thao tác trong 60 giây trước đó. |
| Cùng một lỗi lặp nhiều lần | Một bản ghi với số lần, không tạo hàng trăm dòng. |
| Trong Replay bật "ghi chi tiết" cho một phiên | Chỉ phiên đó ghi JSONL thao tác, tự tắt sau thời hạn đã chọn; phiên khác không đổi. |
| Mở app khi có log cũ hơn 7 ngày | Phiên cũ đã đóng bị dọn; phiên có ghi chú và phiên đang chạy còn nguyên. |

Test: `tests/recorder-log-policy.test.mjs`, `tests/recording-retention.test.mjs`, `tests/browser-recorder.test.mjs`.

## Recorder gọn và debug theo phiên — 2026-11-11

- 1.000 input/scroll không tạo 1.000 event timeline hay file JSONL ở chế độ thường; lỗi kế tiếp có tối đa 100 action gần nhất của đúng tab. Không lưu value/password.
- 1.000 request GET thành công hoặc bị Data Saver chặn chỉ tạo thống kê gộp; request POST form và lỗi HTTP/network vẫn truy được, query URL không nhân bản lỗi.
- Snapshot chỉ chụp mốc submit/chuyển trang/lỗi mới; mốc hash giống nhau dùng chung file còn tồn tại; khi file cũ đã mất thì ghi lại. Nhiều phiên không vượt hai lượt chụp; renderer đọc HTML bị treo không nhận lặp lệnh.
- Trang xem lại chỉ bật debug cho phiên đang chạy được chọn; hết 5 phút hoặc bấm tắt thì trở về mức mặc định. Debug chỉ ghi id/trạng thái field, không ghi giá trị nhập.
- Ghi nốt file khi export/đóng phiên; debug JSONL ghi batch/async và xoay ở 5 MB. Bộ đệm quá 256 KB phải báo số event thô bị bỏ.
- Dọn tuổi/dung lượng chỉ xóa phiên cũ đã đóng, không có feedback và file do recorder sở hữu. Kiểm tra symlink, file không thuộc recorder và lỗi lưu metadata trước khi xóa.
- Tạo hơn 2.000 event: replay giữ sequence cũ, feedback và snapshot tham chiếu.

## Theo dõi lead khi không tick Check Lead (2026-11-11)

| Thao tác | Kết quả mong đợi |
|---|---|
| Không tick Check Lead, offer nhập xong email | Slot hiện "⏳ Chờ lead"; autofill chạy tiếp tới cuối, không tạm dừng. |
| Lead về cho IP đó (trong 10 phút) | Badge "✅ Có lead", log `lead_observed`, Telegram báo một lần. Khóa bảo vệ đúng IP; tiếp tục câu hỏi, không tự đóng vì lỗi/trang cảm ơn chung. Chỉ FinancialHelpFinder thankyou đã hết việc mới hoàn tất. |
| Trình duyệt đã đóng ở thankyou, lead về sau đó | Vẫn có log + Telegram trong 10 phút kể từ lúc nhập email. |
| Hết 10 phút không có lead | "— Chưa thấy lead", không đóng trình duyệt vì lý do này. |
| Cookie Toffers hết hạn | "⏳ Chờ lead" (tooltip báo API lỗi), không kết luận không có lead. |
| Có tick Check Lead | Hành vi cũ giữ nguyên (tạm dừng, 2 × 30s, không lead thì đóng). |

### Form đặc thù bị khóa khi chuyển bước

- Cho address/phone disabled, ngày sinh readonly, giữ city hoạt động: autofill bỏ qua ô khóa và tiếp tục city.
- Website xóa zipcode sau sự kiện input: không tăng số trường thành công hoặc gắn data-ux-filled.
- Mở khóa address sau đó: lượt quét kế tiếp điền lại được, không cần tải lại tab.

### Đồng bộ nhịp chuột và nhập dữ liệu

- Alpha Intent có địa chỉ sẵn nhưng city/zip rỗng: từng ô chỉ nhận input sau click riêng, không bị đồng bộ địa chỉ điền trước.
- Uplevel: email, tên, zip, bang, city, điện thoại được điền lần lượt; giữ khoảng nghỉ 160ms trước/sau điền nhanh. Hidden telephone vẫn nhận đủ 10 chữ số.
- Regression trong `tests/first-slot-mouse.test.mjs` ghi timeline mouse down/input của từng ô, kiểm tra nhập sau click và khoảng nghỉ trước khi chuyển ô.

### Giảm log và phục hồi trang lỗi của IP có lead

- HTML toàn trang mặc định không đọc content/ghi file; debug chủ động dừng sau 10 phút hoặc 10 MB.
- Vượt 200 file: dọn file cũ/phiên đã đóng, giữ phiên active/có feedback và orphan mới dưới 15 phút.
- IP confirmed gặp HTTP 500, chrome-error hoặc lỗi duplicate: Back rồi tiếp tục autofill, không đóng browser/tab và không hạ cờ lead.
- Không có history/Back timeout: giữ mở, giãn 15 giây giữa các lượt, tối đa ba lần cùng URL lỗi.
- Trong lúc Back, không chạy scan autofill song song; sau khi trang khỏe mới gỡ khóa submit của trang phục hồi.
- Iframe quảng cáo lỗi trong khi form chính khỏe: không Back khỏi form chính. Đổi IP giữa lúc phục hồi không kế thừa cờ lead của IP cũ.

### F12 và lấy HTML để debug

- Screen View đang chọn tab phụ: F12 và nút HTML phải lấy đúng tab đó, không lấy nhầm main tab hoặc slot khác.
- Mac dùng F12/Fn+F12 hoặc Cmd+Option+I; UI có nút DevTools khi phím chức năng bị macOS chặn.
- Chọn iframe: nội dung sao chép và file tải phải là DOM của iframe. Script trong HTML không được chạy trong giao diện app.
- Headed Chromium: mở DevTools Elements bằng CDP cấp browser. Headless/engine không hỗ trợ: vẫn có bảng HTML trong app.
- Tải file trên app Mac: chọn nơi lưu qua NSSavePanel. Hủy hộp thoại không tạo file. Cầu nối native chỉ nhận main frame local đúng cổng.
- Đổi slot/tab hoặc đóng Screen View: hủy nội dung HTML cũ và kết quả fetch đang chờ. Escape chỉ đóng bảng HTML trước.
- Toolbar preview ở viewport 900/640/480/360/320px: đủ 9 nút đều nằm trong màn hình, header và trang không tràn ngang; các nút tự xuống dòng hoặc chuyển lưới 3/2 cột.
- Regression: `tests/screen-debug.test.mjs` kiểm API, UI thật, responsive toolbar, chọn iframe, copy, download và cầu nối lưu native bằng fixture offline.

### AI ưu tiên lead và hoàn tất FinancialHelpFinder

- Khi bốn chỗ AI bận, xếp yêu cầu thường trước rồi thêm IP có lead: chỗ trống kế tiếp phải cho IP có lead; cùng ưu tiên theo FIFO.
- IP vừa có lead trong lúc chờ được nâng ưu tiên. Tab đóng/trang đổi/hết hạn phải rời hàng, không mất chỗ đang chạy hoặc mất lượt retry sửa form.
- Fixture `financialhelp-autofill.test.mjs` đi qua form iframe theo từng bước, kiểm cả CSS ẩn đúng và CSS chưa tải; không chạm nút Continue của trang cha.
- Thankyou FinancialHelpFinder còn tab có câu hỏi/form/loading/AI hoặc popup đặt chỗ: giữ browser. Khi mọi offer kết thúc thì đóng cả phiên kể cả IP confirmed, không hạ cờ lead.
- Host giả hoặc trang thankyou của website khác không được hưởng ngoại lệ mới.

### Yes rồi fallback No

- Nhóm nhiều câu Yes/No: chọn Yes từng câu đang thấy trước Continue; nhóm ẩn không được chọn.
- Continue không đổi bước hai lượt: chuyển sang No, chờ xác minh từng lựa chọn rồi thử Continue.
- Sau No vẫn không qua hai lượt: giữ bước, không spam click. Click lỗi hoặc nút disabled không tăng lượt; Continue thành công chuyển bước reset bộ đếm.
- Nếu Yes mở subform: điền dữ liệu qua pipeline hiện có trước Continue; autoSubmit=false không tự bấm Continue.
- Regression: `tests/yes-no-fallback.test.mjs`.

### Lưu subform trước Continue

- Yes mở vùng Save/Cancel: điền dữ liệu trước, click Save bằng chuột rồi chờ vùng lưu đóng.
- Save còn hiện/disabled hoặc chưa xác nhận: không bấm Continue; hai lần Save không tính thành hai lần Continue lỗi để đổi No.
- Save/Cancel của form phụ hoặc bước ẩn không được bấm. Không bấm Cancel.
- Regression nằm trong `tests/yes-no-fallback.test.mjs`.

Sau khi tách module Yes/No/Save, chạy lại `tests/yes-no-fallback.test.mjs`, `tests/twy-scoped-survey.test.mjs` và `tests/financialhelp-autofill.test.mjs` để giữ đúng thứ tự Yes → subform → Save → Continue và reset/cooldown riêng cho từng bước.

### Màn 80–99% trống câu hỏi

- Trống đủ 60 giây: F5 lần 1; tiếp tục trống 60 giây: F5 lần 2; tiếp tục trống 60 giây: chuyển AI một lần. Không lặp reload thêm.
- Reload cùng path/query thay đổi không reset số lượt; câu hỏi/form xuất hiện thì nhả quyền về autofill, bắt đầu lại bộ đếm cho lần kẹt sau.
- Câu hỏi trong iframe đang thấy, trang 100%/thankyou, captcha, manual/skip/consent hoặc frame không đọc được không được coi là màn trống để F5.
- IP có lead giữ nguyên cờ và browser; nhánh non-offer không đóng tab đang được phục hồi. AI tắt thì hiện lý do, không âm thầm gọi CLI.
- Regression: `tests/late-progress-recovery.test.mjs`.

### Tắt đóng non-offer

- Popup trống/không có form giữ mở dù là tab duy nhất và đã chờ trên 30 giây; không tạo non_offer_tab_closed hoặc đóng browser.
- Vượt trần tab đã mở không gắn thêm timer quét non-offer hoặc đóng tab; cơ chế đặt chỗ trước khi mở offerwall vẫn giới hạn số tab mới.
- Lỗi mạng thực sự, bảo vệ IP có lead và hoàn tất FinancialHelpFinder thankyou vẫn chạy theo luồng riêng.

### Hồi quy checkbox chờ lead (2026-11-12)

- Bỏ tích Check Lead: qua màn email và Jump Page vẫn điền/trả lời/tiếp tục; không kích hoạt chờ chủ động.
- Với phiên tắt Check Lead còn cờ `checking`, `failed` hoặc `leadCheckTriggered`, form vẫn được xử lý và watchdog vẫn phục hồi khi cần.
- Tích Check Lead: sau màn email hoặc Jump Page mới dừng chờ xác minh; xác nhận lead xong tiếp tục chạy.

### Yes/No và bảo vệ lead khi còn câu hỏi (2026-11-12)

- Màn gần cuối có checkbox ẩn với nhãn Yes/No hoặc link tách wrapper: chọn Yes đủ từng nhóm trước Continue; class `chosen` không làm click lặp.
- Có lead ở luồng không tích chờ: thử reload/lỗi trang, giữ browser và cờ bảo vệ IP; không bật checkbox chờ.
- Tab thankyou FinancialHelpFinder cùng tab câu hỏi dạng link/checkbox ẩn: giữ toàn bộ browser đến khi hết việc.
