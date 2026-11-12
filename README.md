# AutoLeadPC Mac — Chrome và AdsPower

### Chọn trình duyệt trên AutoLeadPC Mac 2

Chọn **AdsPower** để app tạo profile SunBrowser riêng cho mỗi slot, gắn proxy, kiểm tra IP qua trình duyệt và dọn profile khi phiên đóng. Nhập AdsPower API key trong **Settings > Browser** trước khi chạy. Chế độ **Chrome** tiếp tục dùng các bản Chrome đã cài trên máy và cơ chế chia luồng, tự bù slot hiện có.

Ở chế độ **Chrome**, nút **Tạo profile và mở** dùng các ứng dụng Google Chrome đã cài trên máy. Mỗi cửa sổ có phiên bản, thư mục profile và proxy riêng; nếu thiếu phiên bản, app báo lỗi trước khi mở. User-Agent theo profile thiết bị đã chọn và mang số phiên bản đầy đủ của bản Chrome đang mở (ví dụ `Chrome/154.0.8037.98`), khớp với Client Hints.

### Giả lập thiết bị và chống fingerprint

Phần này nằm trong `stealth.mjs`:

- **Đổi tận gốc qua CDP** cho từng tab và iframe khác site: User-Agent, Client Hints (brand GREASE giống Chrome, `platformVersion`, kiến trúc, model), `navigator.platform`, số nhân CPU, `navigator.languages` và header `Accept-Language`. Ngôn ngữ và múi giờ lấy theo quốc gia của IP proxy.
- **Script vá trong trang**: một script duy nhất chạy ở mọi frame và trong Web Worker tạo từ blob. Hàm vá trả `[native code]` khi gọi `toString`, giữ đúng `name` và `length`. Các phần được vá: chuỗi GPU và giới hạn WebGL theo profile, `deviceMemory`, `screen.avail*` và `outerWidth/outerHeight`. Với profile iOS, script xoá thêm Client Hints và `window.chrome`.
- **Mỗi cửa sổ là một máy khác nhau**: mỗi phiên có một seed riêng. Từ seed, app chọn ngẫu nhiên một cấu hình có thật trong profile, gồm chip/GPU, số nhân CPU, RAM, độ phân giải và tỉ lệ màn hình, phiên bản hệ điều hành. Ví dụ `macOS 15.6.1 · Apple M4 Pro · 14 nhân · 1512x982@2x`. Cấu hình này hiện khi rê chuột vào biểu tượng thiết bị trong tab **Trình duyệt**.
- **Nhiễu Canvas, ClientRects, WebGL, Audio luôn bật** theo seed của phiên: đọc lại nhiều lần vẫn ra cùng kết quả, khác phiên thì khác nhau. Tuỳ chọn Fonts vẫn bật/tắt riêng. Canvas xuất ảnh từ một bản sao có nhiễu, không đụng vào canvas của trang. ClientRects nhân một hệ số cố định nên `right - left` vẫn bằng `width`. Audio được thêm nhiễu một lần cho mỗi buffer.
- **WebRTC** luôn chạy với `--webrtc-ip-handling-policy=disable_non_proxied_udp` nên không lộ IP thật qua UDP. **ApiFakeIP** đặt toạ độ theo IP qua `geolocation` của Playwright và cấp luôn quyền geolocation.
- App không chèn badge hoặc sửa tiêu đề trang. IP và trạng thái lead hiển thị trong giao diện AutoLead; bộ quan sát thao tác dùng listener và binding để ghi sự kiện từ trang/frame.

Giới hạn còn lại: worker nạp từ URL thường (không phải blob) và service worker vẫn thấy `navigator.platform` thật. Danh sách font hệ thống vẫn là của máy đang chạy. Profile iPad/iPhone chạy trên Blink nên chỉ giả lập được bề mặt. Để ít lệch nhất, chọn profile trùng hệ điều hành của máy (`macos` trên Mac).

Giao diện có ba tab: **Thiết lập** chứa số cửa sổ, loại proxy, website đích và dữ liệu tự điền; **Proxy** chứa danh sách và công cụ kiểm tra/xuất lịch sử; **Trình duyệt** chứa nút mở/đóng profile cùng mục tải phiên bản Chrome for Testing.

Khi mở trình duyệt, app xác minh IP exit và kiểm tra trang đích. App lưu trạng thái của từng proxy trong lịch sử để tránh dùng lại; nếu dịch vụ xác minh IP lỗi, lượt mở và tự bù tạm dừng. Lịch sử nằm trong dữ liệu AutoLeadPC, có thể xuất CSV ở tab Proxy và xem danh sách IP đã dùng.

