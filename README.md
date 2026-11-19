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

Yêu cầu Node.js 20.19+ hoặc 22.12+.

```sh
npm install
npm start
```

## AI dùng dữ liệu của luồng autofill

Trong **Vận hành**, tích **AI điều khiển** để theo dõi các tab tự động ngay khi mở và cả tab tự động đang chạy. Agent đối chiếu cả trường trống, trường báo lỗi và lựa chọn mặc định với record của từng tab trên form `data-autoleadpc-mcp="record"` của đúng origin đã nhập lúc mở trình duyệt. Khóa trường và nguồn record dùng cùng quy ước bên dưới. Khi chưa có form phù hợp, agent chờ. Bỏ tích sẽ hủy lượt AI và trả tab cho autofill. Đóng tab hoặc trình duyệt sẽ dừng agent tương ứng. Checkbox ở trạng thái gạch ngang khi đang dùng một chế độ AI khác từ Cài đặt.

App áp dụng ngay các khóa đã biết. Với nhãn chưa rõ, app gửi chung các nhãn, loại trường và tên cột khả dụng cho agy hoặc API đã chọn. App tự lấy giá trị từ record sau khi nhận ánh xạ. Dropdown và radio phải khớp một lựa chọn duy nhất. Nhóm checkbox hoặc select nhiều lựa chọn cần cột đáp án riêng, ví dụ JSON `"mcp_answer_channels":["mail","sms"]`. Mảng rỗng `[]` yêu cầu bỏ mọi lựa chọn, còn checkbox đơn nhận `true` hoặc `false`. App giữ lựa chọn hiện tại khi thiếu đáp án hoặc khi có nhiều option cùng khớp.

Sau khi đổi giá trị, app đọc lại sau 550 ms. Nếu trang đặt lại giá trị, app đọc lại các lựa chọn hiện tại và thử sửa thêm một lần. Khi trường vẫn sai, trạng thái agent liệt kê khóa trường cần kiểm tra. Sự kiện `form_agent_field_blocked` ghi khóa trường và lý do trong chế độ log đầy đủ. Người vận hành có thể xem lại form trước khi gửi.

Ở chế độ agent liên tục và chế độ xử lý form bị kẹt trong Cài đặt, app dùng record hiện tại của tab. AI chỉ chỉ định ô nhập hoặc dropdown. App đọc lại nhãn từ DOM, áp dụng cùng bộ quy tắc lấy email đã gán, dữ liệu record và các cách viết tương đương của option. Các nhóm radio, checkbox và hành động gửi form do autofill xử lý. Khi có lỗi validation, app lập danh sách trường sửa được và dùng AI CLI đã cấu hình để ưu tiên các trường đó. Log `ai_form_plan_received` ghi số trường AI nhận diện trong danh sách. Luồng trong app tự chạy theo chế độ AI đã chọn, không cần ghép mã MCP hoặc nhập dữ liệu lần nữa.

## MCP biểu mẫu cho agent bên ngoài

Chạy client trong thư mục gốc của checkout này. Codex đọc cấu hình project ở `.codex/config.toml`. Claude Code đọc `.mcp.json`. Với client MCP stdio khác, đặt command là `node`, args là đường dẫn tuyệt đối đến `mcp-server.mjs` và `--forms`. Dùng cùng `AUTOLEADPC_PORT`, `AUTOLEADPC_INSTANCE` và, nếu có tùy chỉnh, `AUTOLEADPC_DATA_DIR` với backend. Cấu hình project đi kèm dùng instance 2, cổng 3211. Backend phải chạy phiên bản có mục **MCP biểu mẫu** trong Screen View. Cờ `--forms` chỉ công bố bốn công cụ dành cho biểu mẫu.

