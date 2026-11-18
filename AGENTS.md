# Hướng dẫn cho AI coding agent

## Đóng gói Windows

`npm run build:windows` tạo bộ cài x64 trong `dist/windows/` bằng Electron/NSIS.
Wrapper ở `packaging/windows/`, backend dùng chung `src/` và `ui/`; script
`scripts/build-windows.mjs` tạo staging `.windows-build/backend`, cài dependency
Windows riêng và kiểm SHA-256 Node.js từ nodejs.org. Không chép node_modules macOS,
Config/Settings hoặc dữ liệu runtime sang Windows. App Windows dùng AppData,
Node độc lập và IPC shutdown; giữ guard đường dẫn khi dọn profile.
Workflow `.github/workflows/windows-build.yml` build và smoke test trên Windows.
`tests/windows-packaging.test.mjs` thuộc TEST_FILES. Không chạy smoke test bằng
dữ liệu thật. Mọi tuyên bố đủ tính năng cần QA Windows thật theo QA_TEST_CASES.md.
Quy tắc chỉ giữ một `.app` ở /Applications vẫn áp dụng cho bản macOS;
artifact `.exe` là đầu ra riêng được người dùng yêu cầu.

Windows `--server` chạy nền trong phiên desktop sau đăng nhập, giữ tray khi đóng X,
bind LAN (trừ `AUTOLEADPC_ALLOW_LAN=0`) và tắt public tunnel tự động. Không gọi đây
là Windows Service trước đăng nhập. Autorun dùng Electron login item, không lưu
mật khẩu Windows. Công cụ ở `packaging/windows/server/` được copy vào gốc app qua
`extraFiles`; `Windows-LAN.ps1` chỉ mở đúng Node/port trên Private/LocalSubnet,
không tắt Firewall hoặc thay network profile. Test vòng đời ở `tests/windows-server.test.mjs`.

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
- Dependency trực tiếp: `playwright`, `@openai/codex-sdk`, `@playwright/mcp`, `https-proxy-agent`, `socks-proxy-agent`.
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

Tạm thời app mặc định `AUTOLEADPC_LOG_MODE=access`: trang vào được không ghi log; mỗi tab chỉ ghi tối đa một lỗi mở trang đích, bỏ probe IP/Toffers click và query nhạy cảm; không tạo snapshot/HTML/JSONL hoặc log thao tác/AI/HTTP. Riêng mốc lead và đóng tab/phiên vẫn được ghi cùng IP, confirmedLeadIp, trạng thái lead và lý do đóng; mất CDP không đủ bằng chứng thì ghi chưa xác định. Console giữ `[PageAccess]`, `[Lifecycle]` và `[Process]`. Đặt `AUTOLEADPC_LOG_MODE=full` trước khởi động để khôi phục recorder. Trong chế độ full, recorder chỉ ghi tiến trình/lỗi; event thô giữ trong bộ đệm 100 thao tác/60 giây và chỉ ghi JSONL khi bật debug tối đa 10 phút. Input/cuộn và request nền không tạo event riêng; log phiên tối đa 2.000 event, ảnh chụp tối đa hai lượt toàn app; lưu trữ dọn artifact khi vượt 500 MB/200 file nhưng giữ tóm tắt 100 mốc (tối đa 1.000 bản, 7 ngày), giữ phiên active/chưa endedAt/có feedback; orphan có grace 15 phút khi vượt trần file. HTML toàn trang mặc định tắt, debug chủ động giới hạn 10 phút/10 MB.

Thumbnail desktop chỉ tải ô nhìn thấy mỗi 5 giây; cache 10 giây và tối đa hai lượt chụp toàn app. Watcher health cache DOM 3 giây, vô hiệu khi điều hướng; URL lỗi vẫn kiểm tra ngay. Mỗi BrowserContext giữ tối đa MAX_OFFER_TABS=10 tab trên mọi đường mở tab, không chỉ offerwall; tab mới nhất vượt trần bị đóng, 10 tab đầu không bị dọn. Offerwall đặt chỗ context trước await khi mở popup. Phiên im lâu chỉ cảnh báo, không áp thời gian sống cứng.

Watchdog autofill phải phân biệt script captcha nền với challenge thực sự, thử repair bằng record trước AI và giãn scan khi không tiến triển (tối đa 5 giây). CLI và sửa form/SDK dùng chung `waitForAiCapacity()`: ưu tiên IP confirmed, FIFO trong từng nhóm, chờ tối đa 15 giây; caller chỉ nhả chỗ sau acquired, không tiêu retry khi hết hạn hàng. Data Saver có danh sách hẹp video/replay bên thứ ba, vẫn giữ captcha, ảnh, tài liệu và API của form.

