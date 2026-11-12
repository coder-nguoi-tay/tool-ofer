# Nghiên cứu tối ưu hiệu năng và băng thông — 2026-11-13

Tài liệu nghiên cứu, **chưa sửa code**. Mọi số liệu dưới đây đo trên máy thật ngày 12–13/11/2026, nguồn ghi rõ từng chỗ. Phần nào là suy đoán được đánh dấu *giả thuyết*.

Bổ sung cho `docs/BROWSER_PERFORMANCE.md` (đợt 2026-11-11, đã giảm thumbnail/screencast/watcher). Đợt này đi vào hai thứ đợt trước chưa đo: **tiến trình `node` của app** và **băng thông proxy tính tiền**.

---

## 1. Tóm tắt cho người quyết định

| Câu hỏi | Trả lời ngắn | Bằng chứng |
|---|---|---|
| Vì sao chạy 10 Chrome thì thao tác trong app bị đơ? | Hai nút thắt cùng lúc: **RAM chạm trần** (Chrome của app ≈ 1,5 GB/phiên × 10 ≈ 15 GB trên máy 16 GB → macOS nén/swap → cả máy khựng) và **tiến trình `node` đơn luồng của app đã ăn 46 % CPU khi mới 2 phiên** → 10 phiên thì mọi click/ảnh màn hình xếp hàng sau autofill. | §2.1, §2.2 |
| `node` bận vì cái gì? | JSON.stringify khối lớn (tab Log tải 5 MB mỗi 2 s, file log 3,7 MB ghi lại mỗi 5 s) + autofill quét mỗi 500 ms/tab + Playwright chụp stack trace mỗi lệnh. | §2.3 |
| Băng thông đang tốn bao nhiêu? | **0,6–1,5 GB proxy cho mỗi lead** (11/11: 12,5 GB cho 8 lead). ~1.800 request/phiên. Proxy 711 tính **gấp 3–4 lần** số app đo. | §3.1 |
| Làm gì trước? | (1) Đo một lần khi đang chạy 10 phiên — 30 phút, không đụng app. (2) Hai sửa không rủi ro ở tab Log. (3) Đếm byte chính xác theo host/phiên để biết chặn gì. (4) Rồi mới chặn thêm, bật cache, giới hạn quét. | §4 |
| Phần cứng có cần nâng không? | Phần mềm kéo được CPU/độ đơ, **không bớt được RAM của website**. Muốn 15–20 phiên ổn định thì cần máy 32 GB; Mac M4 không gắn thêm RAM rời. | §2.5 |

---

## 2. Hiệu năng

### 2.1 Máy và tải lúc đo

Đo 2026-11-13 ~00:30, app đang chạy **2 phiên** + Brave + Terminal + Claude.

| Chỉ số | Giá trị | Lệnh |
|---|---|---|
| CPU | Apple M4, 10 core (4 P + 6 E) | `sysctl` |
| RAM | 16 GB; đang dùng 14 GB, nén 4,2 GB, swap 408 MB/2 GB, **724.904 trang đã ghi ra swap** (~11 GB từ lúc bật máy) | `top`, `vm_stat`, `memory_pressure` |
| Load average | **9,56** (10 core) | `top` |
| Chrome của app | 23 tiến trình, **2.941 MB cho 2 profile ≈ 1,5 GB/phiên** (gồm 9 renderer, 2 GPU) | `ps` lọc `chrome-regular-builds` |
| `node app.mjs` | **46 % CPU** trung bình 5 s, RSS 245 MB | `top -pid` |
| Wrapper Swift | 4,7 % | |
| WindowServer | 22,7 % | |
| WebKit (UI app) | ~11 % | |

Ngoại suy tuyến tính (chưa đo thật ở 10 phiên — xem §4 bước 0): 10 phiên ≈ 15 GB Chrome + 1 GB app/hệ thống → vượt 16 GB → macOS buộc phải nén/swap. Khi swap hoạt động mạnh, **mọi** cửa sổ (kể cả app và Chrome đang hiện) khựng vài giây — đây là triệu chứng "đứng hình luôn".

### 2.2 Vì sao `node` là nút thắt của thao tác

Đường đi của một click trong Screen View: WKWebView → `POST /screen/input/:slot` → `node` → CDP `Input.dispatchMouseEvent` → Chrome. Đường đi của hình: Chrome screencast → CDP → `node` → SSE base64 → canvas. **Cả hai đều qua event loop đơn luồng của `node`**, chung hàng đợi với autofill/watcher của 10 phiên. Khi `node` bận 100 %, click đến Chrome trễ và frame về trễ → "đơ, không thao tác được" dù Chrome bên dưới vẫn chạy.