Nút chính mở Chrome Stable từ `/Applications/Google Chrome.app`, các bản Chrome cũ trong `~/Library/Application Support/AutoLeadPC/chrome-regular-builds` và các kênh Beta, Dev, Canary trong `chrome-channels`. Bản cũ đặt tên `Google Chrome 154.0.8037.98.app` hoặc `Google Chrome Beta 156.0.8078.4.app` theo kênh và phiên bản thực tế. Profile được lưu trong `chrome-profiles` và **tự xoá ngay khi cửa sổ đóng** — mỗi profile là một bản chép đầy đủ của profile mẫu (~179 MB) nên để lại thì đĩa phình thêm bấy nhiêu cho mỗi proxy đã thử; lệnh xoá chỉ chấp nhận đường dẫn nằm trong `chrome-profiles`. Phiên đăng nhập của một cửa sổ vì vậy không còn lại sau khi đóng, trừ phần được chép lại từ profile mẫu ở lần mở sau; lịch sử proxy được lưu trong dữ liệu AutoLeadPC. Mỗi proxy được xác minh IP ngay trong Chrome; IP trùng hoặc website lỗi sẽ đóng cửa sổ và thử proxy kế tiếp. SOCKS5 có user/password đi qua relay cục bộ của app. Tự bù cũng dùng các bản Chrome này. Kho `chrome-builds` chứa Chrome for Testing đã tải trước, tách khỏi nút chính.

Ô **Dữ liệu tự điền** nhận CSV có hàng tiêu đề hoặc mảng JSON gồm các object. Ví dụ CSV: `Họ tên,Địa chỉ,Số điện thoại` ở dòng đầu, các bản ghi ở những dòng tiếp theo; hoặc JSON chứa các trường lead (`Full Name`, `Address`, `City`, `State`, `Zipcode`, `Phonenumber`, `Năm Sinh`, `SSN`, `Routing`, `Name bank`, `Number`...). App tự động đối sánh thông minh tên trường (Anh - Việt, tên gộp hoặc tách rời First/Last Name, Month/Day/Year, Area/Prefix/Line, SSN1-3...), hỗ trợ form nằm trong iframe và các trang chuyển hướng. App tự phục hồi nếu chuỗi JSON bị cắt cụt đuôi. Dữ liệu đã lưu tiếp tục được dùng cho profile tự bù.

Autofill xác định form/container đang làm việc trước khi điền, kiểm tra lỗi và tìm nút gửi. Khi form ở iframe, CTA của trang cha không được dùng thay. Các input/nút liên kết bằng thuộc tính `form` và menu địa chỉ liên kết qua `aria-controls`/`aria-owns`/`list` vẫn được hỗ trợ. Nút bên dưới form dài được tìm trong chính form đó và chỉ cuộn khi nằm ngoài vùng nhìn thấy; không tự cuộn tới widget/footer ở mỗi lượt quét. Form phụ đã hiện từ đầu không được tự chọn sau khi form chính kết thúc; bước mới vừa xuất hiện hoặc thao tác focus chủ động có thể đổi phạm vi.

Khi IP của trình duyệt đã được xác nhận có lead, ứng dụng giữ cứng trạng thái theo IP và không tự đóng phiên khi tải lại trang, gặp duplicate, trang cảm ơn hoặc lỗi mạng. Các tab của cùng phiên dùng chung cờ bảo vệ; IP khác không được kế thừa. Nếu trang chính lỗi mạng/HTTP/duplicate, watcher thử Back về trang trước rồi đánh thức autofill để tiếp tục form/câu hỏi. Mỗi tab tối đa 3 lần cho cùng URL lỗi, cách nhau 15 giây; không có history hoặc phục hồi thất bại thì giữ mở. Lỗi iframe quảng cáo không làm rời form chính đang hoạt động. Người dùng vẫn có thể đóng phiên chủ động.

Khi gửi form, ứng dụng bỏ qua form đã ẩn và nút đang disabled/busy; kiểm tra lại nút ngay trước khi click để tránh gửi lần nữa trong lúc trang chuyển bước. Luồng gửi dự phòng chỉ áp dụng cho form hoặc nút đang hiển thị và sẵn sàng.

Với IP chưa có lead, nếu một tab hiển thị `Traffic Blocked!`, app tiếp tục đánh dấu proxy lỗi, đóng phiên và mở proxy/IP khác theo cấu hình tự bù.

Khi người dùng đóng tab cuối cùng của một phiên Chrome bằng dấu X, app cũng kết thúc tiến trình Chrome của phiên đó và cập nhật số cửa sổ đang mở. Phiên đóng theo cách này không được tự bù bằng proxy khác.