1. Trên website mình quản lý, đánh dấu một form ở document chính và khai báo khóa dữ liệu trên từng trường. Ví dụ ô ZIP có thể dùng `<form data-autoleadpc-mcp="record"><label>Postal code<input type="tel" data-autoleadpc-field="zipcode"></label></form>`.
2. Yêu cầu agent gọi `form_pair` với origin chính xác, ví dụ `https://forms.example.org`. Trong **Screen View → MCP biểu mẫu** của tab đã có record, nhập mã và bấm **Ghép tab này**. Mã có hiệu lực một lần. Quyền hết hạn mười phút kể từ lúc cấp mã.
3. Agent gọi `form_inspect` để xem nhãn, khóa, loại trường và trạng thái có dữ liệu. Gọi `form_fill` với duy nhất khóa, ví dụ `{"field":"zipcode"}`. Backend lấy giá trị từ record của tab. Các cột có sẵn như `contact`, `contactmethod`, `preferredcontact` và `language` được ưu tiên. Với câu hỏi riêng, có thể nhập một cột CSV/JSON tên `mcp_answer_<khóa>` trong dữ liệu app. Ví dụ `mcp_answer_contact` chứa `sms` cho nhóm radio có khóa `contact`. Các khóa hồ sơ hỗ trợ gồm `firstname`, `lastname`, `fullname`, `email`, `phone`, `address`, `city`, `state`, `zipcode`, `country`. Dropdown và radio cần khớp duy nhất một lựa chọn. App đọc lại sau 550 ms để phát hiện trang trả trường về giá trị cũ. Với radio, dùng cùng khóa và name cho cả nhóm, và đặt đáp án bằng value của lựa chọn.
4. Người vận hành xem lại kết quả trong tab. Bấm **Ngắt ghép tab này** hoặc gọi `form_disconnect` để kết thúc. Đổi document, đóng tab hoặc thay record làm mất quyền dùng grant cũ.

MCP trả trạng thái sau lượt xác minh giá trị. Trang có thể tiếp tục xử lý bất đồng bộ hoặc tự chuyển bước theo logic riêng. Công cụ không nhận selector, JavaScript, lệnh điều hướng, submit hay giá trị do agent nhập. Giao diện ghép và client stdio kết nối trực tiếp qua loopback. Agent cloud cần một MCP client chạy trên máy giữ app hoặc một triển khai remote có xác thực riêng.

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

Desktop có hai lựa chọn chờ lead: **Check Lead (2×30s)** và **Check Lead (2×20s)**, chỉ chọn một. Không chọn ô nào thì chạy hết luồng và chỉ hiển thị lead thụ động. Cả Start thường và tuần tự đều dùng thời gian đã chọn; “Chỉ hiện khi có Lead” giữ lựa chọn hiện tại, mặc định bật 2×30s nếu chưa chọn. Tắt cả hai ô chờ sẽ tắt cả “Chỉ hiện khi có Lead”.

Checkbox **Dừng autofill khi có lead** áp dụng cho phiên mở bằng Start: tự làm đến lúc chờ lead, xác nhận có lead thì dừng nhập liệu/click/rê/cuộn và AI trên mọi tab của cùng IP, giữ browser mở. Giữ thời gian 20s/30s đang chọn; nếu chưa chọn thì bật 2×30s. Không bật checkbox này vẫn tiếp tục làm sau lead như hiện tại. Bỏ cả hai ô chờ lead cũng bỏ chế độ dừng. Cờ confirmed giữ qua reload; phiên đang dừng không bị nhánh hoàn tất FinancialHelpFinder tự đóng. Thao tác thủ công vẫn dùng được.

Tạm thời khi chạy app, `AUTOLEADPC_LOG_MODE` mặc định là `access`: trang vào được không ghi log; mỗi tab chỉ ghi tối đa một lỗi `page_access_failed` nếu mở trang đích thất bại, bỏ probe IP và Toffers click, bỏ query/fragment khỏi URL. Không ghi tiếp thao tác/AI/mạng, không chụp ảnh/HTML/JSONL tự động. Riêng mốc lead và đóng tab/phiên vẫn được ghi cùng IP, confirmedLeadIp và trạng thái lead; kết thúc phiên lưu lý do đóng hoặc ghi rõ chưa xác định khi chỉ mất CDP. Console giữ `[PageAccess]`, `[Lifecycle]` và lỗi tiến trình `[Process]`. Autofill/AI và xuất HTML thủ công vẫn hoạt động. Muốn khôi phục recorder đầy đủ: đặt `AUTOLEADPC_LOG_MODE=full` trước khi chạy app. Nhật ký cũ được giữ nguyên.

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

Khi **Tự bù** đang bật và luồng **không check lead**, đóng cửa sổ bằng X, đóng tab cuối hoặc bấm X trong bảng vẫn giữ số cửa sổ mục tiêu và bù slot trống. Trình duyệt bị đóng/mất kết nối cũng được dọn một lần rồi bù bằng đúng engine đã chọn (Chrome, GoLogin hoặc AdsPower).

