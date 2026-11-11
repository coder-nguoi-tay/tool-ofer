# Nhường slot khi tab phụ không phải offer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab phụ không phải offer được nhận diện đúng và sớm hơn, phiên chỉ còn tab rác được đóng để bù slot, lịch sử proxy ghi đúng lý do, slot bù chia đều theo offer.

**Architecture:** Không viết lại watcher. Sửa điều kiện trong các module nhỏ hiện có (`get-non-offer-reason`, `is-session-working-on-offer`, `detect-offer-content-in-page`, `watch-traffic-blocked-page`), tách 2 hàm thuần mới để test được (`pickRefillOfferRoles`, `isExitIpConsumed`).

**Tech Stack:** Node.js ESM (Node 20+, CI 22/24), `node:test`, Playwright Chromium cho test DOM (skip nếu chưa cài).

**Spec:** `NON_OFFER_SLOT_RELEASE_RESEARCH.md` (mục "Phạm vi đã chốt", §3, §4, §5).

## Trạng thái đối chiếu source

Các phần nghiệp vụ Task 1–6 đã có implementation và test trong source; không tự tạo commit. Bổ sung sau review và giảm tải xem `NON_OFFER_SLOT_RELEASE_RESEARCH.md` cùng `docs/BROWSER_PERFORMANCE.md`. Checkbox commit dưới đây không đại diện cho trạng thái runtime của app cài đặt.

## Global Constraints

- **Tab chính / tab gốc (`session.mainPage`, `page._uxOriginTab === true`) không bị xét non-offer.** Không task nào được đổi dòng `const isOrigin = ...` ở `watch-traffic-blocked-page.mjs:257` hay điều kiện `isOrigin ? null : ...`.
- Mọi nhánh đóng vẫn kiểm `protectConfirmedLeadSession(session)` trước thao tác đóng.
- Không thêm dependency. Không đổi ngưỡng adtrapper, thankyou, lead check, `MAX_OFFER_TABS`.
- File test mới phải thêm vào `TEST_FILES` trong `tests/run-tests.mjs`.
- Code mới: JSDoc tiếng Việt, `@author ductv <ductv@getflycrm.com>`, `@since 2026-11-11`.
- Không xóa file/hàm/comment ngoài những dòng điều kiện được nêu trong task (quy tắc CLAUDE.md của user).
- Mặc định đã chốt cho các câu hỏi §6: (1) duplicate IP vẫn tính là IP đã dùng; offer hết hạn / non-offer / HTTP lỗi ghi `offer_unavailable` và cũng tính là đã dùng; lỗi mạng / Traffic Blocked / adtrapper giữ `failed` như cũ. (3) chỉ `leadCheckStatus === 'checking'` giữ phiên. (4) `offerMode = 'skip'` **không đổi** — đóng + bù sẽ mở lại đúng offer skip và quay vòng đốt proxy. (5) sửa P1.

## Review Focus

1. Popup đang chuyển hướng qua nhiều URL cùng path khác query (tracking redirect) — đồng hồ không reset, nhưng trang có form xuất hiện trước 30s thì vẫn giữ. Test ở Task 2.
2. Phiên có hành động autofill cách đây < 30s nhưng popup là tab duy nhất và trống — phải giữ. Test ở Task 4.
3. Đóng vì duplicate IP: exit IP vẫn bị chặn ở lượt bù tiếp theo. Test ở Task 6.
4. Bù slot khi các offer đang bằng nhau — chọn offer số nhỏ nhất, không lỗi khi `liveBrowsers` rỗng. Test ở Task 1.
5. Trang chỉ có dấu `data-ux-opened` (offerwall đã mở thẻ) không còn input — phải coi là đã làm. Test ở Task 5.

---

### Task 1: Bù slot chia đều theo offer (P1)

**Files:**
- Create: `src/refill/actions/pick-refill-offer-roles.mjs`
- Modify: `src/refill/actions/queue-automatic-refill.mjs:96-116` (thay vòng gán bằng lời gọi hàm mới)
- Test: `tests/non-offer-slot-release.test.mjs` (tạo file, đăng ký vào `TEST_FILES`)

**Interfaces:**
- Produces: `export function pickRefillOfferRoles(liveBrowsers: object[], offerCount: number, needed: number): number[]` — offer của mỗi phiên lấy theo `s.offerNumber ?? s.streamRole ?? 1`; mỗi lượt chọn offer có số phiên ít nhất, hòa thì số nhỏ nhất.

