
## 13) Cấu trúc module mới cho repo `tool-ofer`

### 13.1. Mục tiêu kiến trúc

Repo cần chuyển từ mô hình “logic rải rác trong file lớn” sang mô hình “module theo chức năng”, rõ ràng như sau:

- Browser runtime layer: quản lý page/frame/browser
- DOM intelligence layer: hiểu câu hỏi và option
- Form automation layer: autofill và select
- Survey execution layer: giải quyết câu hỏi/quiz/survey
- Verification and fallback layer: kiêm tra đã click đúng chưa, retry, AI assist
- State and logging layer: theo dõi session + sự kiện + debug

Cấu trúc này giúp repo tách được 3 rắc rối chính:

1. `playwright-core` / `playwright` runtime
2. DOM hiểu nghĩa / filter noise
3. Click + verify + retry

Nếu không tách, chương trình sẽ luôn bị “nhầm answer / click wrong button / submit sai / không biết fail ở đâu”.

### 13.2. Kiến trúc module đề xuất

```
repo/
├─ browser/
│  ├─ browser-runtime.js
│  ├─ browser-context.js
│  ├─ browser-launch.js
│  └─ browser-helpers.js
├─ dom/
│  ├─ question-detector.js
│  ├─ option-extractor.js
│  ├─ noise-filter.js
│  ├─ selector-resolver.js
│  └─ form-analyzer.js
├─ survey/
│  ├─ question-classifier.js
│  ├─ answer-selector.js
│  ├─ answer-verifier.js
│  └─ survey-runner.js
├─ autofill/
│  ├─ record-normalizer.js
│  ├─ field-matcher.js
│  ├─ checkbox-handler.js
│  ├─ select-handler.js
│  └─ input-handler.js
├─ execution/
│  ├─ click-executor.js
│  ├─ keyboard-executor.js
│  ├─ submit-executor.js
│  └─ retry-policy.js
├─ state/
│  ├─ session-state.js
│  ├─ metrics.js
│  └─ log-collector.js
├─ fallback/
│  ├─ ai-assist-adapter.js
│  ├─ dom-fallback.js
│  └─ retry-fallback.js
├─ utils/
│  ├─ dom-utils.js
│  ├─ text-utils.js
│  ├─ selectors.js
│  └─ timing.js
├─ app.mjs
├─ script.mjs
├─ autofill.mjs
├─ survey-solver.mjs
└─ ai-assist.mjs
```

### 13.3. Chi tiết từng module

#### 13.3.1. `browser/`

##### `browser-runtime.js`
- mở browser và page
- expose API chuẩn:
  - `launchBrowser()`
  - `createPage()`
  - `openNewTab()`
  - `closePage()`
  - `ensureReady()`
- ẩn hoàn toàn `playwright` hoặc `playwright-core` khỏi phần còn lại của repo

##### `browser-launch.js`
- quyết định dùng `playwright` hay `playwright-core`
- hỗ trợ `executablePath` theo OS
- kiểm tra `chromium.launch()` có thành công không
- fallback để xác định browser path trên macOS/Linux/Windows

##### `browser-context.js`
- quản lý context / session / profile
- quản lý popup, iframe, frame navigation
- đảm bảo mọi page đều đi qua cùng một lifecycle

##### `browser-helpers.js`
- wrapper cho `scrollIntoViewIfNeeded`, `hover`, `mouse.move`, `keyboard`, `waitForTimeout`
- giúp cùng repo dùng một cách tương tự nhau, không lặp logic qua lại

#### 13.3.2. `dom/`

##### `question-detector.js`
- phát hiện câu hỏi đang hiện trên màn hình
- xác định mọi loại câu hỏi:
  - yes/no
  - radio
  - checkbox group
  - select
  - rating
  - table/matrix
  - card option
  - consent checkbox
- trả về cấu trúc:
  - `questionTitle`
  - `questionType`
  - `container`
  - candidate list

##### `option-extractor.js`
- trích xuất options trong cùng container với câu hỏi
- lọc theo visibility/aria-hidden/disabled/hidden
- trả về metadata cho từng option:
  - `text`
  - `role`
  - `tag`
  - `id`
  - `checked`
  - `selected`
  - `visible`
  - `parent`