**Dừng/Đóng tất cả** hoặc tắt tự bù không mở lại browser. Luồng check lead giữ chính sách đóng chủ động không bù slot đó; IP đã xác nhận lead không bị tự đóng để phục vụ việc thay phiên. Cần còn proxy/cấu hình hợp lệ để mở được phiên thay thế.

Checkbox **Không bù slot** trong nhóm tùy chọn thực thi giữ các trình duyệt đang mở nhưng chặn mọi lần mở profile thay thế, kể cả hàng đợi đang delay. Trạng thái được lưu trong `no-slot-refill-settings.json`, không bị Start/Stop xóa; bỏ tích sẽ cho phép bù lại theo target và cấu hình hiện có.

### Giảm tải khi chạy nhiều trình duyệt

Thumbnail desktop chỉ tải các ô đang nhìn thấy mỗi 5 giây, dùng cache 10 giây và giới hạn hai lượt chụp đồng thời toàn app. Screen View giảm nhịp gửi frame/chụp bù; watcher lỗi DOM giãn còn 3 giây nhưng vẫn kiểm tra URL lỗi tức thì. Mỗi trình duyệt giữ tối đa 10 tab tổng, tính cả tab đầu và mọi tab mở trực tiếp hoặc từ offerwall; tab thứ 11 trở đi bị đóng, không đóng bớt 10 tab đầu. Giới hạn này áp dụng riêng từng trình duyệt, không phải toàn app. Phiên im 5 phút chỉ ghi cảnh báo, không tự đóng theo thời gian.

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

Form `reg-data` trong iframe Adsmith được khóa theo từng `sign_up_step*`, nhận các nút `sign_up_btn`; không điền bước sau hoặc mượn nút trang cha. Riêng `https://financialhelpfinder.com/thankyou.php`, app hoàn tất browser khi không còn tab offer/AI/popup đang xử lý, kể cả IP có lead. Trang `blog.financialhelpfinder.com/paththankyou.php` chỉ là bước trung gian: app không đóng mà để autofill bấm nút "Return to Financial Help Finder" sang bước tiếp. Form/câu hỏi đang hiện, trang chưa đọc được hoặc đang tải vẫn được giữ; quy tắc Back khi lỗi không đổi. Xem `docs/debug/financialhelp-autofill-analysis.md`.

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

Tab offer phụ gặp `chrome-error://chromewebdata/` được đóng bằng quy tắc URL, không đợi đọc DOM lỗi, kể cả phiên đã có lead; giữ các tab đang làm việc. Tab chính/gốc vẫn theo chính sách phục hồi lỗi hiện có. Link trùng được dọn trong từng BrowserContext/IP, kể cả nhiều popup mở đồng thời hoặc tab trùng đã tồn tại trước lúc gắn watcher; không gộp tab của hai IP khác nhau.


### GoLogin Orbita

Mở **Cài đặt & Logs → Cài đặt hệ thống → GoLogin Orbita**, nhập **API Token** rồi bấm **Lưu cài đặt**. Sau đó tick **GoLogin Orbita** trên màn chạy và bấm Start. Ô token trống giữ cấu hình cũ; giao diện chỉ báo đã cấu hình, không tải token đã lưu về. Token được lưu riêng trong `gologin-config.json` của instance với quyền 0600; không ghi vào cấu hình lượt chạy hoặc localStorage. Không còn token dự phòng trong source. Token từng nằm trong source cần được chủ tài khoản thu hồi/thay mới.

GoLogin chỉ mở khi có proxy hợp lệ và IP trong Orbita khớp IP đã khóa; thiếu proxy, proxy lỗi hoặc trùng IP thì bỏ slot, không chuyển sang IP trực tiếp. Mỗi phiên có log lead/đóng, record riêng trên từng tab, chuột, autofill/AI và watcher dùng chung. Check lead chỉ chạy sau email hợp lệ nếu đã tick; thời gian 2×20s/2×30s được giữ khi tự bù.