- [ ] **Step 1: Viết test fail**

```js
test('pickRefillOfferRoles: bù vào offer đang thiếu, hòa thì offer nhỏ nhất', () => {
  assert.deepEqual(pickRefillOfferRoles([{ offerNumber: 1 }, { offerNumber: 1 }, { offerNumber: 2 }], 2, 1), [2]);
  assert.deepEqual(pickRefillOfferRoles([], 3, 4), [1, 2, 3, 1]);
  assert.deepEqual(pickRefillOfferRoles([{ streamRole: 2 }], 2, 1), [1]);
});
```

- [ ] **Step 2:** `node --test tests/non-offer-slot-release.test.mjs` → FAIL (module chưa có).
- [ ] **Step 3:** Tạo hàm; trong `queue-automatic-refill.mjs` thay khối `assignedStreamRoles = []; ... for (let i ...)` bằng `assignedStreamRoles = pickRefillOfferRoles(liveBrowsers, offerCount, localNeeded);`.
- [ ] **Step 4:** Test PASS; `node --check src/refill/actions/queue-automatic-refill.mjs`.
- [ ] **Step 5:** Commit `fix(refill): chia slot bù đều theo offer thay vì luôn offer 1`.

### Task 2: Đồng hồ non-offer theo origin + pathname (F3) và test bộ phân loại

**Files:**
- Modify: `src/leads/actions/get-non-offer-reason.mjs:17-21`
- Test: `tests/non-offer-slot-release.test.mjs`

**Interfaces:**
- Consumes: `getNonOfferReason(page, tracker)` (giữ nguyên chữ ký). `tracker` thêm field `key` (origin + pathname, chuỗi rỗng nếu URL không parse được); `tracker.url` vẫn cập nhật URL đầy đủ.

- [ ] **Step 1: Viết test** — page giả: `{ url: () => u, isClosed: () => false, frames: () => [{ evaluate: async () => result }] }`, mock `Date.now` bằng `t.mock.method(Date, 'now', () => now)`.

```js
test('getNonOfferReason: các ngưỡng và trang trung gian', async t => { /* mỗi assert một tình huống */
  // 404offer → lý do ngay ở lần gọi đầu
  // about:blank: 19_999ms → null; 20_000ms → 'Trang trắng (about:blank) không tải offer'
  // _uxMainStatus = 404: 10_000ms → 'Trang lỗi HTTP 404'
  // không form, 30_000ms → 'Trang không có form nhập / đáp án để chọn'
  // một frame hasForm:true → null; mọi frame evaluate reject → null
  // https://api.ipify.org, toffers.top, adtrapper → null
});
test('getNonOfferReason: đổi query/hash không reset đồng hồ, đổi path thì reset', async t => {
  // t0 tại https://ads.test/a?x=1 ; t0+30s tại https://ads.test/a?x=2#b → có lý do
  // t0+30s tại https://ads.test/b → null (đồng hồ reset)
});
```

- [ ] **Step 2:** Chạy → test thứ hai FAIL.
- [ ] **Step 3:** Tính `key` bằng `new URL(url)` trong try/catch (`origin + pathname`; lỗi → dùng nguyên `url`); chỉ reset `tracker.since` khi `key !== tracker.key`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `fix(non-offer): không reset đồng hồ khi chỉ đổi query/hash`.

### Task 3: Ghi HTTP status ngay khi có tab (F4)

**Files:**
- Modify: `src/leads/actions/watch-traffic-blocked-page.mjs:192-200` (gắn listener trong `bindPageInstantCheck`) và `:244-252` (bỏ việc gắn listener ở nhịp interval, giữ khởi tạo tracker)
- Test: `tests/non-offer-slot-release.test.mjs`

**Interfaces:**
- Produces: `page._uxMainStatus: number` được gắn từ response điều hướng của main frame ngay khi tab xuất hiện (tab có sẵn lúc attach và sự kiện `page`). Cờ chống gắn trùng: `page._uxStatusListenerBound = true`.

- [ ] **Step 1: Viết test** — dùng `createLeadTestSession('198.51.100.30')` và `captureLeadWatcherTicks(t)`; tạo popup bằng `await browser.newPage()` **sau** `watchTrafficBlockedPage(session)`, rồi trước khi chạy tick nào:

```js
popup.emit('response', { request: () => ({ isNavigationRequest: () => true }), frame: () => popup, status: () => 404 });
assert.equal(popup._uxMainStatus, 404);
```

