# Nghiên cứu tích hợp Playwright Core cho repo `tool-ofer`

## 1) Tóm tắt ngắn

Repo hiện tại không thiếu khả năng chạy browser; nó đã đang dùng Playwright theo cách rất mạnh mẽ: `locator()`, `click()`, `fill()`, `evaluate()`, `page.goto()`, `frameLocator`, `context`, `browser`, `mouse`, `keyboard`, custom fallback, và các heuristic từ form autofill / survey solver.

Vấn đề không nằm ở việc `playwright` hay `playwright-core` khác nhau về API. Vấn đề nằm ở chỗ:

- mã đang dựa nhiều vào selector/heuristic từng loại HTML phổ biến,
- web target có cấu trúc HTML rất đa dạng, custom component, nested labels, SVG, role=button, hidden inputs, listbox, matrix, checkbox card, iframe, popup, lazy rendering,
- các site khảo sát/offerwall thường không tuân thủ chuẩn web rõ ràng, nên logic cần hiểu ngữ nghĩa của câu hỏi/đáp án, không chỉ biết cách click theo CSS.

Do đó, nếu người ta chỉ chuyển từ `playwright` sang `playwright-core` mà không thay đổi logic “nhận dạng câu hỏi + lựa chọn đáp án”, hệ thống sẽ vẫn thất bại ở các form khó.

Kết luận: `playwright-core` là khả thi và tương thích về API, nhưng không giải quyết được vấn đề thực sự nếu phần `DOM intelligence` chưa đủ mạnh.

---

## 2) Nguyên nhân thực sự của vấn đề

### 2.1. Không phải lỗi của Playwright core

`playwright-core` có API gần như giống hệt `playwright` về thao tác browser. Điều khác biệt là:

- `playwright`: thêm browser binaries, dễ chạy ngay,
- `playwright-core`: chỉ engine, bắt buộc có Chrome/Chromium trên máy target,
- cả hai đều hỗ trợ `locator`, `click`, `fill`, `page.evaluate`, Timers, keyboard, mouse, frame, popup.

Vì vậy, khi repo lỗi ở nhiều site, nguyên nhân không phải là `playwright-core` không nhận diện được DOM. Nguyên nhân là logic auto-fill/survey xử lý hiện tại đang dựa vào heuristic quá mạnh và không đủ mềm.

### 2.2. HTML form/quiz/survey không đồng nhất

Trong các form khảo sát/offerwall, cấu trúc phổ biến rất khác nhau:

- `label + input` cách xa nhau,
- phần tử chọn nằm trong `div/span/svg/button/a` khác nhau,
- `role="radio"`, `role="button"`, `role="option"` thay vì `input[type="radio"]`,
- input ẩn nhưng custom div hiển thị,
- container có `aria-hidden`, inert, hidden, opacity:0,
- nhiều option không có `id` / `name`, chỉ có `data-*`, class, text,
- matrix/table với nhiều hàng x nhiều cột,
- checkbox dạng card, pill, image, circle, icon,
- mỗi câu hỏi có title khác nhau, text option không sát với selector của câu hỏi,
- popup, iframe, SDK third-party, widget ams/locotomato, custom survey engine.

### 2.3. Logic hiện tại đang vượt quá CSS selector đơn giản

Repo đã có nhiều code rất tốt như:

- `resolveSmartLocator()`
- `executeSmartClick()`
- `handleGenderSelect()`
- `handleTrySelectOption()`
- `handleRadioAndSurveyOptions()`
- `survey-solver.mjs`
- `solveSurveyStep()`

Nhưng hầu hết các hàm này vẫn đang chạy theo kiểu:

- "nếu thấy selector này thì nhắm vào";
- "nếu không thấy -> thử selector khác";
- "nếu text chứa keyword này thì chọn";
- "nếu bằng random thì click".

Điều này làm việc với 60–80% site phổ biến, nhưng sẽ yếu ở các site custom hoặc đa lớp.

### 2.4. Bot-detection và performance khiến click phải “rất tự nhiên”