Form scope tính cả radio/checkbox native ẩn có label hiển thị. AI dùng `ensureAvailableFormScope()` xác định lại scope inactive/unavailable trước khi đọc/thao tác; khi chưa phục hồi được phải nhả AI về autofill, không đốt retry/khóa trạng thái vì lỗi scope. Phục hồi tăng revision để mở lại lượt thử, vẫn giữ khóa chống lặp cho thất bại thật sự và không mở rộng tìm kiếm ngoài form.

Ngoại lệ đáp án No nằm riêng trong `src/autofill/adsmith/`: chỉ AS_IFRAME Adsmith `/forge/v4/`, `plc=9235` nhúng trong FinancialHelpFinder. Chọn/xác minh đủ `li.No.Active` ở OfferPage Active rồi Continue; không chạy generic Yes, Save subform Yes, focus tọa độ hoặc AI trong iframe này. Những iframe khác giữ quy tắc Yes/fallback hiện tại.

### Browser, proxy và vòng đời phiên

Các file facade ở thư mục gốc như `autofill.mjs`, `stealth.mjs`, `adspower-profile.mjs` chủ yếu re-export implementation từ `src/` để giữ API cũ.

Các nhánh trình duyệt chính:

- Chrome đã cài/Chrome for Testing: `src/browser/actions/launch-requested-browsers.mjs`, `open-browser-with-installed-chrome.mjs`, các module `chrome-installations`, `chrome-profiles`, `chrome-paths`.
- AdsPower SunBrowser: `src/adspower-profile/` và `src/browser/actions/launch-ads-power-browsers.mjs`, `open-ads-power-browser.mjs`; dùng Local API/API key, tạo profile theo slot và kết nối Playwright qua CDP.
- GoLogin Orbita: `src/gologin-profile/`, `src/browser/actions/launch-gologin-browsers.mjs`, `open-gologin-browser.mjs`, `src/browser/gologin/`. Cài đặt có sáu lựa chọn riêng trong `device-choices.mjs`: Windows 10/11, Mac Intel/ARM, Linux, Android; mặc định đủ sáu và phân phối luân phiên theo slot, dùng đúng `os`/`osSpec`, giữ lựa chọn khi bù. Profile mới random Orbita 148–154 và 156 (không có 155); chỉ thay đổi profile mới, không đổi profile cũ. Token lưu riêng, API GET chỉ trả trạng thái và lựa chọn, không trả token. Chỉ tái dùng profile AutoLeadPC đã dừng và cùng OS/osSpec. SDK stop() chỉ commit: phải dừng processSpawned thuộc chính SDK trước khi commit/dọn; giữ khóa khi dừng thất bại. Orbita Android dùng lớp touch trong `attach-android-touch-input.mjs` vì mousePressed có thể treo; giữ các engine khác. iPhone/iPad legacy là giả lập Chromium, không phải profile GoLogin chính thức hay Safari/iOS thật. Chạy trong app truyền headless vào SDK từ đầu; headful ẩn tới lead dùng startup flags. Recording dùng relay từ trước SDK và giữ id khi reconnect; chỉ kết thúc khi đóng thật/lỗi khởi tạo đã dọn. CDP mất nhưng processSpawned còn sống: giữ IP/lead/record, thử nối lại ba lần, không cho prune/tab cuối kill hoặc bù.
- `src/local-profile-engine/`: helper mở Chrome/Chromium với `zero_profile`, `DevToolsActivePort` và CDP; đây là engine profile cục bộ độc lập, không phải facade chung cho mọi luồng ở trên.

