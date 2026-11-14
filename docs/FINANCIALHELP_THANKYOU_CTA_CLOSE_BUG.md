# Lỗi đóng trình duyệt tại FinancialHelpFinder thank-you khi còn nút `.btn`

Ngày điều tra: 2026-11-15  
Phiên bản mã nguồn khi điều tra: 1.3.3  
Trạng thái: **đã sửa 2026-11-15 theo bằng chứng HTML thật — xem mục 16 (thay cho phương án `.btn` ở mục 7–8)**

## 1. Mục tiêu tài liệu

Tài liệu này mô tả đầy đủ:

- Hiện tượng trình duyệt GoLogin/Orbita bị đóng tại trang FinancialHelpFinder thank-you dù trang vẫn còn nút `.btn` cần bấm.
- Bằng chứng từ log và ranh giới giữa lỗi của app với lỗi GoLogin.
- Toàn bộ chuỗi hàm từ lúc phát hiện URL thank-you đến lúc đóng browser.
- Điểm không đồng nhất giữa bộ nhận diện “còn công việc” và autofill.
- Từng file cần sửa, từng file chỉ cần kiểm tra và những file không nên thay đổi.
- Phương án sửa, tiêu chí nhận diện CTA, rủi ro và bộ test bắt buộc.

Phạm vi chính là URL được `isFinancialhelpThankyouUrl()` nhận diện, gồm:

- `https://financialhelpfinder.com/thankyou.php`
- `https://www.financialhelpfinder.com/thankyou.php`
- `https://blog.financialhelpfinder.com/paththankyou.php`

Tài liệu không đề xuất tắt toàn bộ cơ chế hoàn tất FinancialHelpFinder. Chỉ cần ngăn việc kết luận “đã hết công việc” khi DOM vẫn còn CTA hợp lệ.

## 2. Hiện tượng và kết quả mong đợi

### Hiện tượng

1. Offer đã đi tới trang thank-you.
2. Trên trang vẫn có nút dạng `.btn`, ví dụ một `div.btn`, cần được autofill bấm để tiếp tục.
3. App chưa bấm nút nhưng trình duyệt GoLogin bị đóng.
4. Log cho thấy app đánh dấu `thankyou_completed` trước khi tiến trình Orbita thoát.

### Kết quả mong đợi

1. Khi trang thank-you còn CTA có thể thao tác trong vùng nội dung chính, app phải giữ browser.
2. Autofill phải còn cơ hội tìm và bấm CTA bằng luồng chuột/submit hiện có.
3. Trong lúc CTA đang được bấm, đang chuyển trang hoặc đang mở tab mới, app vẫn phải giữ phiên.
4. Chỉ hoàn tất phiên khi các tab đã ổn định và không còn form, câu hỏi, offer chưa mở, CTA cần xử lý, AI, popup hoặc công việc khác.
5. Nếu người dùng bật chế độ dừng autofill sau lead, browser vẫn được giữ theo chính sách hiện có.

## 3. Bằng chứng từ log

### 3.1 Phiên đã điều tra

- Slot: **7**.
- IP metadata/lead: **72.241.1.69**.
- Thời điểm app kết luận hoàn tất: **2026-11-14T17:22:32.896Z**.
- Thời điểm kết thúc phiên: khoảng **2026-11-14T17:22:33.620Z**.
- Dữ liệu log được trích xuất phục vụ điều tra tại `/tmp/autoleadpc-thankyou-browser-logs.json` trên máy điều tra; đây không phải file mã nguồn hoặc artifact cần commit.

Mốc chính:

```text
thankyou_completed
Đã tới FinancialHelpFinder thankyou và không còn tab làm offer; hoàn tất trình duyệt.
```

Sau mốc này, log lần lượt có:

```text
gologin_close_requested
gologin_process_exited
gologin_profile_deleted
session_closed
closeReasonType=thankyou_completed
```

### 3.2 Kết luận từ bằng chứng

Đây **không phải** các trường hợp sau:

- GoLogin tự ngắt phiên.
- Orbita crash ngẫu nhiên.
- Người dùng bấm đóng cửa sổ.
- Tab cuối bị đóng rồi kéo browser thoát theo.
- Mất CDP khiến app tưởng browser đã đóng.