Tab **Trình duyệt** hiển thị phiên bản, IP exit đã xác minh và số trường tự điền của từng cửa sổ Chrome đang mở. Để mọi profile mới có sẵn RoboForm, bấm **Cài RoboForm cho profile mới** trong tab **Trình duyệt**. App mở profile mẫu `~/Library/Application Support/AutoLeadPC/chrome-template-profile` bằng bản Chrome thấp nhất trên máy, không qua proxy, tại trang RoboForm trên Chrome Web Store. Cài extension, đăng nhập RoboForm, rồi đóng cửa sổ đó. Mỗi khi app tạo một profile Chrome mới (kể cả tự bù), nó chép profile mẫu sang, trừ khóa tiến trình, cache và phiên tab. Profile đã tạo trước đó không bị thay đổi. Mọi extension cài trong profile mẫu đều được chép, và dòng trạng thái của từng cửa sổ Chrome ghi tên extension có trong profile đó hoặc lý do không có. Khi cửa sổ profile mẫu còn mở, app từ chối tạo profile Chrome mới. Cookie và phiên đăng nhập trong profile mẫu cũng được chép, nên chỉ dùng profile mẫu cho RoboForm. Nếu sau này cài thêm một bản Chrome thấp hơn bản đã mở profile mẫu, profile mới cho bản đó sẽ mở không có RoboForm; muốn khắc phục, xóa thư mục profile mẫu rồi cài lại.

## Cách dùng

Trong tab **Nhật ký thao tác (Logs)**, bấm **Xem lại phiên / Ghi chú lỗi** để chọn phiên theo slot, IP và thời gian. Bộ ghi nhận tự hoạt động trên các phiên Chrome/AdsPower mới: click, nhập/chọn, phím điều hướng, cuộn, form ẩn/hiện, quyết định của bot, điều hướng, lỗi JavaScript, console warning/error và vòng đời request trang/API (đang chờ, thời gian, kết quả). `source=browser` không phân biệt thao tác người dùng với bot; `isTrusted` cũng không đủ để phân biệt hai nguồn này.

Trang xem lại cho phép duyệt/phát từng bước, lọc tab hoặc lỗi/đứng, xem ảnh và trạng thái form (ẩn, disabled/busy, invalid). Ảnh chụp sau nhóm thao tác cách nhau khoảng 650 ms, không phải video hoặc ảnh chính xác từng lần nhấn. Khi tab chuyển/đóng quá nhanh, sự kiện vẫn được lưu nhưng ảnh có thể không chụp kịp; giao diện hiển thị ảnh tham chiếu cùng tab hoặc thông báo thiếu ảnh.

Ghi **Điều đã xảy ra** và **Kết quả đúng mong muốn** cho bước sai rồi tải **JSON sự kiện + ghi chú**. Dữ liệu này phục vụ đối chiếu và viết thêm test/sửa code, không tự huấn luyện hay tự sửa code. Nút tải ZIP xuất cả lịch sử, JSONL hành động, HTML và ảnh; dữ liệu lưu trong thư mục `logs` của từng instance và giữ đến khi chủ động xóa. Dữ liệu ảnh/HTML có thể chứa nội dung form đã điền; chỉ chia sẻ các phiên cần phân tích.

1. Nhập số cửa sổ và website ở tab **Thiết lập**, dán danh sách proxy ở tab **Proxy**.
2. Bấm **Tạo profile và mở** để mở các ứng dụng Google Chrome thường đã cài. Các bản Chrome for Testing trong kho riêng không được nút này sử dụng.
3. Dùng **Xem IP đã dùng** để xem lịch sử, **Tự bù** để bù cửa sổ đóng, hoặc **Đóng tất cả** để dừng lượt.

Proxy (kể cả user/password), URL, số cửa sổ và dữ liệu tự điền được lưu trong SQLite cục bộ `~/Library/Application Support/AutoLeadPC/preferences.sqlite` khi bấm **Lưu cấu hình**. Database này không mã hóa; chỉ đưa vào dữ liệu mà bạn muốn lưu trên máy này.

### Thêm proxy thủ công trên giao diện desktop

Trong **Thông tin → Hàng đợi Proxy**, dán danh sách, chọn SOCKS5 hoặc HTTP/HTTPS rồi bấm **Thêm vào hàng đợi**. App giữ các proxy đang có, bỏ dòng không hợp lệ hoặc trùng với hàng đợi/lịch sử đã dùng và cập nhật bộ đếm sau khi lưu.

## Chạy từ mã nguồn