Chính sách đóng và bù: luồng `enableLeadCheck === false` giữ target và tự bù khi bấm X cửa sổ/tab cuối hoặc X trong app nếu tự bù đang bật. Checkbox desktop **Không bù slot** đặt `autoRefill.noSlotRefill` qua `/auto-refill/no-slot-refill`; queue kiểm tra cờ trước enqueue, đầu job và sau delay, giữ browser/target/settings nhưng không mở thay thế. Lựa chọn được nạp/lưu riêng trong `no-slot-refill-settings.json`, không reset theo Start/Stop. Dừng/Đóng tất cả và suppress chủ động luôn thắng. Luồng check lead giữ hành vi đóng chủ động giảm target, không bù; bảo vệ IP confirmed vẫn áp dụng cho các nhánh tự đóng. Theo dõi lead thụ động cũng khóa confirmedLeadIp khi thấy lead, không bật chế độ chờ và không ghi thống kê lead. Queue phải chọn đúng engine từ settings; AdsPower dùng launcher với `isAutomaticRefill=true` để không reset target.

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
- Desktop chọn một trong hai checkbox chờ lead 2×30s hoặc 2×20s qua `getLeadCheckSettings`/`selectLeadCheckInterval`; hai nhánh Start thường/tuần tự truyền cùng lựa chọn. Không tick thì không chờ. “Chỉ hiện khi có Lead” giữ thời gian đang chọn hoặc bật 30s nếu chưa có; tắt cả hai ô chờ phải tắt chế độ ẩn chờ lead.
- `stopAutofillOnLead` là opt-in cho phiên mới: chọn checkbox tự bật chờ 30s nếu chưa chọn 20s/30s. `shouldStopAfterLead` giữ mọi tab của IP confirmed không autofill/AI/chuột tự động, kể cả qua reload; primitives đọc session từ `page._autofillSession`. Giữ browser, không hoàn tất/tự đóng FinancialHelpFinder khi chế độ này đang dừng. Không bật thì tiếp tục sau lead như cũ; thao tác thủ công không bị chặn.
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

Ngoại lệ hoàn tất do người dùng yêu cầu: HTTPS financialhelpfinder.com/thankyou.php chỉ đóng browser khi các tab ổn định và hết form/câu hỏi/offer chưa mở, AI hoặc popup đang xử lý. Áp dụng cả IP confirmed; tab lỗi vẫn phục hồi Back. `blog.financialhelpfinder.com/paththankyou.php` là trang trung gian (còn nút `a.thankyou-button` "Return to Financial Help Finder" để autofill bấm), không áp luật thank-you chung lẫn hoàn tất. Form iframe FinancialHelpFinder khóa phạm vi theo sign_up_step* và class nút sign_up_btn.

Nhóm Yes/No hiển thị dùng `handleYesNoStep`: Yes trước, hai Continue không đổi bước thì No; cooldown 1,5 giây, tối đa hai Continue sau No, không chọn bước ẩn hoặc bỏ qua subform/consent bắt buộc.

Subform Yes có Save/Cancel: `handleSurveySave` ưu tiên điền/lưu trong scope rồi đợi Save biến mất mới Continue; Save không tăng bộ đếm Continue fallback No, không bấm Cancel hoặc nút form phụ.

Logic Yes/No/Save chia theo trách nhiệm trong `src/autofill/yes-no/`; hai handle ở ngoài chỉ điều phối. Giữ WeakMap trạng thái riêng theo frame trong get-step-state/get-save-state, không tạo bản sao bộ đếm ở caller. DOM inspector truyền vào evaluate phải tự chứa.

Màn 80–99% trống control: `src/autofill/late-progress/` chờ 60s mỗi lượt, reload tối đa hai lần cùng path rồi chẩn đoán AI một lần. Kiểm mọi iframe hiển thị; không áp dụng thankyou/100%/captcha/manual/skip/consent. `_lateProgressRecoveryActive` giữ tab khỏi nhánh non-offer trong thời gian phục hồi, không thay cờ lead.

Tự đóng non-offer nói chung vẫn tắt cho tab chính: watchTrafficBlockedPage không gọi getNonOfferReason; limitOfferTabs chỉ gắn listener đếm tab và đóng tab mới nhất vượt trần 10, không quét DOM hoặc phân loại non-offer. `getEmptyOfferPageReason` đóng trang trắng sau 20 giây, trang một dòng ngắn không tương tác sau 30 giây và tab phụ không có công việc offer sau 30 giây; giữ loading/challenge/form/iframe offer, phiên vừa thao tác, đang check lead và IP confirmed theo phạm vi từng nhánh. `detectOfferContentInPage` chỉ nhận form/câu hỏi/CTA trong main ngữ nghĩa hoặc cột trung tâm, loại search/header/nav/footer/aside/sidebar; link Next/Continue thường không phải offer, link/media chỉ ngăn phân loại trắng. Offerwall link-only cần card/metadata offer và được trả qua `hasOfferWorkEvidence` cho watcher, thankyou/completion. Trần đặt chỗ offerwall trước khi mở tab vẫn hoạt động. Các rule lỗi trang và hoàn tất thankyou là độc lập.

