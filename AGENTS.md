# Hướng dẫn cho AI coding agent

Tài liệu này mô tả repository AutoLeadPC Mac ở trạng thái hiện tại. Ngôn ngữ chính của mã, tài liệu và giao diện là tiếng Việt; giữ ngôn ngữ này khi bổ sung tài liệu hoặc thông báo cho người dùng.

## 1. Tổng quan dự án

AutoLeadPC Mac là ứng dụng macOS điều khiển nhiều phiên trình duyệt, mỗi phiên có proxy và fingerprint thiết bị riêng. Luồng nghiệp vụ chính là chọn proxy, xác minh IP exit, mở trang offer, điền form/giải survey, theo dõi lead, tự bù phiên khi cần và ghi bằng chứng để xem lại.

Ứng dụng gồm hai phần chạy cùng nhau:

- Một wrapper macOS bằng Swift dùng AppKit và `WKWebView`.
- Một tiến trình Node.js chạy HTTP server nội bộ, cung cấp giao diện/API và điều khiển trình duyệt qua Playwright/CDP.

Đây là package private, không phải thư viện phát hành công khai. JavaScript dùng ESM (`"type": "module"`); không có TypeScript, framework frontend, bundler hay bước biên dịch JavaScript. HTTP server dùng `node:http`, không dùng Express.

### Công nghệ và file cấu hình chính

- `package.json`: Node `^20.19.0 || >=22.12.0`; các script `start`, `test`, `relay`.
- `package-lock.json`: khóa dependency; CI cài bằng `npm ci`.
- Dependency trực tiếp: `playwright`, `cloakbrowser`, `@openai/codex-sdk`, `@playwright/mcp`, `https-proxy-agent`, `socks-proxy-agent`.
- `AutoLeadPCMacApp.swift`: vòng đời app native, `WKWebView`, lưu cấu hình bằng SQLite3 và tương thích đọc Keychain cũ.
- `Info.plist`: mẫu plist; bản build thật được `build-app.sh` tạo với instance và cổng riêng.
- `build-app.sh`: biên dịch Swift, đóng gói và ký `.app`.
- `runtime-node/node`: Node arm64 độc lập được đóng gói; file nhị phân này được theo dõi bằng Git LFS qua `.gitattributes`.
- `.github/workflows/ci.yml`: CI trên `macos-latest`, Node 22 và 24.
- `ui/assets.json`, `ui/bundles.json`: danh sách tài nguyên được phục vụ và thứ tự ghép JS/CSS.
- `tests/run-tests.mjs`: danh sách chính thức của toàn bộ test tự động.

Không có cấu hình formatter/linter hay script lint/format trong repository. Không tự thêm một toolchain mới khi chưa có yêu cầu.

## 2. Chạy từ mã nguồn

Yêu cầu hệ điều hành đích là macOS; bản `.app` khai báo macOS 12.0 trở lên. Cài dependency rồi khởi động:

```sh
npm install
npm start
```

`npm start` tương đương `node app.mjs`. Mặc định:

- HTTP server lắng nghe ở `127.0.0.1:3211` và mở giao diện bằng trình duyệt mặc định.
- Instance là `1`, dữ liệu nằm trong `~/Library/Application Support/AutoLeadPC`.
- Cổng có thể đổi bằng `AUTOLEADPC_PORT`; instance bằng `AUTOLEADPC_INSTANCE`; tên thư mục dữ liệu bằng `AUTOLEADPC_DATA_DIR`.
- Đặt `AUTOLEADPC_NO_OPEN=1` để không tự mở trình duyệt.
- Chạy `node app.mjs --public` để lắng nghe trên `0.0.0.0`; chỉ dùng trên mạng tin cậy.
- `AUTOLEADPC_CHROME_APP` thay đường dẫn Chrome Stable mặc định.
- `AUTOLEADPC_MAX_ALIVE`, `AUTOLEADPC_CONCURRENCY`, `AUTOLEADPC_RELAY_PORT` lần lượt giới hạn số phiên sống, số profile mở đồng thời và cổng bắt đầu của relay.
- `AUTOLEADPC_NO_WATCHDOG=1` tắt watchdog thoát theo tiến trình cha; không dùng nếu không hiểu vòng đời tiến trình.

