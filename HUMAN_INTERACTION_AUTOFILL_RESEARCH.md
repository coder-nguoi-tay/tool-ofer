# Nghiên cứu chuyển Autofill/Survey/Submit sang thao tác chuột và bàn phím

## 1. Mục tiêu và kết luận

Mục tiêu là thay cách **ghi dữ liệu trực tiếp vào DOM** bằng luồng thao tác tương tự ngườì dùng:

- Cuộn tới control, di chuyển chuột và click vào ô nhập/nhãn/lựa chọn.
- Xóa dữ liệu bằng phím, nhập từng ký tự, dùng phím điều hướng khi phù hợp.
- Click checkbox/radio/card/dropdown/submit bằng input pipeline của trình duyệt.
- Đọc lại trạng thái do website thiết lập để xác minh kết quả; không tự ép trạng thái rồi báo thành công.

**Kết luận: làm được với phần lớn text input, button, card, radio, checkbox và custom dropdown. Native select, date input, autocomplete địa chỉ và các trường ẩn cần chiến lược riêng. Không nên viết lại bộ nhận diện field hay bộ chọn câu trả lờì; chỉ nên thay lớp thực thi thao tác.**

Nên triển khai theo hướng:

1. Giữ hành vi hiện tại ở chế độ `compatible`.
2. Thêm `hybrid`: ưu tiên chuột/phím, chỉ fallback DOM khi thao tác không thành công; đây là chế độ nên thử nghiệm đầu tiên.
3. Thêm `physical` opt-in: cấm DOM fill/click/setter và synthetic event; nếu không thao tác được thì trả lỗi rõ ràng. Tên `physical` ở đây chỉ là tên chế độ, **không có nghĩa điều khiển chuột vật lý của macOS**.

Không nên bật `physical` làm mặc định ngay vì có thể làm giảm tỷ lệ hoàn tất form. Cần đo trên fixture local trước.

## 2. Ranh giới kỹ thuật cần hiểu đúng

Playwright điều khiển trình duyệt qua automation protocol. `page.mouse` và `page.keyboard` tạo input ở cấp trình duyệt, không di chuyển con trỏ chuột vật lý hay phát input toàn hệ điều hành.

- Tọa độ của Mouse là CSS pixels trong viewport của main frame.
- `mouse.move/down/up` phát các sự kiện chuột tương ứng trong trang.
- `keyboard.type()` phát các sự kiện phím và input theo từng ký tự; `keyboard.insertText()` chủ yếu phát `input`, không tương đương thao tác gõ phím đầy đủ.
- Ký tự ngoài US keyboard có thể không tạo đủ chuỗi `keypress` như phím vật lý; cần fixture cho tiếng Việt/ký tự đặc biệt nếu dữ liệu thật có các ký tự này.
- `isTrusted=true` chỉ nói event do trình duyệt tạo theo input pipeline; nó **không chứng minh hành vi giống ngườì**, không bảo đảm website chấp nhận dữ liệu và không phải bằng chứng về khả năng vượt anti-bot.

Vì vậy mục tiêu đúng là: **dùng đường input của browser, tăng tính nhất quán của event và chỉ báo thành công khi website xác nhận**. Không đặt mục tiêu “không thể bị phát hiện”.

Nguồn API:

- Playwright Mouse: https://playwright.dev/docs/api/class-mouse
- Playwright Keyboard: https://playwright.dev/docs/api/class-keyboard
- Playwright Locator: https://playwright.dev/docs/api/class-locator

## 3. Hiện trạng: đã có thao tác ngườì dùng nhưng chưa thuần input

| Nhóm thao tác | Đã có | Điểm còn ghi DOM hoặc bỏ qua thao tác thật | Kết luận |
|---|---|---|---|
| Text/textarea | `human-type-core.mjs` click, focus, Select All, Backspace, gõ từng ký tự | Xóa bằng `el.value=''`; fallback `fill()`/native setter; tự dispatch input/change/blur | Nâng cấp lên đầu tiên, nền tảng đã tốt |
| Di chuyển/click | `human-mouse-move.mjs` dùng quỹ đạo Bézier; `human-click.mjs` dùng mouse down/up | Fallback `locator.click()` rồi DOM `el.click()`; kết quả chỉ là boolean dispatched | Tách mode và bổ sung xác minh |
| Select trong autofill | Đã so khớp option chính xác theo value/label | Gán `select.value`, `selected`, tự dispatch event | Giữ matcher, thay executor |
| Select trong survey | Đã lọc placeholder và option disabled | Gán `sel.value` và tự dispatch event | Cần native-select controller |
| Checkbox | Đã thử humanClick, label, check/click và đọc lại `checked` | Cuối cùng vẫn DOM click, native setter `checked=true`, ép ARIA | Loại bỏ ép trạng thái khỏi `physical` |
| Survey radio/card | `performSurveyAnswer()` có cooldown, verify selection và chuyển câu | `safeSurveyClick()` kế thừa mọi DOM fallback của `humanClick()` | Giữ verification, thay click policy |
| Date | Có chuẩn hóa ISO và đọc lại giá trị | Chủ động dùng `fill()` rồi native setter; còn sửa class/error thủ công | Nhóm khó, làm sau text/select |
| Address/autocomplete | Có chờ suggestion, ArrowDown/Enter, chọn gợi ý | Tự focus/dispatch event, setter khi field rỗng, tự sửa class | Phải xác minh bằng suggestion/state của widget |
| Submit | Có tìm nút, kiểm tra lỗi, form scope và trạng thái màn | Fallback `button.click()`, `form.requestSubmit()`, dispatch submit | Strict chỉ click nút; không gửi form bằng code |

## 4. Các đoạn cần sửa hoặc nâng cấp, kèm lý do

### 4.1. Text input: giữ cách gõ, loại bỏ can thiệp DOM trong đường strict

**Vị trí:** `src/autofill/human-type-core.mjs:20-75`, `src/autofill/human-type-core.mjs:171-235`.

Các điểm cần đổi:

1. `human-type-core.mjs:65-75` đang xóa phần dư bằng `el.value=''` và tự dispatch `input` sau Select All + Backspace.
   - Trong `physical`, nếu đã focus đúng ô thì phím xóa phải là cách duy nhất.
   - Đọc lại giá trị sau khi xóa; nếu còn dữ liệu thì trả `clear_failed`, không tự xóa bằng setter.
2. `human-type-core.mjs:180-210` fallback `fill()` và native value setter.
   - Chỉ cho phép ở `compatible` hoặc `hybrid`.
   - `physical` trả `type_failed` hoặc `value_not_retained`.
3. `human-type-core.mjs:213-231` luôn tự dispatch input/change/blur.
   - Chuột/phím thật đã làm phát sinh event theo website; tự bắn lại có thể tạo event thừa hoặc sai thứ tự.
   - Strict chỉ rờì focus bằng `Tab` hoặc click control kế tiếp khi luồng cho phép, rồi đọc state.
4. `human-type-core.mjs:14-16` và wrapper `human-type.mjs:19-27` hiện trả `Promise<void>`.
   - Caller không biết thành công nhờ keyboard hay DOM fallback.
   - Cần trả kết quả có cấu trúc để quyết định retry, log và cộng tiến độ.

**Giữ nguyên:** hàng đợi theo page ở `humanType()` và `src/autofill/state/page-typing-chains.mjs`. Queue hiện đã bao các thao tác bên trong `humanTypeCore()`, gồm click/clear/type và một phần đọc lại. Cần mở rộng quyền input tới các thao tác ngoài wrapper, không tạo queue lồng tự khóa.

**Lý do ưu tiên:** text đã có nền tảng gõ và queue để tái sử dụng; phần còn thiếu chủ yếu là policy fallback, quyền input chung và kết quả xác minh. Chưa có benchmark để lượng hóa phần trăm hoàn thiện hoặc mức rủi ro so với select/date.

### 4.2. Click chuột: tách dispatched khỏi verified

**Vị trí:** `src/autofill/human-click.mjs:22-77`.

- `human-click.mjs:31-52` đã scroll, lấy bounding box, di chuyển chuột, down/up và trả `true`. Đây là phần nên tái sử dụng.
- `human-click.mjs:56-75` đang fallback `locator.click()` rồi `el.click()`.
  - `locator.click({force:false})` có thể nằm trong `physical` vì vẫn đi qua input pipeline của browser.
  - `el.click()` chỉ nằm trong `compatible`/`hybrid`.
- `true` hiện chỉ có nghĩa “đã phát thao tác”, không có nghĩa website đã chọn checkbox, mở dropdown hay chuyển câu.
  - Không đổi ngược ý nghĩa này trong cùng boolean vì dễ gây regression.
  - Thay bằng result mới `{ dispatched, verified, method, reason }` ở controller; verifier tùy loại control.
- `src/browser/locators/click-ready-control.mjs:9-29` đã biết click label hiển thị của checkbox/radio ẩn. Nên giữ cơ chế này nhưng đưa vào cùng policy và hàng đợi.

**Nâng cấp thêm:** kiểm tra target nhận được input trước `mouse.down`; sau `mouse.up` xác minh selection/navigation. Luôn thả chuột trong `finally` nếu đã nhấn, kể cả khi target detached; không bỏ bước thả vì đang kiểm tra overlay. Không retry khi thao tác trước còn chưa rõ kết quả. Sau click chờ điều kiện cụ thể thay vì chỉ sleep cố định.

### 4.3. Quỹ đạo chuột: sửa tính đúng đắn trước khi làm “tự nhiên” hơn

**Vị trí:** `src/autofill/human-mouse-move.mjs:14-56`.

- Vị trí bắt đầu ban đầu được chọn ngẫu nhiên ở `human-mouse-move.mjs:16-20`, không phải vị trí chuột thật. Điều này có thể tạo bước nhảy không nhất quán với chuỗi thao tác.
- Control point và jitter ở `human-mouse-move.mjs:38-50` chưa được giới hạn trong viewport; quỹ đạo có thể đi ra ngoài vùng hiển thị.
- Nên khởi tạo vị trí từ một lần move có chủ đích hoặc trạng thái chuột do controller quản lý; giới hạn mọi điểm trong viewport và tránh cập nhật `_lastMousePos` nếu lệnh move thất bại.
- Không cần tối ưu Bézier/typo như một cơ chế “né phát hiện”. Ưu tiên đúng target, không drift, không click hai lần và nhịp chờ phù hợp trạng thái UI.

**Tài liệu cần cập nhật khi triển khai:** comment tại `human-mouse-move.mjs:1-6` và `human-click.mjs:7-14` đang gợi ý “OS/CDP/isTrusted”; cần mô tả đúng là input qua browser protocol, không phải input OS. Comment `fill-select-or-text-field.mjs:122` về “chống bị phát hiện bot” cũng không nên được xem là bảo đảm.

### 4.4. Native select autofill: giữ so khớp, thay cách gán option

**Vị trí:** `src/autofill/fill-select-or-text-field.mjs` và các module trong `src/autofill/select/`.

