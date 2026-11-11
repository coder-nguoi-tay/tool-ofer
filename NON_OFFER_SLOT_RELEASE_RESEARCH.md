# Nghiên cứu: phát hiện trình duyệt không ở trang offer để đóng, nhường slot

Ngày: 2026-11-11. Trạng thái: đã có implementation và test trong source, **chưa xác nhận app cài đặt đã cập nhật**. Mục 2–6 giữ phân tích trước triển khai để đối chiếu; số dòng cũ không còn là vị trí chính xác.

## Đã triển khai (2026-11-11, chưa commit)

Kế hoạch: `docs/superpowers/plans/2026-11-11-non-offer-slot-release.md`. Test: `tests/non-offer-slot-release.test.mjs`.

| Mục | Thay đổi |
|---|---|
| P1 | `pickRefillOfferRoles` (`src/refill/actions/pick-refill-offer-roles.mjs`) — slot bù vào offer đang thiếu. |
| 4.3 / F3 | Đồng hồ non-offer theo origin + pathname. |
| 4.4 / F4 | Listener HTTP status gắn trong `bindPageInstantCheck`. |
| 4.2 / F2 | `isSessionWorkingOnOffer` = đang `checking` hoặc `_uxLastActionAt` < 30s; `addActionCount`/`addVerifiedFieldCount` ghi mốc; 4 chỗ cộng thẳng trong `ai-assist/execute-action.mjs` đi qua helper. |
| Phát sinh | Tab phụ chết/không phải offer là **tab cuối** → đóng cả phiên + bù slot (trước đây chỉ đóng tab, rồi bị hiểu nhầm là người dùng bấm X: không bù, trừ target). Tab phụ do app đóng gắn `_uxClosedByApp`. |
| 4.5 / F5 | `worked` nhận thêm 8 dấu `data-ux-*`. |
| 4.6 / F6 | `isExitIpConsumed` / `closeHistoryStatus` (`src/proxy/actions/is-exit-ip-consumed.mjs`): `duplicate_ip`, `offer_unavailable` vẫn tính IP đã dùng. |
| Sau review | Offer `skip` không được chọn khi bù slot; trang chỉ bị đóng khi **trống liên tục** 30s; IP `completed` (thankyou) vẫn tính đã dùng; `autoCloseNoLead=false` giữ phiên (`keepOpenAfterLeadCheck`); hoạt động tính cả `session.lastActionTime` (AI, handler survey). |

Bổ sung sau triển khai: F8 đồng bộ offerwall với trần `MAX_OFFER_TABS` (mặc định 3 tab tổng), đặt chỗ chung trong context khi nhiều tab cùng mở. Chưa có metadata để xác minh nhiệm vụ chỉ ghé trang N giây; không tự suy đoán thời gian hoàn thành.

P2: phiên skip đã mở vẫn được giữ theo phạm vi đã chốt; không chọn offer skip để bù đa offer. P3: cảnh báo một lần sau 5 phút không ghi nhận hoạt động, chưa tự đóng theo thời gian; bỏ qua manual, skip, checking và keepOpenAfterLeadCheck. Đóng khi không tiến triển cần chốt ngưỡng và bằng chứng tiến triển riêng, không dựa vào thời gian sống tuyệt đối.

## 1. Mục tiêu

Một slot (một cửa sổ trình duyệt = một proxy) chỉ nên bị giữ khi nó đang làm offer, đang chờ check lead,
hoặc IP đã có lead. Mọi trạng thái khác (offer hết hạn, trang trắng, trang lỗi, trang quảng cáo/tin tức
không có form) phải được đóng để `queueAutomaticRefill` mở proxy khác thay vào.

### Phạm vi đã chốt (2026-11-11)