Repo đã cố tình mô phỏng hành vi thật:

- human mouse movement,
- adaptive typing,
- random pauses,
- click sau khi hover,
- submit cooldown,
- focus/blur events,
- manual fallback evaluate.

Tuy nhiên, ở các site khó, với HTML custom, robot-like heuristic just by clicking random choices sẽ khiến hiệu quả thấp hoặc sai địa lý đáp án.

---

## 3) Vì sao không nên tập trung vào `playwright-core` như giải pháp chính

### 3.1. `playwright-core` không sửa được sự không đồng nhất của DOM

Nó không có khả năng hiểu “câu hỏi này là gì” và “đáp án nào phù hợp nhất” nếu không có logic riêng.

### 3.2. Repo đang cần intelligence chứ không chỉ browser runtime

Cần một lớp mới để:

- phân tích ngữ cảnh câu hỏi,
- tách phần tử câu hỏi và các option,
- so sánh text, role, container, parent-child,
- chọn option tốt nhất theo heuristic hoặc câu hỏi mục tiêu,
- xác minh câu trả lời đã được chọn thành công.

### 3.3. Nếu chỉ đổi import, repo sẽ chạy tốt ở site chuẩn nhưng yếu ở site custom

Câu hỏi đúng cần trả lời là: "đúng site nào đang test, html trông như thế nào". Với HTML khó, chỉ cần `playwright-core` là không đủ.

---

## 4) Nguồn gốc thực tế trong repo hiện tại

### 4.1. Các file cho thấy repo đã hiểu được bài toán

Các file quan trọng:

- `script.mjs`: có `resolveSmartLocator`, `executeSmartClick`, huge command interpreter
- `survey-solver.mjs`: có `solveRatingQuestions`, `solveMatrixQuestions`, `solveSurveyCheckboxes`, `clickSurveyNextButton`
- `autofill.mjs`: có `matchFieldValue`, semantic categories, form matching
- `ai-assist.mjs`: AI fallback để sửa form nếu quá khó

Tức là repo không thiếu browser automation; nó thiếu một lớp `semantic DOM resolver` vững chắc hơn để hoạt động trên dạng HTML khó.

### 4.2. Những điểm đang yếu

Repo có các kỹ thuật tốt nhưng vẫn còn 3 điểm yếu chính:

1. `selector` phụ thuộc nhiều vào class/id,/keyword từ các site phổ biến.
2. `click` thường hoạt động “thử rồi xem” chứ không có cơ chế xác nhận thật sự thành công.
3. `question choice matching` thiếu scoring rõ ràng dựa trên ngữ nghĩa và cấu trúc HTML.

---

## 5) Yêu cầu thật sự cần có để tích hợp Playwright Core an toàn

### 5.1. Yêu cầu kỹ thuật

- Cài `playwright-core` và duy trì `playwright` hoặc chỉ dùng `playwright-core` khi browser system có sẵn.
- Dùng `executablePath` rõ ràng nếu không dùng bundled browser.
- Kiểm tra `chromium.launch({ headless: false, executablePath: ... })` thành công.
- Giữ nguyên API của repo `<page>.locator()` / `<frame>.locator()` / `evaluate()` / `click()`.
- Nếu cần, thêm fallback cho browser path macOS/Linux/Windows.

### 5.2. Yêu cầu logic

- Phải có `semantic question detector`.
- Phải có `option extraction` và `option scoring`.
- Phải có `selection verification` sau khi click.
- Phải có `safe fallback` nếu option bị ẩn / bị overlay / custom.
- Phải có `submit guard` để không click nhầm form/continue.
- Phải có `logic bỏ noise` cho privacy / terms / login / nav links.

### 5.3. Yêu cầu đo lường hiệu quả

Mỗi lần xử lý câu hỏi phải có:

- `question_detected = true/false`
- `options_found = n`
- `best_option_score`
- `selection_verified = true/false`
- `fallback_used = true/false`
- `submit_guard_passed = true/false`

Nếu không có các metric này, bạn sẽ khó biết vì sao site nào fail.