Sau lượt AI, cả Chrome và AdsPower gọi `resumeAutofillAfterAi`; không đặt nhánh tự đóng theo chữ Thank you trong callback AI. Nhóm checkbox nhiều đáp án chọn tối đa 2 ô ngẫu nhiên qua `src/survey-solver/pick-random-checkbox-items.mjs`; generic handler/lượt quét cuối chỉ xử lý checkbox đơn/consent. Khi `pickRandom=false`, giữ chế độ tuần tự tối đa 2 ô. Widget Twy phải giữ scope ngoài cùng chứa câu hỏi và Continue. Nhóm checkbox chưa đủ yêu cầu và select còn placeholder vẫn là công việc chưa hoàn tất; dropdown đi qua primitive chuột chung, lỗi ghi log khi trạng thái đổi.

Link offer duy nhất theo BrowserContext/IP: `selectUniqueOfferUrls` loại link lặp từ hai launcher; `reserveOfferLink` khóa mở trước await và giữ lịch sử qua reload; `attachUniqueOfferTabs` dọn tab trùng theo điều hướng, kể cả tab gốc/confirmed. Ngoại lệ đóng tab trùng không được đóng browser/tab cuối và phải ưu tiên giữ tab có form/câu hỏi. Thankyou chung phải kiểm tra `hasUnfinishedOfferWork`; tab chính còn tab khác thì giữ phiên.

Offer phụ vào `chrome-error://chromewebdata/` được nhận diện trực tiếp theo protocol/host tại `matchSubOfferCloseReason`, không đợi DOM lỗi. Đóng riêng tab phụ trước nhánh bảo vệ lead; giữ guard tab chính/gốc và tab cuối của browser. Không đổi quy tắc Back/phục hồi trang lỗi của tab chính có lead.

Recorder không xóa nhật ký phiên gần đây chỉ do trần artifact: dùng `summarizeRecordingSession` và lưu metadata thành công trước khi unlink. Snapshot tự động dùng `prepareSnapshotHtml` (512 KB, bỏ script/data URI lớn) và so DOM/form/iframe trước khi screenshot; canvas/video hiển thị không dùng so DOM để bỏ chụp. HTTP polling thành công được lọc tại `attachRequestLogging`, giữ lỗi/abort/lệnh và không log query.

Rule tab loại trừ tại `is-excluded-offer-page-url.mjs` bắt từ request main frame để không lọt redirect; `is-blocked-google-page-url.mjs` chặn `google.com` và mọi subdomain, còn `install-excluded-popup-filter.mjs` ngăn link/`window.open` Google trước khi tạo tab nhưng không chặn tài nguyên captcha trong iframe. `closeExcludedOfferTab` giữ browser có lead bằng tab trống khi cần. Offerwall dùng `readOfferwallCards` và `reserveOfferwallCard` để khóa định danh offer trước await và giữ lịch sử qua dựng lại DOM; CTA đã xử lý không đi qua readiness/AI lần nữa. Không chạy fallback click cộng form.submit sau timeout.
# SweepstakesAlerts card page (2026-11-15)

`src/autofill/offerwall/` nhận màn cuối SweepstakesAlerts có tiến độ 98–100% và card/link hiển thị. Chỉ trong context đó: giữ tab card làm mainPage, dọn snapshot các tab cũ một lần, sau đó mở link card trong tab riêng. Không dọn lại tab mới sau reload, không reset lịch sử chống trùng, không vượt 10 tab gồm root. Handler chạy trước pipeline form để không bị scope cũ chặn; root có marker URL để watcher không gọi AI/reload hoặc coi là trang rỗng trong lúc chờ tab con. Stop/chờ lead/dừng sau lead và offer mode vẫn thắng. Selector dựa trên card có link, không kích hoạt chỉ vì nhìn thấy 98%. Các site khác giữ luồng cũ.

Màn cuối SweepstakesAlerts có `#ow-placement iframe[data-content-iframe]` từ HTTPS `sdk.scrptk.com/content/render` được giữ trong lúc iframe tải; chỉ dọn tab cũ khi iframe có card. Đọc offer trong đúng frame, bỏ link Powered by/Privacy ở trang cha. Task Addept tái dùng luồng card → CTA → Skip, reset dấu CTA khi chọn task mới; đủ 10 tab thì chờ chỗ trống.