Yêu cầu Node.js 20.19+ hoặc 22.12+ (theo yêu cầu của `cloakbrowser`).

```sh
npm install
npm start
```

## Chạy test

Chạy `npm test` để chạy self-check và test bộ cài các phiên bản Chrome. Các test DOM mở Chromium headless trên trang cục bộ; test tự động không gửi form tới website thật.

Các bài kiểm tra tự động nằm trong `tests/*.test.mjs` và `tests/mock-pages/`; `tests/selfcheck.mjs` chạy trước toàn bộ suite. Các mẫu HTML dùng chung vẫn nằm ở `mock-pages/`.

Các kịch bản kiểm tra thủ công với website thật nằm trong `tests/manual/` và được chạy riêng. Kịch bản offline trên HTML đã ghi nhận nằm ở `tests/integration/test-offline-screens.mjs`.

## Cấu trúc mã nguồn

`app.mjs` chỉ giữ điểm khởi động và các export tương thích. Các module ở thư mục gốc như `autofill.mjs`, `ai-assist.mjs`, `tgbot.mjs`, `stealth.mjs` cũng giữ API cũ và chuyển implementation vào `src/`.

- `src/http/routes/<nhóm>/`: mỗi endpoint và HTTP method có handler riêng; thứ tự xử lý nằm trong các danh sách `primary-handlers.mjs` và `screen-handlers.mjs`.
- `src/browser/`: từng thao tác mở/đóng phiên, quản lý profile, tab, cửa sổ, user agent, screencast và Data Saver.
- `src/autofill/`: từng bước xử lý form, field, checkbox, select, survey, gửi form và theo dõi tab.
- `src/autofill/twy/`: dữ liệu liên hệ, subform và quyết định thao tác campaign Twy; `form-scope/` giữ handler trong form hiện tại.
- `src/ai-assist/visible-state/`, `src/ai-assist/retry/`: chỉ gửi control đang hiển thị cho AI và khóa việc thử lại trên cùng trạng thái không tiến triển.
- `src/browser/locators/`: chuẩn hóa selector ID số, xác minh control/nhãn hiển thị và click thật.
- `src/ai-assist/`, `src/codex-form-agent/`: từng thao tác chẩn đoán và hỗ trợ AI.
- `src/tgbot/commands/`: mỗi lệnh Telegram có handler riêng; `index.mjs` giữ thứ tự chọn handler.
- `src/proxy/`, `src/queues/`, `src/records/`, `src/leads/`: xử lý proxy, hàng đợi email, dữ liệu lead và theo dõi kết quả.
- `src/config/`, `src/storage/`, `src/monitoring/`, `src/logging/`: cấu hình, dữ liệu khởi tạo, băng thông và log; mỗi thao tác có file riêng.
- `src/runtime/constants/`: từng giá trị cấu hình và đối tượng trạng thái của ứng dụng; các biến thay đổi theo phiên nằm trong `application-state.mjs`.
- `src/script/`, `src/survey-solver/`, `src/stealth/`, `src/relay/`: các thao tác của engine tương ứng.
- `ui/<desktop|mac|mini>/functions/`: mỗi hàm giao diện một file.
- `ui/<desktop|mac|mini>/setup/`: từng bước khởi tạo và đăng ký sự kiện, theo đúng thứ tự ban đầu.
- `ui/<desktop|mac|mini>/styles/`: CSS theo từng phần giao diện.

`ui/assets.json` là danh sách tài nguyên được phép phục vụ; `ui/bundles.json` xác định thứ tự ghép nguồn. Máy chủ ghép thành một JS và một CSS cho mỗi giao diện. Khi thêm file giao diện, cập nhật hai manifest tương ứng. JavaScript vẫn là script thường để các hàm gọi từ `onclick` và các biến giao diện dùng chung hoạt động như trước.

Module mới nên import trực tiếp chức năng cần dùng trong `src/`. Các file tương thích ở gốc dành cho các nơi đang gọi API cũ; tránh import ngược `app.mjs`. Trạng thái dùng chung nằm trong các file `state/` hoặc `src/runtime/application-state.mjs` để các hàm dùng cùng một bản dữ liệu. Callback truyền vào `page.evaluate()` phải tự chứa và không truy cập closure của Node.

`./build-app.sh` chép toàn bộ `src/` và `ui/` vào bundle, ký và cập nhật duy nhất `/Applications/AutoLeadPC Mac 2 AdsPower.app`. Thoát app trước khi build. Script dùng staging tạm và phục hồi bản cũ khi cài thất bại; khi hoàn tất không giữ backup, ZIP hoặc bản sao trong workspace. Các lần build sau tiếp tục dùng đúng đường dẫn này. Chạy từ source vẫn dùng `npm start`; không có bước build JavaScript bổ sung.

