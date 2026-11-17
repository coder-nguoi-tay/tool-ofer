# Trạng thái xử lý sau review

## Stop, đóng tab cuối và bù bằng phiên sạch

Đã sửa tab cuối Screen View dùng cùng `prepareManualBrowserClose()` với đóng slot: không check lead giữ target/bù; check lead giảm target đúng một lần; Stop/Không bù slot thắng. Route không nuốt lỗi dừng native hoặc xóa phiên còn sống. Watcher bỏ qua tab do route này quản lý để tránh đóng/bù hai lần. Stop/Đóng tất cả giữ phiên/khóa chưa dừng được, nhận cả child pending xuất hiện muộn và trả số đóng thực tế/cảnh báo cho cả chế độ giữ lead. Desktop dùng chung handler Stop; Desktop/Mini hiển thị lỗi/cảnh báo thay vì báo thành công giả. Đường tự đóng trang lỗi/duplicate của Obscura cũng đi qua `session.close()`.

Khi phiên Obscura đã dừng, lưu metadata thuần gần nhất theo slot, không giữ context/cookie/storage. Phiên bù lấy seed mới, fingerprint phần cứng và phiên bản Chrome/Safari khác phiên vừa đóng. Nhóm thiết bị xoay trong lựa chọn của người dùng; nếu chỉ chọn một nhóm thì đổi fingerprint/phiên bản trong nhóm đó. Danh sách phiên bản Apple 17.4.1–18.0 và pool Chrome hiện có được giữ. Pool hữu hạn nên các phiên bản có thể xuất hiện lại ở các lượt sau; không lặp lại phiên bản của phiên vừa thay thế.

IP geo và IP xác minh trong browser đều được đối chiếu với IP của phiên cũ, kể cả khi tắt checkDuplicate. Proxy xoay cùng endpoint vẫn được phép nếu có IP mới. Không tìm được IP/profile mới thì báo thiếu tài nguyên, không mở offer bằng phiên cũ. Slot có native còn sống vẫn được giữ chỗ dù đang đóng. Relay, log, screencast và khóa được dọn trước callback bù; PID/context mới không nhận cookie/localStorage cũ.

App đã build/ký/cập nhật và mở lại tại `/Applications/AutoLeadPC Mac 2 AdsPower.app` khi không có phiên thật hoạt động. Source trong app khớp bản sửa. Suite chính thức đạt 952/952, không skip (`/tmp/autoleadpc-stop-fresh-suite.log`); bộ đóng–bù/fresh chạy từ bundle đạt 26/26 (`/tmp/autoleadpc-stop-fresh-bundle-tests.log`).

Kiểm chứng mới: các ca tab cuối/Stop lỗi, giữ lead, child pending muộn, UI lỗi, xoay thiết bị/phiên bản, cookie/localStorage sạch, loại IP cũ và đóng trang duplicate đạt. Test lead-refill hiện đi qua adapter/queue/routing thật với native thật, chứng minh PID/IP/thiết bị/phiên bản mới khác phiên cũ; API/proxy/đầu vào launcher được giả lập offline.


## Danh sách phiên bản Apple đã bổ sung

Theo yêu cầu giới hạn phiên bản, iPhone/iPad mới dùng bốn cặp OS/Safari cố định: 17.4.1/17.4, 17.5.1/17.5, 17.6.1/17.6 và 18.0/18.0. Generator dùng chung danh sách cho cả hai loại thiết bị; không còn iOS 16.6.1 hoặc Safari 17.5 cố định cho mọi OS. Token Safari/604.1 giữ nguyên. Preview hiển thị `profile.os`; các override HTTP/JS tiếp tục lấy cùng profile. Phiên đang chạy không được chỉnh lại fingerprint.

Đã kiểm tra 64 seed/thiết bị và mở native thật cho đủ tám tổ hợp thiết bị/phiên bản, đối chiếu HTTP, JS và API trạng thái; 25/25 test runtime/full-flow đạt. Release nextest của demo engine đạt 5/5, trong đó có kiểm tra 256 seed/thiết bị và giới hạn danh sách cho phép. Không sửa engine upstream trong lượt này. Suite chính thức đạt 934/934, không skip (`/tmp/autoleadpc-apple-profiles-suite.log`). App đã build/ký/cài lại và mở tại `/Applications/AutoLeadPC Mac 2 AdsPower.app`; binary trong app khớp SHA-256 với release/bin. Hai test kiểm tra đủ tám tổ hợp profile chạy trực tiếp trong bundle cũng đạt.