Đây là **lệnh đóng chủ động từ app**. App ghi nhận lý do hoàn tất trước, sau đó mới yêu cầu dừng GoLogin/Orbita và dọn profile.

Log xác nhận chắc chắn lý do đóng và chuỗi vòng đời. Tuy nhiên, chế độ log access tại thời điểm đó không lưu DOM/HTML của nút, nên log không thể chứng minh text, kích thước hay toàn bộ class của CTA. Thông tin nút `.btn` đến từ hiện tượng người dùng báo; khả năng bỏ sót selector này được xác định bằng đối chiếu mã nguồn.

## 4. Chuỗi thực thi gây đóng browser

```text
Tab điều hướng tới FinancialHelpFinder thank-you
        |
        v
checkInstantThankYou()
hoặc timer 1 giây trong watchTrafficBlockedPage()
        |
        v
completeFinancialhelpSession(session, closeSessionAndRefill)
        |
        v
canCompleteFinancialhelpSession(session)
        |
        +-- Chờ danh sách tab/URL ổn định ít nhất 3 giây
        +-- Kiểm tra AI, popup, lỗi trang, trạng thái tải
        +-- Đọc DOM từng frame bằng detectOfferContentInPage()
        |
        v
hasOfferWorkEvidence(content)
        |
        +-- Không thấy form
        +-- Không thấy nhóm đáp án
        +-- Không thấy submit/CTA đặc thù
        +-- Không tính div.btn đơn lẻ
        |
        v
Trả false: tưởng rằng không còn công việc
        |
        v
canCompleteFinancialhelpSession() trả true
        |
        v
completeFinancialhelpSession() kiểm tra lại lần hai
        |
        v
Ghi thankyou_completed
        |
        v
closeSessionAndRefill({ completedFinancialFlow: true })
        |
        v
Đóng browser, dừng managed profile và xử lý bù slot theo cấu hình
```

Có hai điểm kích hoạt cùng một hàm hoàn tất:

- `src/leads/actions/watch-traffic-blocked-page.mjs:177-185`: kiểm tra ngay sau điều hướng.
- `src/leads/actions/watch-traffic-blocked-page.mjs:241-255`: kiểm tra định kỳ mỗi giây.

Việc có hai điểm gọi không phải nguyên nhân gốc. Cả hai đều phải đi qua cùng điều kiện `canCompleteFinancialhelpSession()`.

## 5. Vai trò từng thành phần hiện tại

### 5.1 Nhận diện URL thank-you

File: `src/leads/actions/is-financialhelp-thankyou-url.mjs`

- Chỉ nhận HTTPS và đúng host/path đã định nghĩa.
- Không nhận host giả hoặc URL chỉ chứa chuỗi FinancialHelpFinder.
- Đây là tín hiệu để bắt đầu xét hoàn tất, **không phải** bằng chứng đủ để đóng browser.

File này không gây lỗi trong phiên điều tra.

### 5.2 Điều phối hoàn tất phiên

File: `src/leads/actions/complete-financialhelp-session.mjs`

Các bảo vệ hiện có:

- `shouldStopAfterLead(session)` ngăn hoàn tất nếu người dùng chọn dừng sau lead.
- `WeakSet completing` ngăn hai lượt hoàn tất cùng session chồng nhau.
- Gọi `canCompleteFinancialhelpSession()` trước khi ghi trạng thái proxy.
- Gọi lại `canCompleteFinancialhelpSession()` lần thứ hai trước khi đóng.
- Chỉ ghi `thankyou_completed` sau khi bộ kiểm tra cho phép.

Điểm quan trọng: hàm này là **ngoại lệ được phép đóng browser đã có lead**. Nó không hạ cờ lead; đây là hành vi đã có test. Không nên sửa bằng cách cấm đóng mọi phiên confirmed lead vì sẽ phá yêu cầu hoàn tất FinancialHelpFinder hiện tại.

### 5.3 Kiểm tra điều kiện hoàn tất

File: `src/leads/actions/can-complete-financialhelp-session.mjs`