---

## 6) Cách tích hợp đúng chuẩn

### 6.1. Tách các lớp logic

Khuyến nghị thêm các module như:

```js
// pseudo-design
export async function detectQuestionContext(frame) {...}
export function extractQuestionOptions(frame, questionContext) {...}
export function scoreOption(option, questionContext, record) {...}
export async function chooseBestOption(frame, questionContext, record) {...}
export async function verifySelection(frame, chosenOption) {...}
```

### 6.2. Cách chọn đáp án không nên chỉ dựa vào random

Không nên:

- chọn random một option trong tất cả các option có sẵn,
- click vào option gần nhất mà không xem context,
- click vào phần đầu tiên matching với class `.btn-option`.

Nên:

- tìm container của câu hỏi,
- quét các option trong cùng container,
- tính điểm cho từng option theo:
  - text gần title câu hỏi,
  - là radio/button/select option,
  - visible,
  - không nằm trong footer/legal,
  - không là nút back/prev/cancel,
  - không phải hidden/disabled/aria-secret,
  - có role=radio/image/button. 

### 6.3. Sử dụng verification sau click

Sau khi click, kiểm tra:

- `selected`/`checked`/`aria-checked=true`/`classList.contains('selected')`
- nếu không thành công thì fallback `evaluate(() => el.click())`
- nếu vẫn không thành công thì thử click label hoặc parent node

Điều này cực kỳ quan trọng với custom component.

---

## 7) Không nên làm gì

### 7.1. Không nên đổi `playwright` sang `playwright-core` mà bỏ qua browser setup

Nếu thiếu `executablePath`, browser sẽ không chạy.

### 7.2. Không nên tin selector cứng

Ví dụ không nên logic như:

```js
frame.locator('.btn-option').first().click();
```

vì trên nhiều site `.btn-option` có thể là nút rác, button wrapper, hoặc không ổn định.

### 7.3. Không nên click ngay khi phát hiện “nút nào có chữ Yes/No” mà không xác nhận container

Có rất nhiều nút Yes/No trên site nhưng không phải câu hỏi hiện tại.

### 7.4. Không nên bỏ qua noise patterns

Privacy / legal / footer / login / nav / help / home / cart / account đều là lỗi phổ biến.

### 7.5. Không nên coi `evaluate()` là fallback lõi duy nhất

`evaluate()` rất mạnh nhưng không phải lúc nào cũng đúng. Nếu click không được, `evaluate` có thể đổi DOM, nhưng nếu không điền đúng state thì vẫn fail.

### 7.6. Không nên randomize quá mức

Nếu random quá mức, các câu hỏi có dấu hiệu logic (age, income, yes/no, state, gender) sẽ sai nhiều hơn và phá trạng thái flow.

### 7.7. Không nên bấm submit ngay khi có một field rỗng mà không check required + validation

Repo đã có logic này tốt, nhưng cần giữ nguyên vì nếu bấm submit quá sớm sẽ làm form bị block.

---

## 8) Yêu cầu nghiệp vụ / UX cho repo

### 8.1. Tính tin cậy

- Với site chuẩn: phải điền ocr/form đúng hơn 90%.
- Với site custom survey: phải có thể chọn từ nhiều loại question cơ bản.
- Với site custom widget: phải có thể fallback cho label, role, parent click, input dispatch.

### 8.2. Tính bền vững

- Khi layout thay đổi đôi chút, logic không nên fail hoàn toàn.
- Có fallback branch rõ ràng.
- Có metrics log từng bước.

### 8.3. Tính an toàn

- Không click nhầm footer, legal, contact, nav, login.
- Không click duplicate nhiều lần trên cùng option.
- Không submit khi form đang có validation lỗi.

### 8.4. Tính dễ debug

Mỗi câu hỏi cần log:

- question text xuất hiện ở đâu,
- option count found,
- chosen option score,
- clicked node type,
- verified state,
- fallback reason.

---

## 9) Kế hoạch tích hợp đề xuất cho repo `tool-ofer`