- `buildSelectCandidates()` chuẩn bị candidate; `find-matching-select-option.mjs` là matcher thuần theo value/label, không thay đổi DOM.
- `select-option-with-human-interaction.mjs` chỉ điều phối loại select; `select-native-option-with-human-interaction.mjs` và `select-custom-option-with-human-interaction.mjs` giữ thao tác riêng của từng loại.
- `find-visible-custom-select-trigger.mjs` và `find-visible-custom-select-option.mjs` tách riêng việc nhận diện control khỏi hành vi click.
- `select-matching-option.mjs` chỉ giữ executor DOM tương thích cho select dạng danh sách/multiple.
- Native select được click rồi thử phím, chỉ fallback `selectOption()` khi popup macOS không nhận phím qua CDP; kết quả hybrid phải được phân biệt với thao tác chuột/phím thuần túy.
- Select gốc ẩn của Select2/Choices/Chosen được chuyển sang click trigger hiển thị, chờ option, click và xác minh giá trị. Executor được dùng bởi autofill chung, Uplevel và AI repair; action AI select thường giữ hợp đồng `selectOption()` hiện có.

### 4.5. Dropdown survey: dùng chung controller với autofill

**Vị trí:** `src/survey-solver/solve-dropdown-questions.mjs:53-82`.

- `solve-dropdown-questions.mjs:56-81` đang chọn ngẫu nhiên rồi gán `sel.value` và dispatch event.
- Tách hai bước: “tìm option hợp lệ cần chọn” và “thao tác chọn option”.
- Native select gọi cùng controller với mục 4.4; custom listbox cần click trigger, chờ option visible, click option và verify.
- Không tự đặt `data-survey-dropdown-filled='1'` rồi dùng nó như bằng chứng website đã nhận lựa chọn. Marker nội bộ chỉ dùng cho bookkeeping, còn `answered` chỉ tăng khi `verified=true`.

### 4.6. Checkbox/radio/card: bỏ bước ép checked trong strict

**Vị trí chính:** `src/autofill/handle-checkbox-field.mjs:68-149`.

Thứ tự đề xuất:

1. Click input nếu input thật sự visible/actionable.
2. Nếu input ẩn nhưng có label liên kết, click label bằng chuột.
3. Với card/custom control, click đúng phần tử có role/state, không click mù toàn bộ container.
4. Đọc `checked`, ARIA hoặc class do website thiết lập.
5. Nếu chưa xác minh, trả `selection_unverified`; strict dừng hoặc retry có giới hạn.

Các đoạn cần loại khỏi strict:

- `handle-checkbox-field.mjs:115-127`: DOM `target.click()`/`el.click()`.
- `handle-checkbox-field.mjs:129-148`: native setter `checked=true`, tự set `aria-checked` và dispatch event.
- `src/autofill/complete-frame-controls.mjs:158-187`: `check({force:true})`, DOM click và ép `checked` ở vòng hoàn tất trước submit. Đây là đường thứ hai có thể làm mất tính nhất quán nếu chỉ sửa handler chính.

`force:true` có thể bỏ qua actionability; strict nên dùng click/check không force và xác minh. Nếu website che control thật thì báo lỗi/unsupported thay vì ép state.

### 4.7. Survey: giữ bộ xác minh hiện có

**Vị trí:** `src/survey-solver/verification/perform-survey-answer.mjs:14-46`.

Đây là nền tảng tốt cần tái sử dụng:

- Kiểm tra target detached và trạng thái đã chọn.
- Cooldown chống click lặp.
- `dispatched`, `verified`, `advanced`, `reason` tách biệt.
- Đọc state sau click trong một khoảng timeout.

`src/survey-solver/verification/inspect-selection-state.mjs:8-16` đọc checked/ARIA/class do website thiết lập; `read-question-state.mjs:10-37` hỗ trợ nhận biết chuyển câu kể cả SPA không đổi URL. Không cần thiết kế lại.

Điểm cần đổi là `src/survey-solver/safe-survey-click.mjs:11-13`: hiện chỉ ủy quyền cho `humanClick()` nên vẫn nhận DOM fallback. Nên truyền mode/controller vào và trả result có nguồn thao tác. Với lựa chọn tự chuyển câu, `advanced=true` là bằng chứng hợp lệ ngay cả khi option cũ đã detached.

### 4.8. Date: không hứa strict hỗ trợ ngay

**Vị trí:** `src/autofill/fill-select-or-text-field.mjs:40-120`.

Code hiện cố tình dùng ISO `fill()`/setter vì date input chia segment theo locale. Đây là rủi ro thật, không nên chỉ thay bằng `keyboard.type(isoDate)` rồi cho là xong.

Cần fixture riêng cho:

- `input[type=date]` với locale/thứ tự ngày khác nhau.
- Text date có mask MM/DD/YYYY hoặc DD/MM/YYYY.
- Ba select ngày/tháng/năm.
- Datepicker custom mở bằng click.

Strict chỉ đánh dấu thành công khi `inputValue()` và/hoặc state datepicker khớp. Nếu chưa có chiến lược đúng locale, trả `unsupported_control` hoặc `value_not_retained`. Không sửa class `valid/error` hay che error như `fill-select-or-text-field.mjs:90-107` để tạo cảm giác hợp lệ.

### 4.9. Address/autocomplete và hidden fields: để website tự đồng bộ

**Vị trí:** `src/autofill/fill-select-or-text-field.mjs:176-305`.

- `fill-select-or-text-field.mjs:184-194` tự focus và dispatch input/keydown. Strict nên dùng click + keyboard thật.
- Giữ chờ suggestion và lựa chọn bằng ArrowDown/Enter hoặc click option. Phải kiểm tra suggestion đang mở, option đã chọn và giá trị hiển thị sau chọn.
- `fill-select-or-text-field.mjs:244-265` đang khôi phục field rỗng bằng setter. Trong strict phải báo widget đã xóa/không giữ giá trị, không tự ghi lại.
- Không tự dispatch chuỗi event ở `fill-select-or-text-field.mjs:278-298` trong strict.
- Hidden field như place id, token, state nội bộ không thể “click nhập” trực tiếp. Chỉ chấp nhận giá trị hidden do chính website đồng bộ sau khi chọn suggestion. Nếu website không đồng bộ, thao tác chưa hoàn tất.

Đây là nhóm có nguy cơ regression cao vì nhiều widget dùng state bên ngoài giá trị input hiển thị.

### 4.10. Submit: strict phải click nút, không requestSubmit

**Vị trí:** `src/autofill/submit-frame-form.mjs:302-338` và `src/autofill/submit-visible-form-fallback.mjs:51-78`.

- Giữ toàn bộ kiểm tra required/invalid/error, form scope, nút disabled/busy, cooldown và trạng thái màn trước khi submit.
- Khi tìm được nút: scroll + humanClick + chờ navigation, màn mới, success state hoặc validation error.
- `submit-visible-form-fallback.mjs:61` dùng `button.click()`, `:73-78` dùng `requestSubmit()`/dispatch submit. Cả hai không nằm trong `physical`.
- Strict nên ưu tiên nâng cấp `findSubmitButton()` để nhận diện nút custom và click nó. Nếu không tìm thấy nút actionable, trả `submit_target_not_found`, không gửi form bằng code.
- `session.hasSubmittedCurrentScreen` và action count chỉ được cập nhật theo contract thống nhất: đã dispatch đúng target, sau đó theo dõi kết quả. Không suy ra “hoàn tất” chỉ từ một lần gọi hàm submit.

## 5. Kiến trúc đề xuất

### 5.1. Tách quyết định khỏi thực thi

Không đưa thêm toàn bộ logic vào `human-type-core.mjs` hoặc `human-click.mjs`. Nên có một facade nhỏ, ví dụ:

```text
src/autofill/interaction/
  human-interaction-controller.mjs  // facade, mode, hàng đợi theo page
  interaction-result.mjs            // chuẩn hóa kết quả và reason
  type-text.mjs                     // click/focus/clear/type/read-back
  select-option.mjs                 // native select; nhận option đã được matcher chọn
  click-choice.mjs                  // input/label/card/radio/checkbox
  click-submit.mjs                  // submit button và verify điều hướng
```

Tên/thư mục là đề xuất, chưa phải code đã tồn tại. Các module phải giữ nhỏ; matcher, metadata và form-scope vẫn nằm ở module hiện có.

Caller chỉ quyết định **cái gì**:

```js
await interaction.typeText({ page, frame, field, value });
await interaction.selectOption({ page, frame, field, optionIndex });
await interaction.clickChoice({ page, frame, target });
await interaction.clickSubmit({ page, frame, button });
```

Controller quyết định **bằng cách nào**, dựa trên mode.

### 5.2. Contract kết quả thống nhất

```js
{
  dispatched: true,          // browser đã nhận một thao tác quyết định
  verified: true,            // website đã xác nhận state mong đợi
  method: 'mouse_keyboard', // nguồn thao tác thật sự
  reason: 'value_verified', // mã ổn định để log/test
  fallbackUsed: false,
  attempts: 1
}
```

Các `reason` tối thiểu:

- `target_detached`, `target_not_actionable`, `focus_failed`.
- `clear_failed`, `type_failed`, `value_not_retained`.
- `option_unmatched`, `selection_unverified`, `step_verified`.
- `unsupported_control`, `unsupported_in_physical_mode`.
- `submit_target_not_found`, `submit_unverified`.

Không nuốt mọi lỗi bằng `catch {}` ở facade. Có thể giữ việc không làm crash phiên, nhưng phải trả reason để caller không cộng tiến độ sai.

### 5.3. Ba chế độ tương tác

| Mode | Chuột/phím | Playwright locator input | DOM setter/click/synthetic event | Mục đích |
|---|---|---|---|---|
| `compatible` | Có như hiện tại | Có | Có như hiện tại | Giữ tương thích và so sánh baseline |
| `hybrid` | Ưu tiên | Fallback có kiểm soát | Chỉ fallback cuối, ghi log | Dùng thử nghiệm đầu tiên |
| `physical` | Có | Chỉ API đi qua input, không force | Không | Nghiên cứu strict, opt-in |

Trong `physical` vẫn được **đọc DOM** để tìm option, lấy state và xác minh. Điều bị cấm là thay đổi giá trị/trạng thái hoặc phát event thay cho thao tác ngườì dùng.

Không cần thêm thư viện; Playwright hiện có đủ primitive. Cấu hình ban đầu chỉ cần option nội bộ/env opt-in cho thử nghiệm; chưa cần thêm UI cho tới khi có số liệu ổn định.

### 5.4. Hàng đợi theo page cho toàn bộ chuỗi thao tác

Focus và con trỏ chuột là tài nguyên dùng chung của page. Hai coroutine có thể làm hỏng nhau ngay cả khi mỗi hàm riêng lẻ đúng:

```text
Task A click field A → Task B click field B → Task A gõ vào field B
```

Vì vậy cần queue theo `Page` cho toàn bộ transaction `scroll → click → type/select → verify`, không chỉ queue `keyboard.type`. Giữ WeakMap hiện có hoặc chuyển nó sang controller; không tạo queue toàn cục làm chặn các page độc lập.

Mỗi transaction cần:

- Timeout hữu hạn.
- Kiểm tra target còn connected và thuộc đúng form/frame.
- Không giữ lock vĩnh viễn khi navigation/reject promise.
- Không retry vô hạn khi state không thay đổi.

### 5.5. Instrumentation trước khi đổi mặc định

Mỗi thao tác nên log:

```text
control kind | mode | method | dispatched | verified | reason | attempts | durationMs | fallbackUsed
```

Không cần log giá trị nhạy cảm của record. Nhờ method/reason có thể trả lờì:

- Bao nhiêu field thành công hoàn toàn bằng mouse/keyboard?
- Control nào hay rơi vào DOM fallback?
- Strict thất bại vì focus, overlay, mask, validator hay chuyển câu?
- Hybrid tăng thờì gian bao nhiêu so với compatible?

## 6. Thuật toán thao tác theo từng control

### 6.1. Text/textarea

```text
Cuộn tới field
→ click bằng chuột vào vùng an toàn
→ xác minh document.activeElement hoặc focus state
→ Meta+A (macOS) / Control+A → Backspace
→ đọc lại field rỗng
→ keyboard.type từng ký tự
→ Tab/click tiếp nếu luồng cần blur
→ đọc inputValue và state validation do website tạo
```

- Không tiếp tục gõ nếu focus không đúng.
- Với tel/zip/mask, so sánh theo giá trị canonical đã có ở caller, nhưng vẫn kiểm tra website giữ giá trị.
- Retry phải giới hạn; lần retry strict vẫn dùng phím, hybrid mới được `fill()`/setter.
- Không dispatch input/change/blur bổ sung trong strict.

### 6.2. Checkbox/radio/card

```text
Xác định input hoặc label/card actionable
→ scroll + humanClick
→ chờ checked/ARIA/class thay đổi hoặc câu hỏi chuyển bước
→ verified mới tăng answered/progress
```

Nếu input ẩn nhưng label hiển thị, click label là hành vi hợp lệ. Nếu cả hai không actionable, strict báo lỗi; không set `checked` và không tự set ARIA/class.

### 6.3. Native select/custom listbox

Native select:

```text
Matcher chọn optionIndex
→ click/focus select
→ dùng phím theo chiến lược đã test cho loại select
→ Enter/Escape phù hợp để đóng popup nếu cần
→ đọc selectedIndex/value/text
```

Custom listbox:

```text
Click trigger
→ chờ listbox/option visible
→ click option bằng chuột hoặc ArrowDown/Enter
→ chờ trigger value/aria-activedescendant/selected state cập nhật
```

Không dùng chung verifier của native select cho custom listbox.

### 6.4. Submit

```text
Kiểm tra form còn required/invalid/error và địa chỉ suggestion đang mở
→ tìm submit button trong form scope
→ scroll + humanClick không force
→ chờ một trong: navigation / question advance / success / validation error / busy
→ cập nhật session theo kết quả, tránh double submit
```

Nếu không có nút, strict không dùng `requestSubmit()`.

## 7. Lộ trình triển khai đề xuất

### Giai đoạn 0 — Chốt baseline và khả năng quan sát

- Thêm result/method/reason mà không đổi hành vi `compatible`.
- Ghi nhận tất cả fallback: keyboard, locator click/check, DOM click, setter, synthetic event, `requestSubmit`.
- Chạy test hiện có và lưu baseline thờì gian/tỷ lệ hoàn tất trên fixture.
- Đầu ra: biết chính xác đường nào còn DOM, không phỏng đoán từ tên hàm `human*`.

### Giai đoạn 1 — Controller, queue và text input

- Tạo facade, truyền mode từ autofill session.
- Mở rộng queue theo page cho toàn transaction.
- Chuyển text/textarea sang result mới.
- Hybrid fallback được log; physical không setter/event.
- **Không** đổi select/date/address ở cùng bước để dễ khoanh vùng regression.

### Giai đoạn 2 — Checkbox, radio, card survey

- Đưa `humanClick`, `clickReadyControl`, `safeSurveyClick` về cùng policy.
- Chuyển cả `handleCheckboxField` và `completeFrameControls`; tránh sót đường ép checked thứ hai.
- Tái sử dụng `performSurveyAnswer` và `inspectSelectionState`.
- Kiểm tra không double click khi SPA auto-advance.

### Giai đoạn 3 — Native select và custom dropdown

- Tách `selectMatchingOption` thành matcher thuần và executor.
- Chuyển autofill select và survey dropdown sang chung controller.
- Thử nghiệm native popup trên macOS bằng fixture trước khi chốt chuỗi phím.
- Giữ `selectOption()` chỉ như hybrid fallback nếu số liệu cho thấy cần.

### Giai đoạn 4 — Date và address

- Làm sau khi các control cơ bản ổn định.
- Xây fixture theo locale/mask/datepicker và từng loại autocomplete.
- Strict cho phép trả unsupported; không tự đồng bộ hidden state.

### Giai đoạn 5 — Submit strict và opt-in thử nghiệm

- Chuyển submit button sang controller.
- Vô hiệu DOM submit fallback riêng trong physical.
- Chạy A/B `compatible` ↔ `hybrid` ↔ `physical` trên cùng fixture.
- Chỉ cân nhắc hybrid làm mặc định sau khi tỷ lệ hoàn tất và regression đạt ngưỡng; physical tiếp tục opt-in cho tới khi có dữ liệu đủ mạnh.

## 8. Test và tiêu chí nghiệm thu

### 8.1. Fixture local cần có

Dùng fixture/mock page, không cần chạy website thật ở giai đoạn nghiên cứu:

1. Text input thường, textarea, controlled input kiểu React, input tự clear khi sai.
2. Tel/zip mask, maxlength, Unicode và ký tự đặc biệt.
3. Checkbox visible, checkbox ẩn có label, radio group, card có ARIA.
4. Native select, select có optgroup/disabled, custom listbox.
5. Date native, date mask, ba select DOB, custom datepicker.
6. Address autocomplete trả suggestion chậm, chọn suggestion rồi website tự điền hidden field.
7. SPA auto-advance không đổi URL, option bị detach sau click.
8. Submit button thường/custom, nút bị overlay, validation error, busy và chống double submit.

Fixture nên ghi event log `pointer/mouse/key/input/change/blur/submit`, thứ tự event và `isTrusted`. `isTrusted` là dữ liệu quan sát, không phải tiêu chí duy nhất để kết luận thành công.

### 8.2. Unit/integration tests

Các test hiện có cần giữ và mở rộng đúng chủ đề:

- `tests/survey-verification.test.mjs`
- `tests/record-repair-policy.test.mjs`
- `tests/manual-answer-regression.test.mjs`
- `tests/spa-progress.test.mjs`
- `tests/address-suggestion.test.mjs`
- `tests/active-form-submit.test.mjs`
- `tests/submit-form-visibility.test.mjs`

Các test này đã nằm trong runner `tests/run-tests.mjs`; khi triển khai cần chạy toàn bộ bằng `node tests/run-tests.mjs`, không chỉ chạy test mới.

### 8.3. Điều kiện pass cho từng mode

**Compatible**

- Không thay đổi hành vi hiện tại ngoài result/log được bổ sung.
- Các test hiện tại pass.

**Hybrid**

- Đường thành công thông thường dùng mouse/keyboard trước.
- Fallback chỉ chạy sau khi thao tác chính thất bại và phải có log `fallbackUsed=true`.
- Kết quả cuối vẫn đọc state website, không chỉ tin vào lệnh fallback đã chạy.

**Physical**

- Không gọi `fill()`, native value/checked setter, `el.click()`, `requestSubmit()` hay tự dispatch event thay thao tác.
- Không cộng field/answered hoàn tất khi `verified=false`. Submit attempt/dispatched có counter riêng; chưa tăng màn hoàn tất hoặc lead thành công chỉ vì đã phát click.
- Focus sai, control bị che, option detached hoặc widget không giữ giá trị phải trả reason tương ứng.
- Không gõ xen kẽ khi hai task cùng page; các page khác nhau vẫn độc lập.
- Form scope, iframe và SPA advance không bị thay đổi so với baseline.

### 8.4. Số liệu so sánh trước khi đổi mặc định

Theo dõi tối thiểu:

- Completion rate theo fixture và loại control.
- Tỷ lệ `verified=true` không dùng fallback.
- Tỷ lệ fallback theo method/reason.
- Thờì gian trung vị và P95 mỗi form/control.
- Tỷ lệ retry, double click, stale/detached và submit lặp.

Không đặt mục tiêu “100% form đều physical”. Một số control có thể cần unsupported trong strict; điều quan trọng là kết quả trung thực và có thể đo.

## 9. Rủi ro và cách kiểm soát

| Rủi ro | Hậu quả | Cách kiểm soát |
|---|---|---|
| Chậm hơn do click/type/chờ verify | Giảm throughput | Chờ theo state thay vì sleep dài; đo P95; không random delay quá mức |
| Focus bị task khác chiếm | Gõ sai field, trộn dữ liệu | Queue toàn transaction theo page; kiểm tra activeElement |
| SPA render lại giữa thao tác | Detached, click nhầm | Kiểm tra connected trước/sau; retry giới hạn; dùng question state |
| Overlay/custom checkbox | Mouse miss hoặc không toggle | Click label actionable; strict không ép checked |
| Native select/date khác locale | Chọn sai option/ngày | Fixture riêng; verify; unsupported thay vì đoán |
| Autocomplete phụ thuộc hidden state | Input nhìn đúng nhưng form không hợp lệ | Chọn suggestion thật; để website đồng bộ hidden state |
| Tắt fallback làm form không hoàn tất | Completion rate giảm | Hybrid trước, physical opt-in, giữ compatible |
| Random hóa quá mức | Khó reproduce test | Seed/inject timing cho test; reason và event log đầy đủ |
| Hiểu sai `isTrusted` | Kỳ vọng sai về anti-bot | Tài liệu/log nói đúng browser input; không đưa ra bảo đảm né phát hiện |

## 10. Phạm vi nên chốt cho lần triển khai đầu tiên

Một bản thay đổi đầu tiên có kích thước vừa phải nên chỉ gồm:

1. `InteractionResult` + log method/reason.
2. Mode `compatible`/`hybrid`/`physical`, mặc định compatible trong lúc phát triển.
3. Queue theo page cho toàn transaction.
4. Text input strict + hybrid fallback.
5. Checkbox/radio/card strict, xử lý cả hai đường `handleCheckboxField` và `completeFrameControls`.
6. Test local cho text, checkbox/radio, focus serialization, survey verify và no-DOM-fallback ở strict.

Chưa gộp date/address/native select vào bản đầu nếu chưa có fixture; cũng chưa cần UI hay dependency mới.

**Tiêu chí hoàn thành bản đầu:** các control trong phạm vi dùng chuột/phím thật sự; strict không có DOM fallback; mọi progress đều dựa trên verification; toàn bộ test runner pass; có số liệu so sánh compatible/hybrid/physical trước khi mở rộng sang select, date, address và submit strict.

## 11. Phạm vi áp dụng theo yêu cầu màn hình (2026-11-11)

Mọi slot bật chuyển động chuột mô phỏng và lớp con trỏ riêng trong viewport. Mỗi tab có trạng thái chuột độc lập; con trỏ vật lý macOS không thể đồng thời xuất hiện ở nhiều cửa sổ.

Đây là giới hạn phạm vi của cơ chế hiện có, chưa phải triển khai toàn bộ controller hay chế độ physical của nghiên cứu. Lớp con trỏ chỉ cập nhật phần hiển thị riêng với pointer-events:none; không thay giá trị/checked/ARIA của control website.

<a id="runtime-flow"></a>

## 12. Truy vết toàn bộ quá trình chọn câu trả lời và nhập form