Số vòng lặp định kỳ **mỗi tab** (từ `grep setInterval` trong `src/`):

| Vòng lặp | Chu kỳ | File |
|---|---|---|
| Autofill quét | **500 ms** (giãn 1,5 s sau 3 lượt không tiến triển, 5 s sau 6 lượt hoặc không có control) | `attach-autofill-page-watcher.mjs`, `get-autofill-scan-delay.mjs` |
| Check lead sau email | 1 s | `attach-autofill-page-watcher.mjs` |
| Watcher phiên (URL/lỗi/thankyou/tab phụ) | 1 s / phiên | `watch-traffic-blocked-page.mjs` |
| Ghi HTML đầy đủ (chỉ khi bật debug) | 10 s | `attach-full-html-logger-to-page.mjs` |
| Recorder thao tác tay (fallback) | 3 s | `start-manual-ops-recorder.mjs` |
| Screencast keepalive | 500 ms, chỉ 1 slot đang mở modal | `attach-screencast-session.mjs` |

Autofill có 115 điểm gọi `evaluate` trong `src/autofill`; một lượt quét trên trang có form là hàng chục round-trip CDP. 10 phiên × (1–3 tab) × 2 lượt/s = 20–60 lượt quét/s ở trạng thái xấu nhất.

Ngoài ra **Data Saver dùng `context.route('**/*')`** (`attach-data-saver.mjs`): mọi request của mọi tab đều dừng ở `Fetch.requestPaused`, sang `node` quyết định, rồi `continue`. 183.000 request/ngày (11/11) = trung bình 2/s nhưng dồn cục khi 10 trang cùng tải (hàng trăm/s). Mỗi request là một lượt JSON parse + stack capture trong `node`.

### 2.3 `node` đang tiêu CPU vào đâu (sample 5 s, `sample <pid> 5`)

Khung native nóng nhất theo thứ tự:

1. `v8::internal::FastJsonStringifier` / `JsonStringifier::Serialize` — **JSON.stringify khối lớn**.
2. `Script::GetPositionInfo`, `CallSiteInfo::GetMethodName` — **tạo stack trace**. Playwright client chụp stack cho *mỗi* lệnh API (`captureRawStack`) để gắn vào lỗi/trace; càng nhiều `evaluate`/`route.continue` càng nhiều.
3. `Builtins_*IC_Megamorphic`, `StringToLowerCaseIntl` — xử lý chuỗi/đối tượng đa hình (so khớp selector, lowercase URL trong Data Saver và bộ lọc nút).

Nguồn JSON.stringify đã truy ra:

| Nguồn | Kích thước × tần suất | Ghi chú |
|---|---|---|
| Tab **Log** trong app, "Auto refresh (2s)" **bật mặc định** (`ui/desktop/index.html:1428`) → `GET /browser-logs` | **5,07 MB mỗi 2 s** (đo bằng `curl`) | `node` serialize 5 MB + WKWebView `JSON.parse` 5 MB + `JSON.stringify(logData).length` để so khác biệt (`fetch-logs.js`) — tức là **parse rồi stringify lại 5 MB phía UI mỗi 2 s** |
| `browser-logs.json` | 3,76 MB, serialize toàn bộ mỗi 5 s khi có log mới (`queue-save-browser-logs.mjs`) | Gộp 5 s là đúng, nhưng vẫn là toàn bộ lịch sử 25–47 phiên |
| `GET /state` | 36 KB mỗi 1,5 s (desktop) / 3 s (mini) | Không đáng kể |
| `GET /proxy-queue` | 30 KB | Không đáng kể |

### 2.4 Log có cho thấy "đứng hình" không?

Trong 30 phút gần nhất (`browser-logs.json`, 3.119 sự kiện): 5 lần `autofill_renderer_unresponsive` (evaluate quá 4 s), 3 `autofill_stuck` (lượt quét > 20 s ở survey solver), 3 `autofill_library_stalled`. Đối chiếu ngữ cảnh: **4/5 lần "renderer không phản hồi" rơi đúng lúc trang đang redirect** (twyne → financialhelpfinder, ipify → toffers), kể cả khi chỉ có 1 phiên. Tức là đây là dương tính giả do điều hướng, **không phải bằng chứng máy treo**. App hiện không có số đo độ trễ event loop hay thời gian mỗi lượt quét — §4 bước 0 bổ sung.

