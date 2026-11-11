
## 17) Phân loại và xử lý câu hỏi về độ tuổi, sở thích, phương tiện xe đang đi

### 17.1. Vấn đề thực tế

Các câu hỏi kiểu:
- age / how old are you / age range
- preference / favorite / like best
- vehicle / car / truck / suv / motorcycle / what do you drive / currently drive

đều có đặc điểm chung: có nhiều option nhưng không phải lúc nào cũng có selector rõ ràng, và các câu hỏi này rất hay xuất hiện trong survey / offerwall dưới dạng card, tab, select, hoặc custom widget.

Do đó, không thể xử lý bằng một luật click chung. Cần phân loại câu hỏi trước, sau đó mới chọn option tương ứng.

### 17.2. Cách phân loại câu hỏi

#### 17.2.1. Age questions

Dấu hiệu nhận diện:
- `age`, `how old`, `years old`, `age range`, `under 18`, `18-24`, `25-34`, `35-44`, ...

Logic cần áp dụng:
- ưu tiên xác định `questionType = 'age_range'`
- nếu record có age data: chọn khoảng tuổi phù hợp với record
- tuổi lấy từ `record.age`; nếu thiếu thì tính từ năm sinh bằng `calculateAge(record)` (đọc được `Năm Sinh`/DOB)
- nếu không có record: chọn theo thứ tự ưu tiên cố định `25-34` > `35-44` > `45-54` > `18-24` > `55-64` > `65+`

Ví dụ:
- record.age = 28 => chọn `25-34`
- record.age = 42 => chọn `35-44`
- nếu không biết => chọn candidate có score cao nhất nhưng không random từ cả page

#### 17.2.2. Preference questions

Dấu hiệu nhận diện:
- `favorite`, `prefer`, `like most`, `what do you like`, `which do you prefer`

Logic cần áp dụng:
- ưu tiên `questionType = 'preference'`
- nếu record có `favorite_vehicle`, `vehicle_preference`, hoặc tương tự => ưu tiên match option theo giá trị đó; nếu thiếu thì dùng `vehicle_type`
- nếu không có record: chọn option chứa từ khóa phổ biến trong block, ví dụ: `SUV`, `Sedan`, `Truck`, `Car`, `Motorcycle`, tùy theo text câu hỏi

#### 17.2.3. Vehicle / current-mode questions

Dấu hiệu nhận diện:
- `what vehicle do you drive`, `currently drive`, `vehicle type`, `mode of transportation`, `transportation used`

Logic cần áp dụng:
- ưu tiên `questionType = 'vehicle'`
- nếu record có `vehicle_type`, `vehicle_make`, `car_make`, `vehicle_model` => chọn option phù hợp nhất
- nếu không có record: ưu tiên option như `Car`, `Sedan`, `SUV`, `Truck`, `Motorcycle`, `Van`, `Bus` theo văn bản câu hỏi và mức độ phổ biến trong block

### 17.3. Logic mặc định cần bổ sung

Mẫu nhận diện nằm ở `QUESTION_TYPE_PATTERNS` (`autofill.mjs`), dùng chung cho `classifyQuestionText` và trong trang. Thứ tự: age → preference → vehicle. Mọi từ khóa dùng `\b` để `page`, `manage`, `care`, `business` không bị nhận nhầm.

| Loại | Từ khóa chính |
|---|---|
| `age_range` | age, how old, years old, age range, các khoảng 18-24 … 65+ |
| `preference` | favorite, prefer(red/ence), like most, what do you like |
| `vehicle` | vehicle, car, truck, suv, motorcycle, van, bus, drive, transport(ation) |

Câu như "What type of vehicle do you prefer?" khớp `preference` trước; nhánh `preference` vẫn dùng `vehicle_type` của record như `favorite_vehicle`.

### 17.4. Matching theo record và block

#### 17.4.1. Khi có record

- Nếu `record.age` tồn tại => match với khoảng tuổi trong block
- Nếu `record.vehicle_type` hoặc `record.vehicle_make` tồn tại => chọn option gần nhất trong cùng block
- Nếu `record.favorite_vehicle` tồn tại => ưu tiên option matching semantic

#### 17.4.2. Khi không có record