Ví dụ chạy headless về mặt giao diện, đúng instance của bản đóng gói:

```sh
AUTOLEADPC_NO_OPEN=1 AUTOLEADPC_INSTANCE=2 AUTOLEADPC_PORT=3211 npm start
```

Lưu ý: khởi động server có nạp/dọn dữ liệu runtime và dọn tiến trình Chrome/SunBrowser mồ côi thuộc các thư mục profile do app quản lý. Không chạy đồng thời một instance thật và một instance thử nghiệm nếu chưa tách dữ liệu/cổng.

Các entry point bổ sung:

```sh
# Chạy relay SOCKS5/HTTP có xác thực trên loopback; mặc định đọc ./proxies-auth.txt
npm run relay -- /duong/dan/proxies-auth.txt

# Chạy worker agent nối vào hub; vòng poll này chạy liên tục
node app.mjs --hub=http://127.0.0.1:3211

# MCP server qua stdio; app HTTP phải đang chạy
node mcp-server.mjs
```

`Open AutoLeadPC Mac.command` là launcher Terminal: nếu chưa có `node_modules`, nó chạy `npm install` và `npx playwright install chromium`, sau đó gọi `npm start`.

## 3. Kiến trúc runtime

### Điểm vào và HTTP

`app.mjs` chỉ giữ:

- Re-export API tương thích từ các module trong `src/`.
- Handler `uncaughtException`/`unhandledRejection` của tiến trình.
- Điều kiện chạy trực tiếp dựa trên `realpathSync(process.argv[1])`, không dùng `import.meta.main`.

Khi chạy trực tiếp, app chọn `startLocalInterface()` hoặc `startAgentMode()` nếu có `--hub=`.

`src/http/actions/start-local-interface.mjs` nạp queue/cấu hình/log đã lưu, reset trạng thái tự bù về stopped, cài watchdog dọn profile và tự bù, khởi động polling nền, Telegram/tunnel rồi tạo HTTP server. Router nằm ở:

- `src/http/create-interface-request-handler.mjs`: duyệt route theo thứ tự, trả 404 nếu không có handler nhận request.
- `src/http/routes/primary-handlers.mjs`: route giao diện, cấu hình, queue, lead, log, AI, 711Proxy, Telegram...
- `src/http/routes/screen-handlers.mjs`: Screen View, điều khiển browser/tab và remote agent.
- `src/http/routes/<nhóm>/`: handler riêng cho từng endpoint/method.
- `src/http/routes/commands/execute.mjs`: gọi command handler được truyền từ `startLocalInterface()` cho `/launch`, `/launch-adspower`, `/check`, `/close`, `/stop`, `/auto-refill` và các lệnh liên quan.

Khi thêm route, tạo handler phù hợp và đăng ký vào đúng danh sách; chỉ tạo file mà không đăng ký thì route không hoạt động.

### Giao diện native và web

`AutoLeadPCMacApp.swift` tạo cửa sổ `WKWebView`, khởi động `app.mjs` như tiến trình con và tải `http://127.0.0.1:<port>`. Nó ưu tiên `Contents/Resources/runtime-node/node`, sau đó mới thử Node ở `/opt/homebrew/bin/node` và `/usr/local/bin/node`.

Wrapper đặt `AUTOLEADPC_NO_OPEN=1`, truyền instance/cổng từ `Info.plist`, ghi stdout/stderr vào `/tmp/autoleadpc-<instance>.log` và dừng Node khi app thoát. Mặc định wrapper chạy Node với `--public`; đặt `AUTOLEADPC_ALLOW_LAN=0` để chỉ dùng loopback.

Các giao diện web là HTML/CSS/JavaScript thuần:

- `/` và `/pc`: `ui/desktop/index.html`, giao diện desktop trong `ui/desktop/`.
- `/mac`: `ui/mac/index.html`, giao diện Mac trong `ui/mac/`.
- `/mini` hoặc `/screen-mini`: `ui/mini/index.html`, giao diện Mini App trong `ui/mini/`.
- `/browser-replay`: `ui/replay/index.html`, trang xem lại phiên trong `ui/replay/`.