### 2.5 Cờ Chrome liên quan

`--renderer-process-limit=3`: tiết kiệm RAM nhưng các tab trong cùng phiên **dùng chung renderer** — một trang quảng cáo nặng chạy JS dài là tab bên cạnh treo theo (đứng hình *trong* trang, không phải trong app). `--js-flags=--max-old-space-size=512`: heap JS tối đa 512 MB/renderer, trang nặng sẽ GC liên tục. `--disk-cache-size=1`/`--media-cache-size=1`: **tắt cache đĩa** (xem §3.4). Không có ghi chú lý do trong code lẫn commit (`git log -S`).

RAM là trần vật lý. Những gì phần mềm làm được với RAM: đóng tab phụ sớm (đã làm 13/11), Data Saver chặn media (đã có), hạn chế tab/phiên. Không giảm được JS/ảnh của website.

---

## 3. Băng thông

### 3.1 Số liệu thật (`bandwidth-daily.json`, `lead-stats.json`, `browser-logs.json`)

| Ngày | App đo (up/down) | **711 tính tiền** | Tỉ lệ 711/app | Request | Phiên (log) | Lead xác nhận | **MB 711 / lead** |
|---|---:|---:|---:|---:|---:|---:|---:|
| 11-08 | 372 MB (197/175) | – | – | 21.428 | – | 9 | – |
| 11-09 | 563 MB (209/353) | – | – | 34.661 | – | 2 | – |
| 11-10 | 2.016 MB (873/1.143) | 4.745 MB | 2,35 | 112.658 | – | 8 | **593** |
| 11-11 | 3.146 MB (1.253/1.893) | **12.466 MB** | 3,96 | 182.943 | – | 8 | **1.558** |
| 11-12 | 2.039 MB (833/1.206) | 6.226 MB | 3,05 | 116.766 | 87 | 11 | **566** |
| 11-13 (0h–1h) | 295 MB | 886 MB | 3,01 | 14.616 | – | – | – |

Số dư 711 còn **41,2 GB** (`last711Balance`). App bản 1 (`AutoLeadPC/`) không dùng 711 (`last711Balance` = 0) → không phải cộng trùng hai app.

Ba điều rút ra:

1. **~72 MB proxy mỗi phiên** (11-12: 6.226 MB / 87 phiên), **~1.350 request mỗi phiên**. Với ~8 phiên mới có 1 lead → 0,6–1,5 GB/lead.
2. **Upload chiếm 40 % số app đo** (873/2.016 MB). Web bình thường upload 5–10 %. 183.000 request × ~1,5 KB header (cookie, UA, Client Hints) ≈ 270 MB/ngày chỉ là header. **Số request là đòn bẩy lớn nhất**, không phải kích thước file.
3. **Proxy tính gấp 3–4 lần app đo.** Cách app đo: `request.sizes()` của Playwright trên `requestfinished/failed` (`attach-bandwidth-tracker.mjs`). Cách 711 đo: hiệu số số dư "flow" mỗi 30 s (`record711-balance-sample.mjs`) — tức là **tất cả byte qua proxy**, bất kể Playwright có thấy hay không.

*Giả thuyết* cho khoảng cách 3–4× (chưa có cái nào được chứng minh; §4 bước 2 sẽ đo):

| Giả thuyết | Playwright `sizes()` có đếm không | Ước lượng |
|---|---|---|
| TLS handshake, `preconnect`, kết nối mở rồi không dùng | Không | Vài KB/kết nối; hàng trăm kết nối/phiên → 1–3 MB/phiên. Không đủ giải thích. |
| Request bị hủy giữa chừng (điều hướng, tab đóng) đã tải một phần | Đếm 0 | Có thể lớn ở trang redirect nhiều |
| WebSocket, streaming, long-poll | Không đếm frame | Session replay đã chặn, nhưng quảng cáo/push (Pushnami) có socket |
| **Service worker** (Pushnami đăng ký SW) tự fetch | Không thấy ở `context` | Chưa đo |
| **Prerender / Speculation Rules** (Chrome tải trước trang kế tiếp) | Không thấy | Trang affiliate hay dùng; *có thể* là phần lớn khoảng cách |
| Cách 711 làm tròn/đếm hai chiều có overhead | – | Hỏi nhà cung cấp |
| Thiết bị khác dùng chung tài khoản 711 | – | **Cần người dùng xác nhận** |