Hàm đang giữ phiên khi:

- Session đã đóng hoặc bị suppress auto-refill.
- `isSessionWorkingOnOffer(session)` cho biết còn đang làm offer.
- AI assist/form fixing đang chạy.
- Có offerwall popup đã đặt chỗ nhưng chưa mở xong.
- Không có tab FinancialHelpFinder thank-you.
- Danh sách tab hoặc URL thay đổi.
- Danh sách tab chưa ổn định đủ 3 giây.
- Tab đang recovery, AI, HTTP status lỗi hoặc URL không phải HTTP/HTTPS.
- Page health báo lỗi.
- Không đọc được DOM, trang đang loading/challenge hoặc còn bằng chứng công việc.
- Còn offerwall card chưa mở.
- Danh sách tab/URL thay đổi trong lúc kiểm tra.

Nguyên tắc “không đủ bằng chứng thì giữ phiên” là đúng. Lỗi nằm ở dữ liệu đầu vào: detector trả về thiếu bằng chứng CTA, khiến hàm này tưởng rằng đã an toàn để đóng.

### 5.4 Nhận diện công việc trong DOM

File: `src/leads/actions/detect-offer-content-in-page.mjs`

Hàm chạy trực tiếp trong `frame.evaluate()` và trả các cờ:

- `hasForm`: input/select/textarea/radio/checkbox hợp lệ trong vùng nội dung chính.
- `hasChoices`: nhóm đáp án, Yes/No hoặc lựa chọn có ngữ cảnh câu hỏi.
- `hasFormProgress`: submit native, action rõ ràng, nút progress disabled hoặc Continue/Next/Submit trong form/step.
- `hasOfferEntry`: CTA thuộc offer card hoặc selector offer đặc thù.
- `hasOfferWork`: tổng hợp bốn nhóm trên.
- `loading`, `challenge`, `worked`, `empty`, `singleLine`: phục vụ giữ trang và phân loại trang rỗng.

Detector đã có các lớp lọc đúng hướng:

- Chỉ nhận nội dung hiển thị.
- Loại header/nav/footer/aside/sidebar, cookie banner.
- Ưu tiên `main`, `[role="main"]`, form/step hoặc cột trung tâm.
- Loại search và newsletter.
- Không coi link bài viết thông thường là offer.

Nhưng detector chưa có cờ cho **một CTA hoàn tất/chuyển bước đứng đơn lẻ**.

### 5.5 Tổng hợp bằng chứng

File: `src/leads/actions/has-offer-work-evidence.mjs`

Hiện chỉ kiểm tra:

```text
hasOfferWork
hasForm
hasChoices
hasFormProgress
hasOfferEntry
```

Nếu thêm cờ mới ở detector mà quên cập nhật aggregator này, caller vẫn có thể bỏ qua CTA. Vì vậy detector và aggregator phải được sửa cùng một thay đổi.

### 5.6 Khả năng tìm nút của autofill

File: `src/autofill/find-submit-button.mjs`

Autofill đã hỗ trợ nhiều dạng CTA mà completion detector không nhận, đặc biệt:

- `div.btn`
- `div.button`
- `.thankyou-button`
- `.thankyou-actions a`
- `.btn-option`
- Nhiều CTA theo text như Continue, Next, Claim, Get Started, Get My Reward...

File `src/autofill/submit-frame-form.mjs:43-46` gọi `findSubmitButton()` để lấy nút trước khi thực hiện thao tác submit.

Đây là mâu thuẫn cốt lõi:

| Khả năng | Autofill | Completion detector |
|---|---|---|
| Nhận `div.btn` ngoài form | Có | Không |
| Nhận `.thankyou-button` | Có | Không nếu không thuộc selector khác |
| Nhận `.thankyou-actions a` | Có | Không nếu không thuộc offer card/action đặc thù |
| Nhận submit native | Có | Có |
| Nhận CTA offerwall đặc thù | Có | Có |
| Nhận form/câu hỏi | Có luồng riêng | Có |

Autofill không phải nơi phát lệnh đóng. Không cần mở rộng `findSubmitButton()` để sửa lỗi này; cần làm completion detector nhận đúng công việc mà autofill đã có khả năng xử lý.