- [ ] **Step 2:** FAIL (`undefined`).
- [ ] **Step 3:** Chuyển 3 dòng `page.on?.('response', ...)` vào `bindPageInstantCheck`, bọc bằng cờ `_uxStatusListenerBound`.
- [ ] **Step 4:** PASS; chạy thêm `node --test tests/confirmed-lead-protection.test.mjs` → PASS.
- [ ] **Step 5:** Commit `fix(non-offer): ghi HTTP status của tab ngay khi tab mở`.

### Task 4: "Đang làm offer" theo hoạt động gần đây (F2)

**Files:**
- Modify: `src/leads/actions/is-session-working-on-offer.mjs`
- Modify: `src/autofill/add-action-count.mjs`, `src/autofill/add-verified-field-count.mjs` (thêm một dòng ghi mốc)
- Test: `tests/non-offer-slot-release.test.mjs`

**Interfaces:**
- Produces: `session._uxLastActionAt: number` (ms) — gán `Date.now()` mỗi khi `addActionCount`/`addVerifiedFieldCount` cộng số > 0.
- Produces: `isSessionWorkingOnOffer(session, now = Date.now()): boolean` = `session.leadCheckStatus === 'checking' || now - (session._uxLastActionAt ?? 0) < NON_OFFER_WAIT_MS.noForm`. Caller duy nhất: `watch-traffic-blocked-page.mjs:273`, không cần sửa.

- [ ] **Step 1: Viết test**