Cách duy nhất chốt được: đếm byte ở **socket**, không qua Playwright (§3.5).

### 3.2 Data Saver hiện tại làm gì (`src/browser/data-saver/`)

- Cho qua mọi thứ của captcha/Cloudflare (`is-essential-offer-url`), **mọi ảnh**, document, script, stylesheet, font, xhr/fetch.
- Chặn: media (video/audio/m3u8/ts), 15 host nền (video player + session replay) khi không phải host của trang, và 40 host quảng cáo/tracker nặng (`heavy-and-tracker-hosts.mjs`) cho các type còn lại.
- **Không chặn**: Google Analytics / Tag Manager, Facebook/TikTok/Pinterest/Snap pixel, Microsoft Ads, New Relic/Sentry/Datadog, Segment/Amplitude/Mixpanel, OneSignal/Pushnami, Quantcast/BlueKai, font Google, ảnh quảng cáo. Và vì script/xhr được cho qua gần như vô điều kiện, các tracker này **còn tiếp tục gửi beacon suốt thời gian tab mở**.

Thực tế không log được host nào tốn nhiều nhất: recorder chỉ ghi document/xhr, không có byte theo host. Trong 25 phiên gần nhất chỉ thấy host "đích" (financialhelpfinder, toffers, twyne, quadclickmedia, leadid, trustedform) — đó là những host **không được chặn**.

### 3.3 Đòn bẩy băng thông (ước lượng, chưa đo)

| # | Đòn bẩy | Tiết kiệm ước lượng | Rủi ro | Cách kiểm chứng |
|---|---|---|---|---|
| B1 | **Chặn tracker/analytics phổ thông** (GA, GTM, FB/TikTok/Pinterest pixel, Bing, Sentry/NewRelic, Segment/Amplitude, Quantcast, Pushnami/OneSignal…) ở type script/xhr/fetch/beacon/ping | 20–40 % số request; upload giảm mạnh | **Pixel affiliate**: toffers xác nhận lead server-side (postback) nên an toàn; nhưng một số offer tính lead bằng pixel client → phải **allowlist host tracking của offer** (quadclickmedia, twyne, leadid, trustedform, adsmith, searchcactus, lifepointspanel…) và **so tỉ lệ lead/phiên trước–sau** qua API toffers | A/B theo ngày: tỉ lệ lead/phiên, MB/lead |
| B2 | **Bật lại cache đĩa cho profile** (`--disk-cache-size=50 MB` thay vì 1) | Mỗi lần `lead_error_recovery` reload, back, quay lại path1e… hiện tải lại toàn bộ JS/CSS/ảnh. Profile bị xóa khi đóng nên không rò giữa phiên | Gần như không; fingerprint không đổi (cache là mặc định của Chrome thật) | Đếm request lặp URL trong một phiên trước–sau |
| B3 | **Đóng tab phụ không có form sớm hơn** (đã có 30 s từ 13/11; cân nhắc 15 s) và **đóng tab "đốt" băng thông**: tab không tiến triển mà `page._bandwidthBytes` tăng > X MB/phút (quảng cáo tự làm mới) | Lớn ở phiên để lâu; 11/11 có 12,5 GB với số lead bằng 10/11 → *giả thuyết* nhiều tab/phiên treo lâu | Tab đang chờ redirect chậm | Có sẵn `page._bandwidthBytes`; chỉ thêm watcher |
| B4 | Chặn **font bên thứ ba** (fonts.gstatic.com, typekit) → dùng font hệ thống | 100–300 KB/trang | Site có thể thấy font không tải (nhỏ) | Đo MB/phiên |
| B5 | Chặn **ảnh quảng cáo** theo host (không chặn ảnh của trang/captcha) | Trung bình | Người dùng đã chốt "không chặn ảnh" → chỉ làm nếu allow theo host rõ ràng | |
| B6 | Chặn **prerender/prefetch/speculation** (`--disable-features=Prerender2,SpeculationRulesPrefetchFuture` hoặc header) | *Nếu* giả thuyết §3.1 đúng: có thể là phần lớn khoảng cách 3–4× | Không ảnh hưởng form | Đo bằng relay (§3.5) trước–sau |
| B7 | Giảm kiểm tra IP qua proxy (`api.ipify.org` 63 lần/25 phiên) | Nhỏ (~2 KB/lần) | – | Bỏ qua |
| B8 | Cờ Chrome: `--disable-sync`, `--safebrowsing-disable-auto-update`, tắt Optimization Guide | Nhỏ; `--disable-background-networking` đã có | – | |

