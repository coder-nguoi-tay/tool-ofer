# Kế hoạch: check lead sau khi nhập email cho mọi offer (không cần tick Check Lead)

Ngày: 2026-11-11. Trạng thái: **đã triển khai (chưa commit, chưa build app).**

## Đã chốt và triển khai

- D1 (cập nhật 2026-11-12 theo code `observe-leads-after-email.mjs:31-38`): không tick Check Lead, khi **thấy lead** → gán `confirmedLeadIp` và **bật** `protectConfirmedLeadSession` cho đúng IP đó (phiên được giữ như lead đã xác nhận); vẫn **không** ghi thống kê lead, không tạm dừng autofill, không đóng trình duyệt khi chưa thấy lead. Bản đầu (2026-11-11) chỉ hiển thị — đã đổi ngoài phiên, test `lead-observe-after-email.test.mjs` theo hành vi mới.
- D2: cửa sổ theo dõi 10 phút (`LEAD_OBSERVE_WINDOW_MS`) từ lần poll đầu thấy `emailFilled`; vẫn đối chiếu sau khi trình duyệt đã đóng (Set trong RAM, mất khi tắt app).
- D3: báo Telegram một lần khi có lead.
- D4: dùng kết quả poll nền `refreshToffersOverview` (cấu hình Toffers), không gọi API thêm.
- Code: `src/leads/actions/observe-leads-after-email.mjs`; gọi từ `refresh-toffers-overview.mjs`; `get-auto-refill-status.mjs` trả `leadObserveStatus` (`waiting|found|not_found|api_error`) + `leadObserveMessage`; badge ở `ui/desktop/functions/fetch-running-state.js`, `_poll-thumbnails.js`, `_update-screen-slots.js`, `ui/mac/functions/render-auto-refill-state.js`, `ui/mini/functions/render-screen-grid-cards.js`.
- Test: `tests/lead-observe-after-email.test.mjs` (8 test).

## 1. Hiện trạng

| Điểm | Vị trí | Hành vi |
|---|---|---|
| Cờ bật | UI `cbxCheckLead` → `body.enableLeadCheck` → `leadConfig.enabled` (`launch-requested-browsers.mjs:401`, `launch-ads-power-browsers.mjs:112`) | Một cờ chung cho cả lượt Start. |
| Kích hoạt | `onEmailSubmitted` / `onScreen5Reached` → `startLeadVerification` (`open-browser-with-installed-chrome.mjs:492-497`, `open-ads-power-browser.mjs:742-747`) | Chỉ khi `sess.emailFilled`. |
| Chặn khi tắt cờ | `start-lead-verification.mjs:26` (`leadConfig.enabled !== true` → return); `attach-autofill.mjs:147`, `fill-page-forms.mjs:77/98/147`, `track-frame-screen.mjs:84` (`enableLeadCheck === false` → bỏ qua) | Tắt cờ = không bao giờ check. |
| Khi bật cờ | `start-lead-verification.mjs` | **Tạm dừng autofill** sau màn email, gọi API 2 × 30s; có lead → `confirmed`, ghi thống kê, Telegram, cho autofill chạy tiếp; không lead → **đóng trình duyệt, đổi proxy**. |
| Nguồn dữ liệu sẵn có | `startToffersBackgroundPolling(10_000)` (`start-local-interface.mjs:107`) → `refreshToffersOverview` → `latestToffersOverview.results` | **Luôn chạy**, kể cả khi tắt cờ, mỗi 10 giây gọi `fetchLeadDatas`. Hiện chỉ dùng hiển thị point/tổng lead, **không đối chiếu với IP phiên nào**. |
| Đối chiếu IP | `isLeadPresent(responseData, targetIps)` (`src/lead-check/is-lead-present.mjs`) | Dùng lại được nguyên. |
| Cờ email | `session.emailFilled` được set ở `fill-frame-fields.mjs:157/255`, `fill-page-forms.mjs:85/246`, `attach-autofill.mjs:167`, AI repair | Set **bất kể cờ Check Lead**. |
| Hiển thị | `get-auto-refill-status.mjs:61-65` trả `leadCheckStatus`, `leadCheckMessage`, `emailFilled`, `leadCheckEnabled`; UI: `ui/desktop/functions/_update-screen-slots.js`, `fetch-running-state.js`, `ui/mac/functions/render-auto-refill-state.js`, `ui/mini/functions/render-screen-grid-cards.js` | Đã có chỗ hiện trạng thái lead theo slot. |