Trong phần GoLogin có sáu lựa chọn profile chính thức: **Windows 10, Windows 11, Mac Intel, Mac ARM (M2), Linux và Android**, mặc định chọn cả sáu để phân phối luân phiên theo slot. Lựa chọn được lưu riêng với token, truyền qua Start thường/tuần tự và giữ khi bù slot. Mỗi profile mới chọn ngẫu nhiên Orbita **148, 149, 150, 151, 152, 153, 154 hoặc 156**; 155 không có trên CDN. Nhóm hệ điều hành Chrome độc lập; iPhone/iPad giả lập không được liệt kê như profile GoLogin chính thức. Thay đổi chỉ áp dụng cho profile mới, không đổi OS/nhân của profile đã tạo.

Chỉ tái sử dụng profile AutoLeadPC đã dừng (`status=stopped` hoặc `isRunning=false`) có cùng `os`/`osSpec`. Không đổi OS của profile đã tồn tại, không sửa/xóa profile cá nhân. Khi đóng, app dừng đúng tiến trình Orbita do SDK sinh ra trước khi gọi `stop()` để lưu/dọn dữ liệu, tránh browser mồ côi. Nếu chưa xác nhận dừng thành công, giữ khóa profile/proxy/IP.

Orbita Android được thử thực tế có thể treo với `mousePressed`; lớp input riêng chuyển nhấn/thả thành touch event và giữ chuyển động/con trỏ. Các engine khác giữ nguyên primitive chuột. Script `tests/manual/gologin-supported-devices.mjs --live` chạy chủ động bằng token của instance, tạo profile QA riêng cho từng loại, kiểm tra IP và form offline rồi dừng/xóa chỉ profile vừa tạo; không thuộc npm test và không gửi form offer.


GoLogin bật **Chạy trong app** được khởi chạy bằng `--headless=new` ngay từ SDK, không mở cửa sổ Orbita rồi mới thu nhỏ. Screen View/HTML vẫn hoạt động; nút Hiện không tạo cửa sổ Desktop cho phiên headless. Chế độ chỉ ẩn tới lead/target dùng cửa sổ headful khởi động ngoài màn hình và thu nhỏ, theo dõi cả popup.

Nhật ký GoLogin bắt đầu trước tạo profile/SDK/CDP/IP, giữ pha khởi tạo và mã lỗi an toàn trong chế độ log tối giản. Mất CDP khi tiến trình còn sống không được kill hoặc nhả IP: thử nối lại ba lần vào Orbita cũ, giữ lead/record/lịch sử link và dựng lại Screen View/autofill. Nếu chưa nối được thì giữ browser và ghi một mốc lỗi; chỉ dọn khi có lệnh đóng hoặc tiến trình đã thoát. Bộ prune và tab cuối cũng áp dụng guard này.
# Màn card cuối SweepstakesAlerts

Autofill chỉ bật luồng này khi tab `sweepstakesalerts.com`/`www.sweepstakesalerts.com` có tiến độ 98–100% và card có link hiển thị. App dọn các tab cũ trong cùng browser một lần rồi bấm CTA thật của từng card. HTML/JavaScript của website quyết định điều hướng tab hiện tại, iframe, tái dùng tab có tên hoặc mở tab mới; app không ép mở tab con và không bỏ qua preventDefault. Giữ trần tab hiện có; chỉ CTA mở tab con phải chờ quota, điều hướng tab hiện tại vẫn được chạy khi hết quota. Reload không dọn lại các tab mới hoặc mở lại card đã thử. Không áp dụng khi dừng/chờ lead, manual/skip/consent-only hoặc tắt autoSubmit. Trang gốc được giữ khỏi nhánh trang rỗng và không gọi AI/F5 chỉ vì đang chờ tab con. Những site khác giữ luồng offerwall hiện tại.

Màn cuối SweepstakesAlerts có `#ow-placement iframe[data-content-iframe]` từ HTTPS `sdk.scrptk.com/content/render` được giữ trong lúc iframe tải; chỉ dọn tab cũ khi iframe có card. Đọc offer trong đúng frame, bỏ link Powered by/Privacy ở trang cha. Task Addept tái dùng luồng card → CTA → Skip, reset dấu CTA khi chọn task mới; đủ 10 tab thì chờ chỗ trống.

Phạm vi click: màn card SweepstakesAlerts chỉ đọc trong vùng Alpha Intent/main hiển thị; khi có vùng main thì không mở card nằm ngoài vùng đó. Chỉ khi không có main mới nhận vùng form/offerwall. Iframe Addept được giới hạn theo placement; task chỉ lấy từ `.unit-stack`. Bộ chọn submit và primitive click từ chối header/footer/nav/aside/sidebar, vùng attribution và các role điều hướng; không fallback sang link ngoài vùng nghiệp vụ.