## 6. Nguyên nhân gốc

### Nguyên nhân trực tiếp

`hasOfferWorkEvidence()` trả `false` cho trang thank-you chỉ còn một `.btn` đơn lẻ vì không nhánh nào trong `detectOfferContentInPage()` ghi nhận nút đó.

### Nguyên nhân kiến trúc

Hai subsystem dùng hai tập quy tắc khác nhau cho cùng khái niệm “còn nút cần bấm”:

- Autofill có selector rộng để tìm mục tiêu thao tác.
- Completion watcher có selector hẹp để quyết định đóng phiên.

Khi watcher hẹp hơn autofill, browser có thể bị đóng trước khi autofill thực hiện hành động hợp lệ.

### Vì sao test hiện tại không phát hiện

File `tests/financialhelp-completion.test.mjs` đã kiểm tra:

- Chỉ khớp đúng URL thank-you.
- Giữ browser khi còn form/câu hỏi.
- Giữ browser khi AI chạy hoặc offerwall popup đang mở.
- Đóng browser confirmed lead khi thật sự hết việc nhưng giữ trạng thái lead.
- DOM thật với form trong iframe, offerwall chưa mở và popup.
- Nhóm Yes/No và checkbox ẩn có label.

Chưa có test nào dựng trang thank-you chỉ chứa một CTA `.btn` trong `main`. Do đó regression này đi qua suite hiện tại.

## 7. Phương án sửa đề xuất

### 7.1 Nguyên tắc

Bổ sung một tín hiệu riêng, ví dụ `hasCompletionAction`, cho CTA đơn lẻ còn phải xử lý. Không nhét CTA này vào `hasChoices` vì một nút không phải nhóm câu trả lời; không nhét vào `hasOfferEntry` nếu nút không mở offer mới.

Tín hiệu mới phải được:

1. Tạo trong `detectOfferContentInPage()`.
2. Đưa vào `hasOfferWork`.
3. Trả về trong object kết quả.
4. Đọc trong `hasOfferWorkEvidence()` để tương thích cả object mới và fixture cũ.

Kết quả cần đạt:

```text
Trang có CTA trung tâm hợp lệ
=> hasCompletionAction = true
=> hasOfferWork = true
=> hasOfferWorkEvidence(content) = true
=> canCompleteFinancialhelpSession() = false
=> completeFinancialhelpSession() không đóng browser
=> autofill tiếp tục có thời gian bấm nút
```

### 7.2 Phạm vi selector đề xuất

Ưu tiên tối thiểu các dạng autofill đã hỗ trợ và liên quan trang thank-you:

```text
button.btn
a.btn
[role="button"].btn
div.btn
.thankyou-button
.thankyou-actions a
```

Có thể cân nhắc `.button`/`div.button` nếu có fixture hoặc HTML thật chứng minh cần thiết. Không nên mở rộng hàng loạt selector chỉ vì autofill đang có danh sách dài; mỗi selector mới trong watcher làm tăng khả năng giữ phiên do nút không liên quan.

### 7.3 Điều kiện bắt buộc để CTA được coi là công việc

Một phần tử chỉ được tính khi thỏa đồng thời:

- Hiển thị theo hàm `shown()` hiện có.
- Không thuộc vùng loại trừ theo `chrome()` hiện có.
- Nằm trong `main`/scope nội dung hoặc cột trung tâm theo `inOfferArea()` hiện có.
- Là phần tử tương tác/button rõ ràng, không phải container lớn chỉ tình cờ có class chứa chữ `btn`.
- Không phải nội dung pháp lý, cookie, menu, đóng, quay lại, điều hướng bài viết hoặc chia sẻ mạng xã hội.
- Không phải link `mailto:`/`tel:` nếu mở rộng sang `a`.

Nên dùng class token chính xác qua `matches('.btn')`, không dùng selector `[class*="btn"]` cho quy tắc chung vì dễ khớp class không phải nút.

### 7.4 Trạng thái sau khi click