## Sửa đóng sau check lead và kiểm tra phiên bản Tablet

`startLeadVerification.closeForNewSlot()` trước đây gọi `session.browser.close()` cho Obscura, chỉ ngắt CDP rồi reconnect vào engine cũ; callback cleanup/bù không chạy. Nhánh Obscura nay gọi `session.close()` để xác nhận process dừng trước khi callback nhả relay/IP/proxy và gọi hàng đợi bù hiện có. Không sửa quy tắc xác định lead, không giảm target và không tạo vòng bù riêng. Suite chính thức lượt này đạt 931/932; một test phone-mask báo 27 sự kiện input vượt ngưỡng 16. Chạy lại riêng file phone-mask đạt 2/2; không sửa logic phone trong phạm vi này. Log: `/tmp/autoleadpc-lead-refill-full-suite.log`, `/tmp/autoleadpc-phone-mask-recheck.log`.

Test hồi quy mới `tests/obscura-lead-refill.test.mjs` dùng native thật và adapter/queue/routing hiện có, mock các biên Internet: không khớp IP, không có lead, giữ mở theo cài đặt, lỗi API, có lead, Stop, Không bù slot và dừng native thất bại. 8/8 đã đạt cả từ source và bundle đã cài tại `/Applications/AutoLeadPC Mac 2 AdsPower.app`; app đã mở lại, chữ ký hợp lệ. Kiểm chứng PID cũ dừng, cleanup một lần, khóa nhả trước khi mở PID mới, không reconnect và không bù chồng.

Kiểm tra 48 seed cho từng thiết bị từ binary hiện tại: iPad có iPadOS 17.4.1 và 17.5.1; iPhone có iOS 16.6.1, 17.4.1 và 17.5.1. Generator đang cố định `Version/17.5` cho tất cả profile Apple; cần mapping theo profile nếu mở rộng danh mục. `Safari/604.1` là token tương thích, không dùng làm phiên bản Safari thực; phiên bản sản phẩm nằm ở `Version/…`. Có thể mở rộng các cặp OS/Safari đã xác minh (ví dụ iPadOS 18 / Safari 18), nhưng thay UA không biến Obscura thành Safari/WebKit thật. Lượt này chỉ kiểm tra danh mục, chưa thêm phiên bản.