### Bước 1: Duy trì Playwright hiện tại hoặc chuyển sang Playwright Core khi browser sẵn có

- ưu tiên hiển thị rõ browser path cho system Chrome/Chromium,
- kiểm tra `chromium.launch()` kết nối thành công,
- nếu không chạy, fallback thông báo `executablePath` chưa tồn tại.

### Bước 2: Tạo lớp `semantic DOM resolver`

Thêm một module mới hoặc mở rộng `survey-solver.mjs` / `autofill.mjs`:

- `detectQuestionContext(frame)`
- `extractVisibleQuestionNodes(frame)`
- `findCandidateOptions(questionNode)`
- `scoreOption(option, question, record)`

### Bước 3: Chỉ thực thi click khi option đã được xác minh

- không chỉ `.click()`
- phải có `verifySelection()`
- nếu không verified -> thử `label.click()` / `closest('label')` / `dispatchEvent('input')` / `dispatchEvent('change')`

### Bước 4: Tích hợp với các survey solver hiện tại

- `solveRatingQuestions()` => giữ nguyên, nhưng thêm range detection cho card rating custom
- `solveMatrixQuestions()` => giữ nguyên, cần xác định row + column theo accessiblity
- `solveSurveyCheckboxes()` => cần tránh select toàn bộ đầu tiên nếu không phải consent
- `handleRadioAndSurveyOptions()` => cần dùng score-based matching thay vì random broad matching

### Bước 5: Log chuẩn cho debugging

- log từng câu hỏi,
- log `questionTitle`, `options`, `pickedOption`, `score`, `fallback`, `verified`, `submitGuard`.

---

## 10) Mức độ nên hoàn thành trước khi coi là tích hợp ổn định

Một repo như `tool-ofer` nên chỉ gọi là “tích hợp xong” khi thỏa mãn các tiêu chí sau:

- Có ít nhất 3–5 loại survey pattern được cover: radio, checkbox, yes/no, rating, matrix, select.
- Có fallback cho custom card/option/listbox.
- Có score-based scoring cho option matching.
- Có verification sau click.
- Có noise filtering cho legal/nav/footer.
- Có browser path config và launch test cho `playwright-core`.
- Có logging và metrics cho each question.
- Có acceptance tests trên nhiều HTML mẫu khó.

---

## 11) Kết luận cuối cùng

Nếu chỉ nhìn vào vấn đề `playwright` vs `playwright-core`, thì câu trả lời là: `playwright-core` có thể tích hợp và tương thích về API, nhưng không phải là cứu cánh cho repo này.

Vấn đề thực sự là:

- HTML của survey/offerwall rất đa dạng,
- custom UI không theo chuẩn,
- selector logic hiện tại chưa đủ mạnh,
- repo cần semantic DOM detection và verification loop.

Do đó, phương án đúng là:

1. Giữ/integrate `playwright-core` nếu system browser có sẵn.
2. Đồng thời thêm lớp `semantic question detection + option scoring + verification`.
3. Không chạy random click / selector cứng / không check noise.
4. Không coi browser runtime là “giải pháp chính” cho form automation khó.

---

## 12) Tài liệu / checklist gợi ý cho dev tiếp theo

Checklist tối thiểu trước khi deploy:

- [ ] browser path đúng
- [ ] `chromium.launch()` thành công
- [ ] locator works on page/frame
- [ ] question detector works on 3+ patterns
- [ ] option extraction finds all visible candidates
- [ ] scoring logic chooses correct option
- [ ] verification checks selected state
- [ ] no duplicate click / no legal/nav click
- [ ] submit guard blocks invalid form
- [ ] debug logs capture each question

---

Bản ghi này nên được dùng như tài liệu chính để định hướng tiếp theo: không tập trung vào `playwright-core` như đích cuối, mà tập trung vào `DOM semantic intelligence + feature verification + browser runtime compatibility`.

Nguồn gốc của bài toán nằm ở việc repo đang làm “automation trình duyệt” qua nhiều loại form phức tạp, không phải ở bản thân Playwright.