Phạm vi click: màn card SweepstakesAlerts chỉ đọc trong vùng Alpha Intent/main hiển thị; khi có vùng main thì không mở card nằm ngoài vùng đó. Chỉ khi không có main mới nhận vùng form/offerwall. Iframe Addept được giới hạn theo placement; task chỉ lấy từ `.unit-stack`. Bộ chọn submit và primitive click từ chối header/footer/nav/aside/sidebar, vùng attribution và các role điều hướng; không fallback sang link ngoài vùng nghiệp vụ.

Nhận diện ô địa chỉ phải đối chiếu label/aria-labelledby/aria-label và placeholder với name/id/type. Nhãn địa chỉ Anh–Việt rõ ràng thắng định danh phone/tel; thiếu địa chỉ trong record thì để trống, không fallback sang phone. Nhãn nổi chỉ đọc ở wrapper có một control; không lấy label của ô bên cạnh hoặc disclaimer làm nhãn. Không dùng giá trị cá nhân đang nhập làm tín hiệu phân loại.

Nhánh nhập nhanh phone của Alpha Intent cũng phải gọi `collectFieldMetadata`/`matchFieldValue` trước khi điền; quét tiếp các ứng viên thay vì chọn `.first()` theo type tel. Ô địa chỉ type tel không được điền phone trước luồng chung.

Nhãn accessible dùng cho fill: ghép nội dung `aria-labelledby` theo thứ tự ID trong cùng document/shadow root, bỏ ID không tồn tại; sau đó mới dùng `aria-label`, rồi label native. Nhãn ARIA nhận diện rõ nghiệp vụ được ưu tiên hơn name/id/type. Các nhánh nhập nhanh Alpha Intent đối chiếu giá trị qua cùng parser trước khi nhập; không nhận tên ID tham chiếu làm nội dung nhãn, vẫn giữ phone chia phần theo phone1/2/3.

Trang cuối mở offer theo vị trí hiển thị (trên xuống dưới, trái sang phải), không chọn task Addept ngẫu nhiên. Các lượt quét trang gốc/frame không chạy chồng; CTA/link được chốt lần thử trước input và giữ lịch sử trong BrowserContext qua reload/dựng lại DOM/đóng tab con. Link đầu đang pending hoặc đủ trần tab thì chờ, không mở vượt sang link sau. Chỉ CTA HTTP(S) có đích xác định mới được bấm; task đã xử lý không bấm lại sau reload.

Addept đã thử chọn card nhưng info panel chưa hiện thì giữ trạng thái chờ xác minh, không chọn lại card hoặc vượt sang card sau; panel xuất hiện muộn vẫn tiếp tục CTA của card đang chờ.

Theo yêu cầu ghi HTML từng ô, log `input_fill_html` được giữ cả trong mode access: ghi trước thao tác nhập nhanh/chậm/date, chỉ outerHTML của input/textarea (tối đa 8.192 ký tự), bỏ value/nội dung textarea, handler inline và data attribute ngoài nhóm định danh field. URL trang/frame bỏ query; không chụp toàn trang hoặc ghi từng ký tự. Desktop có bộ lọc HTML input và nút Xem HTML; nội dung nằm trong browser-logs.json, cùng giới hạn 2.000 event/phiên.

Cứu kẹt Adsmith: `inspectAdsmithFrameLoading` + `recoverAdsmithFrameLoading` chỉ áp dụng FinancialHelpFinder với đúng AS_SURVEY/AS_IFRAME. Spinner chưa tạo frame chờ 25s, blank chờ 20s, Chrome error chờ 4s; GET lại trang cha tối đa 5 lượt/URL, giữ budget qua reload/hash/quay lại URL. Handler sở hữu lượt quét kể cả khi hết lượt, không để late-progress/stuck-page/AI F5 thêm. Tôn trọng lead/AI/manual; renderer chưa đọc được không bị suy diễn thành blank. Chi tiết tại docs/ADSMITH_IFRAME_LOADING_RECOVERY.md.

Tương tác form (2026-11-18): humanClick giữ nhịp nhấn ngắn 15–25ms trước nhấn, 25–40ms giữ, 20–30ms sau nhả; nhịp nhập 160ms trước/sau fill vẫn giữ. Data Saver ưu tiên resourceType document/stylesheet/font trước mẫu đuôi URL để CSS có query giống ảnh/pixel không bị chặn nhầm. Không tiêm __autolead_perf_style hoặc ép reduced-motion/animation-duration của trang; giữ callback và transition của form JS.