Mỗi giao diện giữ HTML, JS và CSS trong thư mục riêng dưới `ui/`; không đặt HTML giao diện ở thư mục gốc.

Screen View desktop nhận F12/Fn+F12 hoặc Cmd+Option+I, có nút DevTools và HTML. `/screen/devtools/:slot` mở DevTools qua CDP cấp browser; `/screen/html/:slot?frame=N` đọc DOM của frame ở tab đang xem. Bảng HTML chỉ hiển thị textarea, không chạy script/không tạo log tự động. Cầu nối `autoleadDebugHtml` dùng NSSavePanel để lưu HTML từ main frame local đúng cổng.

Tab **Thông tin → Hàng đợi Proxy** của desktop có nút **Thêm vào hàng đợi**, dùng `/proxy-queue/import` với `mode: append` và tái sử dụng `importProxyLines()` để giữ hàng đợi/lịch sử và bỏ trùng. Không truyền mode vẫn giữ hợp đồng đồng bộ của giao diện Mac.

`src/http/read-ui-asset.mjs` ghép các phần theo `ui/bundles.json` và phục vụ ở runtime. JavaScript giao diện là script thường, không phải ES module: các hàm/biến global và handler inline vẫn phụ thuộc nhau, thứ tự ghép là một phần của hành vi. Mỗi giao diện được ghép thành một JS và một CSS. Toolbar preview Desktop dùng `ui/desktop/styles/screen-preview-responsive.css`: nút xuống dòng ở màn hẹp, chuyển lưới 3 cột dưới 520px và 2 cột dưới 360px, không được cắt nút hoặc tạo tràn ngang.

Recorder mặc định chỉ ghi tiến trình/lỗi; event thô giữ trong bộ đệm 100 thao tác/60 giây và chỉ ghi JSONL khi bật debug tối đa 10 phút. Input/cuộn và request nền không tạo event riêng; log phiên tối đa 2.000 event, ảnh chụp tối đa hai lượt toàn app; lưu trữ dọn phiên cũ đã đóng quá 7 ngày hoặc vượt 500 MB/200 file, giữ phiên active/có feedback; orphan có grace 15 phút khi vượt trần file. HTML toàn trang mặc định tắt, debug chủ động giới hạn 10 phút/10 MB.

Thumbnail desktop chỉ tải ô nhìn thấy mỗi 5 giây; cache 10 giây và tối đa hai lượt chụp toàn app. Watcher health cache DOM 3 giây, vô hiệu khi điều hướng; URL lỗi vẫn kiểm tra ngay. Offerwall dùng chung trần MAX_OFFER_TABS=10 và đặt chỗ context trước await khi mở popup. Phiên im lâu chỉ cảnh báo, không áp thời gian sống cứng.

Watchdog autofill phải phân biệt script captcha nền với challenge thực sự, thử repair bằng record trước AI và giãn scan khi không tiến triển (tối đa 5 giây). CLI và sửa form/SDK dùng chung `waitForAiCapacity()`: ưu tiên IP confirmed, FIFO trong từng nhóm, chờ tối đa 15 giây; caller chỉ nhả chỗ sau acquired, không tiêu retry khi hết hạn hàng. Data Saver có danh sách hẹp video/replay bên thứ ba, vẫn giữ captcha, ảnh, tài liệu và API của form.

### Browser, proxy và vòng đời phiên

Các file facade ở thư mục gốc như `autofill.mjs`, `stealth.mjs`, `adspower-profile.mjs`, `cloakbrowser-engine.mjs` chủ yếu re-export implementation từ `src/` để giữ API cũ.

Các nhánh trình duyệt chính:

- Chrome đã cài/Chrome for Testing: `src/browser/actions/launch-requested-browsers.mjs`, `open-browser-with-installed-chrome.mjs`, các module `chrome-installations`, `chrome-profiles`, `chrome-paths`.
- AdsPower SunBrowser: `src/adspower-profile/` và `src/browser/actions/launch-ads-power-browsers.mjs`, `open-ads-power-browser.mjs`; dùng Local API/API key, tạo profile theo slot và kết nối Playwright qua CDP.
- CloakBrowser: `src/cloakbrowser-engine/`; được chọn trong luồng mở Chrome bằng `useCloakBrowser`, có profile tách theo phiên bản engine.
- `src/local-profile-engine/`: helper mở Chrome/Chromium với `zero_profile`, `DevToolsActivePort` và CDP; đây là engine profile cục bộ độc lập, không phải facade chung cho mọi luồng ở trên.

Chính sách đóng và bù: luồng `enableLeadCheck === false` giữ target và tự bù khi bấm X cửa sổ/tab cuối hoặc X trong app nếu tự bù đang bật. Dừng/Đóng tất cả và suppress chủ động luôn thắng. Luồng check lead giữ hành vi đóng chủ động giảm target, không bù; bảo vệ IP confirmed vẫn áp dụng cho các nhánh tự đóng. Theo dõi lead thụ động cũng khóa confirmedLeadIp khi thấy lead, không bật chế độ chờ và không ghi thống kê lead. Queue phải chọn đúng engine từ settings; AdsPower dùng launcher với `isAutomaticRefill=true` để không reset target.

Sau khi mở context, phiên đi qua các lớp: xác minh proxy/IP exit, chống trùng IP theo offer, áp fingerprint/locale/timezone, mở trang đích, gắn autofill/script/AI/captcha, ghi log, screencast, theo dõi lead và quản lý đóng/tự bù.

`src/stealth/` xây fingerprint nhất quán từ seed theo phiên, override CDP và script trong trang. `src/relay/` mở relay không xác thực trên `127.0.0.1` để chuyển xác thực tới proxy upstream; phải đóng relay cùng vòng đời phiên.

`src/browser/sessions.mjs` giữ tập `activeBrowsers`. Trạng thái singleton khác nằm trong `src/runtime/application-state.mjs`, `src/runtime/constants/` và các thư mục `state/`. Không tạo bản sao trạng thái riêng khi các module cần cùng quan sát/thay đổi nó.

### Autofill, AI và dữ liệu nghiệp vụ

Chuột mô phỏng của autofill chạy riêng trên mọi tab/IP. Policy nằm trong `src/autofill/interaction/`, gắn theo session khi đăng ký tab và khi quét form trực tiếp. Con trỏ vẽ trong DOM từng trang; con trỏ vật lý của macOS vẫn dùng chung. Nhãn checkbox ẩn và click AI đi qua `humanClick`; fast input đặc thù truyền page để rê/click trước khi fill. Điền nhanh chờ 160ms sau click và 160ms sau nhập/xác minh trước khi chuyển ô. Các ô Uplevel và city/zip Alpha Intent phải điền tuần tự qua chuột, không set hàng loạt giá trị hiển thị trong evaluate. Lớp hiển thị con trỏ chỉ có một evaluate chờ mỗi tab, không giữ luồng quá 80ms. Con trỏ được gắn từ lúc đăng ký tab (cả manual/skip), tự khôi phục qua init script khi reload/điều hướng; hình SVG dùng Shadow DOM để tránh CSS offer che mất.

- `src/autofill/`: nhận diện field Anh–Việt, form scope, iframe, checkbox/select, survey, validation và submit.
- `src/survey-solver/`, `src/option-scorer/`: giải survey và chấm điểm lựa chọn.
- `src/ai-assist/`: chẩn đoán/sửa form và heuristic fallback.
- `src/codex-form-agent/`: Codex SDK + Playwright MCP, kiểm tra URL và che bí mật.
- `src/script/`, `src/captcha/`: script bước do người dùng định nghĩa và captcha.
- `src/leads/`, `src/lead-check/`: phát hiện offer, trạng thái trang, thống kê/xác minh lead và Toffers.
- `src/proxy/`: cấu hình proxy, lịch sử, khóa IP/proxy, 711Proxy.
- `src/records/`, `src/queues/`, `src/refill/`: record autofill, queue email/proxy và tự bù slot.
- `src/agents/`: đăng ký, heartbeat, nhận và phân phối task cho remote agent.
- `src/tgbot/`: Telegram bot và từng command handler; thứ tự chọn handler nằm trong `src/tgbot/commands/index.mjs`.
- `src/logging/`, `src/observer/`: browser log, HTML/screenshot, replay và ghi thao tác.
- `src/monitoring/`, `src/browser/screencast*`, `src/browser/screen/`: băng thông và Screen View.
- `src/config/`, `src/storage/`, `src/runtime/`: đường dẫn, nạp cấu hình, seed dữ liệu, hằng số và trạng thái ứng dụng.
- `src/tunnel/`: Tailscale Funnel hoặc Cloudflare Tunnel.
- `Config/Browser/`: cấu hình/template browser được đóng gói; `Config/Settings/` là dữ liệu local nhạy cảm và bị ignore.

