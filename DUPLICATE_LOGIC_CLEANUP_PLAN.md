# Rà soát logic trùng lặp — kế hoạch gom/loại bỏ

Ngày: 2026-11-12. Trạng thái: rà soát xong; **đã làm A1, A2 (bước deprecated), A5, A6** (chưa commit). Chưa xóa gì.

## Đã làm (2026-11-12)

| Mục | Thay đổi | Test |
|---|---|---|
| A1 | 9 chỗ `browserSessionLogs.get(session).push` trong watcher + check lead → `session.addBrowserLog?.(...)` (giữ `offer/type/ip/detail`). Nhánh dự phòng trong `open-browser-with-installed-chrome.mjs` (khi chưa có `addBrowserLog`) giữ nguyên. | `tests/log-routing.test.mjs` |
| A2 | `addActionCount`/`addVerifiedFieldCount` ghi `lastActionTime`; `is-session-working-on-offer.mjs`, `warn-idle-offer-session.mjs` đọc `lastActionTime`, `_uxLastActionAt` chỉ còn đọc dự phòng (**@deprecated**, không còn nơi ghi — bỏ ở PR sau). | `tests/non-offer-slot-release.test.mjs` |
| A5 | `LEAD_CHECK_AFTER_EMAIL_PLAN.md` mục D1 khớp code (thấy lead → bật bảo vệ). | — |
| A6 | `src/leads/actions/record-proxy-outcome.mjs`: `recordProxyOutcome()` + `sessionLabel()` thay 5 khối ghi lịch sử proxy và 5 dòng tính nhãn trong watcher; status từng nhánh giữ nguyên. | `tests/record-proxy-outcome.test.mjs` |
| Lỗi chức năng (log 2026-11-11) | Regex pháp lý dùng chung `SURVEY_LEGAL_NOISE_RE` thêm `polic(y|ies)`, `program requirements`, `biometric`; `find-submit-button.mjs` (2 bản chép) và `form-scope/find-scoped-submit-button.mjs` (bản chép thiếu, không xét `href`) dùng chung regex này. Form chỉ còn link chính sách không còn bị chọn làm nút submit. | `tests/legal-link-submit.test.mjs` |

Import không còn dùng sau khi gom (`browserSessionLogs`, `queueSaveBrowserLogs`, `readProxyUsageHistory`, `persistProxyUsageHistory` trong watcher / check lead) **chưa xóa** — chờ duyệt.

Ghi chú: watcher đã được sửa ngoài phiên để **không còn tự đóng tab không phải offer** (chỉ còn lỗi mạng/blocked); kế hoạch không đụng tới thay đổi đó.

Quy tắc áp dụng (CLAUDE.md của user): không tự xóa; "0 caller" không đủ bằng chứng; thứ tự: gom về một chỗ / đánh dấu deprecated → PR nhỏ riêng từng nhóm → user duyệt → mới xóa.

## Cách rà

1. File trùng byte (md5) trên `.mjs/.js/.cjs/.md/.html` (bỏ `node_modules`).
2. Hàm/hằng **định nghĩa** cùng tên ở nhiều file (bỏ re-export `export … from`).
3. Khối code trùng: cửa sổ 8 dòng đã chuẩn hóa (bỏ comment, thay chuỗi/số) trên `src/` + file gốc. Bảng dữ liệu (device-profiles, stealth, bot-commands) giống nhau là bình thường — bỏ qua.
4. Đọc tay các trạng thái/luồng song song (cờ lead, mốc hoạt động, nguồn API, đường ghi log).

Kết quả chung: dự án tách "mỗi hàm một file" khá sạch, ít hàm trùng tên. Trùng lặp nằm chủ yếu ở **trạng thái song song** và **khối code chép giữa hai engine** — đây là thứ gây nhiễu thông tin (log/trạng thái mỗi nơi một kiểu, sửa một chỗ quên chỗ kia).

## Nhóm A — Gây nhiễu/sai thông tin (ưu tiên)

### A1. Ghi log đi vòng qua `addBrowserLog` (10 chỗ)
`browserSessionLogs.get(session)` là **cùng mảng** với `session.addBrowserLog` (`attach-browser-logger.mjs:27`), nhưng `logs.push(...)` trực tiếp bỏ qua: gán `id`/`sequence`, gộp sự kiện lặp (coalescer), chính sách chụp bằng chứng của recorder mới.
- `src/leads/actions/watch-traffic-blocked-page.mjs` ×6, `src/leads/actions/start-lead-verification.mjs` ×3, `src/browser/actions/open-browser-with-installed-chrome.mjs` ×1.
- Hệ quả: sự kiện không có `id` trong Replay (ghi chú không tham chiếu được), lỗi lặp không được gộp, `queueSaveBrowserLogs()` phải gọi tay.
- Đề xuất: thay bằng `session.addBrowserLog?.({...})`. Không xóa hàm nào.
- Kiểm chứng: `tests/browser-recorder.test.mjs`, `tests/recorder-log-policy.test.mjs`, `tests/confirmed-lead-protection.test.mjs`; grep `browserSessionLogs.get(` ngoài `src/logging` = 0.