Nhận diện ô địa chỉ phải đối chiếu label/aria-labelledby/aria-label và placeholder với name/id/type. Nhãn địa chỉ Anh–Việt rõ ràng thắng định danh phone/tel; thiếu địa chỉ trong record thì để trống, không fallback sang phone. Nhãn nổi chỉ đọc ở wrapper có một control; không lấy label của ô bên cạnh hoặc disclaimer làm nhãn. Không dùng giá trị cá nhân đang nhập làm tín hiệu phân loại.

Nhánh nhập nhanh phone của Alpha Intent cũng phải gọi `collectFieldMetadata`/`matchFieldValue` trước khi điền; quét tiếp các ứng viên thay vì chọn `.first()` theo type tel. Ô địa chỉ type tel không được điền phone trước luồng chung.

Nhãn accessible dùng cho fill: ghép nội dung `aria-labelledby` theo thứ tự ID trong cùng document/shadow root, bỏ ID không tồn tại; sau đó mới dùng `aria-label`, rồi label native. Nhãn ARIA nhận diện rõ nghiệp vụ được ưu tiên hơn name/id/type. Các nhánh nhập nhanh Alpha Intent đối chiếu giá trị qua cùng parser trước khi nhập; không nhận tên ID tham chiếu làm nội dung nhãn, vẫn giữ phone chia phần theo phone1/2/3.

Trang cuối mở offer theo vị trí hiển thị (trên xuống dưới, trái sang phải), không chọn task Addept ngẫu nhiên. Các lượt quét trang gốc/frame không chạy chồng; CTA/link được chốt lần thử trước input và giữ lịch sử trong BrowserContext qua reload/dựng lại DOM/đóng tab con. Link đầu đang pending hoặc đủ trần tab thì chờ, không mở vượt sang link sau. Chỉ CTA HTTP(S) có đích xác định mới được bấm; task đã xử lý không bấm lại sau reload.

Addept đã thử chọn card nhưng info panel chưa hiện thì giữ trạng thái chờ xác minh, không chọn lại card hoặc vượt sang card sau; panel xuất hiện muộn vẫn tiếp tục CTA của card đang chờ.

Theo yêu cầu ghi HTML từng ô, log `input_fill_html` được giữ cả trong mode access: ghi trước thao tác nhập nhanh/chậm/date, chỉ outerHTML của input/textarea (tối đa 8.192 ký tự), bỏ value/nội dung textarea, handler inline và data attribute ngoài nhóm định danh field. URL trang/frame bỏ query; không chụp toàn trang hoặc ghi từng ký tự. Desktop có bộ lọc HTML input và nút Xem HTML; nội dung nằm trong browser-logs.json, cùng giới hạn 2.000 event/phiên.

Cứu kẹt Adsmith: `inspectAdsmithFrameLoading` + `recoverAdsmithFrameLoading` chỉ áp dụng FinancialHelpFinder với đúng AS_SURVEY/AS_IFRAME. Spinner chưa tạo frame chờ 25s, blank chờ 20s, Chrome error chờ 4s; GET lại trang cha tối đa 5 lượt/URL, giữ budget qua reload/hash/quay lại URL. Handler sở hữu lượt quét kể cả khi hết lượt, không để late-progress/stuck-page/AI F5 thêm. Tôn trọng lead/AI/manual; renderer chưa đọc được không bị suy diễn thành blank. Chi tiết tại docs/ADSMITH_IFRAME_LOADING_RECOVERY.md.
# Bản Windows

Bộ cài Windows x64 được tạo từ chính backend Node.js và giao diện `/pc` hiện tại,
với cửa sổ Electron thay wrapper Swift. Node.js, Playwright, Codex SDK/CLI Windows
và SQLite native Windows được đóng gói cùng ứng dụng; không cần cài Node.js trên máy đích.

```sh
npm ci
npm run build:windows
```