- **Tab chính / tab gốc (`mainPage`, `_uxOriginTab`) không kiểm tra non-offer** — giữ nguyên hành vi hiện tại.
- Chỉ kiểm tra **các tab được mở ra** (popup, tab offer con, tab trang tự bật).
- **App không bao giờ đóng riêng tab đầu** — tab đầu chỉ được tắt bằng tay. Các nhánh đóng *cả trình duyệt* để xoay proxy / bù slot (lỗi mạng, duplicate IP, adtrapper, hết lead, thankyou, completeText) vẫn giữ. Bước `Close` trong script do người dùng viết được giữ. Tab đầu tới thankyou khi còn popup → hoàn tất cả phiên thay vì đóng riêng tab đầu.
- Vì vậy F1, F7, mục 4.1 và phần `hasCta` của 4.5 là **ngoài phạm vi**, giữ lại làm ghi chú.

## 2. Bản đồ luồng trước triển khai (lưu để đối chiếu)

### 2.1. Điểm gắn watcher theo engine

| Engine | Gắn watcher | Ghi chú |
|---|---|---|
| Chrome cài sẵn / CloakBrowser | `src/browser/actions/open-browser-with-installed-chrome.mjs:855-856` và lần nữa ở `launch-requested-browsers.mjs:473` | Lần gắn thứ hai bị chặn bởi `session.trafficWatcherAttached`. |
| AdsPower | `src/browser/actions/open-ads-power-browser.mjs:631-632` | `page.goto` nuốt lỗi (`:578-581`), **không kiểm tra HTTP status** của trang đích như nhánh Chrome (`open-browser-with-installed-chrome.mjs:757-760`). |

Cả hai engine còn gắn: `limitOfferTabs` (tối đa `MAX_OFFER_TABS = 3`), `closeChromeWhenLastTabCloses`,
`attachBrowserCloseHandler` (dọn proxy lock/relay/profile và gọi bù slot).

Watcher chỉ được gắn **sau khi** đã xác minh IP và mở trang đích thành công. Trong lúc đang mở, phiên được
bảo vệ bởi try/catch của launcher (lỗi → đóng, `suppressAutoRefill = true`, worker thử proxy tiếp).

### 2.2. Một nhịp của `watchTrafficBlockedPage` (`src/leads/actions/watch-traffic-blocked-page.mjs`)

Interval 1 giây (`:209-455`), bỏ qua nhịp nếu nhịp trước chưa xong (`checking`), dừng hẳn nếu IP đã có lead.

1. Đóng tab trùng link không phải tab gốc (`:222-231`, `findDuplicateTabs`).
2. Với từng tab còn mở:
   1. `thankyou` URL → `handleThankYouClose` (`:238-241`): còn tab khác thì đóng tab, tab cuối thì đóng phiên, proxy ghi `completed`.
   2. Lần đầu thấy tab: tạo tracker non-offer, gắn listener `response` để lưu `page._uxMainStatus` (`:244-252`).
   3. `getDeadOrBlockedReason(page)` (`:253`): chrome-error, toffers duplicate, Traffic Blocked, `ERR_*`, can't be reached… (quét cả iframe, timeout 2s/frame).
   4. Nếu không chết: **chỉ tab không phải gốc** mới gọi `getNonOfferReason` (`:257-258`).
      - Có lý do + còn tab khác → đóng tab (`:262-271`).
      - Có lý do + là tab duy nhất + phiên chưa "đang làm offer" → nâng thành `deadReason` (`:273`).
   5. Có `deadReason`: tab phụ → đóng tab (`:278-290`); tab chính hoặc duplicate IP → ghi proxy `failed`, `closeSessionAndRefill` (`:292-324`).
   6. Adtrapper/adswapper: `disabled.html` → đóng phiên; đứng 8s → reload tối đa 2 lần → đóng phiên (`:327-449`).

Song song có check "tức thì" trên `framenavigated` cho duplicate IP và thankyou (`:192-207`).

### 2.3. Bộ phân loại non-offer (`src/leads/actions/get-non-offer-reason.mjs`)