Không nên coi CTA đã hết việc chỉ vì autofill vừa phát lệnh click. Nếu CTA vẫn hiển thị trong khi request/navigation đang chạy, việc tiếp tục giữ phiên là an toàn.

Chỉ cho phép hoàn tất khi một trong các trạng thái sau xuất hiện:

- CTA biến mất khỏi DOM.
- CTA bị ẩn và không còn là mục tiêu hiển thị.
- Trang chuyển sang trạng thái cuối không còn công việc.
- Các guard hiện có xác nhận toàn bộ tab/frame đã hết việc và ổn định.

Không thêm nhánh đóng ngay theo text “Thank you”, số lần click hoặc chỉ một marker click nếu chưa kiểm tra lại trạng thái trang.

### 7.5 Vì sao không copy toàn bộ `findSubmitButton()` vào watcher

Không nên sao chép danh sách selector dài của autofill vì:

- Autofill tìm nút để thử thao tác; watcher quyết định vòng đời browser, mức độ rủi ro khác nhau.
- `findSubmitButton()` là hàm bất đồng bộ dùng Locator/Playwright, còn `detectOfferContentInPage()` là inspector đồng bộ chạy trong DOM.
- Callback truyền vào `frame.evaluate()` phải tự chứa; không thể tham chiếu trực tiếp hàm/selector từ closure Node.
- Copy hai bản selector dễ tiếp tục lệch nhau ở lần nâng cấp sau.
- Selector quá rộng có thể khiến mọi trang có nút trung tâm không bao giờ được dọn.

Chỉ bổ sung tập CTA tối thiểu có bằng chứng lỗi, dùng lại các hàm lọc `shown`, `chrome`, `inOfferArea` trong cùng inspector.

## 8. Danh mục file cần sửa

### 8.1 Bắt buộc: `src/leads/actions/detect-offer-content-in-page.mjs`

Nội dung cần thay đổi:

- Thêm nhận diện CTA đơn lẻ trong vùng nội dung chính.
- Thêm cờ rõ nghĩa, đề xuất `hasCompletionAction`.
- Đưa cờ vào `hasOfferWork`.
- Trả cờ trong object kết quả.
- Cập nhật JSDoc kiểu trả về.
- Giữ nguyên lọc search/header/nav/footer/sidebar và nguyên tắc cột trung tâm.

Lý do: đây là điểm đang trả thiếu bằng chứng cho completion watcher.

Lưu ý: detector còn được dùng bởi:

- `src/leads/actions/has-unfinished-offer-work.mjs`
- `src/leads/actions/get-empty-offer-page-reason.mjs`
- `src/leads/actions/get-non-offer-reason.mjs`

Vì vậy phải chạy test của các luồng này, không chỉ test FinancialHelpFinder. Tác động mong đợi là trang có CTA trung tâm hợp lệ được giữ; trang có nút header/footer vẫn không bị tính nhầm.

### 8.2 Bắt buộc: `src/leads/actions/has-offer-work-evidence.mjs`

Nội dung cần thay đổi:

- Bổ sung `content.hasCompletionAction` vào kết quả tổng hợp.
- Giữ các cờ cũ để fixture/object cũ vẫn hoạt động.
- Cập nhật JSDoc nếu mô tả danh sách bằng chứng.

Lý do: đây là hàm mà completion watcher dùng để quyết định còn công việc hay không.

### 8.3 Bắt buộc: `tests/financialhelp-completion.test.mjs`

Cần thêm cả test mức quyết định và DOM thật:

1. **Thank-you còn `div.btn` trong `main`**
   - Không có form.
   - Không có offer card.
   - Không nằm trong scope form/step.
   - Sau khi danh sách tab đã ổn định hơn 3 giây, `canCompleteFinancialhelpSession()` vẫn phải trả `false`.

2. **CTA biến mất**
   - Xóa/ẩn CTA khỏi cùng DOM.
   - Khi không còn công việc khác, hàm phải cho phép hoàn tất.

3. **CTA ở header/nav/footer**
   - `.btn` ở các vùng này không được giữ browser.
   - Bảo đảm bản sửa không nhận mọi `.btn` toàn trang.