Kết quả: `dist/windows/AutoLeadPC-Setup-1.3.3-x64.exe`. Đây là một tệp cài đặt;
sau khi cài, chạy AutoLeadPC trong Start Menu. Không xóa hay tách các tệp trong
thư mục cài đặt. Cần Internet khi build để lấy runtime và dependency chính thức.
Build trên Windows được hỗ trợ qua workflow **Windows installer** (chạy thủ công
trong GitHub Actions); sau khi chạy tải artifact **AutoLeadPC-Windows-x64**.
Build chéo trên macOS còn phụ thuộc khả năng chạy công cụ NSIS của electron-builder.

Dữ liệu Windows nằm ở `%APPDATA%\AutoLeadPC-2`; cache profile ở
`%LOCALAPPDATA%\AutoLeadPC-2\Cache`. Nhật ký khởi động là `backend.log` trong
thư mục dữ liệu. Gỡ bộ cài giữ dữ liệu. App chỉ mở một instance và báo lỗi nếu
cổng 3211 đang được chương trình khác sử dụng. Mặc định chỉ bind loopback;
đặt `AUTOLEADPC_ALLOW_LAN=1` trước khi mở nếu cần hub LAN trong mạng tin cậy.

Cài Chrome (major 150 trở lên theo chính sách hiện tại) hoặc dùng chức năng tải
Chrome for Testing. AdsPower/Multilogin cần ứng dụng và Local API Windows;
GoLogin cần token và Internet để SDK tải Orbita. AI cần tài khoản/API key và
cấu hình riêng; CLI `agy` cần cài riêng nếu chọn nhà cung cấp này. Tunnel cần
`cloudflared.exe` trong PATH hoặc Tailscale đã cài. Không mang token, proxy,
profile hoặc dữ liệu thật từ máy build vào bộ cài.

Các kiểm tra tự động không thay thế QA trên Windows thật. Trước khi coi bản Windows
đủ chức năng, thực hiện checklist Windows trong `QA_TEST_CASES.md`, nhất là
Chrome/AdsPower/GoLogin, tự bù, Screen View, AI và dọn phiên khi đóng app.

Bản thư mục chạy trực tiếp: giải nén `AutoLeadPC-Windows-x64.zip`, mở
`AutoLeadPC-Windows-x64/AutoLeadPC.exe` và giữ nguyên toàn bộ thư mục đi kèm.
Gói này kèm Chrome for Testing Windows x64 tại `resources/browser/chrome-win64`;
wrapper tự chọn Chrome đi kèm khi không đặt `AUTOLEADPC_CHROME_APP`. Không cần
cài Node.js hay Chrome riêng. Token/proxy/record cần nhập hoặc import khi dùng;
AdsPower/Multilogin vẫn là ứng dụng ngoài nếu chọn các engine này.

Gói riêng tư `AutoLeadPC-Windows-Private-x64.zip` được tạo riêng khi người dùng
yêu cầu chuyển cấu hình/tài khoản. Dữ liệu nằm trong `resources/private-settings`,
được nạp trước backend ở lần mở đầu tiên; các file đã có trên Windows được giữ.
Marker `imported-private-settings.json` ngăn nạp lại sau đó. Gói riêng tư chứa
thông tin đăng nhập dạng đọc được: giữ kín và không đưa vào Git hoặc chia sẻ công khai.
Build Windows thông thường không tự đóng gói dữ liệu riêng tư. Không chuyển
Keychain macOS hoặc cookie/password của profile trình duyệt giữa hai hệ điều hành.

## Server Windows chạy nền và truy cập LAN

Thanh IP/title trong trang Orbita được đồng bộ lại khi IP phiên đổi (ví dụ khi
xác nhận lead), kể cả tab đang mở, reload và tab mới. Các request đổi tên profile
GoLogin được gửi tuần tự để phản hồi cũ không ghi đè tên có IP mới. Đây là IP app
đã xác minh/đối chiếu lead; nội dung IP do website tự hiển thị được giữ nguyên.
Proxy xoay hoặc IP khác nhau theo đích/IPv4/IPv6 vẫn cần đối chiếu IP mạng thực tế.

Đóng GoLogin từ app dùng trực tiếp luồng dọn phiên, chờ dừng Orbita và xóa profile
trên GoLogin; không phụ thuộc sự kiện đóng Context/CDP của Windows. Nút X từng slot,
tab cuối Screen View và Đóng tất cả dùng cùng lượt cleanup; sự kiện trùng không xóa
lặp. Nếu dừng SDK hoặc xóa profile thất bại, xem nhật ký `[GoLogin]`; giữ khóa khi
chưa dừng được tiến trình và không báo thành công giả ở nút đóng.