```js
test('isSessionWorkingOnOffer: chỉ checking hoặc hành động trong 30s gần nhất', () => {
  assert.equal(isSessionWorkingOnOffer({ leadCheckStatus: 'checking' }, 1e9), true);
  for (const s of ['api_error', 'unmatched', 'failed']) assert.equal(isSessionWorkingOnOffer({ leadCheckStatus: s }, 1e9), false);
  assert.equal(isSessionWorkingOnOffer({ _uxLastActionAt: 1e9 - 29_999 }, 1e9), true);
  assert.equal(isSessionWorkingOnOffer({ _uxLastActionAt: 1e9 - 30_000, autofillActions: 9, emailFilled: true }, 1e9), false);
});
test('addActionCount/addVerifiedFieldCount ghi mốc hành động', ...); // amount 0 không ghi mốc
test('watcher: popup trống là tab duy nhất, hành động cũ > 30s → đóng phiên và bù slot', async t => {
  // fixture: đóng mainPage (page.closed = true), popup URL https://news.test/x, frames → [{evaluate: async () => ({hasForm:false,hasChoices:false,worked:false,challenge:false})}]
  // session.autofillActions = 5, _uxLastActionAt cũ; autoRefill.enabled = false để không chạy launcher
  // chạy tick sau khi mock Date.now vượt 30s → counters.browserCloses === 1
});
test('watcher: như trên nhưng leadCheckStatus checking → không đóng', ...);
test('watcher: tab chính trống bao lâu cũng không bị đóng (phạm vi đã chốt)', ...); // chỉ có mainPage, 10 phút → browserCloses === 0
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Sửa ba hàm theo Interfaces; import `NON_OFFER_WAIT_MS` từ `src/runtime/constants/non-offer-wait-ms.mjs`.
- [ ] **Step 4:** PASS; chạy `node --test tests/confirmed-lead-protection.test.mjs tests/browser-session-lifecycle.test.mjs tests/no-lead-auto-refill.test.mjs` → PASS.
- [ ] **Step 5:** Commit `fix(non-offer): giữ phiên theo hoạt động gần đây thay vì cờ vĩnh viễn`.

### Task 5: Mở rộng dấu "đã làm" trên trang (F5)

**Files:**
- Modify: `src/leads/actions/detect-offer-content-in-page.mjs` (selector `worked`)
- Test: `tests/non-offer-slot-release.test.mjs` (Chromium, skip theo mẫu `tests/active-form-submit.test.mjs:22`)

**Interfaces:**
- `worked` thêm các dấu: `data-ux-opened`, `data-ux-mui-clicked`, `data-ux-soi-done`, `data-ux-ow-clicked`, `data-ux-autofill-owner`, `data-ux-typing`, `data-ux-semantic-answered`, `data-ux-answer-attempt-at`. Không đổi `hasForm`/`hasChoices`.

- [ ] **Step 1: Viết test** — `page.setContent(html)` rồi `page.evaluate(detectOfferContentInPage)`:
  - `<div data-ux-opened="1">Offer A</div>` → `worked === true`, `hasForm === false`.
  - `<nav><input type="text"></nav><p>news</p>` → cả 4 field `false`.
  - `<input type="email">` → `hasForm === true`.
- [ ] **Step 2:** Case đầu FAIL.
- [ ] **Step 3:** Thêm các selector.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `fix(non-offer): nhận thêm dấu autofill đã làm trên trang`.

### Task 6: Lịch sử proxy ghi đúng lý do đóng (F6)

**Files:**
- Create: `src/proxy/actions/is-exit-ip-consumed.mjs`
- Modify: `src/browser/actions/launch-requested-browsers.mjs:170-174`, `src/browser/actions/launch-ads-power-browsers.mjs:162-166` (dùng hàm mới)
- Modify: `src/leads/actions/watch-traffic-blocked-page.mjs` — khối ghi history ở `:89-99` (instant duplicate) và `:292-306` (deadReason)
- Test: `tests/non-offer-slot-release.test.mjs`

**Interfaces:**
- Produces: `export function isExitIpConsumed(entry: object): boolean` = có `entry.exitIp` và `entry.status` ∈ `['success', 'duplicate_ip', 'offer_unavailable']`.
- Produces: `export function closeHistoryStatus(reason: string, fromNonOffer: boolean): 'duplicate_ip'|'offer_unavailable'|'failed'` cùng file `is-exit-ip-consumed.mjs` — duplicate khi `reason` chứa `'Toffers Duplicate IP'` hoặc `'click offer'` (cùng điều kiện `isToffersDup` ở `:278`).
- Status ghi trong watcher: instant dup (`:94`) → `'duplicate_ip'`; khối deadReason (`:300`) → `closeHistoryStatus(deadReason, fromNonOffer)` với `let fromNonOffer = false` gán `true` ở `:273`. Adtrapper (`:340`, `:420`) giữ `'failed'`.
- `isRetryableIpVerificationFailure` không đổi (chỉ xét `failed`/`verification_error`). UI `show-used-ips.js` hiển thị status khác `success` là "bad" — chấp nhận.

- [ ] **Step 1: Viết test**

```js
test('isExitIpConsumed', () => {
  for (const status of ['success', 'duplicate_ip', 'offer_unavailable']) assert.equal(isExitIpConsumed({ exitIp: '1.2.3.4', status }), true);
  assert.equal(isExitIpConsumed({ exitIp: '1.2.3.4', status: 'failed' }), false);
  assert.equal(isExitIpConsumed({ status: 'success' }), false);
});
```

```js
test('closeHistoryStatus', () => {
  assert.equal(closeHistoryStatus('IP đã click offer trước đó (Toffers Duplicate IP)', false), 'duplicate_ip');
  assert.equal(closeHistoryStatus('Trang không có form nhập / đáp án để chọn', true), 'offer_unavailable');
  assert.equal(closeHistoryStatus('Traffic Blocked!', false), 'failed');
});
```

Không viết test watcher ghi history: `proxy-usage-history-path.mjs` trỏ thẳng vào thư mục dữ liệu thật của app (không có biến môi trường để đổi). Các test watcher ở Task 3-4 **không được gán `session.proxyKey`** để khỏi ghi vào file thật.

- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Tạo hàm, thay hai chỗ `if (entry.status !== 'success') return null;` bằng `if (!isExitIpConsumed(entry)) return null;` (giữ dòng `if (!entry.exitIp)` hoặc gộp vào hàm), sửa status trong watcher.
- [ ] **Step 4:** PASS; `node --check` 3 file đã sửa.
- [ ] **Step 5:** Commit `fix(proxy-history): duplicate IP và offer không khả dụng vẫn tính IP đã dùng`.

### Task 7: Đồng bộ tài liệu và chạy toàn bộ

**Files:**
- Modify: `NON_OFFER_SLOT_RELEASE_RESEARCH.md` — thêm mục "Đã triển khai" liệt kê commit từng task; ghi P2 (`skip`) và F8 (offerwall) còn mở.
- Modify: `QA_TEST_CASES.md` — một case QA tay: popup quảng cáo trống tự đóng sau ~30s, tab chính không bị đóng.

- [ ] **Step 1:** `npm test` → toàn bộ PASS (test Chromium có thể skip nếu chưa cài; ghi rõ trong báo cáo).
- [ ] **Step 2:** Cập nhật hai tài liệu.
- [ ] **Step 3:** Commit `docs(non-offer): cập nhật trạng thái triển khai và QA`.