| Điều kiện | Ngưỡng (`NON_OFFER_WAIT_MS`) | Kết quả |
|---|---|---|
| URL `404offer.com` / `//unavailable.` | ngay | "Offer hết hạn" |
| URL ipify / toffers.top / adtrapper / adswapper | — | luôn giữ (trang trung gian) |
| URL rỗng / `about:blank` | 20s | "Trang trắng" |
| `_uxMainStatus` ∈ {404, 410, 500, 502, 504} | 10s | "Trang lỗi HTTP" |
| Không frame nào có form/đáp án/challenge/dấu autofill | 30s | "Không có form / đáp án" |
| Không đọc được frame nào | — | giữ (tránh đóng nhầm) |

Đồng hồ chờ đặt lại mỗi khi `page.url()` đổi (`:18-21`).

`detectOfferContentInPage` (`src/leads/actions/detect-offer-content-in-page.mjs`) coi trang là offer khi:
- `challenge`: title "Just a moment / Checking your browser";
- `worked`: có một trong `data-ux-filled|clicked|qclicked|semantic-clicked|submitted`;
- `hasForm`: input text/email/tel/number/date/radio/checkbox, select, textarea hiển thị, không nằm trong header/nav/footer, không phải ô search/newsletter;
- `hasChoices`: ≥ 2 phần tử chữ ngắn (≤ 60 ký tự, không phải chữ "rác") cùng một cha, trong tập `button, label, [role=radio|option|checkbox], [class*=answer|option|choice], a[class*=btn|answer|option]`.

### 2.4. Các đường đóng phiên và bù slot

| Đường | File | Bù slot? | Ghi lịch sử proxy |
|---|---|---|---|
| `closeSessionAndRefill` (dead/non-offer/adtrapper/duplicate/thankyou) | `watch-traffic-blocked-page.mjs:39-75` | Có, ngay (delay 0) | `failed` (thankyou: `completed`) |
| Lead check: không có lead / lead lệch IP | `start-lead-verification.mjs:55-88, 204, 228` | Có, delay 5s (`closingDueToNoLead`) | không đổi |
| Tab cuối bị đóng (app hoặc trang tự đóng) | `close-chrome-when-last-tab-closes.mjs:56-71` | Có | không đổi |
| Người dùng bấm X | `prepare-manual-browser-close.mjs` | Chỉ luồng không check lead | không đổi |
| `completeText` tìm thấy | `open-browser-with-installed-chrome.mjs:859-881` | Có | không đổi |
| AdsPower: URL đích là duplicate | `open-ads-power-browser.mjs:583-592` | Có | không đổi |

Bù slot: close handler → `queueAutomaticRefill` (`src/refill/actions/queue-automatic-refill.mjs`) → tính
`neededSlots = min(target, maxAlive) - live` → `launchRefillBrowsers` đúng engine. Cờ `autoRefill.queued`
+ `enqueueExclusively` chống bù trùng khi nhiều đường cùng gọi.

### 2.5. Các guard "giữ phiên"

- `protectConfirmedLeadSession` (IP đã có lead) chặn mọi nhánh đóng, kiểm lại trước mỗi thao tác await.
- `isSessionWorkingOnOffer(session)`: `emailFilled || completedScreens > 0 || leadCheckStatus || autofillActions > 0 || autofillFields > 0`.
- `worked` trong DOM của trang hiện tại.
- Tab gốc (`mainPage`, `_uxOriginTab`) không bao giờ bị xét non-offer.

### 2.6. Test hiện có

- `tests/confirmed-lead-protection.test.mjs`: watcher không đóng phiên có lead (duplicate/thankyou/lỗi mạng). Có fixture dùng lại được: `tests/helpers/lead-session-fixture.mjs` (`createLeadTestSession`, `captureLeadWatcherTicks`).
- `tests/browser-session-lifecycle.test.mjs`: `findDuplicateTabs`, tab cuối.
- `tests/toffers-duplicate-close.test.mjs`: nhận diện duplicate URL.
- `tests/selfcheck.mjs:1284-1307`: adtrapper chỉ smoke (khởi tạo không ném lỗi).
- **Không có test nào** cho `getNonOfferReason`, `detectOfferContentInPage`, `isSessionWorkingOnOffer`.

## 3. Phát hiện (xếp theo mức ảnh hưởng tới việc nhường slot)