Khi widget chưa hiển thị bước tiếp hoặc AI đã thử nhưng giao diện không đổi, app ghi `ai_waiting_state`. App tự kiểm tra lại khi dữ liệu hiển thị đổi; thao tác gọi AI thủ công cho phép thử lại trạng thái đã bị khóa. Nút ẩn hoặc disabled vẫn phải chờ website mở khóa. Các kiểm thử tương ứng nằm ở `tests/ai-visible-state.test.mjs`, `tests/ai-action-target.test.mjs`, `tests/twy-scoped-survey.test.mjs` và `tests/scoped-question-widgets.test.mjs`.

Radio/checkbox native ẩn nhưng label đang hiển thị vẫn xác định được form đang làm việc, kể cả khi Continue chưa xuất hiện. AI xác định lại scope tạm lỗi trước khi đọc/thao tác; phục hồi thành công mở lại lượt thử của trạng thái đó. Nếu chưa phục hồi được, AI ghi `ai_scope_waiting` khi action thất bại và trả quyền autofill, không tiêu ba vòng thử hay khóa vĩnh viễn cùng giao diện. Các thao tác vẫn giới hạn trong form đã xác minh. Test hồi quy: `tests/form-scope-recovery.test.mjs`.

Ngoại lệ khảo sát Adsmith: chỉ `AS_IFRAME` có URL `adsmith.io/forge/v4/` (hoặc `www.adsmith.io`), placement `plc=9235`, nhúng trong FinancialHelpFinder được chọn **No** trước Continue. Handler riêng xác minh class `li.No.Active`, không mở subform Yes, không click focus iframe lặp và không gọi AI đổi đáp án. Các trang/iframe khác giữ mặc định Yes và fallback hiện có. Test: `tests/adsmith-no-survey.test.mjs`.

## Autofill 1.3.3 build 9

Click chỉ được ghi dispatched khi thao tác thành công; câu trả lời chỉ được tính sau khi đọc lại lựa chọn hoặc xác minh bước mới. Select theo record dùng alias theo loại field và so khớp đầy đủ, không lấy option đầu dự phòng. Thiếu dữ liệu tên/city/field lạ sẽ giữ chưa hoàn tất; quy tắc chuẩn hóa phone hiện có được giữ nguyên.

Semantic xử lý nhiều nhóm tuổi/phương tiện/sở thích trong cùng form, kể cả label bọc input và iframe. AI/rescue chỉ repair bằng dữ liệu cung cấp; executor và MCP repair chặn submit/điều hướng, còn pipeline autofill kiểm tra validation và phụ trách submit. Chế độ manual/skip/consent_only không tự kích hoạt AI để điền vượt quyền.

Các test `survey-verification`, `record-repair-policy`, `semantic-blocks`, `spa-progress` và `manual-answer-regression` nằm trong `tests/`. Các snapshot offline không có engine/API trả về trạng thái chờ xác minh; test kiểm tra rằng tool không tự tạo cờ answered.

### Chuột mô phỏng trên mọi màn hình

Autofill bật quỹ đạo rê chuột, drift, cuộn mô phỏng và dấu con trỏ riêng trên từng tab/IP. Chuyển động chạy bên trong từng trang Playwright; con trỏ vật lý của macOS vẫn là một con trỏ dùng chung. Nhãn checkbox ẩn, click AI và ô Alpha Intent/ngày/select dùng chung luồng rê chuột trước thao tác. Slot sau vẫn điền nhanh sau click; không gõ tiếp nếu click thất bại. Lớp vẽ con trỏ chỉ giữ một lệnh chờ mỗi tab và chờ tối đa 80ms, tránh chặn click khi renderer đứng. Con trỏ được tạo ngay khi gắn tab, kể cả chế độ thủ công; tự hiện lại sau reload/điều hướng hoặc khi website xóa DOM. Hình SVG nằm trong Shadow DOM và host có style riêng để CSS offer không làm mất hình.

### Khôi phục form đứng và giảm tải nền