## 2. Mục tiêu

Mọi offer, khi đã nhập xong email, đều hiện kết quả check lead theo IP của phiên, dù có tick Check Lead hay không.

## 3. Đánh giá khả thi: **CAO**

- Tín hiệu "đã nhập email" (`emailFilled`) có sẵn ở mọi chế độ.
- Dữ liệu lead đã được tải mỗi 10 giây ở nền → **không cần gọi API thêm**, không tăng tải mạng hay rủi ro rate limit.
- Hàm đối chiếu IP có sẵn.
- UI đã có cột/badge trạng thái lead theo slot.
- Phần khó **không phải kỹ thuật** mà là chính sách (mục 5): khi tắt cờ mà phát hiện có lead thì phiên có được "bảo vệ" như lead đã xác nhận không.

## 4. Thiết kế đề xuất

Tách hai chế độ, **không đổi** chế độ đang bật cờ:

| | Tick Check Lead (giữ nguyên) | Không tick — chế độ mới "theo dõi lead" |
|---|---|---|
| Khi nào bắt đầu | Sau màn email (như cũ) | Ngay khi `emailFilled = true` |
| Autofill | Tạm dừng chờ kết quả | **Không dừng**, chạy tới cuối như hiện tại |
| Nguồn dữ liệu | Gọi API riêng 2 × 30s | Dùng kết quả poll nền 10 giây |
| Không có lead | Đóng trình duyệt, đổi proxy | **Không đóng**, chỉ hiển thị "chưa thấy lead" |
| Có lead | `confirmed`, bảo vệ phiên | Hiển thị "có lead" — mức bảo vệ theo quyết định D1 |

Luồng chế độ mới:
1. Sau mỗi lần `refreshToffersOverview` thành công, gọi `observeLeadsAfterEmail(latestToffersOverview)`.
2. Hàm này duyệt `activeBrowsers`: phiên có `emailFilled`, `enableLeadCheck === false`, có `exitIp`, chưa có kết quả → ghi `emailFillAt` nếu thiếu → `isLeadPresent(overview, exitIp)`.
3. Có lead → `session.leadObserveStatus = 'found'` + thời điểm; quá cửa sổ theo dõi (D2) mà chưa thấy → `'not_found'`; API lỗi → `'api_error'` (giữ chờ, không kết luận).
4. `get-auto-refill-status` trả thêm `leadObserveStatus`, `leadObserveMessage`; 4 file UI hiện badge "⏳ Chờ lead / ✅ Có lead / — Chưa thấy lead" cạnh trạng thái hiện có.
5. (Tùy D2) Phiên đóng trước khi hết cửa sổ: close handler đưa `{exitIp, offer, emailFillAt}` vào danh sách chờ trong RAM để vẫn đối chiếu tới khi hết cửa sổ, kết quả hiện ở log/thống kê.

Không cần hook mới vào autofill: chỉ đọc cờ `emailFilled` đã có → không đụng các guard tạm dừng ở `fill-page-forms`/`track-frame-screen`.

### File dự kiến

- Mới: `src/leads/actions/observe-leads-after-email.mjs` (đối chiếu + cửa sổ theo dõi + danh sách phiên đã đóng nếu có).
- Sửa: `src/leads/toffers-overview/refresh-toffers-overview.mjs` (gọi hàm trên sau khi có overview).
- Sửa: `src/refill/actions/get-auto-refill-status.mjs` (2 field).
- Sửa: 4 file UI ở mục 1 (badge).
- Tùy D1: `src/leads/statistics/save-and-record-lead-ip-stats.mjs` / `protect-confirmed-lead-session.mjs`.
- Tùy D2: close handler ở `open-browser-with-installed-chrome.mjs:595` và `open-ads-power-browser.mjs:534`.
- Test mới: `tests/lead-observe-after-email.test.mjs` (đăng ký `TEST_FILES`).

## 5. Quyết định cần chốt trước khi code