### F1 — Tab gốc không bao giờ được xét non-offer — NGOÀI PHẠM VI (chủ ý, xem "Phạm vi đã chốt")

`watch-traffic-blocked-page.mjs:257-258`: `isOrigin ? null : getNonOfferReason(...)`.

Kịch bản giữ slot vĩnh viễn:
- Offer chuyển tab chính sang trang tin tức/quảng cáo/landing không form (sau khi bấm CTA hoặc tự redirect).
- AdsPower: `page.goto` lỗi/timeout bị nuốt → tab chính đứng ở `about:blank` hoặc trang 404/5xx; không có nhánh nào đóng (chỉ `chrome-error://` mới bị `getDeadOrBlockedReason` bắt).
- Đa tab: tab 2, 3 do app mở cũng là `_uxOriginTab` → cũng miễn.

Đường duy nhất hiện tại để đóng phiên vì non-offer: tab chính đã tự đóng và tab còn lại là tab phụ duy nhất (`:273`).

### F2 — Cờ "đang làm offer" tính cho cả phiên và không bao giờ hết

`is-session-working-on-offer.mjs`: một lần `autofillActions > 0` (kể cả bấm consent/cookie/CTA) là phiên miễn đóng
vì non-offer mãi mãi. Thêm nữa `leadCheckStatus` truthy bao gồm cả `api_error` và `unmatched`
(`start-lead-verification.mjs:182, 194, 233`) — trạng thái kết thúc, không phải "đang chờ".

Kịch bản: submit xong → offer redirect sang trang quảng cáo → phiên đã có `autofillActions` → kẹt slot.
Kịch bản: API lead lỗi → `api_error`, "giữ trình duyệt mở" → nếu trang sau đó rời offer, không bao giờ nhường.

### F3 — Đồng hồ chờ đặt lại khi URL đổi bất kỳ phần nào

`get-non-offer-reason.mjs:18-21` so cả query và `#hash`. Trang quảng cáo xoay vòng, SPA tin tức đổi hash/query
theo scroll, hoặc trang tracking tự `history.replaceState` sẽ không bao giờ chờ đủ 30s.

### F4 — `_uxMainStatus` được gắn muộn

Listener `response` gắn ở nhịp đầu tiên thấy tab (`:249`), muộn tới ~1s + thời gian nhịp trước. Response
điều hướng đầu tiên của popup thường đã qua → status `undefined` → nhánh HTTP lỗi (10s) bị bỏ qua, trang
404/5xx chỉ còn trông vào nhánh "không form" (30s), mà trang lỗi hay có nút/link nên thường được giữ.

### F5 — `hasChoices` quá rộng, `worked` quá hẹp

- `hasChoices` (detect-offer-content-in-page.mjs:23-31): menu ngoài `<nav>`, dãy tag, nút carousel, nút chia sẻ
  không khớp regex "rác" đều thành ≥ 2 lựa chọn → trang rác được giữ. Lệch có chủ ý (thà giữ nhầm), nhưng
  nếu áp dụng cho tab chính (F1) thì chiều ngược lại mới nguy hiểm, xem F7.
- `worked` chỉ nhìn 5 dấu. Autofill còn đặt nhiều dấu khác chứng tỏ đã làm trên trang:
  `data-ux-opened`, `data-ux-mui-clicked`, `data-ux-soi-done`, `data-ux-ow-clicked`, `data-ux-autofill-owner`,
  `data-ux-typing`, `data-ux-semantic-answered`, `data-ux-answer-attempt-at`… → trang offerwall/MUI đã làm
  vẫn có thể bị coi là "không có gì để làm" nếu DOM không còn input/đáp án hiển thị.

### F6 — Đóng vì lỗi trang offer nhưng ghi proxy `failed`

`closeSessionAndRefill` dùng chung cho mọi lý do; các nhánh ghi `status: 'failed'` (`:94, 300, 340, 420`).
Hệ quả kép, ngược chiều nhau:
- Proxy đã chuyển `success` → `failed`, nên exit IP **rơi khỏi** `usedExitIps` (`launch-requested-browsers.mjs:170-174`,
  `launch-ads-power-browsers.mjs:162` chỉ tính `status === 'success'`). Với lý do "Toffers Duplicate IP" đây là sai:
  IP đã click offer lại có thể được proxy xoay khác dùng lại.