4. **CTA bị ẩn**
   - `display:none`, `visibility:hidden`, `opacity:0` hoặc không có client rect không được tính là CTA hiển thị.

5. **Watcher tích hợp**
   - Session confirmed lead có thank-you + `.btn`: `browserCloses` phải bằng 0.
   - Sau khi CTA biến mất và các điều kiện ổn định khác thỏa, browser mới được đóng.
   - Trạng thái lead vẫn được giữ.

6. **Các biến thể cần thiết**
   - `.thankyou-button`.
   - `.thankyou-actions a` nếu được đưa vào selector chính thức.

Ưu tiên dùng Chromium headless thật cho test DOM vì cần kiểm tra `getComputedStyle()`, `getClientRects()` và vị trí trung tâm. Giữ cơ chế skip khi môi trường không có browser như các test hiện tại.

### 8.4 Bắt buộc cập nhật tài liệu hành vi: `AGENTS.md`

Sau khi sửa, cập nhật mô tả ngoại lệ hoàn tất FinancialHelpFinder để ghi rõ: CTA `.btn`/thank-you hiển thị trong vùng nội dung chính cũng là công việc chưa hoàn tất.

Không thay đổi tài liệu thành hành vi chưa được triển khai. Cập nhật cùng commit sửa code/test.

### 8.5 Không cần sửa registry test nếu bổ sung vào file hiện có

`tests/run-tests.mjs` đã có `financialhelp-completion.test.mjs` trong `TEST_FILES`. Nếu chỉ thêm test vào file này thì không cần đổi runner.

Nếu tách thành file test mới, bắt buộc thêm tên file vào `TEST_FILES`; nếu không, `npm test` sẽ không chạy file mới.

## 9. Các file không cần sửa cho bản vá tối thiểu

| File | Vai trò | Quyết định |
|---|---|---|
| `src/leads/actions/watch-traffic-blocked-page.mjs` | Gắn listener, timer và thực hiện đóng/bù | Giữ nguyên; đã gọi đúng lớp kiểm tra |
| `src/leads/actions/complete-financialhelp-session.mjs` | Điều phối hai lần kiểm tra và ghi `thankyou_completed` | Giữ nguyên; không phải nguồn nhận diện DOM sai |
| `src/leads/actions/can-complete-financialhelp-session.mjs` | Chờ ổn định, duyệt tab/frame và fail-safe | Giữ nguyên nếu aggregator đã nhận cờ mới |
| `src/leads/actions/is-financialhelp-thankyou-url.mjs` | Nhận diện URL | Giữ nguyên |
| `src/autofill/find-submit-button.mjs` | Tìm CTA để bấm | Giữ nguyên; đã nhận `.btn` |
| `src/autofill/submit-frame-form.mjs` | Điều phối submit | Giữ nguyên cho lỗi này |
| `src/leads/actions/protect-confirmed-lead-session.mjs` | Bảo vệ IP confirmed | Giữ nguyên chính sách |
| `src/autofill/should-stop-after-lead.mjs` | Giữ browser khi chọn dừng sau lead | Giữ nguyên |
| Các module GoLogin/profile | Dừng process/profile theo yêu cầu app | Không sửa; chúng thực thi hậu quả của lệnh đóng |
| Logic bù slot | Mở phiên thay thế theo cấu hình | Không sửa trong bản vá detector |

Chỉ nên đụng vào các file ở mục 8.1–8.4 nếu test chứng minh còn thiếu một guard khác. Không mở rộng phạm vi sang GoLogin, autofill hay refill khi chưa có bằng chứng lỗi tại đó.

## 10. Các phương án không nên dùng

### 10.1 Cấm đóng mọi browser tại thank-you

Không nên. Cách này tránh được lỗi tức thời nhưng làm phiên hoàn tất không được dọn, có thể giữ proxy/profile vô hạn và phá yêu cầu chạy liên tục.

### 10.2 Cấm đóng mọi browser đã confirmed lead

Không nên cho bản vá này. FinancialHelpFinder là ngoại lệ được yêu cầu đóng khi thật sự hết việc; test hiện có khẳng định hành vi này.

### 10.3 Tắt watcher hoặc bỏ kiểm tra thank-you

