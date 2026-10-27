
## 15) Yêu cầu xử lý trường hợp câu trả lời khó xác định nút click

### 15.1. Vấn đề thực tế

Trong nhiều form HTML phức tạp, không phải lúc nào cũng có thể xác định chắc chắn option nào là đáp án đúng chỉ bằng text và selector đơn giản. Một số trường hợp phổ biến:

- option là `div` hoặc `span`, không phải `input[type="radio"]`
- option nằm trong card UI với icon / SVG / background / custom class
- label và input tách nhau, không cùng container
- text câu hỏi nằm ở trên, option ở dưới, không cùng ancestor gần
- option có role button / option / tab, không có name/id rõ ràng
- nhiều button cùng kiểu “Yes/No”, “Continue”, “Next”, nhưng chỉ một button là thực sự của câu hỏi hiện tại
- nút option bị ẩn, bị overlay, bị disabled khi chưa chọn xong

### 15.2. Quy tắc xử lý bắt buộc

Khi gặp trường hợp câu trả lời khó xác định hoặc option không rõ ràng, hệ thống không được click ngẫu nhiên. Thay vào đó phải dùng luồng sau:

1. Nhận diện đúng câu hỏi hiện tại
   - tìm container gần nhất có title câu hỏi
   - không scan toàn page
   - nếu không tìm được => mark ambiguous

2. Trích xuất candidate option trong cùng container
   - chỉ lấy option visible + enabled + không noise
   - loại bỏ legal/nav/footer/button rác

3. Tính điểm từng option
   - text gần title câu hỏi
   - cùng container
   - role/label/aria tương ứng
   - không phải nút back/continue/legal
   - visible + enabled + not hidden
   - selected/checked nếu đã có

4. Chọn best candidate
   - nếu score cao và rõ ràng => click
   - nếu score trung bình hoặc mơ hồ => không click ngay

5. Fallback theo trình tự an toàn
   - click node trực tiếp
   - click label / closest label
   - click parent container
   - dispatch `input` + `change`
   - trigger `evaluate(() => el.click())`

6. Xác minh đã chọn đúng
   - check `aria-selected`, `checked`, `selected`, `active`, `value` changed
   - nếu không xác minh được => không tiếp tục random; chuyển fallback hoặc dừng

7. Nếu vẫn không xác định rõ
   - không click random
   - chuyển sang AI assist / human review / skip session / log as ambiguous

### 15.3. Logic đề xuất cho `scoreOption()`

```js
function scoreOption(optionEl, questionText, record) {
  let score = 0;

  if (optionEl && optionEl.getBoundingClientRect().width > 0) score += 30;
  if (isInSameContainer(optionEl, questionText)) score += 25;
  if (normalizeText(optionEl.textContent).includes(normalizeText(questionText))) score += 15;
  if (optionEl.role === 'radio' || optionEl.getAttribute('role') === 'option') score += 15;
  if (isVisible(optionEl) && !isDisabled(optionEl)) score += 10;
  if (closestLabelMatches(optionEl, questionText)) score += 10;
  if (isNoiseButton(optionEl)) score -= 50;
  if (isFooterNavOrLegal(optionEl)) score -= 60;
  if (isHiddenOrAriaHidden(optionEl)) score -= 100;
  if (optionEl.matches('.selected, .active, [aria-selected="true"], input:checked')) score += 10;

  return score;
}
```

### 15.4. Rule: không được xử lý theo kiểu “click first matching result”

Các mẫu sai cần tránh:

```js
frame.locator('.btn-option').first().click();
frame.locator('input[type="radio"]').first().click();
frame.locator('label').first().click();
```

Các mẫu này rất dễ gây click nh���m do:

- nhiều `.btn-option` không phải là đáp án của câu hỏi hiện tại
- nhiều input radio là choice của các câu khác hoặc hidden
- label đầu tiên có thể là label của title hoặc footer

### 15.5. Quy tắc fallback an toàn

Khi option có score thấp hoặc không rõ, thay vì click ngẫu nhiên, hệ thống nên làm:

- thử `closest('label')`
- thử click trên `parentElement`
- thử `dispatchEvent(new Event('input'))`
- thử `dispatchEvent(new Event('change'))`
- thử `evaluate(() => el.click())`
- nếu kỹ thuật trên đều không xác minh được => `markAmbiguous()` + `fallbackToAi()`

### 15.6. Yêu cầu bắt buộc với feature này

Mỗi khi có trường hợp “khó xác định”, hệ thống phải lưu log ít nhất:

```json
{
  "questionText": "...",
  "candidateCount": 8,
  "bestScore": 62,
  "ambiguous": true,
  "fallbackUsed": true,
  "verificationPassed": false,
  "reason": "low confidence / custom widget / label mismatch"
}
```

Không được chỉ log “failed to click” mà không mô tả vì sao.

### 15.7. Kết luận

Với HTML khó, cách xử lý đúng không phải là “nhấn nút nào cũng được” mà là:

- định vị đúng câu hỏi
- trích xuất option trong cùng ngữ cảnh
- chấm điểm từng option
- chọn tốt nhất
- xác nhận sau click
- nếu mơ hồ thì fallback hoặc bỏ qua, không random click

Đây là yêu cầu bắt buộc nếu repo muốn hoạt động ổn định với các form/survey phức tạp và có thể tích hợp `playwright-core` mà không làm tăng sai lệch quá nhiều.