- Với "Offer hết hạn"/"không form", lỗi không do IP nhưng proxy vẫn bị đánh dấu thất bại.

Cần chốt chính sách (mục 6).

### F7 — Rủi ro đóng nhầm nếu mở rộng sang tab chính — NGOÀI PHẠM VI (không mở rộng)

Các trang hợp lệ nhưng `detectOfferContentInPage` trả "không có gì":
- Prelander chỉ có **một** nút CTA (Start / Continue / Claim) — `hasChoices` cần ≥ 2, `hasForm` cần input.
- Trang "đang xử lý / redirecting…" có spinner, tự chuyển sau 20-40s.
- Trang có form trong iframe cross-origin chưa tải xong (frame evaluate lỗi → bị lọc khỏi `found`; nếu frame
  chính đọc được và trống thì trang bị coi là không form).
- Trang chờ lead (tab đã submit email, đang check lead) — đã được `leadCheckStatus === 'checking'` giữ.
- Chế độ `offerMode === 'manual'`: người dùng tự thao tác, không có dấu `data-ux-*`.

### F8 — Lệch giữa offerwall và giới hạn tab

`handle-offerwall-cards.mjs:19` cho mở tới 8 offer con song song, nhưng `limitOfferTabs` đóng mọi tab vượt 3
(`MAX_OFFER_TABS`). Offer con không có form (dạng "ghé trang N giây") cũng bị non-offer đóng sau 30s. Hai cơ chế
này không biết nhau.

### F9 — Check "tức thì" thực ra bị bỏ khi interval đang chạy

`checkInstantToffersDup` / `checkInstantThankYou` return nếu `checking` (`:79, 184`) — mà interval gần như luôn
đang chạy (evaluate nhiều frame). Không mất sự kiện (interval vẫn bắt URL), chỉ trễ thêm 1 nhịp. Ghi nhận, không cần sửa.

### F10 — Chi phí quét

Mỗi giây, mỗi tab, mỗi frame: `getDeadOrBlockedReason` đọc `innerText` của cả `body` và `documentElement`; sau 30s
thêm `detectOfferContentInPage` quét toàn DOM. Với 30 phiên × 3 tab × nhiều iframe là đáng kể. Không chặn tính năng,
nhưng nếu thêm xét tab chính thì nên giãn nhịp non-offer (ví dụ 3-5s) thay vì 1s.

### Phát hiện phụ (ngoài phạm vi nhưng ảnh hưởng trực tiếp slot)

**P1 — Bù slot đa offer luôn gán offer 1.** `queue-automatic-refill.mjs:105-114`: vòng `for k` cập nhật
`minCount` nhưng **không gán `minOffer = k`**, nên `assignedStreamRoles` luôn toàn `1`. Slot đóng của offer 2/3/4
được bù bằng offer 1 (`launch-requested-browsers.mjs:344` dùng `assignedStreamRoles[workerIndex]`).
Sửa một dòng: thêm `minOffer = k;` trong nhánh `if (c < minCount)`.

**P2 — `offerMode === 'skip'` giữ slot.** `attach-autofill.mjs:64-71` chỉ return; trình duyệt đứng ở tab gốc
(miễn non-offer theo F1) nên chiếm slot mãi. Cần xác nhận "skip" nghĩa là đóng ngay hay để người dùng xem.

**P3 — Không có lưới an toàn thời gian sống.** `timeLimit` chỉ ghi log (`open-browser-with-installed-chrome.mjs:883-893`).
Không có giới hạn "không tiến triển N phút thì đóng" cho phiên chưa có lead.

## 4. Thiết kế đề xuất

Nguyên tắc: không viết lại watcher, chỉ đổi điều kiện. Mọi nhánh mới vẫn đi qua `protectConfirmedLeadSession`
và `closeSessionAndRefill`.

