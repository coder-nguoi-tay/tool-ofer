
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
- nếu không có record: chọn option có score cao nhất trong block, ưu tiên khoảng tuổi trung bình hoặc phổ biến trong survey

Ví dụ:
- record.age = 28 => chọn `25-34`
- record.age = 42 => chọn `35-44`
- nếu không biết => chọn candidate có score cao nhất nhưng không random từ cả page

#### 17.2.2. Preference questions

Dấu hiệu nhận diện:
- `favorite`, `prefer`, `like most`, `what do you like`, `which do you prefer`

Logic cần áp dụng:
- ưu tiên `questionType = 'preference'`
- nếu record có `favorite_vehicle`, `vehicle_preference`, hoặc tương tự => thay vào 
- nếu không có record: chọn option chứa từ khóa phổ biến trong block, ví dụ: `SUV`, `Sedan`, `Truck`, `Car`, `Motorcycle`, tùy theo text câu hỏi

#### 17.2.3. Vehicle / current-mode questions

Dấu hiệu nhận diện:
- `what vehicle do you drive`, `currently drive`, `vehicle type`, `mode of transportation`, `transportation used`

Logic cần áp dụng:
- ưu tiên `questionType = 'vehicle'`
- nếu record có `vehicle_type`, `vehicle_make`, `car_make`, `vehicle_model` => chọn option phù hợp nhất
- nếu không có record: ưu tiên option như `Car`, `Sedan`, `SUV`, `Truck`, `Motorcycle`, `Van`, `Bus` theo văn bản câu hỏi và mức độ phổ biến trong block

### 17.3. Logic mặc định cần bổ sung

```js
function classifyQuestionText(text) {
  const t = normalizeText(text || '');

  if (/age|years old|how old|age range|under 18|18-24|25-34|35-44|45-54|55-64|65\+/.test(t)) {
    return 'age_range';
  }

  if (/favorite|prefer|like most|which do you prefer|what do you like/.test(t)) {
    return 'preference';
  }

  if (/vehicle|car|truck|suv|motorcycle|van|bus|drive|currently drive|transport|transportation/.test(t)) {
    return 'vehicle';
  }

  return 'unknown';
}
```

### 17.4. Matching theo record và block

#### 17.4.1. Khi có record

- Nếu `record.age` tồn tại => match với khoảng tuổi trong block
- Nếu `record.vehicle_type` hoặc `record.vehicle_make` tồn tại => chọn option gần nhất trong cùng block
- Nếu `record.favorite_vehicle` tồn tại => ưu tiên option matching semantic

#### 17.4.2. Khi không có record

- chọn option có score cao nhất trong cùng block câu hỏi
- không chọn từ toàn page
- không random từ option đầu tiên
- nếu không đủ confidence => `ambiguous = true`

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
- nếu mơ hồ -> ambiguous, không random click

Đây là một phần bắt buộc để nâng cấp repo cho form survey/custom widget phức tạp.