- chọn option có score cao nhất trong cùng block câu hỏi
- không chọn từ toàn page
- không random từ option đầu tiên
- nếu không option nào match: chọn **đáp án đầu tiên không phải** "None of the above / Skip / Prefer not / I do not drive" (yêu cầu của chủ dự án, tránh dừng survey); log `first_answer`
- `ambiguous = true` chỉ còn khi block không có option dùng được

### 17.5. Ví dụ thực tế

#### Ví dụ 1: age

Câu hỏi: "How old are you?"

Options:
- 18-24
- 25-34
- 35-44
- 45-54
- 55-64
- 65+

Nếu record.age = 31 => chọn `25-34`.
Nếu không có record => chọn option có điểm cao nhất trong block, không lấy ngẫu nhiên.

#### Ví dụ 2: vehicle preference

Câu hỏi: "What type of vehicle do you prefer?"

Options:
- Sedan
- SUV
- Truck
- Motorcycle
- Van

Nếu record.vehicle_type = "SUV" => chọn `SUV`.
Nếu không có record => ưu tiên đối tượng text gần với `preferred` và `vehicle type`, chọn option có score cao nhất.

#### Ví dụ 3: current vehicle

Câu hỏi: "What vehicle do you currently drive?"

Options:
- Car
- SUV
- Truck
- Motorcycle
- I do not drive

Nếu record.vehicle_type = "SUV" => chọn `SUV`.
Nếu không có record -> ưu tiên `Car` nếu là câu hỏi hiện tại/trong block không có dữ liệu rõ ràng; nhưng vẫn phải đánh score và verify.

### 17.6. Quy tắc không được làm

- Không dùng `first().click()` cho câu hỏi age/vehicle/preference
- Không đem toàn bộ option trên page ra so sánh mà không có câu hỏi context
- Không dùng cùng một kiểu xử lý cho age và vehicle
- Không coi sự xuất hiện của keyword `car` hay `suv` là đủ để chọn đáp án nếu không cùng block
- Không coi `record` có sẵn là Auto-accept; vẫn phải verify sau click

### 17.7. Kết luận cho phần này

Các câu hỏi về độ tuổi, sở thích, và phương tiện xe đang đi cần được xử lý theo logic chuyên biệt theo loại câu hỏi, không dùng chung một logic click. Cách đúng là:

- phân lớp câu hỏi
- chọn block chứa câu hỏi
- match theo record nếu có
- nếu không có record thì dùng scoring block-local
- verify sau click
- nếu không match -> đáp án đầu tiên hợp lệ (không random, không chọn None/Skip)

Đây là một phần bắt buộc để nâng cấp repo cho form survey/custom widget phức tạp.

### 17.8. Tích hợp với các handler hiện có

- `handleSurveySemanticQuestions` chạy trong scoped pipeline trước AlphaQ/MUI để hoàn tất các câu semantic trước khi Continue. Nhánh không có scope cũng dùng record đã resolve ở `fillPageForms`.
- `semantic/collect-question-blocks.mjs` nhóm theo wrapper gần nhất (fieldset/role group/question) hoặc heading gần nhất khi không có wrapper; từng block được chấm điểm độc lập. Nhãn của input lấy từ label, không dùng textContent rỗng của input.
- Handler chỉ xét control hiển thị qua toàn bộ tổ tiên và `memberSelector`. Không ép visibility, opacity hoặc pointer-events của widget.
- `verification/perform-survey-answer.mjs` phân biệt dispatched và verified. Native checked, ARIA hoặc class của website là bằng chứng; marker do tool tự đặt không phải bằng chứng. Không đọc được DOM/option biến mất đơn lẻ không được mặc định thành công.
- Câu chưa verified chỉ mang timestamp attempt để chống click dồn. Chỉ verified mới gắn `data-ux-qclicked`; generic không chọn thay các option được semantic sở hữu.
- Định danh bước bỏ checked/value/marker; SPA cùng URL phải có heading hoặc tập option mới trước khi ghi autoAdvanced. Nội dung tiến độ như 95% không phải bằng chứng hoàn tất.
- Test cục bộ: `tests/semantic-blocks.test.mjs`, `tests/scoped-question-widgets.test.mjs`, `tests/survey-verification.test.mjs`, `tests/spa-progress.test.mjs`. Bộ snapshot trong Downloads kiểm tra cấu trúc và trạng thái chờ khi thiếu engine; không coi click chưa xác minh là đã trả lời.