**D1 — Có lead khi không tick thì xử lý thế nào? (quan trọng nhất)**
Hiện ghi thống kê lead (`saveAndRecordLeadIpStats` → `leadIpStatsMap`) **tự động bật bảo vệ** (`protectConfirmedLeadSession` đọc map này). Phiên được bảo vệ thì: watcher không đóng, thankyou không đóng/không đổi proxy, completeText không đóng, tab cuối tự đóng sẽ mở tab thay thế. Với luồng không tick (chạy tới thankyou rồi xoay proxy), bật bảo vệ sẽ **làm slot bị giữ lại** sau khi hoàn tất.
- (a) Chỉ hiển thị + ghi log, **không** ghi thống kê, không bảo vệ. Ít rủi ro nhất.
- (b) Ghi thống kê lead (để thống kê IP có lead, AI ưu tiên IP có lead) nhưng **không** bảo vệ phiên → cần tách: thống kê đánh dấu `source: 'observe'` và `protectConfirmedLeadSession` bỏ qua nguồn này.
- (c) Coi như lead xác nhận đầy đủ (giống tick) → phiên giữ lại tới khi đóng tay.

**D2 — Cửa sổ theo dõi bao lâu, và có theo dõi tiếp sau khi trình duyệt đã đóng không?** Lead có thể về chậm sau khi offer hoàn tất. Đề xuất: 10 phút từ lúc nhập email, tiếp tục theo dõi cả khi phiên đã đóng.

**D3 — Có gửi Telegram khi phát hiện lead ở chế độ không tick không?**

**D4 — Cấu hình API:** poll nền dùng `DEFAULT_LEAD_CONFIG` (cookie/datas trong cấu hình Toffers), không dùng ô `leadCheckApiUrl/Cookie/Datas` của lượt Start. Xác nhận hai bên là cùng tài khoản; nếu khác, cần cho poll nền dùng cấu hình của lượt Start.

## 6. Rủi ro và giới hạn

- **Phạm vi dữ liệu API:** tham số `datas` (mặc định `1504`) quyết định API trả những lead nào. Nếu API chỉ trả N lead gần nhất, khi chạy nhiều phiên lead cũ có thể bị đẩy khỏi danh sách trước khi đối chiếu → cần kiểm tra thực tế số bản ghi trả về.
- **Cookie hết hạn:** poll nền trả lỗi → badge hiện "API lỗi", không kết luận "không có lead".
- **Trễ hiển thị:** tối đa ~10 giây sau khi lead xuất hiện trên toffers (chu kỳ poll).
- **IP dùng chung:** chống trùng IP theo trang đích (`usedExitIps`) giữ mỗi IP một phiên/offer, nên gán lead theo IP đáng tin; nếu tắt `checkDuplicate` thì một lead có thể khớp nhiều phiên cùng IP.
- Không thay đổi chế độ tick Check Lead → rủi ro hồi quy thấp, có test sẵn (`confirmed-lead-protection`, `no-lead-auto-refill`).

## 7. Kế hoạch test

1. Phiên không tick, `emailFilled`, overview có IP → `found`; không có IP → vẫn chờ; quá cửa sổ → `not_found`.
2. Phiên chưa nhập email → không theo dõi.
3. Phiên tick Check Lead → hàm mới bỏ qua (không đè `leadCheckStatus`).
4. Overview lỗi API → `api_error`, không kết luận.
5. Theo D1: (a)/(b) không bật `protectConfirmedLeadSession`; (c) bật.
6. Theo D2: phiên đã đóng vẫn được đối chiếu tới hết cửa sổ, sau đó tự xóa khỏi danh sách.
7. Không có thao tác đóng/tạm dừng autofill nào phát sinh ở chế độ mới.
8. Hồi quy: `npm test` toàn bộ.

## 8. Ước lượng

| Phần | Công |
|---|---|
| Lõi đối chiếu + cửa sổ theo dõi | 0,5 ngày |
| API trạng thái + 4 UI badge | 0,3 ngày |
| D1 (b) tách thống kê/bảo vệ (nếu chọn) | +0,3 ngày |
| D2 theo dõi sau khi đóng (nếu chọn) | +0,2 ngày |
| Test | 0,3 ngày |
| **Tổng** | **~1–1,5 ngày** |