### 4.1. Xét non-offer cho cả tab gốc, ngưỡng riêng (F1, F7) — KHÔNG LÀM (đã chốt)

Trong `watch-traffic-blocked-page.mjs:257-273`:
- Gọi `getNonOfferReason` cho mọi tab; truyền thêm `{ origin: true }` cho tab gốc để dùng ngưỡng dài hơn
  (đề xuất `NON_OFFER_WAIT_MS.originNoForm = 60000`, `originBlank = 30000`).
- Tab gốc có lý do non-offer:
  - Còn tab khác đang là offer (không có lý do non-offer) → **không** đóng tab gốc (giữ nguyên hành vi đa tab,
    tránh đổi `mainPage`), chỉ log.
  - Tất cả tab đều non-offer và phiên không ở trạng thái giữ (4.2) → `deadReason = nonOfferReason` → đóng phiên.
- Bỏ qua hoàn toàn khi `session.offerMode === 'manual'`.

### 4.2. Thay cờ phiên bằng trạng thái hiện tại (F2)

Giữ phiên nếu:
- `leadCheckStatus === 'checking'` (đang chờ API) — không tính `api_error`/`unmatched`/`failed`;
- trang hiện tại có `worked` hoặc form/đáp án (đã có trong `detectOfferContentInPage`);
- hoặc có hành động autofill gần đây (đề xuất `session._uxLastActionAt` cập nhật trong `addActionCount` /
  `addVerifiedFieldCount`, giữ nếu < ngưỡng chờ). Đây là thay đổi nhỏ, một dòng ở mỗi hàm.

`isSessionWorkingOnOffer` hiện chỉ có một caller (`:273`); đổi nội dung hàm là đủ, không cần sửa nơi khác.

### 4.3. Đồng hồ theo trang, không theo URL đầy đủ (F3)

`get-non-offer-reason.mjs:18`: so `origin + pathname` thay vì cả URL. Một biến `key`, không thêm state.

### 4.4. Bắt HTTP status ngay khi có tab (F4)

Chuyển việc gắn listener `response` vào `bindPageInstantCheck` (`:192-200`), chạy ngay khi có sự kiện `page`
và cho các tab đã tồn tại. Giữ cờ chống gắn trùng.

### 4.5. Mở rộng `worked`, nhận prelander một CTA (F5, F7)

- Thêm các dấu ở F5 vào selector `worked`.
- (Không làm — chỉ cần khi xét tab gốc) Thêm `hasCta`: một nút/link hiển thị có chữ forward rõ nghĩa (continue|next|start|get started|claim|submit|
  check eligibility|see offer…) ngoài header/nav/footer. Chỉ dùng `hasCta` để **giữ tab gốc**, không dùng để giữ
  tab phụ (giữ nguyên độ chặt hiện tại cho popup).

### 4.6. Trạng thái lịch sử proxy riêng (F6) — cần chốt chính sách

Đề xuất tham số hoá `closeSessionAndRefill({ page, historyStatus })`:
- Duplicate IP → giữ exitIp trong tập đã dùng (ghi `status: 'success'` + `closedReason`, hoặc thêm trạng thái mới và
  đưa vào điều kiện `usedExitIps`).
- Offer hết hạn / non-offer / HTTP lỗi → `offer_unavailable` (không phải lỗi IP).
- Lỗi mạng / Traffic Blocked → giữ `failed` như hiện tại.

### 4.7. Không làm trong đợt này

- Không đổi ngưỡng adtrapper, logic thankyou, lead check.
- Không nối offerwall (F8) — ghi nhận, cần thiết kế riêng (ví dụ đánh dấu `_uxSubOfferTab` và ngưỡng dwell).
- Không thêm lưới thời gian sống (P3) khi chưa có yêu cầu.

## 5. Kế hoạch test (offline, dùng fixture sẵn có)

Một file mới `tests/non-offer-slot-release.test.mjs` (đăng ký vào `TEST_FILES`), dùng page giả kiểu
`tests/helpers/lead-session-fixture.mjs` với `page.frames()` trả các frame có `evaluate` trả kết quả
`detectOfferContentInPage` cố định, và mock `Date.now`:

1. `getNonOfferReason`: `404offer` → ngay; `about:blank` < 20s → null, ≥ 20s → lý do; status 404 ≥ 10s → lý do;
   có form trong iframe → null; mọi frame lỗi → null; ipify/toffers/adtrapper → null.
2. Đổi `#hash`/query nhưng giữ path → đồng hồ không reset (F3); đổi path → reset.
3. Watcher: tab popup không form quá 30s, còn tab chính → đóng popup, giữ phiên.
4. Tab chính đã tự đóng, popup là tab duy nhất, không form, phiên đã có `autofillActions` nhưng không có hành động
   gần đây → phiên đóng, `queueAutomaticRefill` được gọi (F2).
5. Như (4) nhưng `leadCheckStatus = 'checking'` → giữ; IP có lead → giữ.
6. Tab chính đứng trang không form bao lâu cũng không bị đóng (khóa phạm vi đã chốt).
7. `queueAutomaticRefill` với 2 offer, offer 2 thiếu slot → `assignedStreamRoles` chứa 2 (P1).

Kiểm tra cuối: `node --test tests/non-offer-slot-release.test.mjs tests/confirmed-lead-protection.test.mjs
tests/browser-session-lifecycle.test.mjs` rồi `npm test`.

## 6. Câu hỏi cần chốt trước khi sửa

1. **Lịch sử proxy (F6):** đóng vì offer hết hạn / không phải offer thì IP đó có được dùng lại cho cùng offer không?
   Duplicate IP chắc chắn không — xác nhận muốn sửa chỗ IP duplicate rơi khỏi `usedExitIps`.
2. ~~Ngưỡng tab gốc~~ — đã chốt: không kiểm tra tab gốc.
3. **`api_error` / `unmatched`:** khi trang đã rời offer, có cho đóng để nhường slot không, hay luôn giữ để kiểm tay?
4. **`offerMode = 'skip'` (P2):** skip nghĩa là đóng phiên ngay và bù slot, hay giữ mở?
5. **P1 (offer luôn = 1 khi bù):** sửa ngay trong PR riêng một dòng?

Thứ tự triển khai đề xuất (mỗi mục một PR nhỏ): P1 → 4.3 + 4.4 → 4.2 → 4.5 (chỉ phần `worked`) → 4.6 (sau khi chốt câu 1).

## 7. Giảm tải sau triển khai

- Watcher vẫn kiểm tra vòng đời/URL mỗi giây. Quét DOM lỗi của cùng tài liệu được cache 3 giây; đổi URL hoặc framenavigated làm hết cache. Lỗi chrome-error/duplicate trong URL vẫn bắt ngay.
- Mỗi frame chỉ có tối đa một evaluate kiểm tra lỗi còn đang chạy. Timeout không được coi là hủy evaluate; chờ promise cũ kết thúc trước khi cho quét lại frame đó. Timer timeout được dọn khi đọc xong.
- Thumbnail desktop hỏi mỗi 5 giây, chỉ tải ô giao với viewport/vùng cuộn; kiểm tra lại khi callback trì hoãn chạy. Cache ảnh 10 giây theo Page + URL, tối đa hai lượt chụp thumbnail trên toàn app, không tích hàng đợi. API hết tải và chưa có ảnh trả 503 để client thử ở lượt tiếp theo.
- Screen View lấy một trong hai frame do Chromium gửi; ảnh bù trang tĩnh chỉ sau 1,5 giây, timer 500ms. Đây không phải cam kết FPS cố định. Không đổi viewport/fingerprint.
- Không giảm nội dung log thao tác/HTML bằng chứng trong đợt này. Không đóng phiên có lead để tiết kiệm RAM.
- Test bổ sung: `tests/browser-load-policy.test.mjs`; benchmark cô lập: `node tests/manual/benchmark-browser-load.mjs 10 10`. Xem `docs/BROWSER_PERFORMANCE.md` về giới hạn phép đo.