Không nên. Watcher còn xử lý trang lỗi, tab phụ, duplicate, trang trắng và nhiều vòng đời khác. Tắt watcher sẽ tạo regression lớn.

### 10.4 Chỉ thêm delay dài hơn 3 giây

Không giải quyết nguyên nhân. Nếu CTA vẫn không được nhận diện, app vẫn đóng sau delay mới. Delay chỉ làm lỗi xuất hiện chậm hơn và kéo dài thời gian giữ phiên đã thật sự hoàn tất.

### 10.5 Nhận mọi phần tử có class chứa `btn`

Không nên. Có thể khớp container, nút menu, nút đóng hoặc thành phần không phải CTA. Phải kết hợp selector chính xác, visibility, vùng nội dung và bộ lọc noise.

### 10.6 Đánh dấu đã click rồi đóng ngay

Không nên. Click thành công ở phía client không chứng minh navigation/request đã hoàn tất. Phải quan sát trạng thái DOM/URL/tab sau thao tác.

## 11. Kế hoạch triển khai theo thứ tự

1. Thêm test DOM `main > div.btn` vào `tests/financialhelp-completion.test.mjs` để tái hiện lỗi.
2. Xác nhận test mới fail trên mã hiện tại: hàm completion trả `true` trong khi CTA còn hiển thị.
3. Sửa `detect-offer-content-in-page.mjs` để trả `hasCompletionAction`.
4. Sửa `has-offer-work-evidence.mjs` để đọc cờ mới.
5. Chạy lại test mới; xác nhận browser được giữ khi còn CTA.
6. Thêm test CTA biến mất, CTA ẩn và CTA header/footer.
7. Thêm test watcher tích hợp để chứng minh không phát lệnh đóng sớm.
8. Chạy các test liên quan non-offer/empty-page/thank-you chung vì detector được dùng lại.
9. Chạy toàn bộ `npm test`.
10. Cập nhật `AGENTS.md` theo hành vi cuối cùng.
11. Chỉ build app sau khi test đạt và không có phiên làm việc bị gián đoạn.

## 12. Lệnh kiểm tra

```sh
# Test trực tiếp luồng hoàn tất FinancialHelpFinder
node --test tests/financialhelp-completion.test.mjs

# Kiểm tra cú pháp các implementation bị sửa
node --check src/leads/actions/detect-offer-content-in-page.mjs
node --check src/leads/actions/has-offer-work-evidence.mjs

# Toàn bộ suite chính thức
npm test
```

Nếu test Chromium bị skip, cần cài browser theo toolchain hiện có trước khi kết luận đã kiểm tra đủ DOM:

```sh
npx playwright install chromium
```

Không dùng website thật làm test tự động bắt buộc. Dùng fixture offline/DOM tổng hợp, không đưa dữ liệu lead thật vào test.

## 13. Ma trận kiểm thử chấp nhận bản sửa

| Tình huống DOM/trạng thái | Kết quả bắt buộc |
|---|---|
| Thank-you + `main > div.btn` hiển thị | Giữ browser |
| Thank-you + `.thankyou-button` hiển thị | Giữ browser |
| Thank-you + `.thankyou-actions a` hợp lệ | Giữ browser nếu selector này được hỗ trợ |
| CTA đang hiển thị sau click, navigation chưa xong | Giữ browser |
| CTA đã bị xóa, không còn công việc | Cho phép hoàn tất sau guard ổn định |
| CTA `display:none`/`visibility:hidden` | Không tính là việc hiển thị |
| `.btn` chỉ nằm header/nav/footer/aside | Không chặn hoàn tất |
| Search box trong main | Không được đổi thành offer work |
| Link bài viết thông thường | Không được đổi thành CTA offer |
| Form/câu hỏi/offerwall chưa mở | Tiếp tục giữ như hiện tại |
| AI/recovery/popup đang chạy | Tiếp tục giữ như hiện tại |
| Không đọc được DOM | Giữ browser, fail-safe |
| Confirmed lead và thật sự hết việc | Được hoàn tất, không xóa trạng thái lead |
| `stopAutofillOnLead` đang bật | Không tự hoàn tất/đóng |