Giải nén gói Windows vào một thư mục cố định, thoát app cũ rồi chạy
`Cai-tu-khoi-dong.cmd` một lần. Server chạy nền và tự mở sau khi đăng nhập Windows.
Chạy `Mo-cong-LAN.cmd`, chấp nhận quyền Administrator của Windows để thêm rule
Firewall chỉ cho đúng Node đi kèm, cổng 3211, mạng Private và máy cùng subnet.
Đặt LAN/Wi-Fi tin cậy thành Private trong Windows Settings.

Nhấp phải biểu tượng AutoLeadPC trong khay hệ thống → **Địa chỉ truy cập từ máy khác**;
mở `http://IP-MAY-WINDOWS:3211` trên máy cùng mạng. Nút X chỉ ẩn cửa sổ khi chạy
server; **Thoát và dừng server** trong tray mới dừng backend và các phiên của app.
Mở `AutoLeadPC.exe` khi server đã chạy sẽ hiện giao diện của cùng instance.

`Bat-Server.cmd` chỉ mở server, `Go-tu-khoi-dong.cmd` gỡ autorun,
`Dong-cong-LAN.cmd` gỡ rule Firewall. Có thể bật/tắt autorun ngay trong menu tray.
Không di chuyển thư mục app sau khi đăng ký autorun; nếu di chuyển cần gỡ và đăng ký lại.
Server giữ dữ liệu/cấu hình hiện tại và không tự Start các luồng offer khi mở máy.

Đây là server chạy trong phiên desktop sau đăng nhập, để Chrome/GoLogin dùng được
giao diện trình duyệt; không phải Windows Service chạy trước màn hình đăng nhập.
Máy phải còn bật, không sleep và không đăng xuất. Chế độ `--server` bật LAN mặc định,
ẩn cửa sổ và tắt public tunnel tự động (`AUTOLEADPC_DISABLE_TUNNEL=1`).
`AUTOLEADPC_ALLOW_LAN=0` vẫn giới hạn loopback; `AUTOLEADPC_PORT` đổi cổng và cần
dùng cùng giá trị cho app lẫn script Firewall.

API hiện chưa có đăng nhập chung nên chỉ mở cho mạng tin cậy; không forward cổng
3211 ra Internet. Truy cập qua Internet cần một kết nối riêng được bảo vệ.

### Obscura native

Chạy `npm run build:obscura` trước khi chạy Obscura từ source. Lệnh này dùng Rust/Cargo để build engine có rendering/CDP và đặt binary đúng hệ điều hành trong `bin/`; không chép cấu hình, token hoặc dữ liệu phiên. Backend dùng các bước cấp proxy, phân công offer, lịch sử và giới hạn chung với Chrome, sau đó gắn autofill/AI/lead/script vào context Obscura.

Obscura là engine headless: điều khiển bằng Screen View, không có cửa sổ Chrome/Orbita trên Desktop. Các profile Windows/Mac/Android/iPhone/iPad là cấu hình giả lập fingerprint; profile iOS không phải Safari/iOS thật. Khi mất kết nối CDP, app giữ renderer, IP và record rồi thử nối lại; Stop/Đóng tất cả dừng đúng process của từng phiên, kể cả phiên đang khởi tạo.

Bộ cài Windows cần binary Rust Windows x64. Trên Windows, `npm run build:windows` tự build engine nếu `bin/obscura_antidetect_demo.exe` chưa có. Khi đóng gói Windows trên Mac, cung cấp binary Windows đã build qua `AUTOLEADPC_OBSCURA_WINDOWS_BIN`; không dùng binary macOS. Workflow Windows build engine trên runner Windows trước khi đóng gói.

Profile iPhone/iPad của Obscura dùng danh sách cố định: iOS/iPadOS 17.4.1, 17.5.1, 17.6.1 và 18.0, tương ứng `Version/17.4`, `17.5`, `17.6` và `18.0`. Token `Safari/604.1` được giữ theo định dạng tương thích. OS được hiển thị trong preview; đây là cấu hình giả lập, không phải các bản Safari/WebKit thật. Danh sách áp dụng khi mở phiên mới.