##### `noise-filter.js`
- loại bỏ nút không phải câu hỏi:
  - legal/privacy/terms
  - back/cancel/skip
  - nav, menu, footer links
  - login/account links
  - popup / donate / support buttons
- đây là phần cực quan trọng vì hiện repo dễ click nhầm button ngoài câu hỏi

##### `selector-resolver.js`
- giải quyết custom DOM khi không có ID / name chuẩn
- ưu tiên theo:
  - role
  - aria-label
  - nearest label
  - parent question container
  - associated input

##### `form-analyzer.js`
- nhận diện loại page:
  - form thông thường
  - survey
  - offerwall
  - jump page
  - validation form
- quyết định có nên submit hay không, có nên AI assist hay không

#### 13.3.3. `survey/`

##### `question-classifier.js`
- phân loại câu hỏi theo loại thực tế, ví dụ:
  - `age_range`
  - `gender`
  - `income`
  - `yes_no`
  - `consent`
  - `rating`
  - `matrix`
  - `select`
- không tự do dùng keyword đơn thuần; phải dựa theo context + container + option text + data attribute

##### `answer-selector.js`
- chọn đáp án phù hợp nhất dựa trên record + question type + candidate score
- ưu tiên logic đúng hơn là random
- nếu không match -> chọn best-score candidate

##### `answer-verifier.js`
- kiểm tra click đã có hiệu quả chưa
- dùng các trạng thái sau:
  - `aria-selected="true"`
  - `selected` / `active` class
  - `checked=true`
  - value changed
- nếu chưa xác nhận thì retry với label/parent/input

##### `survey-runner.js`
- điều phối toàn bộ vòng survey:
  - detect question
  - classify
  - choose answer
  - verify
  - move next
  - log result

#### 13.3.4. `autofill/`

##### `record-normalizer.js`
- chuẩn hóa record từ CSV/JSON/pipe data
- đồng bộ tên trường và giá trị
- chuẩn hóa phone, email, dob, zip, state

##### `field-matcher.js`
- map `field metadata` -> `record value`
- phần này hiện đang là điểm mạnh của repo, nên nên tách rõ ràng ra file riêng để dễ test

##### `checkbox-handler.js`
- click consent / required checkbox
- dùng label click / parent click / dispatch change nếu cần

##### `select-handler.js`
- xử lý dropdown, custom select, options list
- không chỉ `field.selectOption()` đơn giản, mà cần DOM fallback và `input/change` propagation

##### `input-handler.js`
- gõ text kiểu người thật
- fill field với delay + keyboard + blur + change events

#### 13.3.5. `execution/`

##### `click-executor.js`
- thực hiện click an toàn
- ưu tiên logic: visible -> enabled -> correct container -> label fallback -> evaluate fallback
- không click random

##### `keyboard-executor.js`
- gõ text / simulate input
- bao gồm typing delay, fallback setter

##### `submit-executor.js`
- tìm nút submit thật sự
- kiểm tra required field và validation trước khi click
- không click submit khi form lỗi / field bị thiếu

##### `retry-policy.js`
- các strategy retry rõ ràng:
  - retry click
  - retry label
  - retry parent element
  - retry evaluate
  - retry form.requestSubmit()

#### 13.3.6. `state/`

##### `session-state.js`
- lưu trạng thái session:
  - `currentScreen`
  - `completedScreens`
  - `emailFilled`
  - `leadCheckStatus`
  - `autofillFields`
  - `lastActionTime`

##### `metrics.js`
- lưu metrics cho mỗi question / mỗi field / mỗi submit
- dùng cho debug và đánh giá hiệu năng

##### `log-collector.js`
- standardize logs theo event type
- log rõ `questionType`, `optionsFound`, `bestScore`, `selected`, `verified`, `fallbackUsed`

#### 13.3.7. `fallback/`

##### `ai-assist-adapter.js`
- gắn `inspectAndFixFormWithAi` vào flow, nhưng chỉ khi fallback DOM không thành công
- không gọi AI mỗi vòng lặp