### A2. Hai mốc "hoạt động gần nhất"
- `session.lastActionTime`: ghi ở 10 file (AI, survey, submit, fill).
- `session._uxLastActionAt`: ghi ở `add-action-count.mjs`, `add-verified-field-count.mjs` (do đợt non-offer thêm); đọc ở `is-session-working-on-offer.mjs:19`, `warn-idle-offer-session.mjs:13` — cả hai đều phải `Math.max` hai field.
- Đề xuất: helper ghi `lastActionTime`; reader chỉ đọc `lastActionTime`; đánh dấu `_uxLastActionAt` deprecated một bản rồi bỏ.
- Kiểm chứng: `tests/non-offer-slot-release.test.mjs`, `tests/browser-load-policy.test.mjs`.

### A3. Hai nguồn dữ liệu lead gọi cùng API
- Poll nền `refreshToffersOverview` gọi `fetchLeadDatas` mỗi 10s (`start-local-interface.mjs:107`).
- Mỗi phiên tick Check Lead lại tự gọi `fetchLeadDatas` mỗi 10s (`start-lead-verification.mjs:94-117`). 10 phiên chờ lead ≈ 1 request/giây cùng endpoint; hai nơi có thể thấy dữ liệu khác nhau trong cùng thời điểm.
- Đề xuất: `startLeadVerification` đọc `latestToffersOverview` (ép refresh khi bản cũ hơn 10s) thay vì tự gọi. **Đổi hành vi nhẹ** (thời điểm gọi API) → PR riêng, cần duyệt.
- Kiểm chứng: `tests/confirmed-lead-protection.test.mjs`, `tests/toffers-lead.test.mjs`, `tests/lead-observe-after-email.test.mjs`; đếm request trong log thật.

### A4. Cờ trạng thái lead chồng nhau
`leadCheckStatus` (13 file), `screen5LeadVerified` (7), `confirmedLeadIp` (5), `leadCheckTriggered` + `screen5LeadCheckTriggered` (4 file, luôn set cặp), `leadObserveStatus` (2). `screen5LeadVerified` gần như bằng `leadCheckStatus === 'confirmed'`; hai cờ "Triggered" luôn đi đôi.
- Đề xuất: **chỉ lập bảng ánh xạ** trước (mỗi cờ: ai ghi, ai đọc, khác nhau ở trường hợp nào); gom dần sau khi có test cho từng cặp. Không gom một lần.
- Kiểm chứng: grep từng cờ trong `src/` và `ui/` (UI đọc `leadCheckStatus`), test lead hiện có.

### A5. Tài liệu lệch code
`LEAD_CHECK_AFTER_EMAIL_PLAN.md` ghi D1 = (a) "không bật `protectConfirmedLeadSession`", nhưng `observe-leads-after-email.mjs:34-35` (sửa ngoài phiên) nay **có** bật bảo vệ khi thấy lead, test `lead-observe-after-email.test.mjs:86-92` cũng đã theo code mới. Cần cập nhật tài liệu cho khớp (hoặc xác nhận ý định).

### A6. Khối ghi lịch sử proxy lặp trong watcher
`watch-traffic-blocked-page.mjs`: đoạn đọc → ghi `history.proxies[session.proxyKey]` lặp **5 lần**, tính `label` lặp **5 lần**, `logs.push` 6 lần. Lần sửa status `duplicate_ip/offer_unavailable` vừa rồi phải sửa tay từng nhánh — dễ sót.
- Đề xuất: 2 hàm nhỏ `markProxyHistory(session, status, reason)` và `sessionLabel(session)` trong cùng thư mục; các nhánh gọi lại.
- Kiểm chứng: `tests/non-offer-slot-release.test.mjs`, `tests/proxy-stop.test.mjs`, `tests/confirmed-lead-protection.test.mjs`.

## Nhóm B — Code chép giữa hai nơi (dễ lệch khi sửa)