Khi bù Obscura, phiên cũ phải dừng/dọn xong trước. Phiên thay thế dùng context sạch, seed/fingerprint và phiên bản Chrome hoặc Safari khác phiên vừa đóng; đổi nhóm thiết bị trong lựa chọn đã bật nếu có nhóm khác. Chỉ chọn một nhóm thì vẫn đổi fingerprint/phiên bản trong nhóm đó. IP cũ bị loại ngay cả khi tắt kiểm tra lịch sử trùng; proxy xoay có thể giữ endpoint nếu đã cấp IP mới. Thiếu IP hoặc profile mới sẽ báo lỗi thay vì tái dùng phiên cũ. Pool phiên bản hữu hạn được xoay giữa các lượt.

### Sửa hồi quy autofill và info song song (2026-11-18)

Mỗi info được khóa theo phiên trên bộ cấp phát chung của Chrome, AdsPower, GoLogin và Obscura.
Pool quay vòng, record trùng hoặc đổi dữ liệu bị form từ chối không được lấy info đang thuộc phiên khác.
Thiếu info thì ghi thông báo để nạp thêm; không tự tạo dữ liệu hoặc lấy info đang chạy.
Reload và reconnect giữ info của phiên. Khóa chỉ được giải phóng sau khi phiên đã đóng và rời tập active.

Dropdown chỉ khớp chính xác, không ép DOM để báo thành công, không dùng Submit làm trigger,
không lách khóa busy và không phát change lần hai. Ô chưa tải options nhả về vòng quét thay vì chờ 1,5s mỗi lượt.
Obscura dùng CPU chưa có backend WebGL: getContext trả null để website dùng fallback; không trả pixel giả.
Các thay đổi tương thích API không phải bằng chứng đạt một tỷ lệ chống phát hiện hay vượt mọi website.

Obscura giữ method/body POST và query GET khi form mở tab mới, tôn trọng base href, formtarget/formaction/formmethod của submitter và target có tên. Core Rust sở hữu vòng đời tab, target có tên, opener và hàng đợi điều hướng; không dùng script của app bắt click/submit hoặc cầu nối Node tạo tab. Dữ liệu form không được ghi vào console hay phát ra Runtime.bindingCalled cho client. Reference cửa sổ hỗ trợ điều hướng, đóng, focus và postMessage cơ bản; chưa tương đương đầy đủ WindowProxy/DOM đồng bộ giữa hai cửa sổ.

Cấu hình Obscura được truyền vào core Rust, không cài script vá Web API từ app. Core xử lý bộ đếm meta refresh sau sự kiện load, giữ lịch đã nhận khi thẻ bị xóa và bỏ qua khai báo lỗi. DPR thuộc page và được chia sẻ với các iframe; UA/header riêng cho từng page được áp dụng lên cả hai HTTP transport, bao gồm fetch/XHR. API Web Audio context chưa có backend nên không được quảng cáo; engine không tạo PCM, phổ tần hoặc kết quả decode giả. `AudioBuffer` chỉ còn là vùng chứa dữ liệu. Các mô hình font/giọng đọc theo profile vẫn là mô phỏng, chưa thay thế font hệ điều hành hay bộ phát tiếng nói thật.

Cấu hình chạy theo offer được lưu đầy đủ ở backend và nạp lại qua cùng bộ chuẩn hóa checkbox: chế độ chạy, hiển thị, đa tab, chờ/dừng sau lead, delay và chống trùng. Cache giao diện chỉ được ghép khi thuộc cùng offer. Sequential dùng số luồng đã chọn, giữ lựa chọn đa tab và khởi động lại được sau Stop. Stop/Start thu hồi quyền điều phối của job bù cũ; kết quả đến muộn không nhả khóa hoặc sửa thông báo của lượt mới. Các lựa chọn Fonts/API Fake IP được giữ khi bù; Không bù slot vẫn được lưu độc lập.

Tương tác form (2026-11-18): humanClick giữ nhịp nhấn ngắn 15–25ms trước nhấn, 25–40ms giữ, 20–30ms sau nhả; nhịp nhập 160ms trước/sau fill vẫn giữ. Data Saver ưu tiên resourceType document/stylesheet/font trước mẫu đuôi URL để CSS có query giống ảnh/pixel không bị chặn nhầm. Không tiêm __autolead_perf_style hoặc ép reduced-motion/animation-duration của trang; giữ callback và transition của form JS.