##### `dom-fallback.js`
- nếu selector không match, dùng nearest parent / nearest label / nearest role / nearest container

##### `retry-fallback.js`
- retry theo policy
- dùng nhiều kỹ thuật khác nhau thay vì lặp lại 1 cách

### 13.4. Luồng xử lý mới theo từng màn hình

#### Bước 1: Browser runtime check
- `browser-launch.js` phát hiện Chrome/Chromium path
- `browser-runtime.js` khởi tạo page
- `browser-context.js` gắn page listener

#### Bước 2: Analyze page type
- `form-analyzer.js` phát hiện page đang là form hay survey hay offerwall

#### Bước 3: Noise filtering
- `noise-filter.js` loại bỏ privacy/footer/nav/login/back buttons

#### Bước 4: Detect question
- `question-detector.js` tìm container câu hỏi và câu hỏi title

#### Bước 5: Extract options
- `option-extractor.js` scan toàn bộ option visible trong container

#### Bước 6: Classify question
- `question-classifier.js` xác định loại câu hỏi

#### Bước 7: Choose answer
- `answer-selector.js` chọn option tốt nhất theo record và scoring

#### Bước 8: Click + verify
- `click-executor.js` click
- `answer-verifier.js` kiểm tra selected state

#### Bước 9: Retry / fallback
- nếu thất bại, `retry-policy.js` chạy các fallback strategy khác nhau

#### Bước 10: Submit guard
- `submit-executor.js` tìm submit đúng, không click nếu form invalid

#### Bước 11: Log & metrics
- `log-collector.js` lưu state và debug logs

### 13.5. Mô hình scoring option cần thêm

Phần này cực cần có để thay vì random click.

```
score =
  +30 if visible
  +25 if same container as question
  +20 if text semantically close to question title
  +15 if role is radio/button/option
  +10 if associated label matches question context
  +10 if it is not nav/legal/footer
  -50 if in header/footer/legal/nav
  -100 if hidden/inert/aria-hidden/disabled
  -40 if already selected
  -20 if duplicate option
```

Các mức điểm:
- `>= 70`: click ngay
- `40-69`: thử fallback hoặc click với label
- `< 40`: bỏ qua / không xử lý

Đây là bộ lọc quan trọng để chống nhầm click.

### 13.6. Không nên làm gì trong cấu trúc mới

- Không gọi `locators` quá nhiều trực tiếp trong `autofill.mjs`/`script.mjs`
- Không để click logic phân tán khắp repo
- Không click random option trong `btn-option` mà không xác định container
- Không coi `evaluate()` là API chính để làm mọi thứ
- Không bỏ qua validation guard trước submit
- Không log quá ít; mỗi question cần có kết quả rõ ràng

### 13.7. Yêu cầu triển khai tối thiểu

Để repo được coi là ổn định, yêu cầu tối thiểu phải có:

- browser adapter
- question detector
- option extractor
- scoring logic
- answer verifier
- fallback retry
- validation guard before submit
- logging for each question

Nếu thiếu 1 trong số này, repo sẽ vẫn fail ở các form khó.

### 13.8. Kết luận phần cấu trúc mới

Cấu trúc mới này giải quyết đúng nguyên nhân gốc rễ của repo:

- không phải vì thiếu `playwright-core`
- mà vì logic đang ở dạng “điền + click + guess” chồng chéo
- cần tách thành các lớp rõ ràng để hiểu câu hỏi và lựa chọn đáp án thực sự

Đây là bước bắt buộc nếu muốn repo có thể xử lý các form/survey khó một cách bền vững.

---

## 14) Tóm tắt cuối cùng

- `playwright-core` có thể tích hợp, nhưng không phải là giải pháp chính.
- Vấn đề thực sự nằm ở thiếu `DOM semantic intelligence` và `verification loop`.
- Cấu trúc module mới này là hướng triển khai hợp lý cho repo `tool-ofer`.
- Nên thực hiện refactor theo tầng, không tiếp tục giữ logic chồng lặp trong file lớn.

Bản nghiên cứu này nên được xem như “bản thiết kế kỹ thuật để triển khai tiếp theo”, không chỉ là lý thuyết.