### 3.4 Vì sao cache đang tắt

`--disk-cache-size=1` xuất hiện từ commit `5cb64ce` không kèm lý do. Suy đoán: tránh dấu vết trên đĩa hoặc giảm I/O. Với profile bị xóa khi đóng cửa sổ (`chrome-profiles`), rủi ro rò dữ liệu giữa phiên không còn. Chrome thật của người dùng luôn có cache → tắt cache không giúp chống phát hiện; ngược lại, trang có thể đo thời gian tải tài nguyên lặp (cache timing) để nhận ra bot. Đề xuất bật cache là **tăng tính thật**, không chỉ tiết kiệm.

### 3.5 Đo chính xác: đếm byte ở socket

Hiện relay cục bộ chỉ dùng cho **SOCKS5 có auth** (`open-browser-with-installed-chrome.mjs:141`); proxy 711 là `http://` có auth nên Chrome kết nối thẳng, app không nhìn thấy byte thật. Đề xuất:

1. Cho proxy HTTP có auth cũng đi qua `start-authenticated-http-relay.mjs` (đã có sẵn, chỉ chưa bật cho HTTP), thêm bộ đếm byte hai chiều trên `pipe()` theo **phiên** và theo **host CONNECT**.
2. Ghi vào `session.relayBytes{up,down}` và cộng theo host vào thống kê ngày.
3. So `relayBytes` với `sizes()` và với hiệu số 711 → biết chính xác thành phần nào tạo ra 3–4×, và host nào đáng chặn.

Chi phí: một hop TCP cục bộ (đã dùng cho SOCKS, không thấy vấn đề). Đây là việc **nên làm trước khi chặn thêm bất cứ gì**, vì không có số theo host thì chặn là đoán.

---

## 4. Kế hoạch đề xuất (thứ tự)

**Bước 0 — Đo ở 10 phiên, không đụng app (30 phút).** Script `tests/manual/measure-live-load.mjs` lấy mẫu mỗi 10 s: CPU/RSS của `node`, tổng RSS Chrome, `vm_stat` (free/compressor/pageouts), swap, load average, số phiên từ `/state`, tổng byte từ `/bandwidth/stats`. Xuất CSV. Tùy chọn: thêm `eventLoopLagMs` (`perf_hooks.monitorEventLoopDelay`) vào `/state` để đo độ trễ event loop thật (thay đổi code nhỏ, không ảnh hưởng luồng).

**Bước 1 — Hai sửa không rủi ro (hiệu năng).**
- Tab Log: "Auto refresh" mặc định **tắt**, hoặc `GET /browser-logs?since=<sequence>` chỉ trả phần mới. 5 MB/2 s → gần 0.
- `browser-logs.json`: chỉ serialize phiên có thay đổi (ghi mỗi phiên một file, hoặc JSONL nối thêm), không ghi lại toàn bộ lịch sử.

**Bước 2 — Đếm byte chính xác (băng thông).** §3.5: relay cho proxy HTTP + bộ đếm theo phiên/host + bảng "host tốn nhất hôm nay" trong tab Bandwidth. Sau 1–2 ngày có số thật.

**Bước 3 — Giảm tải `node`.**
- Giới hạn số lượt quét autofill chạy **đồng thời toàn app** (3–4), hàng đợi công bằng giữa phiên; ưu tiên slot đang mở Screen View.
- Chỉ quét lại khi DOM đổi: `addInitScript` một `MutationObserver` nhẹ đặt cờ `window.__uxDirty`; lượt quét đọc cờ bằng một `evaluate` rẻ, DOM không đổi thì bỏ qua (giữ nhịp tối thiểu 3–5 s).
- Data Saver: chuyển chặn theo **host** sang CDP `Network.setBlockedURLs` (chặn trong Chrome, không round-trip `node`); chỉ giữ `route()` cho quy tắc cần ngữ cảnh (type media/pageUrl).

**Bước 4 — Băng thông theo số đo bước 2.** Thứ tự dự kiến: B2 (cache) → B3 (tab đốt băng thông) → B1 (tracker, có allowlist + so tỉ lệ lead) → B6 (prerender) → B4.

**Bước 5 — Phần cứng.** Nếu bước 0 xác nhận swap là nguyên nhân chính của "đứng hình", không có cách phần mềm nào thay được RAM: 10 phiên là trần an toàn của máy 16 GB; 15–20 phiên cần 32 GB+.