**Đối chiếu bổ sung ngày 2026-11-11:** các phần 12–17 mô tả source trong workspace; không tự khẳng định app đang mở đã chứa các thay đổi này. Các trạng thái/contract mới ghi rõ “đề xuất” chưa phải API đã triển khai. Số dòng source cũ chỉ là dấu mốc lúc nghiên cứu, ưu tiên tên hàm và đường dẫn khi truy vết.

Liên kết cố định để tra cứu sau khi tài liệu thêm dòng:

- [Luồng runtime](#runtime-flow)
- [Chọn câu trả lời](#answer-design)
- [Nhập form](#form-design)
- [Trạng thái chống lặp](#transaction-state)
- [Trace và log](#trace-design)
- [Thứ tự triển khai](#implementation-order)

Phần này đi sâu vào **thứ tự quyết định và thao tác**, không chỉ primitive mouse/keyboard. Mục tiêu là khi cần sửa một hành vi, có thể xác định đúng tầng: nhận diện, chọn giá trị, thực thi, xác minh hay ghi tiến độ.

### 12.1. Vòng đờì một lượt quét thực tế

```text
attachAutofill()
→ chọn một record riêng cho phiên
→ attachAutofillPageWatcher() cho từng tab
→ timer thức mỗi 500 ms; scan thực tế có backoff tới 5 giây khi không tiến triển
→ sự kiện navigation/DOM load hoặc trigger chủ động có thể bỏ khoảng chờ
→ khóa filling chặn hai lượt quét chồng nhau trên cùng page
→ fillPageForms()
→ chọn frame + active form scope
→ processFrameSurveys() trước
→ fillFrameFields()
→ completeFrameControls()
→ kiểm tra validation / rescueRequiredField()
→ submitFrameForm()
→ nếu không tiến triển: đọc visible state, thử repair từ record, rồi mới xét AI
```

Vị trí:

- Chọn/clone record: `src/autofill/attach-autofill.mjs:83-108`.
- Khóa `filling`, lịch quét, repair tại chỗ và kích hoạt AI: `attachAutofillPageWatcher()` trong `src/autofill/attach-autofill-page-watcher.mjs`.
- Điều phối form: `src/autofill/fill-page-forms.mjs:146-288`.

Hệ quả quan trọng:

1. Một câu hỏi/field có thể được nhìn thấy lại sau mỗi lượt quét, với nhịp thực tế từ khoảng 500 ms tới 5 giây hoặc được đánh thức chủ động. Cần identity và trạng thái xuyên nhiều lượt quét, không chỉ biến local trong một hàm.
2. `filling` chỉ chặn watcher chồng nhau; nó không thay thế hàng đợi input cho mọi đường gọi ngoài watcher như AI/repair.
3. Khi một lượt có tiến triển, watcher quét lại sau khoảng 80 ms. Nếu chỉ dùng delay để chờ website phản hồi, lượt sau có thể thấy state trung gian và thao tác lặp.
4. `runMultiStepSurveyLoop()` ở `src/survey-solver/run-multi-step-survey-loop.mjs:12-24` là API độc lập được export/test; luồng runtime chính đang gọi `solveSurveyStep()` qua watcher, không phải một vòng survey riêng duy nhất.

### 12.2. Quá trình chọn câu trả lờì hiện tại

Có hai nhánh điều phối:

- Có form scope: `src/autofill/process-frame-surveys.mjs:34-36` gọi `processScopedFormControls()`.
- Không có form scope: chạy chuỗi handler tại `src/autofill/process-frame-surveys.mjs:38-198`.

Trong scoped pipeline:

```text
processScopedWidgets()
→ Twy → semantic age/preference/vehicle → AlphaQ → MUI
→ nếu không có widget action:
   extract prepopulated data
→ Alpha special fields / custom gender / Uplevel sync
→ handleRadioAndSurveyOptions()
→ solveSurveyStep(autoClickNext=false)
```

Vị trí: `src/autofill/form-scope/process-scoped-widgets.mjs:13-23` và `src/autofill/form-scope/process-scoped-form-controls.mjs:18-40`.

`solveSurveyStep()` tiếp tục chia theo loại control:

```text
Rating → Matrix → Checkbox/multi-choice → Dropdown
→ sau mỗi solver, đọc question state để phát hiện auto-advance
```

Vị trí: `src/survey-solver/solve-survey-step.mjs:17-43`.

Như vậy có **nhiều tầng nhận diện và policy chọn đáp án**, không phải một thuật toán duy nhất:

| Đường xử lý | Cách chọn hiện tại | Vị trí |
|---|---|---|
| Semantic age/preference/vehicle | Record → ưu tiên theo loại → first answer hợp lệ; có rank/lọc candidate | `src/autofill/handle-survey-semantic-questions.mjs:23-57`; `src/autofill/choose-semantic-answer.mjs:12-67` |
| Nhóm `btn-option` | Random toàn nhóm sau lọc noise/selected/recent click | `src/autofill/handle-radio-and-survey-options.mjs:181-224` |
| Native radio | Record theo group key nếu có → random tối đa hai option đầu | `src/autofill/handle-radio-and-survey-options.mjs:270-311` |
| Card/button/question group | Nhiều heuristic câu hỏi → Yes nếu có → random tối đa hai option đầu | `src/autofill/handle-radio-and-survey-options.mjs:557-671` |
| Rating | Chọn vị trí khoảng 75% thang điểm | `src/survey-solver/solve-rating-questions.mjs:65-80` |
| Matrix | Chọn cột giữa cho từng hàng | `src/survey-solver/solve-matrix-questions.mjs:48-62` |
| Multi-checkbox | Lọc None of the Above, chọn số lượng theo min/max và random | `src/survey-solver/solve-survey-checkboxes.mjs:94-116` |
| Dropdown survey | Chọn random option hợp lệ rồi gán DOM | `src/survey-solver/solve-dropdown-questions.mjs:53-82` |
| Select chưa match record trong form | Chọn random option hợp lệ rồi gán DOM | `src/autofill/handle-unmatched-field.mjs:20-53` |

**Kết luận:** muốn thay đổi quá trình chọn câu trả lờì một cách có kiểm soát, cần sửa cả policy và ownership, không chỉ thay `locator.click()` bằng `page.mouse`.

### 12.3. Quá trình nhập form hiện tại

Với từng `input, textarea, select` trong `fillFrameFields()`:

```text
Kiểm tra đúng active form scope
→ bỏ disabled/honeypot/field ẩn
→ bỏ field đang có typing lock hoặc đã marked filled
→ collectFieldMetadata()
→ checkbox đi qua handler riêng
→ bỏ readOnly/radio/file/button...
→ matchFieldValue(metadata.names, record)
→ nếu không match: handleUnmatchedField()
→ nếu đã có giá trị: handleExistingFieldValue()
→ fillSelectOrTextField()
→ đọc lại giá trị
→ gắn data-ux-filled + cộng progress + log
```

Vị trí chính: `src/autofill/fill-frame-fields.mjs:29-279`.

Các quyết định dữ liệu nằm ở:

- Metadata/label/name/placeholder/container: `src/autofill/collect-field-metadata.mjs:8-76`.
- Match và format theo record: `src/autofill/match-field-value.mjs:22-256`.
- Giữ giá trị có sẵn: `src/autofill/handle-existing-field-value.mjs:8-36`.
- Điền text/select/date/address: `src/autofill/fill-select-or-text-field.mjs:19-308`.

Ngoài đường chính còn có:

- Phone modal gõ riêng: `src/autofill/fill-page-forms.mjs:182-201`.
- Required-field rescue dùng chung AI executor: `src/autofill/form-scope/rescue-required-field.mjs:11-18`.
- AI fill/type/select/check: `src/ai-assist/execute-action.mjs:55-134` và các nhánh tiếp theo của file.
- Các handler Alpha/Uplevel/site-specific đồng bộ field riêng trước hoặc sau đường điền thông thường.

Do đó strict mode phải được truyền tới các đường phụ này. Nếu chỉ sửa `fillSelectOrTextField()`, rescue/AI/site handler vẫn có thể ghi DOM.

### 12.4. Những thay đổi đã có trong source và giới hạn còn lại

| Thành phần | Hiện có trong source | Chưa được suy ra là đã có |
|---|---|---|
| Chọn màn hình mô phỏng | `configurePageMousePolicy()` gắn slot; mọi slot có quỹ đạo/con trỏ riêng | Con trỏ DOM không phải con trỏ vật lý macOS; không phải mọi click ngoài autofill đều đi qua controller |
| Nhập nhanh | `humanTypeCore()` di chuyển/click bằng mouse trên mọi slot; slot sau vẫn dùng fill đã xác minh trước khi quay về gõ tuần tự | Chưa có `InteractionResult` đầy đủ; kiểm tra blur hiện chưa bao phủ mọi validator bất đồng bộ |
| Theo dõi form đứng | `inspectAutofillChallenge()` phân biệt form với challenge; `getAutofillScanDelay()` giãn scan | Chưa có observer đánh thức cho mọi thay đổi DOM; form AJAX im lặng có thể phải chờ lượt scan kế tiếp |
| Sửa trước AI | `repairVisibleFieldsFromRecord()` thử dữ liệu thật, không submit; cache lần thử theo DOM và record | Chưa thay thế registry field/question; không đủ cho widget không nhận diện được |
| Chờ AI CLI | `waitForAiCapacity()` đặt chỗ, hủy chờ trạng thái cũ, có giới hạn chờ mặc định 15 giây | Giới hạn này không tự bao phủ đường Codex SDK/MCP chạy riêng; không phải timeout phản hồi AI |
| Lead đã xác nhận | `protectConfirmedLeadSession()` giữ cờ bảo vệ và cho form tiếp tục xử lý | Có lead không chứng minh mọi field đã hoàn tất; bảo vệ browser không có nghĩa dừng autofill |
| Data Saver | Chặn media và danh sách hẹp dịch vụ video/replay bên thứ ba | Số request bị chặn chưa phải số byte tiết kiệm hoặc mức giảm trên hóa đơn proxy |

`shouldAnimatePageMouse()` cho phép chuyển động trên mọi tab, kể cả caller chưa gắn slot; popup giữ slot của phiên sở hữu. Đây là chuột mô phỏng trong từng renderer, không phải con trỏ vật lý macOS.

**Phạm vi queue hiện tại:** `humanType()` đã bao cả việc click/clear/type/đọc lại nằm bên trong `humanTypeMarked()`/`humanTypeCore()`, không chỉ lệnh gõ từng ký tự. Phần còn thiếu là các click/scroll/verify chạy ở ngoài wrapper và những producer khác. Không tạo một queue mới lồng vào queue cũ rồi tự chờ chính mình.

### 12.5. Những cổng phải kiểm tra khi thấy form nhưng không có hành động

```text
Có record cho đúng tab?
→ mode có cho phép autofill? (manual/skip/consent_only phải được tôn trọng)
→ lead đã confirmed hay đang chờ kiểm tra chưa có kết quả?
→ renderer có đọc được DOM không?
→ form thật hay challenge đang chiếm màn hình?
→ chọn đúng frame/form, không giữ scope cũ đã mất?
→ field được matcher nhận diện và còn thiếu dữ liệu?
→ có owner/actor khác đang giữ quyền input?
→ thư viện đã thử; local repair có dữ liệu để sửa?
→ AI đang chạy, xếp hàng, bị tắt, bị chặn retry hay không có action?
```

Mỗi cổng cần một reason quan sát được. `inspection_unavailable`, `missing_record`, `policy_blocked`, `queue_waiting` và `unsupported_control` là các nguyên nhân khác nhau; không gộp tất cả thành “AI đang xử lý” hoặc “Cloudflare”. Khi chưa đọc được renderer, không cho AI đoán locator và không chạy input mới chồng lên actor chưa kết thúc.

Nếu cùng session có nhiều page, counter cấp session có thể tăng vì page khác. Thiết kế transaction mới cần tiến độ theo page/epoch để tránh hiểu nhầm rằng page đang đứng đã tiến triển; vẫn tổng hợp lên counter session để hiển thị.


<a id="answer-design"></a>

## 13. Thiết kế đề xuất cho quá trình chọn câu trả lời

### 13.1. Chuẩn hóa thành sáu bước

```text
OBSERVE: chụp câu hỏi và option trong scope
→ CLASSIFY: single/multi/rating/matrix/dropdown + semantic type
→ DECIDE: tạo AnswerPlan, chưa click
→ ACT: click input/label/card hoặc thao tác phím
→ VERIFY: kiểm tra state website hoặc question advance
→ COMMIT: mới đánh dấu handled và tăng answered/progress
```

Hiện nhiều handler trộn cả sáu bước trong cùng một hàm. Nên tách dần theo contract, không cần viết lại tất cả selector cùng lúc.

`AnswerPlan` đề xuất:

```js
{
  questionId: 'origin/path|question|sorted-options',
  questionType: 'single_choice',
  semanticType: 'age_range',
  selectedOptionIds: ['option-uid'],
  selectionPolicy: 'record',
  minimumSelections: 1,
  maximumSelections: 1,
  allowAutoAdvance: true,
  expectedOutcome: 'selection_or_advance'
}
```

`questionId` là identity ổn định; option UID chỉ là handle tạm cho DOM hiện tại. Không dùng option UID random làm identity xuyên lượt quét.

### 13.2. Một câu hỏi chỉ có một owner tại một thờì điểm

Hiện semantic ownership dùng `data-ux-semantic-owned`; generic buttons dùng `data-ux-clicked`/signature; survey solver dùng các UID khác. Các cơ chế này chưa tạo thành một registry chung.

Cần một registry theo frame/page với trạng thái:

```text
observed → planned → acting → verifying → completed
                              ↘ retryable_failed
                              ↘ unsupported
```

Quy tắc:

1. Trước khi click, solver phải claim `questionId`; solver khác thấy `acting/verifying/completed` thì không thao tác.
2. Claim phải tồn tại qua DOM rebuild; marker trên element chỉ làm phụ.
3. `completed` chỉ được ghi sau verification. Click thất bại giải phóng claim hoặc chuyển `retryable_failed` có cooldown.
4. Navigation/question advance hủy claim cũ, không cho thao tác tiếp trên locator cũ.
5. Handler chuyên biệt vẫn được ưu tiên, nhưng phải claim cùng registry thay vì chỉ dựa vào class/attribute riêng.

Có thể tái sử dụng nền `buildSurveyAnswerSignature()` tại `src/autofill/build-survey-answer-signature.mjs:11-20` và WeakMap ở `state/handled-survey-answer-signatures.mjs`, nhưng cần mở rộng từ Set “đã handled” thành trạng thái có owner/result. Không dùng `data-ux-*` làm bằng chứng website đã chọn.

### 13.3. Tách selection policy khỏi selector

Các selector hiện có giá trị vì xử lý nhiều loại HTML. Nên giữ chúng nhưng đưa candidate về một shape chung:

```js
{ optionId, label, value, inputKind, role, selected, enabled, visible, source }
```

Sau đó một policy quyết định:

```text
Nếu record có dữ liệu phù hợp → chọn theo record
Nếu có rule chuyên biệt → áp dụng rule đã khai báo
Nếu nhánh cần random nhưng pickRandom=false → policy_blocked; không áp dụng random
Nếu được phép fallback → áp dụng block-score/first_answer/random theo đúng cấu hình
Nếu không có candidate hợp lệ → unsupported/ambiguous, không click mù
```

Điểm cần sửa cụ thể:

- `handle-radio-and-survey-options.mjs:192-193`, `:281-285`, `:631-638`: ba đường random khác nhau nên gọi policy chung để cấu hình và log nhất quán.
- `handle-unmatched-field.mjs:20-53`: select chưa match record đang random mà không đi qua `performSurveyAnswer`; cần chuyển sang dropdown controller và kiểm tra `pickRandom`.
- `solve-rating-questions.mjs:70-74` và `solve-matrix-questions.mjs:53-56`: giữ chiến lược mặc định nếu đó là yêu cầu nghiệp vụ, nhưng phải ghi rõ `selectionPolicy='rating_default'/'matrix_middle'` thay vì nhìn như lựa chọn từ record.
- `choose-semantic-answer.mjs:24-67`: giữ quy tắc §17 và fallback first answer hợp lệ; không thay bằng random chung.
- Comment `process-frame-surveys.mjs:77-78` nói “mơ hồ thì không bấm” nhưng semantic fallback hiện có `first_answer`; khi triển khai cần đồng bộ comment/tài liệu với policy thật.

### 13.4. Verification phải theo kế hoạch, không một kiểm tra chung cho mọi câu

| Loại câu | Bằng chứng tối thiểu |
|---|---|
| Single radio/card | Đúng option được chọn, hoặc question identity đổi sau auto-advance |
| Multi-checkbox | Đúng các option mong muốn được chọn; đạt min, không vượt max; không chọn None cùng option khác |
| Rating | Đúng value/index được website đánh dấu |
| Matrix | Mỗi hàng có đúng một lựa chọn mong muốn; không chỉ đếm tổng click |
| Native select | `selectedIndex/value` đúng option sau khi popup đóng/change được xử lý |
| Custom listbox | Trigger value + ARIA/selected state đúng; listbox đã đóng nếu website yêu cầu |
| Auto-advance | Question identity mới hoặc completion state, không mặc định thành công khi option chỉ biến mất đơn lẻ |

`performSurveyAnswer()` làm tốt phần single selection/auto-advance. Multi-select cần thêm plan ở caller vì một lần click chưa hoàn thành câu hỏi. `solveSurveyCheckboxes()` hiện đếm lại state ở `:111-116`, có thể giữ nhưng nên so sánh với selected IDs và giới hạn của plan.

Nút Next cần tách khỏi answer verification: `click-survey-next-button.mjs:43-45` hiện trả `true` khi mới dispatch. `solve-survey-step.mjs:36-37` gọi trạng thái là `advanced/next_dispatched`; tên này đúng với dispatch nhưng không được dùng như bằng chứng đã sang màn. Nên bổ sung `nextVerified` bằng `didQuestionAdvance()` trước khi commit chuyển bước.

### 13.5. Identity phải phân biệt dựng lại DOM với một bước mới thực sự

`buildSurveyAnswerSignature()` hiện ghép origin/path, tiêu đề và các nhãn đã sort. `getHandledSurveySignatures()` giữ Set theo frame; chưa thấy cơ chế reset Set theo document/record trong các hàm này. Đây là nền để tái sử dụng, chưa đủ làm khóa transaction duy nhất.

Các va chạm phải có fixture trước khi chọn thuật toán:

| Tình huống | Điều cần phân biệt |
|---|---|
| React dựng lại cùng câu hỏi, mất mọi `data-ux-*` | Vẫn là một câu; không chọn đáp án mới |
| Hai câu giống chữ và cùng Yes/No ở hai fieldset | Hai question khác nhau trong cùng document |
| Hai iframe có cùng URL và nhãn | Không dùng chung registry chỉ vì URL giống nhau |
| Reload hoặc đổi record trên cùng Page/Frame | Không dùng kết quả completed của lần chạy cũ cho record mới |
| Hai bước liên tiếp có nội dung hoàn toàn giống nhau | Cần step id/state transition riêng của website; không thể phân biệt chắc chỉ từ nhãn |
| Chỉ đổi query/hash hoặc xáo thứ tự option | Chưa đủ bằng chứng câu cũ đã hoàn tất hay xuất hiện câu mới |

Khóa đề xuất gồm `sessionRunId + pageKey + frameKey + documentEpoch + formFlowKey + stepEpoch + questionKey + recordRevision`. Các epoch/revision là định danh vòng đời nội bộ, không chứa email/IP/giá trị field. Không lưu locator, vị trí DOM hoặc UID random vào phần business identity ổn định.

`stepEpoch` chỉ tăng khi có bằng chứng: step marker của website đổi, transition được xác minh hoặc document mới. Không tăng chỉ vì có MutationObserver, screenshot khác, DOM node được thay thế, checkbox đổi checked hay timer cập nhật chữ. Nếu website không cung cấp đủ bằng chứng cho hai bước hoàn toàn giống nhau, trả `ambiguous_transition` thay vì đoán.

Locator được Playwright tìm lại trên DOM tại mỗi action; một selector cũ vẫn có thể khớp node mới có cùng nhãn. Vì thế, trước ACT phải kiểm tra epoch, scope và dấu vết target, không chỉ gọi lại locator cũ. [Nguồn: Playwright Locators](https://playwright.dev/docs/locators).

### 13.6. Chốt AnswerPlan một lần cho mỗi attempt

Policy nên ghi `record`, `semantic_rule`, `first_answer`, `random`, `rating_default` hoặc `matrix_middle` rõ ràng; đó là nguồn quyết định, không phải xác suất đáp án đúng.

- Random chỉ chạy khi lập plan; retry của cùng câu giữ nguyên option đã chọn, không bốc lại mỗi scan.
- Khi candidate mất hoặc option bị disable, hủy plan và quan sát lại; không tự thay bằng option đầu.
- `pickRandom=false` chặn nhánh random. Nó không tự xóa rule semantic deterministic đã được yêu cầu tại §17 của `PLAYWRIGHT_CORE_INTEGRATION_RESEARCH.md`.
- Matcher cần phân biệt `known_field_missing_record` với `unknown_survey_question`; không biến một select state/gender/DOB thiếu record thành câu survey để random.
- Giá trị `0`/`false` hợp lệ phải được phân biệt với dữ liệu thiếu; contract mới không dùng một kiểm tra falsy chung cho mọi loại field.

**Khoảng trống cụ thể:** `handleUnmatchedField()` vẫn random select khi `valueToFill` rỗng, không kiểm `pickRandom` và chỉ đọc lại non-empty; danh sách của nhánh này còn chưa lọc đầy đủ disabled/optgroup disabled. Không nhầm với trường hợp **record có giá trị nhưng không có option khớp**, vốn đã được siết trong `selectMatchingOption()`. Hai đường cần test riêng.

### 13.7. Tách claim, hành động và chuyển bước

Có ba quyền khác nhau:

1. **Question claim:** ngăn hai solver chọn cùng câu.
2. **Page input lease:** ngăn chuột/phím của hai tác vụ xen vào nhau.
3. **Pending transition:** ngăn mọi nhánh bấm Next/Submit lần nữa khi lần trước đã dispatched nhưng chưa có kết quả.

Một claim không thể thay cho cả ba. Sau click auto-advance, dừng xử lý danh sách cũ; không để generic solver nhặt câu mới trong cùng snapshot.

`processScopedFormControls()` hiện gắn `widgetAdvanced=true` khi widget trả action count dương. Đây là tín hiệu điều phối “nhường lượt”, chưa phải bằng chứng chuyển bước. Contract mới nên có riêng `handledCurrentPass` và `advancedVerified` để tên trạng thái không làm caller hiểu nhầm.

Tương tự, `runMultiStepSurveyLoop()` hiện tăng `completedSteps` khi `nextClicked=true`. Khi mở rộng loop phải chỉ commit bước sau `nextVerified`/auto-advance đã xác minh; Next dispatch nhưng URL/DOM chưa đổi vẫn là `transition_pending`. Không nối loop này vào watcher để tạo vòng nhập thứ hai khi chưa sửa contract.


<a id="form-design"></a>

## 14. Thiết kế đề xuất cho quá trình nhập form

### 14.1. Mỗi field cần một FieldPlan trước khi thao tác

```js
{
  fieldId: 'stable-field-identity',
  controlKind: 'text',
  source: 'record.email',
  rawValue: '...',
  expectedValue: '...',
  existingValuePolicy: 'preserve_valid',
  clearBeforeType: true,
  verification: 'normalized_value',
  allowSuggestion: false,
  interactionMode: 'hybrid'
}
```

Không đưa giá trị thật vào log/trace công khai; ví dụ trên chỉ mô tả contract.

`FieldPlan` giúp phân biệt:

- Sai giá trị ngay từ matcher.
- Giá trị đúng nhưng gõ không vào.
- Gõ vào nhưng mask biến đổi.
- Website xóa sau blur.
- Giá trị hiển thị đúng nhưng widget chưa chọn suggestion/hidden state.

### 14.2. Chuẩn hóa pipeline nhập

```text
Đọc metadata + record
→ tạo expected value và policy cho field
→ snapshot giá trị/state trước thao tác
→ nếu giá trị cũ được giữ: xác minh rồi dừng, không gõ lại
→ claim field + vào page input queue
→ scroll → click → verify focus → clear → type/select
→ đọc lại ngay sau input
→ blur bằng thao tác phù hợp nếu cần
→ đọc lại sau microtask/validation
→ verified mới ghi progress
```

Cần hai lần đọc vì một số website nhận ký tự nhưng xóa/định dạng lại sau `change` hoặc blur. Chờ điều kiện hoặc một khoảng ngắn có timeout; không sleep dài cố định.

### 14.3. Quyết định rõ khi field đã có dữ liệu

`src/autofill/handle-existing-field-value.mjs:13-35` hiện:

- Nếu giá trị giống expected: mark filled và giữ.
- Nếu khác nhưng không phải placeholder mask/invalid: vẫn giữ, không ghi đè.

Đây là policy hợp lý nếu ưu tiên dữ liệu ngườì dùng/website, nhưng cần được nêu rõ thành `preserve_valid` và có log. Không nên để controller tự quyết định khác. Nếu chế độ repair yêu cầu dùng record thì caller phải chọn `replace_with_record` có chủ đích.

Ngoài ra `handle-existing-field-value.mjs:16-27` và `fill-frame-fields.mjs:222-236` đang tự xóa class error, thêm valid và che helper. Nên tách:

- Marker tiến độ của tool: được giữ nếu cần.
- Class/ARIA/error của website: không sửa để giả lập hợp lệ.
- Verification: dựa trên value, validity/ARIA/error do website thiết lập, không dựa vào class tool vừa thêm.

### 14.4. Đưa mọi đường nhập về cùng result

| Đường gọi | Việc cần làm |
|---|---|
| `fillSelectOrTextField()` | Trả `InteractionResult` cho text/select/date/address thay vì `true/false/undefined` nhiều nghĩa |
| `humanType()/humanTypeCore()` | Trả method, focus/clear/type/read-back result; không nuốt trạng thái thành `void` |
| Phone modal | Dùng controller và chỉ cộng field/action sau verify, thay vì click force rồi cộng ngay |
| `rescueRequiredField()` | Giữ repair policy nhưng executor phải nhận interaction mode |
| AI `executeAction()` | Không dispatch event bổ sung ở strict; dùng chung clear/type/suggestion/verify |
| Site-specific sync | Chỉ cho phép đường DOM tương ứng ở compatible/hybrid; physical báo unsupported nếu không có thao tác visible |
| `handleUnmatchedField()` select | Chuyển sang select controller; không gán `sel.value` trực tiếp |

Caller chỉ cộng `autofillFields` khi `verified=true`. `dispatched=true` nhưng chưa verified phải giữ field chưa hoàn tất và có retry/cooldown rõ ràng.

### 14.5. Verification theo loại dữ liệu

Không nên so sánh mọi field bằng `actual === expected` tuyệt đối:

- Email: có thể normalize case theo policy hiện có.
- Phone/zip: so sánh digits hoặc định dạng canonical, đồng thờì kiểm tra maxlength/validity.
- Date: so sánh ISO value nếu native date; text mask cần parse theo format.
- Name/text Unicode: normalize NFKC khi phù hợp, không làm mất khác biệt có nghĩa.
- Select: so sánh option value và index đã chọn, không chỉ kiểm tra non-empty.
- Address: cần thêm suggestion đã chọn và website state, không chỉ text address.
- Checkbox: so sánh checked và required group state, không chỉ ARIA do tool tự set.

Matcher/formatter hiện có vẫn giữ ở `matchFieldValue()`; controller chỉ nhận expected value và chiến lược verify, tránh nhân bản quy tắc nghiệp vụ.

### 14.6. Giá trị được giữ lại chưa chắc là giá trị từ record

`preserve_valid` chỉ nói “không ghi đè”, không chứng minh đã điền đúng record. Ví dụ form có email A, session được gán email B: giữ A và đánh field verified theo B là hai việc khác nhau.

Result đề xuất phân biệt `record_matched`, `preserved_existing`, `conflict_with_record`, `missing_record` và `value_unverified`. Nếu chọn giữ giá trị khác record, log nguồn/loại xung đột, không log A/B và không gắn nhãn “đúng record”. Quyền thay dữ liệu người dùng phải đến từ policy caller, không do executor tự quyết.

Nguồn giá trị nên có provenance: record/website/extension/manual/unknown khi thực sự biết. Không dùng `isTrusted` để kết luận input là do người dùng vì input automation qua browser cũng có thể là trusted. Các thay đổi nhập tay từ Screen View phải được nhận diện bằng nguồn command của ứng dụng nếu muốn ưu tiên chúng.

### 14.7. Value, validity và dữ liệu widget là ba lớp xác minh

| Lớp | Câu hỏi cần trả lời |
|---|---|
| Value retained | Website giữ giá trị sau input và blur không? |
| Business match | Giá trị sau format còn tương ứng với expected của record không? |
| Website acceptance | Native validity, ARIA/error và state widget cho phép bước tiếp theo chưa? |

Một ô non-empty chưa đạt cả ba lớp. Cần ghi được `validation_pending` khi chưa có kết quả validator, không tự xóa error để chuyển sang hợp lệ. `tryFastTextInput()` hiện kiểm tra value sau thao tác Tab nhưng chưa đợi mọi validator bất đồng bộ; đây là giới hạn cần fixture, không phải lời bảo đảm mọi mask đều được xử lý.

Chuẩn hóa phải theo loại field: digits cho phone/zip khi phù hợp, ISO cho native date, so khớp option cho select. Không áp dụng trim/lowercase hoặc loại dấu câu cho mọi text; với email cũng cần policy hiện có thay vì khẳng định mọi phần địa chỉ đều không phân biệt hoa thường.

Autocomplete cần bằng chứng chọn suggestion của widget và kiểm tra nó còn gắn với cùng địa chỉ sau blur. Không yêu cầu mọi website đều có một hidden place-id giống nhau; chỉ xác minh những state mà adapter biết. Không tự tạo hidden value để làm form trông hoàn tất.

### 14.8. Queue, blur và phiên bản record

Tạo plan từ một `recordRevision` cố định. Khi record được thay giữa lúc gõ, dừng các bước còn lại và quan sát lại trước khi nhập record mới; không nối nửa dữ liệu cũ với nửa dữ liệu mới. Hash dùng nội bộ để cache không được coi là dữ liệu log công khai đã khử nhạy cảm.

Không dùng `Enter` thay cho blur chung vì có thể submit ngầm. `Tab` cũng có thể mở/chọn dropdown, chạy handler hoặc chuyển bước; trước bước tiếp theo phải kiểm tra generation/state hiện tại. Với field không cần blur để xác minh, không tạo thao tác thừa chỉ cho giống người.

Một transaction field nên chốt snapshot, expected, policy và generation trước khi vào queue, rồi kiểm tra lại sau khi nhận lease. Plan có thể đã cũ trong thời gian xếp hàng. Queue theo Page vẫn cho các page khác chạy độc lập; không nâng thành lock toàn browser context khi không có tài nguyên input dùng chung.

### 14.9. Control có trong ảnh nhưng collector không thấy

Các collector dùng `document.querySelectorAll()` không tự đi xuyên mọi Shadow DOM. Khả năng locator của Playwright truy cập open shadow root không tự làm bộ metadata/classifier hiện có nhận diện được field bên trong. Cần fixture web component và đường đọc metadata phù hợp; closed shadow root phải báo giới hạn, không hứa strict hỗ trợ. [Nguồn: Playwright Shadow DOM](https://playwright.dev/docs/locators#locate-in-shadow-dom).

Iframe cần kiểm tra cả visibility của thẻ iframe trên trang cha, scope của frame con và tọa độ viewport main frame khi rê chuột. Không coi input có rect trong iframe đang ẩn là field người dùng nhìn thấy. Lớp con trỏ DOM trên mỗi tab chỉ phục vụ quan sát, không phải bằng chứng target đã nhận input.


<a id="transaction-state"></a>

## 15. Contract trạng thái chung cho câu hỏi và field

Nên dùng cùng mô hình transaction để watcher và AI không hiểu khác nhau:

```js
{
  id: 'question-or-field-id',
  kind: 'survey_question',
  status: 'verifying',
  attempt: 1,
  dispatched: true,
  verified: false,
  method: 'mouse',
  reason: 'awaiting_selection_state',
  startedAt: 0,
  finishedAt: null
}
```

Quy tắc chống lặp:

- `observed`: được phép lập plan.
- `planned`: đã có owner, chưa được solver khác chọn.
- `acting`: input đang chạy, watcher bỏ qua.
- `verifying`: input xong nhưng chưa được click lại.
- `completed`: đã verify; không thao tác lại trừ khi question/field identity thật sự đổi.
- `retryable_failed`: cho retry sau cooldown, có attempt tối đa.
- `unsupported`: không retry vô hạn; để AI/manual policy quyết định nếu được phép.

Timeout ở `acting/verifying` phải yêu cầu hủy; chỉ giải phóng quyền input khi actor đã dừng và cleanup xong. `Promise.race()` hết hạn không tự dừng Playwright hoặc vòng gõ cũ. Navigation làm kết quả của transaction cũ mất quyền commit; không mặc định lệnh đang chạy đã được hủy. Chi tiết tại §15.2–15.3. Không đặt `completed` trước click để “tránh double click”, vì nếu click hỏng câu hỏi sẽ bị khóa sai.

### 15.1. Tách trạng thái lifecycle khỏi kết quả nghiệp vụ

State machine mở rộng dưới đây là đề xuất, chưa được registry hiện tại triển khai đầy đủ:

```text
observed → planned → waiting_input → acting → verifying → completed
                         ↘ stale_plan             ↘ retryable_failed
                                          ↘ timed_out_unknown
                                          ↘ cancelled
```

`unsupported`, `policy_blocked` và `missing_record` là lý do không có plan thực thi; không dùng hết mọi lượt retry cho những trường hợp chưa có dữ liệu/capability. Đổi record hoặc capability mới có thể mở lại việc lập plan. `completed` chỉ có hiệu lực trong cùng vòng đời và sau khi kiểm tra trạng thái còn đúng; nếu website xóa giá trị đã được điền thì phải invalidate.

`already_selected`/`preserved_existing` có thể verified mà không dispatched. Trường hợp này đủ để đánh giá readiness của form nhưng không được cộng thành “một hành động vừa làm”. Counter field hoàn tất và counter hành động thực thi cần ngữ nghĩa riêng, commit có tính idempotent theo transaction ID.

### 15.2. Timeout không phải lệnh hủy

Tình huống phải tái hiện trong fixture:

```text
A đang gõ từng ký tự → caller hết timeout → thả lock bằng Promise.race
B được phép click field khác → vòng gõ A vẫn chạy → dữ liệu trộn vào field B
```

Thiết kế đúng cần cancellation hợp tác và fencing:

1. Mỗi actor giữ `leaseId`, `documentEpoch`, `stepEpoch`, `recordRevision`, `actionGeneration`.
2. Trước bước có tác động, kiểm tra lease/generation và tín hiệu hủy.
3. Khi timeout, dừng cấp bước mới, yêu cầu actor dừng; không tự suy ra lệnh browser đang bay đã bị hủy.
4. Actor cleanup chuột/phím đang nhấn trong `finally`; chỉ trả lease sau khi đoạn input đã kết thúc.
5. Trước commit, kiểm generation một lần nữa; kết quả về muộn không được tăng counter hoặc khóa câu của bước mới.
6. Nếu không biết thao tác mutable đã dừng chưa, giữ page ở `timed_out_unknown` và chỉ đọc/hiển thị chẩn đoán; không cho AI takeover bằng input song song.

`AbortController` không tự hủy một API Playwright chỉ vì application có truyền signal cho hàm bao. Chỉ dùng cancellation của API thực sự hỗ trợ, hoặc kiểm tín hiệu giữa từng bước do ứng dụng điều phối. Với click/submit có kết quả chưa rõ, cần xác minh lại trước retry; không có bảo đảm exactly-once ở máy chủ chỉ từ một client click.

### 15.3. Ranh giới process và takeover

WeakMap khóa theo đối tượng Page chỉ hoạt động trong process đang giữ nó. AI `executeAction()` trong process ứng dụng có thể dùng cùng queue, nhưng Codex SDK/Playwright MCP chạy riêng không tự chia sẻ WeakMap đó. Hai kết nối CDP cũng có thể có hai đối tượng Page khác nhau cho cùng một tab.

Giải pháp nhỏ nhất nên là một nơi cấp quyền input trong ứng dụng, nhận diện cùng browser target, và chỉ một producer được thao tác: `autofill`, `local_repair`, `ai_cli`, `ai_mcp` hoặc `manual_command`. Khi giao quyền cho MCP, watcher dừng input; khi thu hồi phải xác nhận producer đã kết thúc trước khi cấp lease mới. Không dùng class/attribute của website làm khóa liên process đáng tin cậy.

Navigation và popup không dùng cùng quy tắc: navigation làm snapshot/plan cũ mất hiệu lực, popup tạo một page identity riêng; không chuyển mọi claim sang popup. Slot 1 chỉ quyết định hiệu ứng mô phỏng, không phải giấy phép bỏ scope hay bỏ kiểm tra lease.


<a id="trace-design"></a>

## 16. Trace để kiểm tra và tự sửa quá trình

Mỗi question/field nên có một `traceId` xuyên suốt các lần quét. Một trace tối thiểu:

```text
traceId | page/frame identity | question/field identity | source handler
| before state | decision/policy | target option/expected kind
| method | event/verification result | after state | reason | duration
```

Các mốc log hữu ích:

1. `question_observed` / `field_observed`.
2. `question_owned` / `field_claimed`: ai là owner.
3. `answer_planned` / `field_planned`: policy nào chọn giá trị, không cần log dữ liệu nhạy cảm.
4. `interaction_dispatched`: mouse/keyboard/locator/DOM fallback.
5. `selection_verified` / `field_verified`.
6. `question_advanced` / `validation_changed`.
7. `interaction_retry` / `unsupported` / `fallback_used`.

Nhờ trace có thể phân biệt nhanh:

- **Không có `planned`**: selector/classifier/matcher chưa nhận diện.
- **Có `planned`, không có `dispatched`**: target không actionable hoặc queue/lock.
- **Có `dispatched`, không verified**: click/phím không tạo state mong đợi hoặc verifier sai.
- **Verified nhưng lượt sau thao tác lại**: identity/registry không ổn định qua DOM rebuild.
- **Field đúng lúc gõ nhưng sai sau blur**: mask/validator hoặc event bổ sung.
- **Nhiều handler cùng xuất hiện trong một question trace**: thiếu ownership chung.

### 16.1. Trace phải ghi được nguyên nhân chờ, không chỉ thao tác thành công

Ví dụ schema an toàn ở mức ý tưởng, không chứa giá trị record:

```json
{
  "traceId": "trace-local-01",
  "attemptId": "attempt-02",
  "slot": 1,
  "pageKey": "page-local-01",
  "frameKey": "frame-local-02",
  "documentEpoch": 3,
  "stepEpoch": 2,
  "recordRevision": "record-revision-04",
  "owner": "autofill",
  "stage": "verify",
  "controlKind": "email",
  "policy": "record",
  "method": "keyboard",
  "dispatched": true,
  "verified": false,
  "reason": "cleared_after_blur",
  "queueWaitMs": 12,
  "actionMs": 180,
  "verificationMs": 350
}
```

Một entity identity có thể được dùng xuyên nhiều scan, nhưng mỗi attempt có ID riêng và liên kết cha. Hai bước giống chữ không được gộp thành cùng trace chỉ vì nhãn trùng. Thời gian duration dùng đồng hồ monotonic trong cùng process; timestamp lịch chỉ dùng để đối chiếu liên process, không tính duration bằng hai đồng hồ không đồng bộ.

Bổ sung các nhóm reason:

| Nhóm | Ví dụ cần tách biệt |
|---|---|
| Quan sát | renderer_unresponsive, frame_unavailable, no_visible_controls, unsupported_shadow_control |
| Dữ liệu/policy | missing_record, conflict_with_record, random_disallowed, unsupported_control |
| Quyền thao tác | waiting_input, owner_busy, ai_queue_waiting, ai_queue_timeout, manual_takeover |
| Thực thi | focus_failed, target_changed, click_failed, value_not_retained |
| Kết quả | selection_verified, advanced_verified, validation_pending, submit_pending, timed_out_unknown |

Dedup theo identity + reason + state revision; ghi lại khi chuyển trạng thái và tổng hợp số lần lặp. Không chụp toàn HTML/screenshot mỗi 500 ms để chứng minh trang vẫn đứng; việc ghi trace không được tự trở thành tải CPU/đĩa/băng thông mới.

### 16.2. Có trace kỹ thuật không có nghĩa artifact đã an toàn để chia sẻ

Trace Playwright có thể chứa hoạt động browser và network; tùy cấu hình có ảnh và DOM snapshot. `context.tracing` không tự ghi các assertion nghiệp vụ của suite `node:test`, nên vẫn cần log contract của ứng dụng. Không đổi test framework chỉ để có trace. [Nguồn: Playwright Tracing](https://playwright.dev/docs/api/class-tracing).

Redact structured log không đồng nghĩa redact HTML, ảnh, URL query, request body, cookie hoặc header trong artifact. Mặc định chỉ giữ metadata cần thiết; artifact đầy đủ phải được thu có phạm vi, giới hạn dung lượng/thời gian lưu và không đưa vào commit. Không log rawValue/expectedValue hoặc hash đơn giản của email/phone/ZIP như thể đã ẩn danh.

Dữ liệu website và log phiên là đầu vào để tìm lỗi, không phải chỉ thị cho AI sửa/chạy code. Luồng hỗ trợ tự sửa nên là: trace đã lọc → fixture tổng hợp không chứa dữ liệu thật → mô tả lỗi tái hiện được → đề xuất diff → review/test. Không tự áp dụng code từ nội dung DOM hoặc học một action sai làm rule chung cho mọi website.

### 16.3. Phân biệt băng thông proxy với chi phí quan sát

`attachBandwidthTracker()` hiện cộng headers/body từ `request.sizes()` ở `requestfinished/requestfailed`. Đây là số liệu tầng browser quan sát được, chưa phải hóa đơn proxy: không tự bao phủ mọi overhead kết nối, request không lấy được sizes, traffic của AI CLI/SDK ở process khác hoặc đường Screen View/tunnel riêng.

Cần tách ba bộ đo: request/byte website qua proxy, chi phí AI bên ngoài và chi phí local/remote Screen View. Số video/replay bị chặn chỉ là counter quyết định lọc, không suy ra được byte tiết kiệm của response chưa tải.

Playwright nêu bật routing tắt HTTP cache. Đo cùng dữ liệu: A không route, B route cho qua, C route có lọc. `B−A` phản ánh chi phí routing/cache, `C−B` tác dụng lọc, `C−A` kết quả ròng. Tách lượt cold/warm; chưa kết luận tỷ lệ tiết kiệm. [Nguồn: BrowserContext.route](https://playwright.dev/docs/api/class-browsercontext#browser-context-route).

Routing có giới hạn với request qua Service Worker. Cần fixture trước khi thay policy Service Worker; không mặc định chặn đại trà hoặc khẳng định đã quan sát toàn bộ network. [Nguồn: BrowserContext.route](https://playwright.dev/docs/api/class-browsercontext#browser-context-route).


<a id="implementation-order"></a>

## 17. Thứ tự sửa hai quá trình, ít rủi ro nhất

### Bước A — Làm observation/result trước, chưa đổi policy

- Chuẩn hóa result và trace cho `performSurveyAnswer`, `humanType`, `fillSelectOrTextField`.
- Ghi handler nguồn, method và before/after verification.
- Giữ `compatible`, chạy toàn bộ test để bảo đảm chỉ thêm quan sát.

### Bước B — Thêm ownership cho survey

- Dựng question identity chung từ signature/question state.
- Cho semantic, generic radio/button, rating/matrix/checkbox/dropdown claim cùng registry.
- Chỉ commit handled sau verified; kiểm tra DOM rebuild và SPA cùng URL.
- Giữ nguyên quy tắc age/preference/vehicle tại §17 của `PLAYWRIGHT_CORE_INTEGRATION_RESEARCH.md`, không nhầm với §17 lộ trình của tài liệu này.

### Bước C — Tách answer policy khỏi thao tác

- Đưa các nhánh random/record/default về policy có tên.
- Bảo đảm `pickRandom=false` được tôn trọng ở mọi đường, gồm select unmatched.
- Mỗi solver trả plan + verified count; không trộn Next dispatch với answer verified.

### Bước D — Chuẩn hóa field transaction

- Thêm FieldPlan, existing-value policy và verification strategy.
- Mở rộng page queue cho click + clear + type + verify.
- Bỏ việc tự sửa class/che error khỏi đường strict; progress chỉ từ verified result.

### Bước E — Đưa repair/AI/site handlers vào cùng policy

- Truyền interaction mode và queue qua rescue, AI và phone modal.
- Với site-specific handler, giữ matcher nhưng chuyển dần executor; strict báo unsupported khi chỉ còn cách sync DOM.
- Chạy fixture cho form thường, controlled input, mask, hidden checkbox, select, autocomplete, SPA và retry.

### Bước F — Mới chuyển physical/hybrid

- Sau khi ownership/verification ổn định, bật hybrid trên fixture.
- Physical là opt-in; đo completion rate, retry, thờì gian và fallback.
- Không đổi mặc định production chỉ vì event có `isTrusted=true`.

**Điểm sửa then chốt nhất:** trước hết hãy làm **một identity/owner cho mỗi câu hỏi và một result đã xác minh cho mỗi field**. Hai nền này quyết định chuột/phím có chạy đúng quy trình hay chỉ làm thao tác trông tự nhiên hơn nhưng vẫn chọn sai, nhập lặp hoặc báo thành công giả.

### 17.1. Các cổng nghiệm thu trước khi mở rộng hiệu ứng chuột

Các mục dưới đây là đề xuất triển khai tiếp theo, không phải thay đổi runtime trong lượt cập nhật nghiên cứu này.

| Ưu tiên | Việc phải chốt | Bằng chứng cần có trước khi nhận |
|---|---|---|
| P0 | Select thiếu record không bị chọn bừa qua nhánh unmatched | `pickRandom=false`, demographic thiếu giá trị và option disabled đều có test âm |
| P0 | Không tự che error/thêm valid để làm bằng chứng | Value đúng nhưng website vẫn invalid không được commit accepted |
| P0 | Answer/Next/Submit có result riêng | Next dispatch chưa đổi bước không tăng completedSteps hoặc tạo lead success |
| P0 | Claim có epoch và commit idempotent | DOM rebuild không click lại; hai bước giống chữ không khóa nhầm nhau |
| P0 | Timeout không thả input cho actor thứ hai khi actor cũ còn chạy | Promise trả muộn không gõ hoặc commit vào bước mới |
| P1 | Policy nhập/nhấp dùng chung cho các producer | Local repair, AI executor, SDK/MCP và phone modal không đi tắt khỏi scope/lease |
| P1 | Trace có reason và đủ giới hạn dữ liệu | Tìm được điểm nghẽn mà không cần lưu đầy đủ record/HTML ở mọi scan |
| P2 | Bật chuột mô phỏng riêng cho mọi slot | Đã có trong source; cần theo dõi CPU khi chạy nhiều phiên đồng thời |

Không ghép sáu bước A–F thành một lần thay tất cả handler. Mỗi bước phải có phạm vi file/caller, fixture mô tả lỗi, kiểm tra tương thích và cách quay lại hành vi cũ. Observation/result trước chưa có nghĩa được giữ một đường đã biết chọn sai dữ liệu để làm đẹp baseline; sửa lỗi P0 thành nhóm riêng với test chỉ rõ trước/sau.

### 17.2. Ma trận thử nghiệm tối thiểu

| Tình huống | Kết quả bắt buộc |
|---|---|
| Cùng câu được dựng lại, mất marker | Một decision, không thêm verified action lần hai |
| Hai fieldset/iframe có cùng câu/option | Owner và counter độc lập |
| Chỉ hash/query đổi, hoặc chỉ thêm spinner | Không mặc định verified advance |
| Two-step có cùng nội dung nhưng step marker khác | Hai step identity, không tái dùng completed của bước cũ |
| `pickRandom=false`, unmatched select, demographic thiếu record | Không random và không chế dữ liệu |
| Multi-select đủ min nhưng vượt max/None cùng lựa chọn khác | Verification thất bại dù đã có click thành công |
| Value đúng lúc input, bị clear sau blur hoặc validator chậm | Không commit trước khi đạt điều kiện verification đã chọn |
| Có dữ liệu sẵn khác assigned record | Preserve/conflict theo policy; không tự nói đã khớp record |
| Form đóng/mở modal hoặc iframe bị ẩn giữa plan và ACT | Hủy plan cũ; không click vào tọa độ đã stale |
| Actor timeout rồi promise cũ hoàn tất muộn | Không gõ chồng và không cộng progress của epoch mới |
| AI/MCP dùng kết nối Page khác tới cùng tab | Vẫn chỉ một producer có quyền input |
| Record đổi khi AI đang chờ; renderer không đọc được | Invalidate plan cũ; không dùng dữ liệu/locator cũ để đoán |
| Tab slot bất kỳ đóng | Các tab còn lại giữ chuột riêng; lead protection còn nguyên |
| Cache cold/warm, routing cho qua và routing lọc | Có byte/duration đo riêng, không suy từ blockedCount |
| Trace xuất ra ngoài | Không còn giá trị record, query nhạy cảm, cookie hoặc request body ngoài phạm vi cho phép |

Các fixture dương phải có hành vi website thực sự phản hồi input. Snapshot thiếu engine chỉ chứng minh ứng dụng chờ/unsupported an toàn, không chứng minh completion. Fixture phải chặn mạng ngoài và dùng dữ liệu tổng hợp; chưa dùng website thật để tự động submit khi nghiên cứu.

### 17.3. Bản triển khai kế tiếp nên nhỏ tới đâu?

Đề xuất một bản chỉ tập trung vào **kết quả trung thực và chống lặp**, chưa phải toàn bộ physical mode:

1. Ghi đủ method/reason/attempt và tách dispatch khỏi verify; giữ API cũ qua adapter nếu cần để không làm hỏng caller trả number/boolean.
2. Sửa các khoảng trống P0 có bằng chứng ở unmatched select, website error state và Next dispatch.
3. Thử registry/epoch trên một nhóm câu và một nhóm text field đại diện; chưa đưa mọi site handler vào một abstraction mới.
4. Tích hợp page input lease mà không lồng queue cũ; làm fixture timeout/takeover trước khi cho MCP tham gia.
5. So sánh với baseline đã lưu, kiểm tra cả scope/iframe/lead và thời gian; chỉ mở rộng khi các invariant đạt.

Bước có thay đổi policy không được gọi là “chỉ refactor”. Nếu default chọn đáp án thay đổi, phải ghi rõ policy trước/sau và không tự thay các rule semantic đã được yêu cầu. Chưa cần UI cấu hình mới, dependency mới, registry lưu database hoặc cơ chế tự sửa code production.

Điều kiện release phải phân biệt test mới hồi quy với lỗi đã tồn tại. Lỗi baseline cần được định danh riêng và có quyết định xử lý; không bỏ test hoặc đổi assertion chỉ để đạt một con số pass. Lượt nghiên cứu này không chạy lại suite hay benchmark, không xác nhận artifact `.app` hiện tại đã chứa các thiết kế mới.

## 18. Bổ sung ranh giới commit, input và bằng chứng

### 18.1. Bảo vệ lead độc lập với transaction UI

Document/step/record epoch làm một plan cũ mất hiệu lực, nhưng không được tự xóa `confirmedLeadIp` hoặc dùng timeout/unsupported để đóng browser đã có lead. `lead_verified` là bằng chứng nghiệp vụ từ cơ chế lead hiện có; `submit_dispatched`, `form_accepted` và `step_advanced` không tự thay thế nó.

Tương tự, chữ “thank you” hoặc URL success chỉ là tín hiệu UI để verifier đối chiếu trong scope, không đủ tự tạo một lead. Form vẫn còn việc sau khi lead confirmed thì tiếp tục theo mode; không tự freeze trang hoặc chặn hết network để giảm chi phí.

### 18.2. Không giữ quyền input trong toàn bộ thời gian AI suy nghĩ

Về thiết kế, `AI đang phân tích` và `AI đang thực thi input` cần tách biệt. Một plan AI có thể được tạo khi chưa giữ mouse/keyboard lease; trước khi thi hành phải lấy quyền và kiểm lại snapshot/epoch. Nếu autofill đã làm trang đổi trong lúc AI phân tích, reply cũ phải bị loại hoặc lập lại plan, không thực thi nguyên mảng action cũ.

Đây là hướng nghiên cứu sau khi có fencing, không phải đề nghị gỡ ngay các cờ `_aiAssistRunning/_aiFormFixing` hiện tại. Gỡ cờ trước khi có cơ chế quyền input chung sẽ tạo lỗi gõ chồng. Với MCP có thể tự đọc lẫn click, phải có cách cấp/thu hồi quyền thực thi hoặc tiếp tục giữ một producer tại một thời điểm.

Trong `verifying`, quyền question/field và quyền mouse/keyboard cũng khác nhau: sau khi input đã dừng, có thể nhường input cho field độc lập nếu không có khả năng auto-advance. Sau Submit/Next, giữ transition guard của form/page để tránh submit lại; không giữ chuột ở trạng thái nhấn trong lúc đợi network.

### 18.3. Những khẳng định không được suy ra từ các thay đổi hiện có

- Nhìn thấy con trỏ không chứng minh click trúng target hoặc website chấp nhận value.
- `fill` nhanh giữ đúng value chưa chứng minh mọi validator đã xong.
- Cùng một URL không chứng minh cùng step; URL khác cũng chưa tự chứng minh form đã được nhận.
- Một snapshot không có control chưa chắc đã finished; có thể là đang tải, scope cũ, frame chưa đọc được hoặc Shadow DOM chưa hỗ trợ.
- Local repair sửa được field không được phép tự submit từ executor.
- Chặn được video/replay không có nghĩa tiết kiệm 100% traffic nền hoặc chắc chắn nhanh hơn với mọi website.
- Một registry Set “đã handled” chưa phải transaction registry có ownership/cancellation.
- Hash identity/record dùng nội bộ chưa phải log đã ẩn danh an toàn.

## 19. Nguồn kiểm chứng và trạng thái nghiên cứu

Đối chiếu source trong workspace ngày 2026-11-11. Dependency đọc từ môi trường local: `playwright` 1.64.0 và `@playwright/mcp` 0.0.83; đây không phải lời yêu cầu nâng dependency. Trước khi triển khai API cụ thể vẫn phải kiểm tra version thực sự được khóa/đóng gói.

Các nguồn chính thức đã kiểm tra cho phần bổ sung:

- [Playwright actionability](https://playwright.dev/docs/actionability): khả năng click, visibility, ổn định và nhận sự kiện; dùng để thiết kế kiểm tra trước thao tác.
- [Playwright Locators](https://playwright.dev/docs/locators): locator tìm lại node theo DOM hiện tại và giới hạn Shadow DOM.
- [Playwright BrowserContext.route](https://playwright.dev/docs/api/class-browsercontext#browser-context-route): routing, giới hạn Service Worker và ảnh hưởng HTTP cache.
- [Playwright Tracing](https://playwright.dev/docs/api/class-tracing): phạm vi browser/network trace; không thay assertion nghiệp vụ của suite.

Các contract AnswerPlan/FieldPlan, epochs, lease, transition guard, schema trace và ma trận thử nghiệm ở trên là **đề xuất suy ra từ source và các tình huống cần phòng tránh**, chưa phải kết quả benchmark hoặc phần runtime đã được cài vào app. Lượt này chỉ sửa tài liệu nghiên cứu.