| # | Trùng | Quy mô | Đề xuất |
|---|---|---|---|
| B1 | `open-ads-power-browser.mjs:236-759` ↔ `open-browser-with-installed-chrome.mjs:350-866` (gắn logger/data saver, guard popup + tab chết, mở đa tab, completeText, timeLimit, close handler) | ~88 dòng giống | Tách từng khối thành helper dùng chung, **mỗi khối một PR**, bắt đầu từ mở đa tab và completeText |
| B2 | Quét phiên chết: `queue-automatic-refill.mjs:29-36` ↔ `launch-requested-browsers.mjs:243-250` | 8 dòng | Một hàm `pruneDeadSessions()` (đã có `pruneDeadManagedSessions` cho AdsPower — xem gộp được không) |
| B3 | Dựng `leadConfig`: `launch-requested-browsers.mjs:400-408` ↔ `launch-ads-power-browsers.mjs:111-119` | 9 dòng | `buildLeadConfig(body)` |
| B4 | Phát hiện tab chết ở 3 nơi: watcher (`readThrottledPageHealth`), handler `load` tab mới (`open-browser-with-installed-chrome.mjs` ~845), `hasTrafficBlocked` (chỉ `tests/selfcheck.mjs:259` và export `app.mjs:50` dùng) | logic chồng | Handler `load` gọi chung `readThrottledPageHealth`; `hasTrafficBlocked` đánh dấu deprecated (còn export công khai → hỏi trước khi bỏ) |
| B5 | `process-frame-surveys.mjs:189-221` ↔ `complete-frame-controls.mjs:47-78` | 17 dòng | Hàm chung |
| B6 | `http/routes/pc/post-browser-config-save.mjs:20-42` ↔ `post-config-save.mjs:20-42` | 15 dòng | Hàm chung |
| B7 | Kích hoạt check lead: `attach-autofill.mjs:124-136` ↔ `track-frame-screen.mjs:89-101` | 11 dòng | Một `triggerLeadCheck(session, reason)` (liên quan A4) |
| B8 | `proxy/actions/auto-refill-proxy-if-needed.mjs:76-91` ↔ `http/routes/711proxy/post-generate.mjs:97-115` | 11 dòng | Hàm chung |
| B9 | `fill-select-or-text-field.mjs:92-101` ↔ `handle-existing-field-value.mjs:16-25`; `fill-select-or-text-field.mjs:285-295` ↔ `sync-uplevel-rewards-fields.mjs:35-45` | 10 + 8 dòng | Hàm chung |
| B10 | `adspower-profile/build-ads-power-profile-request.mjs:23-34` ↔ `open-ads-power-browser.mjs:188-199` | 9 dòng | Gọi lại hàm build sẵn có |
| B11 | `screen/post-tabs.mjs:17-28` ↔ `post-tabs-close.mjs:19-30`; `tgbot/commands/screen.mjs` ↔ `slots.mjs`; `fetch-lead-datas.mjs:50-63` ↔ `fetch-current-point.mjs:44-55` | 8–9 dòng | Gom khi chạm tới, ưu tiên thấp |

## Nhóm C — Ưu tiên thấp / không cần làm

- **UI mỗi app một bản**: `esc-html.js` (mac = desktop byte-identical, mini gần giống), `fetch-logs`, `render-logs`, `fmt-time`, `start/stop-log-refresh`, `show-toast`, `sync-option-pills`. Bundle tách theo app (`ui/bundles.json`), chưa có thư mục shared → chỉ gom nếu thêm cơ chế shared cho bundle.
- **Không phải trùng, giữ nguyên**: facade gốc `*.mjs` re-export `src/` (tương thích công khai); `AGENTS.md`/`agents.md` là **một file** (cùng inode, ổ đĩa không phân biệt hoa thường); trùng tên backend ↔ UI (`formatBytes`, `loadProxyQueue`, `send`) khác ngữ cảnh.
- Script ad-hoc ở gốc còn `debug-sweep.mjs`, `record-offer-flow.mjs` — không thuộc `npm test`; giữ hoặc chuyển `tests/manual/` khi user muốn.

## Thứ tự PR đề xuất

1. A1 (log đi vòng) — an toàn, giảm nhiễu Replay ngay.
2. A5 (tài liệu lệch code) — chỉ sửa tài liệu.
3. A2 (một mốc hoạt động) — đánh dấu deprecated `_uxLastActionAt`.
4. A6 (helper lịch sử proxy trong watcher).
5. B2, B3, B5–B11 — mỗi cặp một PR nhỏ.
6. A3 (một nguồn dữ liệu lead) — đổi hành vi, cần duyệt.
7. A4 (bảng ánh xạ cờ lead) → gom từng cặp.
8. B1 (hai engine mở trình duyệt) — lớn nhất, tách nhiều PR.
9. B4 phần `hasTrafficBlocked` — chỉ bỏ sau khi user xác nhận không ai dùng ngoài repo (MCP, repo FE, script).

Mỗi PR: test cũ phải pass + test mới cho đường gom; không kèm reformat.