## 4. Quy ước sửa mã

- Module mới nên import implementation trực tiếp từ `src/`. Giữ facade ở gốc cho API tương thích; tránh import ngược `app.mjs` vì dễ tạo vòng phụ thuộc.
- Code mới trong `src/` thường tách mỗi thao tác/function thành một file. Làm theo cấu trúc lân cận thay vì tạo một file tổng hợp lớn mới.
- Dùng ESM, JavaScript thuần và API Node hiện có. Không giả định thư viện chưa khai báo trong `package.json`.
- Theo phần lớn mã hiện tại: indent 2 spaces, semicolon, tên hàm camelCase, tên file kebab-case. Một số file cũ có quote/JSDoc không đồng nhất; ưu tiên khớp file đang sửa, không reformat diện rộng.
- Hàm mới thường có JSDoc mô tả tham số, giá trị trả về, lỗi ném ra và các tag `@author ductv <ductv@getflycrm.com>`, `@since`. Giữ JSDoc/comment đồng bộ với hành vi sau khi sửa.
- Callback truyền vào `page.evaluate()`/`frame.evaluate()` phải tự chứa, chỉ nhận dữ liệu tuần tự hóa được qua tham số; không tham chiếu closure hoặc API của Node.
- Không đổi thứ tự route, thứ tự ghép UI hoặc trạng thái singleton nếu chưa kiểm tra phụ thuộc toàn cục.
- Khi thêm file UI, cập nhật `ui/assets.json`; nếu file tham gia bundle, thêm đúng vị trí trong `ui/bundles.json`. Không chuyển UI sang import module nếu các global/inline handler chưa được chuyển cùng.
- Khi thêm facade runtime ở thư mục gốc, phải thêm tên file vào danh sách `cp -p` trong `build-app.sh`; `src/`, `ui/`, `tests/`, `mock-pages/` được chép đệ quy nhưng facade gốc dùng danh sách tường minh.
- Giữ các invariant nghiệp vụ quan trọng: form iframe không mượn CTA trang cha; không submit form ẩn/disabled/busy/invalid; IP đã xác nhận lead được bảo vệ; trang lỗi của phiên có lead quay lại trang trước và đánh thức autofill (tối đa 3 lần/URL, cooldown 15s), không tự đóng khi phục hồi thất bại; đóng phiên thủ công không được tự bù ngoài ý muốn; proxy/IP không bị dùng xung đột.
- Chờ lead phải bật chủ động qua `isLeadWaitEnabled`; cờ tắt trong session hoặc options luôn thắng. Các guard autofill dùng `shouldPauseForLead`, không chặn chỉ vì còn trạng thái checking/failed khi checkbox đã tắt.
- Khi cần chọn phiên để AI hỗ trợ/xử lý, ưu tiên các trình duyệt có IP đã về lead. Không vì ưu tiên này mà bỏ qua guard bảo vệ IP đã xác nhận lead hoặc quy tắc chống dùng xung đột proxy/IP.
- Chỉ xóa profile qua các guard như `isManagedChromeProfilePath`; không nới kiểm tra đường dẫn để tiện cleanup. Profile Chrome tạm và cache được xóa khi phiên đóng, còn profile mẫu được giữ riêng.
- Nếu sửa quy tắc câu hỏi age/preference/vehicle, đối chiếu §17 trong `PLAYWRIGHT_CORE_INTEGRATION_RESEARCH.md` và cập nhật tài liệu cùng code/test.