- Không coi việc tải script Cloudflare/captcha là trang challenge khi form thật vẫn hiển thị. IP đã có lead tiếp tục được bảo vệ và xử lý form, không bị đóng để tiết kiệm data.
- Mọi slot dùng mouse mô phỏng riêng; slot sau vẫn ưu tiên fill đã xác minh để giữ tốc độ, rồi quay về đường tương thích nếu widget không nhận dữ liệu.
- Khi thư viện đứng, thử sửa field từ record trước AI. Không submit trong bước sửa, không tạo dữ liệu mẫu. Quét không tiến triển giãn từ 500 ms lên tối đa 5 giây; điều hướng hoặc yêu cầu quét chủ động bỏ khoảng chờ.
- Xếp hàng AI tối đa khoảng 15 giây, hủy chờ trạng thái cũ nếu giao diện đổi; timeout phản hồi đã cấu hình vẫn được tôn trọng.
- Data Saver chặn media và script/API bên thứ ba của các dịch vụ video quảng cáo/ghi phiên đã biết. Giữ ảnh, tài liệu/iframe, captcha và API form; không chặn toàn bộ JavaScript hoặc mạng affiliate. Chưa có số đo phần trăm tiết kiệm trên website thật.

### Tự bù khi không kiểm tra lead

Khi **Tự bù** đang bật và luồng **không check lead**, đóng cửa sổ bằng X, đóng tab cuối hoặc bấm X trong bảng vẫn giữ số cửa sổ mục tiêu và bù slot trống. Trình duyệt bị đóng/mất kết nối cũng được dọn một lần rồi bù bằng đúng engine đã chọn (Chrome/CloakBrowser hoặc AdsPower).

**Dừng/Đóng tất cả** hoặc tắt tự bù không mở lại browser. Luồng check lead giữ chính sách đóng chủ động không bù slot đó; IP đã xác nhận lead không bị tự đóng để phục vụ việc thay phiên. Cần còn proxy/cấu hình hợp lệ để mở được phiên thay thế.

### Giảm tải khi chạy nhiều trình duyệt

Thumbnail desktop chỉ tải các ô đang nhìn thấy mỗi 5 giây, dùng cache 10 giây và giới hạn hai lượt chụp đồng thời toàn app. Screen View giảm nhịp gửi frame/chụp bù; watcher lỗi DOM giãn còn 3 giây nhưng vẫn kiểm tra URL lỗi tức thì. Offerwall dùng chung trần 3 tab/phiên, không cố mở 8 tab rồi bị đóng. Phiên im 5 phút chỉ ghi cảnh báo, không tự đóng theo thời gian.

Máy RAM 16 GB nên bắt đầu với 10 trình duyệt và tăng sau khi đo trên offer thực tế; benchmark offline không bảo đảm 20 phiên website thật sẽ mượt. Hướng dẫn đo: [docs/BROWSER_PERFORMANCE.md](docs/BROWSER_PERFORMANCE.md).

### Ghi log và xem lại phiên

Mặc định recorder lưu các mốc tiến trình, lỗi mới và bằng chứng ở mốc cần chẩn đoán. Input/cuộn và request nền được gom vào bộ đệm hoặc thống kê, không ghi từng sự kiện. Khi cần soi một phiên đang chạy, mở **Xem lại phiên trình duyệt** và bật **Ghi chi tiết 5 phút**; chế độ tự tắt sau tối đa 10 phút.

Lỗi mới giữ tối đa 100 thao tác gần nhất trong 60 giây. Dữ liệu thô của chế độ debug được ghi JSONL bất đồng bộ theo lô và xoay ở 5 MB. Log phiên tối đa 2.000 sự kiện; lưu trữ dọn phiên đã đóng quá 7 ngày hoặc cũ nhất khi vượt 500 MB hoặc 200 file. File mồ côi có thời gian an toàn 15 phút khi vượt trần số file. Phiên đang chạy và phiên có ghi chú được giữ.

Autofill form Alpha Intent bỏ qua ô disabled/readonly, giới hạn thời gian chờ thao tác nhập/chọn và xác minh giá trị trước khi ghi nhận đã điền. Cảnh báo kẹt ghi rõ handler khảo sát/field đặc thù đang chạy để truy vết.

Nhịp điền nhanh theo chuột: rê tới ô → click → đợi 160ms → điền/xác minh → đợi 160ms → chuyển ô. Các ô Uplevel và thành phố/zip Alpha Intent được xử lý lần lượt, không còn cập nhật hàng loạt giá trị hiển thị trong một lệnh DOM; dữ liệu ẩn vẫn đồng bộ riêng.

Ghi HTML toàn trang (`offer-html-full`) mặc định tắt. Chỉ bật chủ động bằng `AUTOLEADPC_FULL_HTML_DEBUG=1`, giới hạn 10 phút và 10 MB cho mỗi tiến trình; bằng chứng HTML/ảnh của lỗi vẫn do recorder thông thường ghi.

### Debug HTML trong Screen View

