
## 16) Bản yêu cầu kỹ thuật cần thêm cho việc xử lý nút click khó xác định

### 16.1. Yêu cầu mục tiêu

Khi gặp câu trả lời không xác định rõ nút nào là option hợp lệ, hệ thống phải tự xử lý theo cơ chế sau:

- xác định đúng câu hỏi hiện tại
- lọc option trong cùng phạm vi của câu hỏi
- bỏ noise và button không liên quan
- chọn best candidate dựa trên điểm số
- click theo fallback an toàn
- verify sau click
- nếu vẫn mơ hồ thì dừng hoặc chuyển AI fallback

Nói ngắn gọn: không được click ngẫu nhiên hoặc click theo `.first()` nếu không chắc chắn.

### 16.2. Yêu cầu đầu vào

Hệ thống phải nhận vào:

- `page` hoặc `frame` hiện hành
- `questionContext` hoặc `title câu hỏi` nếu có
- danh sách candidate elements trong vùng tương ứng
- `record` dữ liệu người dùng để match đáp án
- `strategy` để xử lý item mơ hồ

### 16.3. Yêu cầu đầu ra

Khi xử lý xong, phải có output chuẩn như sau:

```json
{
  "questionDetected": true,
  "questionText": "What is your housing status?",
  "candidateCount": 6,
  "bestCandidateScore": 81,
  "selectedCandidateText": "Own",
  "selectionVerified": true,
  "fallbackUsed": false,
  "ambiguous": false,
  "reason": "matched same container and role"
}
```

Nếu không rõ:

```json
{
  "questionDetected": true,
  "candidateCount": 5,
  "bestCandidateScore": 38,
  "selectedCandidateText": null,
  "selectionVerified": false,
  "fallbackUsed": true,
  "ambiguous": true,
  "reason": "low confidence / custom card widget / same text across multiple blocks"
}
```

### 16.4. Yêu cầu logic xử lý bắt buộc

#### 16.4.1. Tìm câu hỏi đúng vùng
- không quét cả page mà phải tìm trong vùng câu hỏi gần nhất
- ưu tiên container có title/label/question text
- nếu không tìm được vùng câu hỏi rõ ràng => đánh dấu ambiguous

#### 16.4.2. Lọc candidate đúng
- visible
- enabled
- không disabled
- không hidden / aria-hidden / opacity 0 / zero-size
- không nằm trong footer / legal / nav / help / account / menu
- không là nút prev/back/cancel/skip

#### 16.4.3. Gán điểm cho từng candidate
- cùng container với câu hỏi: +25
- text gần câu hỏi: +20
- role/aria-label phù hợp: +15
- label tương ứng: +10
- visible + enabled: +10
- không noise: +10
- selected/active: +10
- hidden/disabled: trừ rất mạnh

#### 16.4.4. Chọn answer theo score
- nếu candidate có điểm cao nhất và vượt ngưỡng rõ ràng => click
- nếu score thấp hoặc chênh lệch không rõ => không click random

#### 16.4.5. Fallback an toàn
- click direct element
- click closest label
- click parent container
- dispatch `input` + `change`
- evaluate click if needed

#### 16.4.6. Xác minh sau click
- check `aria-selected`
- check `checked`
- check `selected`
- check class `active`/`selected`
- check `value` hoặc `dataset` changed
- nếu không thành công, retry khác strategy hoặc bỏ qua

### 16.5. Quy định không được làm

- Không dùng `.first().click()` nếu không chắc chắn
- Không click button đầu tiên có chữ “Yes/No” khi nhiều block cùng hiện trên page
- Không click theo class chung như `.btn-option` mà không xác nhận question context
- Không random click nếu candidate score thấp
- Không coi `evaluate(() => el.click())` là method chính mà không verify lại
- Không bỏ qua `ambiguous` state

### 16.6. Kết luận

Nếu repo muốn xử lý tốt các câu hỏi khó và HTML tùy biến, cần có 3 thành phần bắt buộc:

- `questionDetector`
- `optionScorer`
- `selectionVerifier`

Mọi logic nếu thiếu các thành phần này sẽ dễ click sai, đánh dấu đúng sai và làm tăng lỗi ở site custom.

Những yêu cầu này cần được tích hợp vào repo như một tiêu chí bắt buộc của mỗi module xử lý form/survey.