## 5. Test và kiểm tra chất lượng

### Lệnh chính

```sh
# Toàn bộ suite chính thức
npm test

# Một file node:test
node --test tests/stealth.test.mjs

# Một test theo tên
node --test --test-name-pattern="<ten test>" tests/stealth.test.mjs

# Kiểm tra cú pháp các entry point thường được CI kiểm tra
node --check app.mjs
node --check ai-assist.mjs
node --check autofill.mjs
node --check option-scorer.mjs
node --check cloakbrowser-engine.mjs
node --check tests/run-tests.mjs
```

`npm test` chạy `node tests/run-tests.mjs` theo thứ tự:

1. Kiểm tra mọi file trong `TEST_FILES` tồn tại.
2. Chạy `tests/selfcheck.mjs`, một suite assertion lớn không dùng `node:test`.
3. Chạy `node --test` trên danh sách `TEST_FILES`.

**Mọi file test tự động mới phải được thêm vào `TEST_FILES` trong `tests/run-tests.mjs`.** Chỉ đặt file vào `tests/` thì `npm test` không tự phát hiện nó.

Runner tạo thư mục tạm `~/Library/Application Support/AutoLeadPC-tests-*`, đặt `AUTOLEADPC_DATA_DIR` cho tiến trình con và dọn khi thoát. Khi chạy trực tiếp một test có ghi storage, phải kiểm tra test đó có fixture riêng chưa; không mặc định mọi lệnh `node --test` đều có lớp cô lập của runner.

### Chiến lược test

- Unit/integration dùng `node:test` và `node:assert/strict`, mock object và HTTP server loopback.
- Một số test autofill, recorder và offline funnel khởi động Chromium headless thật qua Playwright. Các test này thường skip khi `chromium.executablePath()` không tồn tại; cài `npx playwright install chromium` nếu muốn chạy đủ thay vì skip.
- `tests/mock-pages/manual-screen-samples.test.mjs` chỉ chạy khi có cả Chromium và bộ mẫu local `~/Downloads/mau-man-hinh-offer`; CI/máy thiếu mẫu sẽ skip.
- `tests/integration/test-offline-screens.mjs` là kịch bản Playwright trên bộ mẫu local đó, chặn request ra ngoài. Có thể chạy riêng bằng `node tests/integration/test-offline-screens.mjs` khi đủ dữ kiện.
- Fixture dùng chung nằm trong `tests/mock-pages/` và `mock-pages/`. `mock-pages/README.md` mô tả cách dựng/chặn mạng từng fixture.
- `tests/manual/` chứa kịch bản chạy riêng, có thể đọc đường dẫn local hoặc truy cập website thật; không thuộc `npm test`.
- `QA_TEST_CASES.md` là checklist QA thủ công cho Chrome/proxy/IP/autofill.
- Các script `test-*.mjs`, `debug-sweep.mjs`, `record-offer-flow.mjs`, `start-with-logger.mjs` ở gốc là công cụ ad-hoc, không phải suite tự động.

Tạo lại fixture offline khi cần:

```sh
node mock-html-simulator.mjs
node mock-pages/capture-form-assets.mjs
```

`mock-html-simulator.mjs` ghi đè các fixture/catalog/log tổng hợp trong `mock-pages/`; kiểm tra diff sau khi chạy. Không đưa dữ liệu thật hoặc thông tin nhạy cảm từ snapshot vào test mới.

### CI