Mở ô trình duyệt cần kiểm tra rồi nhấn **F12** (Mac có thể cần **Fn+F12**) hoặc **Cmd+Option+I**. Có thể dùng nút **F12 DevTools** trên thanh công cụ. App hiện bảng HTML của đúng tab đang xem, đồng thời mở DevTools Elements của Chrome/SunBrowser khi engine hỗ trợ cửa sổ inspector.

Nút **HTML** mở trực tiếp bảng mã; chọn **Trang chính/Iframe**, bấm **Sao chép HTML** hoặc **Tải .html**. Bản Mac hiện hộp thoại chọn nơi lưu. Đây là DOM hiện tại, không phải source HTTP ban đầu; chỉ đọc khi yêu cầu và không ghi thêm log tự động. Escape đóng bảng HTML trước khi đóng Screen View.

### Ưu tiên AI và luồng FinancialHelpFinder

Hàng đợi AI dùng chung cho CLI và sửa form/SDK: IP có lead được chọn trước, FIFO trong từng nhóm; giới hạn bốn lượt đồng thời, chờ tối đa 15 giây rồi nhả quyền cho autofill. Badge/log phân biệt đang xếp hàng, chờ phản hồi và chờ giao diện/dữ liệu thay đổi.

Form `reg-data` trong iframe Adsmith được khóa theo từng `sign_up_step*`, nhận các nút `sign_up_btn`; không điền bước sau hoặc mượn nút trang cha. Riêng `https://financialhelpfinder.com/thankyou.php`, app hoàn tất browser khi không còn tab offer/AI/popup đang xử lý, kể cả IP có lead. Form/câu hỏi đang hiện, trang chưa đọc được hoặc đang tải vẫn được giữ; quy tắc Back khi lỗi không đổi. Xem `docs/debug/financialhelp-autofill-analysis.md`.

Nhóm khảo sát Yes/No đang hiển thị được chọn Yes trước. Nếu đã click Tiếp tục hai lần mà vẫn cùng câu hỏi, app chuyển các nhóm sang No rồi thử lại tối đa hai lần; mỗi lần Continue chờ ít nhất 1,5 giây để trang phản hồi. Không đụng nhóm ẩn hoặc lách các ô nhập/consent bắt buộc. Chuyển bước thực sự sẽ reset bộ đếm.

Nếu chọn Yes mở subform có cả Save/Cancel trong form hiện tại, app điền các ô còn thiếu rồi bấm Save và đợi subform đóng trước Continue. Save không tính vào hai lượt Continue để fallback No. Nếu Save vẫn hiện sau hai lần thử thì giữ bước chờ kiểm tra, không bấm Cancel hoặc Continue xuyên qua subform.

Logic Yes/No và Save được chia trong `src/autofill/yes-no/`: `read-step` đọc snapshot, `inspect-survey-subform` nhận diện ô nhập/Save/Cancel, `get-step-state` và `get-save-state` giữ bộ đếm, `select-answer` click đáp án, `click-save` và `click-continue` thực hiện từng loại nút. `handle-yes-no-step.mjs`/`handle-survey-save.mjs` chỉ điều phối theo thứ tự nghiệp vụ. Các hàm chạy trong frame.evaluate vẫn tự chứa, không import closure của Node vào browser.

Màn 80–99% không còn form/câu hỏi trong các iframe đang thấy được chờ 60 giây rồi F5; tối đa hai lần, mỗi lượt cách nhau một phút. Nếu sau lần thứ hai chờ thêm một phút vẫn trống thì gọi AI chẩn đoán một lượt qua hàng đợi ưu tiên lead. Không bịa nút để click; giữ browser và tiếp tục autofill khi control xuất hiện. Không áp dụng trang thankyou/100%, captcha hoặc chế độ manual/skip/consent. Nếu AI tắt thì ghi rõ lý do chờ. Logic nằm riêng trong `src/autofill/late-progress/`.

### Tắt tự đóng trang không phải offer

Theo yêu cầu người dùng, watcher không còn quét thiếu form/câu hỏi để đóng tab hoặc browser. Nhánh vượt giới hạn tab cũng không tự đóng non-offer; trần mở offerwall vẫn được kiểm tra trước khi tạo popup. Xử lý lỗi mạng/blocked, tab trùng/quảng cáo rác và điều kiện hoàn tất thankyou là các nhánh riêng.

Chờ lead là tùy chọn bật chủ động: khi bỏ tích Check Lead, autofill tiếp tục làm đến cuối kể cả phiên còn cờ `checking`/`failed` hoặc cờ đã kích hoạt từ trước. Theo dõi lead thụ động không dừng form; khi phát hiện có lead thì khóa bảo vệ đúng IP để tránh tự đóng trong lúc còn làm câu hỏi. Chỉ ngoại lệ FinancialHelpFinder thankyou đã xác minh hết việc mới được hoàn tất phiên.