Nguồn đối chiếu: [WHATWG Safari UA](https://compat.spec.whatwg.org/#safari-user-agent-pattern), [Apple Safari 18](https://developer.apple.com/documentation/safari-release-notes/safari-18-release-notes).


## Bổ sung sửa preview iPhone/iPad

Đã xác định `/state` loại phiên Obscura có `chromeVersion` rỗng; đây là giá trị hợp lệ của profile iPhone/iPad. Bộ lọc nay nhận diện Obscura qua engine/cờ phiên, vẫn loại phiên đã đóng và giữ điều kiện IP/managed. Danh sách này dùng chung cho bảng chạy, preview desktop và Mini App. Nút điều khiển cập nhật theo engine khi tái dùng slot; Obscura mở Screen View, tooltip không hứa mở cửa sổ Desktop.

Regression trong `tests/obscura-runtime.test.mjs`: sáu loại thiết bị qua state tới `_updateScreenSlots`; phiên đã đóng/phiên không đủ metadata không xuất hiện; engine iPhone/iPad thật có phiên bản Chrome rỗng vẫn xuất hiện và chụp JPEG được. Test mục tiêu đạt 14/14; suite chính thức sau bản sửa preview đạt 922/922, không skip, selfcheck thành công (log `/tmp/autoleadpc-preview-suite.log`). Đã build, ký và cập nhật app duy nhất tại `/Applications/AutoLeadPC Mac 2 AdsPower.app` khi API xác nhận không còn phiên hoạt động. App đã mở lại; HTTP `/assets/desktop/app.js` trả đúng bản sửa. Start Obscura tự chuyển Screen View dù không tích Chạy trong app; Chrome vẫn giữ bảng chạy. Test Start thường/tuần tự đã đạt; suite cuối đạt 924/924, không skip (`/tmp/autoleadpc-obscura-preview-deployed-suite.log`). Không tự chạy offer/proxy thật.


Đã thay launcher Obscura rời rạc bằng bộ cấp phát proxy/offer/history/giới hạn chung với Chrome; giữ phần start/connect/stop và thiết bị trong adapter Obscura. Đã nối callback record/email/reject, chiến lược offer/solver, autofill/AI/lead, script/captcha, guard trang/tab, Data Saver, logging và các đường đóng/shutdown.

Engine native đã được sửa input và hình học iframe, danh tính HTTP cho tài liệu/request con, timezone, tổng byte CDP và renderer giữ qua reconnect. Test hành vi thật nằm ở `tests/obscura-runtime.test.mjs`; các test fixture routing/build cũ đã được cập nhật. Kết quả kiểm chứng ngày 2026-11-17:

- Runner chính thức `npm test`: selfcheck thành công, **919/919 test đạt**, không skip (143 giây).
- Sau bổ sung guard remote worker cuối cùng: chạy lại `tests/obscura-runtime.test.mjs`, **12/12 test đạt**. Bao gồm task đang chờ bị hủy sau Stop và không nhả proxy khi native chưa xác nhận dừng. Test này được đăng ký trong `TEST_FILES` cho các lần chạy suite tiếp theo.
- Native `cargo nextest` release có rendering: **2.668 test đạt, 5 skip**. Bộ CDP mục tiêu riêng trước đó: 397 test đạt, 4 skip.
- Build release thành công cho demo engine và CLI upstream; binary macOS đã cập nhật trong `bin/obscura_antidetect_demo`.
- Kiểm tra cú pháp entry point, module Obscura/worker, `build-app.sh` và `git diff --check` thành công.
- Fixture dùng loopback và dữ liệu cô lập: input/click iframe lồng nhau, danh tính HTTP/timezone, screenshot/response size, reconnect giữ DOM, autofill thật gửi form và dừng process đúng phiên đã được kiểm chứng. Không dùng tài khoản/proxy/offer thật.

Đã nối chung các nhóm runtime: phân công proxy/offer và chống trùng IP; record/email/autofill/AI; chiến lược offer/solver; script/captcha; chờ/dừng lead; guard trang/tab và giới hạn; Data Saver/băng thông/logging; đóng/Stop/shutdown/tự bù; Screen View; remote worker có kiểm tra capability; registry test và đóng gói native theo hệ điều hành. Stop nhận diện cả child đang chờ CDP; lỗi dừng giữ relay, phiên và khóa proxy/IP để không mở chồng.

Log kiểm chứng cục bộ: `/tmp/autoleadpc-obscura-all-final-2.log`, `/tmp/autoleadpc-obscura-last-focused.log`, `/tmp/autoleadpc-obscura-nextest-final.log`. App `/Applications/AutoLeadPC Mac 2 AdsPower.app` đã được cập nhật trong lượt xử lý preview tiếp theo, khi không còn phiên hoạt động; xem mục bổ sung ở đầu tài liệu. Chưa chạy obstacle-course companion vì repository đó không có trên máy.

Giới hạn cần QA trên máy đích: Windows installer, proxy có xác thực, dịch vụ AI/captcha và website offer thật. Obscura chỉ có chế độ headless/Screen View; không có cửa sổ Desktop hoặc Safari thật.

Phần dưới là **bản review trước khi sửa**, giữ lại để đối chiếu 22 nhóm vấn đề; các mô tả “chưa nối” bên dưới không phải trạng thái mới nhất.

---

# Review đồng bộ Obscura với runtime AutoLeadPC

Thời điểm: 2026-11-17, Asia/Ho_Chi_Minh. Nền Git: `1f8348a`, kèm thay đổi chưa commit.

Obscura đã được nối vào lựa chọn trình duyệt, launcher và bộ chọn engine tự bù. Tuy nhiên, phần khởi tạo phiên mới chỉ gắn một phần runtime; nhiều hành vi mà giao diện vẫn cho chọn chưa được thực thi.

Phạm vi là các đường chạy liên quan đến tích hợp trình duyệt: desktop/Mini/API, launcher, session, proxy, fingerprint, autofill, AI, script, lead, Screen View, logging, đóng/dừng, tự bù, remote agent và đóng gói. Đối chiếu chủ yếu với Chrome và GoLogin, cho trường hợp nhiều slot, nhiều offer, proxy xác thực và sử dụng lại sau Stop. Không có thay đổi mã ứng dụng trong lượt review này.

Các file đang được cập nhật trong lúc kiểm tra. Bản đọc gần nhất đã có `browser: context`, `_cdpBrowser`, `mainPage`, `tileIndex`, `isObscura`, callback cleanup và nhãn Obscura trong trạng thái. Các nhận xét cũ về thiếu những trường/callback này không còn áp dụng nguyên trạng; vấn đề đóng tiến trình phía dưới vẫn còn.

## Bằng chứng kiểm thử cô lập

- Engine thật, HTTP server loopback, HTML và dữ liệu giả; không khởi động app bằng dữ liệu người dùng.
- Ô ở trang chính: `locator.fill`, checkbox, select, click và keyboard hoạt động trong fixture cơ bản.
- JPEG screenshot có dữ liệu hợp lệ; đọc DOM và nhận `Page.screencastFrame` hoạt động trong fixture cơ bản. Đây chưa phải QA đầy đủ UI Screen View.
- Iframe cùng origin: `fill('FRAME_VALUE')` trả về nhưng cả `inputValue()` và `frame.evaluate()` vẫn đọc chuỗi rỗng. Ô đã focus đúng. Click nút trong iframe bị timeout 1.800 ms.
- Profile Android: JavaScript báo Android/Chrome 150, request tài liệu chính báo Windows/Chrome 143; request iframe báo Linux/Chrome 145.
- Profile khai báo `America/New_York`, `Intl.DateTimeFormat().resolvedOptions().timeZone` thực tế trả `Asia/Saigon` trên máy kiểm tra.
- Đóng context: tiến trình engine vẫn sống; session không có `_stopProfile`.
- Request fixture có `request.sizes().responseBodySize = -85`, cho thấy số liệu mạng chưa tương thích đúng với Playwright.
- Harness VM dùng chính source launcher và dependency giả: nạp proxy từ textarea gây `line.trim is not a function`; queue rỗng vẫn mở trực tiếp; hai proxy cùng IP vẫn mở hai slot; Stop trong lượt đầu và `noSlotRefill=true` không ngăn lượt sau; hai vai trò offer khác nhau vẫn mở URL đầu.
- Harness cũng xác nhận options autofill chỉ có `slot`, `proxy`, `websiteUrl`, `autoSubmit`, `onLog`; không có callback lead/AI/record/progress/strategy. Harness thay autofill bằng mock, vì vậy kết luận tiêu thụ record bên dưới còn được đối chiếu trực tiếp với source.
- Kiểm tra cú pháp launcher, opener và status handler thành công.
- Bộ `npm test` chạy bằng runner chính thức, có thư mục dữ liệu test cô lập: selfcheck đạt; 907 test, 903 đạt, 4 lỗi, không skip, thời gian node:test khoảng 143 giây; exit code 1.
- Bốn lỗi suite đều do fixture chưa cập nhật theo tích hợp mới: một test trong `tests/no-lead-auto-refill.test.mjs:87` thiếu export mock `launchObscuraBrowsers`; ba test trong `tests/single-app-build.test.mjs:57`, `:98`, `:114` thiếu facade `obscura-engine.mjs` trong workspace giả. Chúng chứng minh bộ kiểm chứng chưa được đồng bộ, không tự chứng minh app thật không build được.
- Log suite: `/tmp/autoleadpc-obscura-review-tests.log`. Các fixture engine riêng đã được đóng và dọn tiến trình thử nghiệm.

## Cần sửa trước khi dùng thực tế

### 1. [P1] Điền/click trong iframe chưa tương thích engine

Thao tác locator trong iframe có thể báo hoàn tất mà giá trị vẫn rỗng; click cũng có thể timeout, như fixture đã tái hiện. Đây là khác biệt của engine/CDP, không thể giải quyết chỉ bằng truyền thêm callback vào app. Input handler hiện đưa `Input.insertText` vào page theo session; cần truy vết và sửa việc chuyển thao tác đến document/frame đang focus, rồi kiểm tra lại cả tọa độ và sự kiện input. Nếu bỏ qua, form nhúng không đi tiếp dù autofill tưởng đã nhập.

Nguồn: `demo-obscura-antidetect/obscura-upstream/crates/obscura-cdp/src/domains/input.rs:407`; `src/obscura-engine/open-obscura-browser.mjs`.

### 2. [P1] Danh tính JavaScript, HTTP và múi giờ không đồng bộ

App chỉ inject stealth script và chỉnh viewport. Engine HTTP vẫn chọn profile mặc định riêng; múi giờ trong profile không được áp vào runtime. Cần đồng bộ UA, Client Hints, timezone và thiết bị trước request đầu, đồng thời áp cho iframe/tab mới; geo phải lấy theo IP thực của phiên. Nếu bỏ qua, website thấy các thông tin thiết bị mâu thuẫn ngay trong cùng một lần mở.

Nguồn: `src/obscura-engine/open-obscura-browser.mjs:85`; `demo-obscura-antidetect/src/generator.rs`; `demo-obscura-antidetect/obscura-upstream/crates/obscura-browser/src/context.rs`.

### 3. [P1] Sai hợp đồng dữ liệu khi nhập proxy

`selectProxies()` trả object nhưng launcher đưa vào queue vốn chứa chuỗi, sau đó gọi `parseProxyLine()` lần nữa. Parser còn nhận scheme ở vị trí `lineNumber`, nên HTTP không có scheme có thể bị hiểu thành SOCKS5. Cần dùng `importProxyLines()` như launcher Chrome và gọi parser đúng ba tham số. Nếu bỏ qua, Start lỗi hoặc chọn sai giao thức.

Nguồn: `src/browser/actions/launch-obscura-browsers.mjs:94`; `src/proxy/configuration/parse-proxy-line.mjs:19`.

### 4. [P1] Hết proxy vẫn mở trang bằng mạng trực tiếp

Khi `shift()` không trả proxy, launcher tiếp tục mở với `proxy=null`. Cần dừng cấp slot và báo hết proxy, thay vì coi đây là phiên trực tiếp hợp lệ. Nếu bỏ qua, yêu cầu nhiều slot hơn số proxy có thể làm trang nhận IP máy thật.

Nguồn: `src/browser/actions/launch-obscura-browsers.mjs:112`.

### 5. [P1] Thiếu cấp phát độc quyền và xác minh IP trong browser

Không gọi guard proxy đang dùng, guard IP đang dùng, acquire lock hoặc kiểm lịch sử IP theo offer. IP app chỉ đến từ probe Node, chưa kiểm trong engine trước khi mở offer, chưa có `exitIps` và guard IP máy thật. Cần dùng lại các bước cấp proxy/IP hiện có và lưu `session.proxy`; kiểm IP browser trước điều hướng offer. Nếu bỏ qua, hai slot có thể dùng cùng IP, hoặc IP hiển thị khác IP browser khi proxy xoay.

Nguồn: `src/browser/actions/launch-obscura-browsers.mjs:116`; đối chiếu `src/browser/actions/launch-gologin-browsers.mjs`, `src/browser/actions/open-gologin-browser.mjs`.

### 6. [P1] Đóng phiên chưa dừng engine trên mọi đường gọi

Hàm kill engine nằm trong `session.close()`, trong khi đóng slot, tab cuối, timer và Close All chủ yếu đóng context. `isManagedProfile=true` còn đưa phiên vào đường `requestManagedProfileStop()`, nhưng session chưa có `_stopProfile`. Cleanup mới chỉ đánh dấu đóng/nhả proxy/xếp bù; chưa kill tiến trình, chưa tự loại session khỏi tập active và chưa nhả stream. Cần nối một hàm đóng idempotent của Obscura vào mọi đường đóng, xác nhận process đã thoát rồi mới nhả tài nguyên. Nếu bỏ qua, app có thể bỏ quản lý engine vẫn sống và mở phiên thay thế.

Nguồn: `src/obscura-engine/open-obscura-browser.mjs`; `src/browser/actions/request-managed-profile-stop.mjs:14`; `src/browser/actions/close-active-browsers.mjs:101`; `src/http/routes/browser/post-close.mjs`; `src/process/actions/shutdown-app-gracefully.mjs`.

### 7. [P1] Stop và Không bù slot không chặn lượt mở đang chạy

Vòng lặp chưa kiểm cờ trước/sau delay, probe và open. Cần đọc lại `stopRequested` và `noSlotRefill` ở các mốc await; nếu lệnh hủy đến trong lúc mở thì đóng phiên mới bằng hàm đóng thật. Nếu bỏ qua, browser vẫn xuất hiện sau Stop hoặc sau khi người dùng cấm bù.

Nguồn: `src/browser/actions/launch-obscura-browsers.mjs:100`.

### 8. [P1] Chờ lead, dừng sau lead và theo dõi thụ động thiếu kết nối

Launcher gọi kiểm lead trước khi điền email, nên verifier thoát. Không đặt `session.enableLeadCheck`/`stopAutofillOnLead`, không truyền callback sau email; `interval` cũng không phải `intervalSeconds` verifier đọc. Khi không tick kiểm lead, cờ phiên không phải `false`, nên observer thụ động bỏ qua. Chưa capture clickid, IP phụ hoặc callback ghi tiến độ lead. Cần nối cấu hình và sự kiện như runtime hiện có, trước khi trang bắt đầu chạy. Nếu bỏ qua, lead không được kiểm đúng mốc và cờ bảo vệ/dừng không phản ánh lựa chọn UI.

Nguồn: `src/browser/actions/launch-obscura-browsers.mjs:160`; `src/browser/gologin/attach-autofill.mjs`; `src/leads/actions/observe-leads-after-email.mjs:26`.

### 9. [P1] Lựa chọn cách giải offer không được áp dụng

Launcher không truyền `offerStrategyState` hoặc `offerSolver`. Chọn manual/skip theo offer hoặc ép solver generic có thể vẫn chạy cách mặc định. Cần giữ offer number và chuyển strategy/solver vào phiên và autofill như các engine hiện có. Nếu bỏ qua, app có thể thao tác hoặc submit offer mà người dùng đã chọn bỏ qua.

Nguồn: `src/browser/actions/launch-obscura-browsers.mjs:184`; `src/browser/gologin/attach-autofill.mjs:37`; `src/autofill/offers/2615/match-offer.mjs:10`.

### 10. [P1] Đóng gói chưa bảo đảm có engine trên máy đích

Windows builder chưa đưa binary Obscura vào bundle, resolver chưa chọn tên `.exe`. Mac build chỉ copy binary release nếu có, không chặn trường hợp thiếu. Test mới cũng bắt buộc binary local nhưng CI chưa có bước build/provision Rust engine. Cần build/copy đúng binary theo nền tảng, kiểm tra bundle và chuẩn bị engine trong CI. Nếu bỏ qua, lựa chọn Obscura vẫn hiện nhưng bản cài sạch không mở được.

Nguồn: `scripts/build-windows.mjs:12`; `src/obscura-engine/resolve-obscura-binary.mjs:27`; `build-app.sh`; `.github/workflows/ci.yml`; `tests/obscura-engine.test.mjs:20`.

## Cần hoàn thiện để đồng bộ tính năng

### 11. [P2] Nhiều offer và nhiều tab chưa được phân công

`websiteUrl2..4`, `offerUrls` chỉ được lưu; `assignedStreamRoles` không được dùng để chọn URL. Mọi slot mở URL đầu, chưa gắn `offerNumber`/`streamRole`, chưa có vòng mở các tab offer. Cần tái sử dụng logic phân công và mở tab theo URL duy nhất; nếu không, tự bù sai offer và số liệu mặc định về offer 1.

### 12. [P2] AI tự cứu form chưa được kích hoạt

Autofill watcher gọi `options.onStuck`, nhưng Obscura không truyền callback này. Cần nối `runAiAssist()` và trả quyền về autofill, giữ guard dừng sau lead và ưu tiên phiên đã có lead. Nút AI thủ công dùng handler chung có thể được gọi, nhưng chưa tương đương cơ chế tự cứu. Nếu bỏ qua, form kẹt sẽ không tự chuyển sang AI.

### 13. [P2] Email, record và form bị từ chối chưa đi theo queue nghiệp vụ

Chưa lấy email qua `takeNextEmail()`, chưa cấp record mỗi tab qua `takeNextRecord()`, chưa cập nhật `currentRecord`/used qua callback tương ứng, chưa đọc `body.autofillData`, chưa có `onFormRejected`. Cần nối các helper sẵn có, không tạo queue mới. Nếu bỏ qua, queue không phản ánh đúng dữ liệu đã dùng, email mẫu không được cấp như các engine khác và record lỗi không được xử lý theo chính sách hiện hành.

### 14. [P2] Script và cấu hình captcha chưa được nối

Không đọc `scriptPath`, không `loadScript()`/`runScript()`, không đưa `captchaApiKey` vào đường chạy script. Cần nối sau bước mở offer, theo đúng session và record, không chạy lại khi reconnect. Nếu bỏ qua, script người dùng chọn không thực thi. Chưa kiểm chứng captcha thật hoặc dịch vụ bên ngoài.

### 15. [P2] Thiếu guard trang lỗi, popup và vòng đời tab cuối

Chưa gắn `watchTrafficBlockedPage`, `attachExtraTabGuards`, `attachUniqueOfferTabs`, `limitOfferTabs` và `closeChromeWhenLastTabCloses`. Chưa xác minh landing 2615 như launcher hiện có. Cần gắn trước điều hướng và giữ bảo vệ IP có lead. Nếu bỏ qua, popup rác/tab dư, trang bị chặn hoặc tab cuối đóng không có cùng cách phục hồi/dọn/bù.

### 16. [P2] Complete text và giới hạn số phiên không chạy

Không gắn `attachCompleteTextWatcher()` và không kiểm `limitRun` trước mở thêm. Cần dùng lại watcher/bộ đếm hiện tại. Nếu bỏ qua, chuỗi hoàn tất không tăng thống kê và không dừng khi đạt giới hạn.

### 17. [P2] Delay và cấu hình tự bù chưa giữ đúng hành vi

`delayStart`, `delayStop`, `choiceDelay`, `enableChoiceDelay` chưa được áp; delay mở dùng công thức cố định. Cleanup truyền object vào `queueAutomaticRefill(delayMs)`, trong khi API nhận số mili giây; object có thể làm nhánh chờ không chạy. Cần truyền số delay đúng hợp đồng và tái dùng các setting hiện có. Nếu bỏ qua, tuần tự và thao tác form không theo thời gian người dùng đặt.

### 18. [P2] Điều khiển hiện/ẩn cửa sổ chỉ còn giao diện

Session đặt `isWindowVisible=false` nhưng không có `showWindow`/`hideWindow`. Handler chung vẫn có thể trả `visible:true` do gọi optional method. Cần xác định khả năng GUI thực của engine; nếu chỉ headless thì phản ánh đúng khả năng và vô hiệu lựa chọn không hỗ trợ. Nếu bỏ qua, nút Hiện và chế độ chỉ hiện khi có lead báo trạng thái không thực hiện được.

### 19. [P2] Tiết kiệm dữ liệu và thống kê băng thông chưa tương đương

Có gắn tracker nhưng sau điều hướng đầu tiên, chưa có relay byte thật và chưa gắn `attachDataSaver()` theo setting. Fixture cho thấy `responseBodySize` âm; upstream phát `Network.loadingFinished.encodedDataLength` từ body size, cần đối chiếu hợp đồng CDP/Playwright. Cần sửa số liệu và gắn tracker/policy trước điều hướng. Nếu bỏ qua, thống kê không đáng tin và checkbox Data Saver không áp policy của app.

Nguồn bổ sung: `demo-obscura-antidetect/obscura-upstream/crates/obscura-cdp/src/domains/page.rs:1037`.

### 20. [P2] Nhật ký khởi tạo và ghi thao tác chưa đủ

Logger được gắn sau `openObscuraBrowser()` đã goto và follow meta refresh; lỗi điều hướng bị catch thành cảnh báo console. Có thể ghi nhận nhầm trang đã ready là tải thành công sau khi bỏ lỡ HTTP 4xx/5xx. Chưa gắn manual ops recorder và các hook HTML theo chế độ full. Cần gắn logger trước request đầu, ghi pha khởi tạo và giữ policy access/full hiện có. Nếu bỏ qua, không có đủ bằng chứng cho lỗi mở offer hoặc học thao tác tay.

### 21. [P2] Remote agent không giữ engine Obscura

Dispatcher task không truyền browser mode; `runAgentTask()` luôn chọn Chrome và gọi `openBrowserWithInstalledChrome()`. Cần truyền/dispatch engine hoặc công khai giới hạn local-only và không phân công Obscura cho worker chưa hỗ trợ. Nếu bỏ qua, bật agent có thể làm slot bù chạy bằng Chrome dù hub chọn Obscura.

### 22. [P2] Test E2E chưa kiểm chứng tích hợp nghiệp vụ

Bài mang tên full flow tự set value/click trong `page.evaluate()` và nhận chuỗi thành công giả trên trang local. Nó không chạy autofill thật, queue, AI, verifier lead, Stop hoặc đường đóng chung, nên vẫn có thể pass khi các hành vi trên hỏng. Cần thêm test theo hành vi, dùng fixture và launcher/API thật với dữ liệu cô lập, đặc biệt iframe và process cleanup. Nếu bỏ qua, trạng thái test xanh dễ bị hiểu thành đủ tính năng.

Lần chạy toàn suite còn có bốn lỗi fixture cụ thể nêu ở phần bằng chứng. Cần thêm export launcher Obscura vào mock routing và facade vào fixture build; không bỏ test để làm suite xanh.

Nguồn: `tests/obscura-full-flow-e2e.test.mjs:333`.

## Ma trận trạng thái

| Nhóm | Trạng thái hiện tại | Giới hạn đã xác định |
| --- | --- | --- |
| Chọn engine desktop/Mini, Start thông thường | Đã nối | Có dispatch đến launcher Obscura |
| Chọn engine tự bù/tuần tự | Đã nối dispatcher | Launcher chưa giữ phân công offer và các guard |
| Nhận diện phiên trong status/UI | Đã cải thiện | Có context, mainPage, tileIndex và nhãn engine |
| Generate profile, stealth script, CDP connect | Hoạt động cơ bản | Chưa đồng bộ mạng/timezone/geo |
| Username/password proxy | Có ghép vào URL | Chưa QA proxy xác thực thật |
| Proxy queue, cấp slot, chống trùng, lịch sử | Chưa đầy đủ | Lỗi kiểu dữ liệu, fail-open, thiếu lock/lịch sử/lưu queue |
| Xác minh IP trong engine, IP máy thật | Chưa nối | Probe Node chưa đủ chứng minh IP browser |
| Fill/check/select/click/keyboard trang chính | Đạt fixture cơ bản | Chưa đại diện cho mọi website/framework |
| Fill/click iframe | Có lỗi đã tái hiện | Fill không lưu giá trị, click timeout |
| Autofill generic | Có gọi | Thiếu callback và lựa chọn nghiệp vụ |
| Cách giải offer, override solver 2615/generic | Chưa nối đủ | URL có thể tự nhận 2615, nhưng override bị bỏ qua |
| Email và record theo tab, reject record | Chưa nối đủ | Thiếu helper cấp phát/callback hiện hành |
| AI tự động khi kẹt | Chưa nối | Thiếu `onStuck` |
| AI thủ công | Có đường handler chung | Chưa QA backend AI thật |
| Script/captcha trong script | Chưa nối | Không dùng đường `loadScript`/`runScript` |
| Lead chủ động, thụ động, stop-after-lead | Có lỗi tích hợp | Thiếu cờ và sự kiện; thiếu clickid/IP phụ |
| Nhiều offer/nhiều tab | Chưa nối đủ | Chỉ URL đầu được mở |
| Popup/trần tab/trang lỗi/landing/last-tab | Chưa gắn guard | Chưa tương đương Chrome/GoLogin |
| Screen View DOM/JPEG/screencast | Đạt fixture cơ bản | Chưa QA toàn bộ route/UI; thao tác iframe còn lỗi |
| HTML/DevTools | Có handler dùng chung | Chưa QA native DevTools; có đường HTML fallback |
| Hiện/ẩn cửa sổ Desktop | Chưa có method | UI có thể báo thành công giả |
| Max-run timer | Có gắn | Đường đóng chưa kill engine |
| Complete text/limitRun/delay thao tác | Chưa nối đủ | Setting không được thực thi |
| Stop/không bù/đóng/shutdown | Chưa an toàn về vòng đời | Không chặn hết lượt mở, chưa kill process trên đường chung |
| CDP reconnect, giữ phiên có lead | Chưa tương đương | Managed prune có thể dọn phiên khi engine còn sống |
| Log/bandwidth | Có gắn một phần | Gắn muộn, thiếu startup/full recorder, số liệu mạng sai |
| Data Saver/anti-fingerprint toggles | Chưa đồng bộ setting | Stealth hiện chỉ nhận seed và OS |
| Remote worker | Chưa hỗ trợ engine Obscura | Worker dùng Chrome |
| Đóng gói Mac/Windows/CI | Chưa đầy đủ | Binary và provisioning chưa được bảo đảm |

## Thứ tự hoàn thiện nhỏ nhất

1. Chốt khả năng engine bằng test iframe, input, HTTP fingerprint, timezone và vòng đời process.
2. Giữ phần riêng Obscura cho start/connect/stop/device; tái sử dụng các bước nghiệp vụ đã có thay vì tiếp tục sao chép thiếu callback từ launcher khác. Không tái dùng nguyên initializer mang giả định riêng GoLogin.
3. Nối proxy/IP, session và hàm đóng thật trước; sau đó nối record/offer/autofill/AI/lead/script/guard và các setting.
4. Chạy test hành vi offline qua launcher/API; sau đó QA Windows và các luồng browser/proxy thật theo checklist dự án.

Kết luận: chưa đủ điều kiện coi Obscura đồng bộ toàn bộ tính năng. Chưa kiểm chứng website offer thật, captcha/AI thật, proxy xác thực thật hoặc bản Windows chạy trên máy đích.