Workflow chạy trên push/pull request nhắm `main`, trên macOS với Node 22 và 24:

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
# node --check cho các file nêu trên
npm test
```

CI chỉ kiểm tra cú pháp và chạy test; không build `.app`, không chạy linter và không có bước deploy. Vì CI bỏ tải browser, các test cần Chromium phải giữ cơ chế skip phù hợp.

## 6. Build, đóng gói và vận hành

### Build `.app`

```sh
./build-app.sh
```

Theo yêu cầu người dùng, **chỉ giữ và cập nhật một app duy nhất tại `/Applications/AutoLeadPC Mac 2 AdsPower.app`**. Không tạo app có tên phiên bản, bản sao trong repo/workspaces, ZIP hoặc backup timestamp trừ khi người dùng yêu cầu riêng.

Yêu cầu công cụ macOS gồm `swiftc`, `iconutil`, `codesign`. Thoát app trước khi build; không tắt phiên trình duyệt đang làm việc để phục vụ kiểm tra đóng gói.

Script thực hiện:

1. Lấy version từ `package.json`, build number hiện là `17`.
2. Tạo staging tạm trong `/Applications`, biên dịch `AutoLeadPCMacApp.swift` bằng `swiftc -O -parse-as-library`.
3. Đóng gói instance `2`, cổng `3211`, bundle ID `com.autolead.mac2.adspower`.
4. Chép facade runtime, `src/`, `ui/`, `tests/`, `mock-pages/`, `Config/Browser/`, dependency và runtime Node hiện có. Không chép `Config/Settings/`.
5. Ký ad-hoc và verify bundle trước khi thay app cố định. Nếu cài thất bại, phục hồi app cũ.
6. Dọn staging và backup tạm khi hoàn tất; không đồng bộ source sang vị trí khác, không tạo artifact phụ.

`tests/single-app-build.test.mjs` kiểm tra build lặp, lỗi signing và rollback trong thư mục cô lập. Khi thay đổi đóng gói, vẫn phải kiểm tra bundle thật và khả năng khởi động trên máy đích.

### Vận hành 24/7

`mac-vps-24-7.sh` là script quản trị riêng cho Mac mini chạy hub. Nó yêu cầu `sudo`, thay `pmset`, tắt tự động cập nhật macOS và có thể sửa cấu hình firewall `pf`. Chỉ chạy khi người dùng yêu cầu rõ; không dùng để test dự án. Tùy chọn `--allowlist` giới hạn dải IP được truy cập cổng app.

Không có pipeline release/cloud deploy khác trong repository; artifact duy nhất là `/Applications/AutoLeadPC Mac 2 AdsPower.app` do `build-app.sh` cập nhật.

## 7. Dữ liệu runtime và bảo mật

### Vị trí dữ liệu

Dữ liệu thường nằm ngoài repository:

- `~/Library/Application Support/AutoLeadPC`: instance 1, gồm `preferences.sqlite`, lịch sử, queue, log, profile...
- `~/Library/Application Support/AutoLeadPC-2`: instance 2 của app đóng gói.
- `AUTOLEADPC_DATA_DIR`: đổi tên thư mục dữ liệu dưới Application Support, hữu ích cho test.
- `~/Library/Application Support/AutoLeadPC/chrome-profiles`: profile Chrome tạm; bản build/cache dùng thêm các thư mục trong `src/browser/chrome-paths.mjs`.
- `~/Library/Caches/<dataDirName>/chrome-profiles`: cache profile tạm.
- `<appDataDirectory>/logs`: JSONL/JSON, HTML và ảnh replay.
- `~/.autoleadpc` nếu tồn tại, nếu không thì `~/Downloads/AutoLeadPC`: một số cấu hình chung như `Config/ai-config.json` và `zero_profile` dự phòng.
- `src/logging/html-capture/state/offer-html-full-dir.mjs` hiện hard-code `/Users/codernguoitay/offer-html-full`; các script ad-hoc khác cũng có đường dẫn máy tác giả. Kiểm tra trước khi chạy trên máy khác.

### Dữ liệu nhạy cảm

- `preferences.sqlite` chứa proxy (có thể gồm user/password), URL, số cửa sổ và dữ liệu autofill; nội dung settings không được mã hóa. Wrapper đặt quyền thư mục `0700` và database `0600`, nhưng điều đó không thay mã hóa.
- Log HTML/screenshot có thể chứa dữ liệu form/lead. Chỉ chia sẻ phiên cần phân tích và không đưa artifact thật vào commit.
- Token Telegram, AdsPower, 711Proxy, cấu hình AI, proxy và record autofill không được in vào log hoặc đưa vào tài liệu/test fixture.
- `Config/Settings/Settings.ini` và `*.ini` bị ignore, có thể chứa token cũ. Không đọc, sao chép hoặc đóng gói các file này. GoLogin đã bị loại khỏi luồng hiện tại; chỉ còn xử lý tương thích cấu hình cũ.
- `.gitignore` đã loại proxy list thật, database, log, queue/config nhạy cảm và `.app`; giữ các quy tắc này khi thêm loại dữ liệu tương tự.
- Relay local không có xác thực và chỉ được bind loopback. Không đổi sang địa chỉ public nếu chưa có cơ chế bảo vệ tương đương.
- HTTP router không có lớp xác thực chung cho API điều khiển. `--public`, tunnel và Mini App phải được giới hạn trong mạng tin cậy; cân nhắc allowlist `pf` khi vận hành, không mở trực tiếp ra Internet công cộng.

## 8. Checklist trước khi hoàn tất thay đổi

1. Đọc module lân cận và facade tương ứng; xác định đúng implementation trong `src/`.
2. Cập nhật mọi registry thủ công liên quan: route list, `ui/assets.json`, `ui/bundles.json`, `TEST_FILES`, danh sách copy trong `build-app.sh`.
3. Thêm hoặc sửa test gần nhất với hành vi; dùng fixture offline/mock, không phụ thuộc website thật cho test tự động.
4. Chạy test mục tiêu rồi `npm test`; chạy `node --check` cho entry point bị ảnh hưởng.
5. Kiểm tra lại vòng đời browser/relay/profile và dữ liệu ghi ngoài repo, không chỉ kiểm tra import/compile.
6. Nếu sửa UI, kiểm tra asset được phục vụ và thứ tự global script; nếu sửa đóng gói, kiểm tra artifact `.app` thật.
7. Cập nhật `README.md`, `QA_TEST_CASES.md`, tài liệu nghiên cứu liên quan và file này khi hành vi/quy ước được mô tả đã thay đổi.

Ngoại lệ hoàn tất do người dùng yêu cầu: HTTPS financialhelpfinder.com/thankyou.php chỉ đóng browser khi các tab ổn định và hết form/câu hỏi/offer chưa mở, AI hoặc popup đang xử lý. Áp dụng cả IP confirmed; tab lỗi vẫn phục hồi Back. Form iframe FinancialHelpFinder khóa phạm vi theo sign_up_step* và class nút sign_up_btn.

Nhóm Yes/No hiển thị dùng `handleYesNoStep`: Yes trước, hai Continue không đổi bước thì No; cooldown 1,5 giây, tối đa hai Continue sau No, không chọn bước ẩn hoặc bỏ qua subform/consent bắt buộc.

Subform Yes có Save/Cancel: `handleSurveySave` ưu tiên điền/lưu trong scope rồi đợi Save biến mất mới Continue; Save không tăng bộ đếm Continue fallback No, không bấm Cancel hoặc nút form phụ.

Logic Yes/No/Save chia theo trách nhiệm trong `src/autofill/yes-no/`; hai handle ở ngoài chỉ điều phối. Giữ WeakMap trạng thái riêng theo frame trong get-step-state/get-save-state, không tạo bản sao bộ đếm ở caller. DOM inspector truyền vào evaluate phải tự chứa.

Màn 80–99% trống control: `src/autofill/late-progress/` chờ 60s mỗi lượt, reload tối đa hai lần cùng path rồi chẩn đoán AI một lần. Kiểm mọi iframe hiển thị; không áp dụng thankyou/100%/captcha/manual/skip/consent. `_lateProgressRecoveryActive` giữ tab khỏi nhánh non-offer trong thời gian phục hồi, không thay cờ lead.

Tự đóng non-offer đã tắt theo yêu cầu: watchTrafficBlockedPage không gọi getNonOfferReason; limitOfferTabs giữ API tương thích nhưng không gắn listener quét/đóng. Trần đặt chỗ offerwall trước khi mở tab vẫn hoạt động. Các rule lỗi trang và hoàn tất thankyou là độc lập.