Yes/No hỗ trợ radio, checkbox có nhãn hiển thị và nút/link tùy biến; phải xác nhận đủ lựa chọn trước Continue. Các đáp án đang hiển thị cũng chặn đóng browser tại thankyou, kể cả nằm ở wrapper riêng hoặc input ẩn.

Sau lượt AI, Chrome và AdsPower trả quyền cho autofill; không đóng browser chỉ vì trang có chữ “Thank you”. Watcher dùng kiểm tra hoàn tất theo mọi tab. Widget Twy giữ phạm vi cả nhóm câu hỏi lẫn Continue. Checkbox và dropdown khảo sát vẫn được giải khi tắt ngẫu nhiên: chọn lần lượt đáp án hợp lệ, giữ lựa chọn có sẵn; yêu cầu số lượng được kiểm tra trước Continue. Dropdown dùng cơ chế chuột chung; placeholder có giá trị `-1`/`none` vẫn là chưa chọn để watchdog gọi hỗ trợ. Thiếu option hoặc click thất bại có log chẩn đoán khi trạng thái thay đổi.

Mỗi link offer chỉ mở một lần trong một BrowserContext/IP, độc lập giữa các IP. Link so trùng bỏ fragment, sắp query nhưng giữ tham số offer. Hai launcher không nhân bản URL để đủ số luồng. Offerwall khóa link trước await và giữ lịch sử qua reload; popup trùng được dọn khi điều hướng, kể cả tab gốc hoặc IP có lead, nhưng giữ một tab làm việc và không đóng browser/tab cuối. Tab có form/câu hỏi được ưu tiên giữ hơn landing trống cùng link. Thankyou không đóng cả phiên khi còn tab khác; iframe, nhãn checkbox, nút Continue và trạng thái loading đều giữ trang đang làm.

Nhật ký tự động giữ tóm tắt lỗi/autofill/AI/lead/lý do đóng khi dọn ảnh và HTML do vượt 500 MB hoặc 200 file. Mỗi tóm tắt giữ tối đa 100 mốc và 600 ký tự/mô tả; giữ id/sequence, thời hạn 7 ngày và tối đa 1.000 bản tóm tắt không được ghim. Phiên đang chạy/chưa có endedAt và phiên có feedback được bảo vệ; lỗi lưu metadata hủy việc xóa bằng chứng. Snapshot tự động bỏ script/data URI lớn, giới hạn HTML 512 KB với cờ rút gọn; so DOM và trạng thái form/iframe trước khi chụp ảnh lại. Nhịp thường cùng URL tối thiểu 5 giây, lỗi/URL mới ưu tiên 650ms; canvas/video hiển thị vẫn chụp. Export HTML thủ công giữ DOM đầy đủ. HTTP không ghi polling thành công của state/proxy-queue/bandwidth/toffers-overview; lỗi, lệnh điều khiển và request bị ngắt vẫn được ghi, không kèm query.

Danh sách loại trừ tab nằm trong `src/browser/tabs/is-excluded-offer-page-url.mjs`: hai trang about_our_program/rzu_program_requirements_ trên contact.uplevelrewards.com/contact.flashrewards.co, cùng secure.usgoldbureau.com/affiliate/affiliate-ira-default/. Rule khớp host/path, bỏ qua query và bắt ngay request điều hướng kể cả redirect. Nếu đây là tab cuối của IP có lead, tạo tab trống trước khi đóng để giữ browser/IP. Offerwall ưu tiên URL CTA thay vì link policy trong footer; khóa theo định danh offer trong context qua reload. Khi đã bắt đầu một lần click thì không retry vì timeout, không chạy fallback click cộng form.submit; CTA đã xử lý bị loại khỏi input tự động và ngữ cảnh AI. Query utm_*, gclid/fbclid/msclkid không tạo link mới; tham số nghiệp vụ vẫn giữ.

Bộ lọc popup loại trừ được gắn qua init script để chặn sẵn window.open/link policy đã biết trước khi popup có frame; các link khác vẫn dùng hành vi native. Rule đóng tab vẫn chạy cho điều hướng trực tiếp và các tab đã tồn tại.

Danh sách loại trừ cũng gồm trang gốc `yougov.com/` (kể cả `www`) và `super.com/home/landings/earn` (kể cả `www`, dấu `/` cuối và query tracking). Chỉ đóng đúng host/path này; form khảo sát trên `account.yougov.com` và các đường dẫn khác vẫn được giữ.