## 14. Tiêu chí hoàn thành

Bản sửa chỉ được coi là hoàn thành khi:

- Test tái hiện `.btn` fail trước sửa và pass sau sửa.
- Không còn lệnh `thankyou_completed` trong khi CTA hợp lệ vẫn hiển thị.
- Autofill có cơ hội bấm CTA; watcher không đóng trong thời gian chuyển bước.
- Trang thật sự hết CTA/form/câu hỏi/offer vẫn được đóng, tránh treo phiên.
- Các test header/footer/search/non-offer không bị regression.
- Toàn bộ suite chính thức pass.
- Tài liệu hành vi được cập nhật đồng bộ với code.

## 15. Kết luận

Lỗi không nằm ở GoLogin. App đã chủ động đóng phiên do bộ nhận diện công việc còn lại không tính CTA `.btn` đơn lẻ trên trang FinancialHelpFinder thank-you.

Bản vá đúng trọng tâm là:

1. Bổ sung CTA trung tâm còn hiển thị vào `detectOfferContentInPage()`.
2. Đưa bằng chứng đó qua `hasOfferWorkEvidence()`.
3. Giữ nguyên guard 3 giây, hai lần kiểm tra, bảo vệ lead và chính sách autofill/refill.
4. Thêm test DOM thật chứng minh browser được giữ cho tới khi CTA không còn cần xử lý.

## 16. Cập nhật 2026-11-15: bằng chứng HTML thật và bản sửa đã áp dụng

### 16.1 HTML thật đã lưu

Tìm thấy HTML thật của hai trang trong `/Users/codernguoitay/offer-html-full/full-capture-1794416535749.jsonl` (lưu 2026-11-11, chế độ ghi HTML đầy đủ):

| Trang | Phần tử bấm được | Bộ nhận diện cũ |
|---|---|---|
| `https://blog.financialhelpfinder.com/paththankyou.php` | Một nút `a.thankyou-button` "Return to Financial Help Finder" → `https://financialhelpfinder.com/` | Hết việc → đóng |
| `https://financialhelpfinder.com/thankyou.php` | 6 nút `button.button-box` (offer quảng cáo), link tải PDF, link footer | Hết việc → đóng |

Không trang nào có `.btn`. Giả thuyết `div.btn` ở mục 2–7 không khớp HTML thật.

### 16.2 Quyết định của người dùng

- `paththankyou.php`: **chưa xong**, phải bấm nút chuyển tiếp.
- `thankyou.php`: **đã xong**, tắt trình duyệt (giữ ngoại lệ đóng cả IP có lead như cũ).

### 16.3 Nguyên nhân thật

`isFinancialhelpThankyouUrl()` coi cả `paththankyou.php` là điểm hoàn tất (thêm 2026-11-12 để tránh luật thank-you chung đóng sau ~1 giây), nên sau 3 giây ổn định app đóng trình duyệt trước khi autofill bấm nút. Chạy autofill thật (offline) trên HTML đã lưu xác nhận autofill **tự bấm được** `a.thankyou-button` (`submit_clicked`, điều hướng sang `financialhelpfinder.com/`); lỗi chỉ ở vòng đời phiên.

### 16.4 Bản sửa

- `src/leads/actions/is-financialhelp-path-thankyou-url.mjs` (mới): nhận diện đúng trang trung gian.
- `isFinancialhelpThankyouUrl()`: chỉ còn `financialhelpfinder.com/thankyou.php` (+ `www`).
- `isThankYouUrl()`: loại trừ `paththankyou.php` để không rơi vào luật thank-you chung.
- Không đổi `detectOfferContentInPage()` / `hasOfferWorkEvidence()`: thêm `.thankyou-button` vào đó sẽ khiến `paththankyou.php` (và trang khác có nút "về trang chủ") không bao giờ hoàn tất, giữ slot vĩnh viễn với IP có lead.
- Test: `tests/financialhelp-paththankyou.test.mjs` (phân loại URL, watcher không đóng dù quá 3 giây, autofill bấm nút chuyển tiếp trên DOM thật).