Mỗi bước: test RED trước, chạy `npm test`, build khi người dùng yêu cầu.

---

## 5. Chưa biết / cần người dùng trả lời

1. Tài khoản 711 có thiết bị/app nào khác dùng chung không? (quyết định cách đọc khoảng cách 3–4×)
2. Có offer nào **tính lead bằng pixel phía client** (không postback) không? Nếu có, tên host tracking của offer đó phải vào allowlist trước khi làm B1.
3. Lý do ban đầu tắt cache đĩa (`--disk-cache-size=1`) — nếu có lý do chống phát hiện cụ thể thì B2 cần xem lại.
4. Tab Log có cần tự làm mới 2 s không, hay làm mới khi mở tab là đủ?
5. Mục tiêu số phiên: giữ 10 hay muốn lên 15–20? Quyết định bước 5.

## 6. Nguồn và lệnh đã dùng

- `top -l`, `vm_stat`, `memory_pressure`, `ps -Ao rss,pcpu,args`, `sample <pid> 5`, `lsof -nP -iTCP:3211`, `curl -w` trên `/state`, `/browser-logs`, `/proxy-queue`, `/screen/tabs/N`.
- `~/Library/Application Support/AutoLeadPC-2/{bandwidth-daily.json,lead-stats.json,logs/browser-logs.json}`.
- Code: `src/autofill/attach-autofill-page-watcher.mjs`, `src/autofill/watchdog/get-autofill-scan-delay.mjs`, `src/browser/data-saver/*`, `src/monitoring/bandwidth/attach-bandwidth-tracker.mjs`, `src/proxy/provider711/record711-balance-sample.mjs`, `src/logging/browser-logs/{queue-save,save-persisted}-browser-logs.mjs`, `src/http/routes/browser/get-logs.mjs`, `ui/desktop/functions/{fetch-logs,start-log-refresh,_start-screen-stream}.js`, `src/browser/actions/open-browser-with-installed-chrome.mjs` (cờ Chrome, relay).
- [Playwright `request.sizes()`](https://playwright.dev/docs/api/class-request#request-sizes): chỉ gồm header/body của request Playwright quan sát được.
- [Chrome DevTools `Network.setBlockedURLs`](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-setBlockedURLs): chặn trong trình duyệt, không cần interception.
- [Chrome Speculation Rules / prerender](https://developer.chrome.com/docs/web-platform/prerender-pages): trang tải trước không hiện trong sự kiện `page` cho tới khi được kích hoạt.

---

## 7. Tiến độ

| Bước | Trạng thái | Ghi chú |
|---|---|---|
| 1. Tab Log tải phần mới | **Xong 2026-11-13** (`tests/log-delta.test.mjs`) | `GET /browser-logs?since=<seq>&epoch=<epoch>`; mỗi sự kiện có `seq` toàn cục (`stamp-log-seq.mjs`), sự kiện gộp nhận seq mới. Không có gì mới → phản hồi < 300 byte thay vì 5 MB. App khởi động lại (epoch khác) → tải đủ. Lưu `browser-logs.json` mỗi 5 s **giữ nguyên** (≈ 0,75 MB/s, nhỏ so với 2,5 MB/s của tab Log; làm sau nếu đo còn thấy). |
| 2. Đếm byte thật tại relay | **Xong 2026-11-13** (`tests/relay-bytes.test.mjs`) | Proxy HTTP có auth (711) nay đi qua `start-authenticated-http-relay.mjs` như SOCKS5; đếm `socket.bytesRead/bytesWritten` phía Chrome theo host (không chạm luồng dữ liệu). `session.readRelayBytes()` cho phiên đang chạy; `recordRelayUsage()` cộng vào ngày + host khi đóng. Tab Bandwidth: cột **Proxy thật** mỗi luồng, bảng **Host tốn nhất hôm nay**. Kiểm chứng với một proxy 711 thật: một request `api.ipify.org` qua TLS = **717 B lên / 3.127 B xuống** cho 20 byte JSON — handshake TLS + header chiếm gần hết; đây là một phần lý do 711 tính cao hơn Playwright đo. Các engine AdsPower/Cloak/local-profile chưa qua relay (hiện `--` ở cột Proxy thật). |
| 0. Đo ở 10 phiên | Chưa | Cần phiên thật đang chạy. |
| 3. Giảm tải `node` | Chưa | Làm sau khi có số đo bước 0 và 1–2 ngày số liệu host từ bước 2. |
