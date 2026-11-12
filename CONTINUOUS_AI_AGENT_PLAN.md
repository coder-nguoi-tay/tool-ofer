# Kế hoạch: AI Agent liên tục theo từng tab offer

## 1. Mục tiêu

Mỗi tab offer có một phiên AI tồn tại xuyên suốt:

```text
Mở offer
→ Khởi tạo agent một lần
→ Đọc giao diện
→ Click/nhập/chọn đáp án
→ Xác minh kết quả
→ Chờ trang tải nếu cần nhưng không đóng agent
→ Đọc giao diện mới và tiếp tục
→ Hoàn tất offer hoặc người dùng dừng
→ Đóng agent và giải phóng tài nguyên
```

Không chấp nhận các hành vi sau:

- Tạo process AI lại sau mỗi vài thao tác.
- Gửi lại toàn bộ HTML và lịch sử sau mỗi bước.
- AI và autofill cùng điều khiển một tab.
- Click lặp vô hạn khi website không thay đổi.
- Giữ agent/tiến trình chạy sau khi tab đã đóng.

Hiện tùy chọn `continuous` mới chỉ có trên giao diện tại `ui/desktop/index.html`; chưa có nhánh xử lý tương ứng trong `src/`. Đây sẽ là điểm kích hoạt chế độ mới.

## 2. Kiến trúc đề xuất

Tạo nhóm module riêng:

```text
src/ai-assist/continuous/
├── start-continuous-agent.mjs
├── get-continuous-agent-state.mjs
├── stop-continuous-agent.mjs
├── run-agent-turn.mjs
├── run-agent-tool.mjs
├── verify-agent-action.mjs
├── wait-for-agent-page-change.mjs
├── build-agent-context.mjs
├── compact-agent-context.mjs
└── state/
    ├── agent-registry.mjs
    └── agent-lifecycle.mjs
```

### 2.1. `agent-registry.mjs`

Dùng `WeakMap<Page, AgentState>` để mỗi tab có đúng một agent.

`AgentState` gồm:

```js
{
  page,
  session,
  thread,
  abortController,
  status,
  offerUrl,
  record,
  actionCount,
  failureCount,
  lastPageSignature,
  lastActionSignature,
  startedAt,
  lastProgressAt
}
```

Các trạng thái:

- `initializing`: đang tạo thread/MCP.
- `observing`: đang đọc giao diện.
- `thinking`: đang chờ model.
- `acting`: đang thao tác.
- `verifying`: đang kiểm tra kết quả.
- `waiting_page`: trang đang tải, giữ nguyên phiên.
- `waiting_lead`: tạm dừng theo chính sách lead.
- `backing_off`: lỗi tạm thời, sẽ tiếp tục.
- `completed`: offer đã hoàn tất.
- `stopped`: người dùng hoặc app chủ động dừng.

Không dùng thêm một bộ trạng thái singleton song song với session hiện tại.

## 3. Giữ phiên AI và kết nối trình duyệt

### 3.1. `start-continuous-agent.mjs`

Nhiệm vụ:

1. Kiểm tra `page`, `session`, chế độ offer và cấu hình AI.
2. Nếu tab đã có agent thì trả agent hiện tại, không tạo thêm.
3. Đặt khóa `initializing` đồng bộ trước mọi `await`.
4. Xin một chỗ AI qua cơ chế capacity hiện có.
5. Tạo Codex thread và kết nối Playwright MCP qua CDP.
6. Gắn agent vào vòng đời tab.
7. Bắt đầu turn đầu tiên.

Tái sử dụng nền tảng tại `src/codex-form-agent/run-codex-form-agent.mjs`, nhưng tách phần tạo `Codex`, `thread`, MCP và `AbortController` ra khỏi hàm chạy một lần hiện tại.

### 3.2. `run-agent-turn.mjs`

Dùng `thread.runStreamed()` và xử lý event streaming:

- Tool bắt đầu/kết thúc.
- Kết quả từng thao tác.
- Trang thay đổi.
- Model trả phản hồi.
- Lỗi, timeout hoặc yêu cầu hủy.

Nguyên tắc:

- Trong lúc còn tiến triển, agent tiếp tục dùng tool trong cùng phiên.
- Nếu model kết thúc turn nhưng trang vẫn còn việc, gọi turn tiếp theo trên cùng thread, không tạo thread mới.
- Khi trang đang tải, dùng `browser_wait_for` hoặc bộ chờ DOM; không đóng phiên.
- `maxRounds` không còn giới hạn vòng đời của continuous agent. Chỉ giới hạn lỗi lặp và từng request/tool.

## 4. Đưa mọi thao tác qua một lớp kiểm soát chung

Hiện `playwright-mcp-human.cjs` mới ép nhập chậm và kiểm tra quyền repair. Cần mở rộng thành policy cho continuous agent.

### 4.1. `run-agent-tool.mjs`

Là điểm đi qua bắt buộc của mọi tool:

```text
AI yêu cầu tool
→ Xác minh agent còn sở hữu tab
→ Kiểm tra trạng thái Stop/lead/CAPTCHA
→ Kiểm tra selector và form scope
→ Chuẩn hóa thao tác
→ Thực thi bằng primitive hiện có
→ Xác minh DOM
→ Trả kết quả cho đúng agent
```

Quy tắc từng loại:

- **Nhập text:** dùng `humanType`, chỉ dùng dữ liệu record; không cho AI bịa email, phone, địa chỉ.
- **Select:** đi qua `selectOptionWithHumanInteraction`, hỗ trợ native/custom select và mở dropdown bằng chuột.
- **Checkbox nhiều đáp án:** đi qua survey solver để giữ quy tắc chọn đúng 2 ô ngẫu nhiên.
- **Radio/survey:** dùng `performSurveyAnswer`, chỉ tính khi website xác nhận.
- **Checkbox consent:** giữ cơ chế click nhãn khi input bị ẩn.
- **Submit/Next/Continue:** không cho raw `browser_click` vượt qua guard. Chuyển thành yêu cầu tới pipeline submit hiện tại; kiểm tra required/invalid/hidden/busy trước khi bấm.
- **Chờ trang:** không reset thread hoặc xóa lịch sử.

AI chỉ đề xuất ý định; quyền thực thi vẫn do app kiểm soát.

## 5. Phân quyền giữa AI và autofill

Đây là phần bắt buộc để tránh nhập/click hai lần.

### 5.1. Khi bật `continuous`

- Agent giữ quyền điều khiển tab từ màn đầu.
- Watcher autofill chỉ quan sát trạng thái, điều hướng, lead và vòng đời tab.
- Không chạy `fillVisibleForms()` song song với agent.
- Agent có thể gọi autofill như một công cụ nội bộ cho field đã biết.
- Submit vẫn do pipeline chung thực hiện.

### 5.2. Khi agent gặp lỗi tạm thời

- Giữ thread và chuyển sang `backing_off`.
- Không nhả ngay quyền điều khiển nếu chỉ là model chậm hoặc trang đang tải.
- Nếu không phục hồi được sau số lần quy định, mới chuyển quyền về autofill.
- Việc chuyển quyền phải đảm bảo request/tool cũ đã bị hủy trước.

### 5.3. Khi tắt continuous hoặc dùng `auto_on_stuck`

Giữ nguyên luồng hiện tại: autofill chạy trước, AI chỉ hỗ trợ khi bị kẹt.

## 6. Hàng đợi, ưu tiên lead và tài nguyên

Tái sử dụng `waitForAiCapacity()` và giới hạn hiện tại là 4 agent đồng thời.

Chính sách mới:

- Agent đang tiến triển không nhả chỗ sau mỗi hành động.
- Không bắt đầu lại từ đầu chỉ vì hết 15 giây trong hàng đợi.
- Nếu phải chờ chỗ khi khởi tạo, trạng thái là `queued`; watcher vẫn giữ tab và dữ liệu.
- IP đã có lead được ưu tiên, nhưng không cắt ngang một thao tác đang chạy của tab khác.
- Agent chờ trang hoặc chờ lead không tiêu request AI.
- Có giới hạn số agent được giữ trong bộ nhớ; agent idle lâu có thể giải phóng worker nhưng giữ checkpoint ngắn để phục hồi.
- Mọi nhả chỗ phải nằm trong `finally`, đúng một lần.

Không thể cam kết tuyệt đối không có thời gian chờ model. Mục tiêu là loại bỏ việc khởi tạo lại, gửi lại ngữ cảnh và xếp hàng lại giữa các bước.

## 7. Xử lý chờ và lỗi mà không mất ngữ cảnh

### 7.1. Trang đang tải

- Dùng sự kiện `DOMContentLoaded`, điều hướng main frame hoặc thay đổi DOM.
- Giữ nguyên `thread`, `record`, lịch sử hành động và `offerUrl`.
- Không gọi model liên tục trong lúc chưa có giao diện mới.

### 7.2. AI trả thao tác không hiệu quả

- Gửi lại cho cùng thread: thao tác nào thất bại, lý do và trạng thái hiện tại.
- Không thực hiện lại nguyên xi cùng action trên cùng signature.
- Sau nhiều thất bại liên tiếp, backoff rồi tiếp tục hoặc chuyển autofill.
- Không xóa lịch sử ngay khi một action thất bại.

### 7.3. Lỗi mạng, quota hoặc model

- Phân loại lỗi để chọn thời gian backoff.
- Không tạo hàng loạt request khi quota đã hết.
- Giữ checkpoint gồm URL, bước hiện tại, record, action gần nhất và lỗi gần nhất.
- Nếu bắt buộc tạo thread mới, chỉ gửi checkpoint/tóm tắt thay vì toàn bộ HTML từ đầu.

### 7.4. Context quá dài

`compact-agent-context.mjs` chỉ giữ:

- Offer và bước hiện tại.
- Các trường đã được website xác nhận.
- Câu hỏi đã trả lời.
- Các action thất bại cần tránh lặp.
- Lỗi validation hiện tại.

Không giữ HTML cũ của từng màn trong prompt.

## 8. Vòng đời và nút dừng

`stop-continuous-agent.mjs` phải:

1. Đặt trạng thái `stopped`.
2. Gọi `AbortController.abort()`.
3. Ngừng nhận tool mới ngay lập tức.
4. Hủy tool/wait đang chạy nếu API hỗ trợ.
5. Đóng kết nối MCP/thread theo vòng đời tab.
6. Giảm bộ đếm capacity đúng một lần.
7. Xóa callback, timer và tham chiếu không cần thiết.

Phải gọi khi:

- Đóng tab.
- Đóng browser.
- Bấm Stop/Đóng tất cả.
- Đổi record/offer không còn thuộc phiên cũ.
- Hoàn tất offer được xác nhận.

Không tự dừng vĩnh viễn chỉ vì DOM tạm thời đứng yên.

## 9. Giao diện và nhật ký

Dùng chế độ **Continuous** đã có trên giao diện.

Bổ sung:

- Trạng thái agent trên từng preview tab.
- Nút **Tạm dừng/Tiếp tục/Dừng AI** cho từng tab.
- Số thao tác đã xác minh.
- Thời điểm có tiến triển gần nhất.
- Lý do đang chờ: tải trang, lead, CAPTCHA, quota hoặc chỗ AI.
- Không hiển thị token, proxy credentials hoặc dữ liệu record đầy đủ.

Khi chọn Continuous, `Max Rounds` không còn áp dụng cho vòng đời agent; cần đổi nhãn hoặc vô hiệu hóa để tránh hiểu nhầm.

## 10. Thứ tự triển khai

### Giai đoạn 1 — Nền tảng vòng đời

- Tạo registry, start/stop, trạng thái theo tab.
- Kiểm tra không tạo hai agent cho cùng page.
- Hủy được agent khi Stop/đóng tab.
- Chưa đổi hành vi `auto_on_stuck`.

### Giai đoạn 2 — Persistent thread

- Tách thread/MCP khỏi `runCodexFormAgent()`.
- Cho phép nhiều turn trên cùng thread.
- Giữ ngữ cảnh khi trang đổi.
- Chờ trang không tạo lại process.

### Giai đoạn 3 — Kiểm soát thao tác

- Đưa type/click/select/check qua policy và primitive chung.
- Giữ guard submit, record, form scope, checkbox và lead.
- Một tab chỉ có một bên điều khiển tại một thời điểm.

### Giai đoạn 4 — Continuous end-to-end

- Kích hoạt từ màn đầu khi chọn Continuous.
- Tự chuyển bước qua nhiều trang.
- Xử lý trang tải chậm, lỗi validation và thao tác thất bại.
- Ưu tiên IP có lead.

### Giai đoạn 5 — UI, test và đóng gói

- Thêm trạng thái và nút điều khiển.
- Chạy test offline và toàn bộ suite.
- Chạy thử một funnel offline nhiều bước bằng Chromium thật.
- Sau khi đạt mới build và cập nhật đúng app trong `/Applications`.

## 11. Tiêu chí nghiệm thu

Tính năng chỉ được coi là hoàn thành khi:

1. Một offer nhiều màn chỉ khởi tạo thread/MCP một lần.
2. Chuyển trang không gửi lại toàn bộ ngữ cảnh ban đầu.
3. Trang tải chậm không làm agent thoát hoặc tạo agent mới.
4. Không có nhập/click trùng giữa AI và autofill.
5. Mỗi thao tác chỉ được tính khi website xác nhận.
6. Checkbox nhiều đáp án vẫn chọn đúng 2 ô ngẫu nhiên.
7. Submit không chạy khi form còn required/invalid/ẩn/disabled.
8. Stop và đóng tab hủy agent, nhả đúng chỗ AI, không còn timer/process chạy.
9. Nhiều tab không vượt giới hạn agent; IP có lead được ưu tiên.
10. `auto_on_stuck`, `heuristic_only`, `disabled`, manual và consent-only giữ hành vi cũ.
11. Test dùng fake AI transport cho kết quả deterministic; không phụ thuộc AI thật trong suite.
12. Toàn bộ test hiện có và test mới đều đạt.

## 12. Phạm vi triển khai đề xuất

Triển khai trước cho AdsPower/CDP vì đã có Codex + Playwright MCP. Sau khi ổn định mới mở rộng cho Chrome thường qua cùng CDP bridge.

Tài liệu này là kế hoạch triển khai; chưa thay đổi implementation cho tính năng continuous agent.

## 13. Kết quả nghiên cứu khả thi (2026-11-12)

Đối chiếu kế hoạch với code và thư viện đang cài. Chưa sửa implementation.

### 13.1. Điều kế hoạch nói đúng

- `continuous` chỉ có ở UI (`ui/desktop/index.html:1263` và cả `ui/mac/index.html:182`) và một comment trong `src/ai-assist/state/global-ai-config.mjs:4`. `run-ai-assist.mjs` / `inspect-and-fix-form-with-ai.mjs` chỉ rẽ nhánh `disabled` và `heuristic_only` → chọn Continuous hiện **chạy y như `auto_on_stuck`**.
- Giới hạn `MAX_CONCURRENT_AGT = 4`, `waitForAiCapacity(..., maxWaitMs = 15000)` trả `queue_timeout`, đã ưu tiên IP có lead (`src/ai-assist/wait-for-ai-capacity.mjs`).
- Codex SDK 0.163 có `thread.runStreamed()`, `startThread()`, `resumeThread(id)` và `AbortController` (`node_modules/@openai/codex-sdk/dist/index.d.ts:214,280,288`).

### 13.2. Vướng mắc 1 — "khởi tạo thread/MCP một lần" không làm được bằng SDK hiện tại

`@openai/codex-sdk` mỗi lần `run`/`runStreamed` **spawn một process `codex exec --experimental-json [resume <threadId>]` mới** (`dist/index.js:178,241,267`). Mỗi turn vì vậy cũng khởi động lại MCP Playwright (`startup_timeout_sec: 8` trong `run-codex-form-agent.mjs`). Thread chỉ giữ **lịch sử hội thoại**, không giữ process.

→ Tiêu chí nghiệm thu §11.1 và yêu cầu §1 "không tạo process AI lại sau mỗi vài thao tác" cần chọn một trong:

| Phương án | Giữ process | Rủi ro |
|---|---|---|
| A. **Một turn dài cho cả offer**: prompt yêu cầu agent tự lặp observe→act→verify qua nhiều màn trong cùng `runStreamed`; chỉ `resume` khi bị ngắt (lỗi/timeout/Stop) | Có, trong suốt turn | Turn dài nhiều phút; `tool_timeout_sec` từng tool vẫn 8s; cần watchdog phía app để abort khi không tiến triển |
| B. `codex app-server` (CLI 0.163 có, đánh dấu **experimental**) — JSON-RPC process sống lâu | Có | API chưa ổn định, đổi theo phiên bản CLI |
| C. Gọi model trực tiếp + vòng tool trong process app | Có | Phải dùng API key riêng (Codex đang chạy theo tài khoản `codex login`), viết lại vòng agent |

Đề xuất: **A** cho giai đoạn đầu (ít thay đổi nhất, dùng được SDK hiện có), giữ thiết kế để đổi sang B khi app-server ổn định.

### 13.3. Vướng mắc 2 — §4 "mọi tool đi qua run-agent-tool.mjs" bị chặn bởi ranh giới process

Tool Playwright MCP chạy **trong process con** (`playwright-mcp-human.cjs`, do Codex CLI spawn) với **kết nối CDP riêng** tới trình duyệt. Các primitive của app (`humanType`, `selectOptionWithHumanInteraction`, `performSurveyAnswer`, guard `submitFrameForm`, `frame._activeAutofillFormScope`, quy tắc Adsmith No) sống trong process app và làm việc trên đối tượng `Page` của app — process MCP không gọi được. Wrapper hiện chỉ vá `browser_type` (gõ chậm) và chính sách repair.

→ Cần thêm vào kế hoạch: **MCP server riêng của app cho thao tác**, theo đúng mẫu `mcp-server.mjs` (đã gọi app qua `appGet/appPost` tới `127.0.0.1:<port>`):

```text
Codex thread
 ├─ browser_snapshot / browser_wait_for   (Playwright MCP — chỉ ĐỌC)
 └─ autolead_fill_field / autolead_answer / autolead_select / autolead_submit / autolead_observe
        → HTTP nội bộ tới app → run-agent-tool.mjs → primitive hiện có trên Page của app
```

Tắt `browser_click`, `browser_type`, `browser_select_option` thô khi ở chế độ continuous. Đây là cách duy nhất để giữ guard submit, record, form scope, checkbox 2 ô và luật Adsmith như §4 yêu cầu. Endpoint nội bộ phải chỉ nghe loopback và kiểm tra token phiên (app đang có thể chạy `--public`/LAN).

### 13.4. Vướng mắc 3 — giữ chỗ AI suốt offer gây đói slot

Với 4 chỗ và 10–20 trình duyệt, "agent đang tiến triển không nhả chỗ" (§6) làm 4 tab giữ chỗ nhiều phút, các tab khác đứng chờ; hàng đợi hiện còn `queue_timeout` 15s. Cần chính sách cụ thể:

- Nhả chỗ khi `waiting_page` > ~5s, `waiting_lead`, `backing_off`, `queued` (không tiêu request).
- Hạn mức giữ chỗ liên tục (ví dụ 3 phút) rồi nhường lượt nếu có tab chờ; IP có lead ưu tiên khi cấp lại.
- Continuous không dùng `queue_timeout` 15s (chờ không giới hạn nhưng có trạng thái `queued` trên UI).

### 13.5. Vướng mắc 4 — chỉ AdsPower có CDP endpoint

`browserWebSocketUrl` chỉ được gán ở `open-ads-power-browser.mjs:114` (từ `startProfile`). Phiên Chrome thường mở bằng Playwright không có ws endpoint cho MCP → §12 (AdsPower trước) là bắt buộc, không chỉ là ưu tiên. Mở rộng Chrome cần mở `--remote-debugging-port` riêng cho từng profile (thêm rủi ro bị phát hiện, cổng trùng).

### 13.6. Các điểm cần bổ sung khác

- **Khóa quyền điều khiển**: watcher hiện có nhiều đường tự chạy thao tác ngoài `fillVisibleForms()` (`recoverEmptyProgress`, `repairVisibleFieldsFromRecord`, cổng AI khi stall trong `attach-autofill-page-watcher.mjs`). Cần một cờ duy nhất (ví dụ `page._uxController = 'agent' | 'autofill'`) kiểm tra ở đầu `fillPageForms` và mọi nhánh repair/AI của watcher.
- **Luật riêng theo site** (Adsmith No, financialhelp completion, Yes/No step): agent phải gọi các handler này như tool, không tự quyết; hiện `executeAction` trả `survey_owned_by_autofill` cho iframe Adsmith — continuous cần cùng quy tắc.
- **Compact context (§7.4)**: với SDK, lịch sử thread do Codex giữ — app **không cắt bớt được**; "compact" thực tế = mở thread mới với checkpoint tóm tắt. Nên ghi rõ.
- **Fake transport (§11.11)**: cần seam rõ ràng — một interface `createAgentTransport({ onEvent })` với bản thật (Codex SDK) và bản giả cho test, thay vì gọi `new Codex()` trực tiếp.
- **Nhật ký**: mỗi tool call của agent đi qua `session.addBrowserLog` (đã có coalescer), không ghi raw snapshot vào log.

### 13.7. Thứ tự đề xuất điều chỉnh

0. **Spike 1–2 ngày**: phương án A trên một funnel offline (AdsPower giả lập CDP bằng Chromium `--remote-debugging-port`), đo số process/turn, thời gian mỗi màn, token.
1. Giai đoạn 1 như kế hoạch (registry, start/stop, khóa quyền điều khiển).
2. MCP server thao tác của app (§13.3) + tắt tool click/type thô.
3. Turn dài + resume khi ngắt (§13.2-A), chính sách giữ/nhả chỗ (§13.4).
4. UI trạng thái/nút dừng; test fake transport; build.

Ước lượng: spike 1–2 ngày; triển khai đầy đủ ~6–9 ngày công (MCP server thao tác và khóa quyền điều khiển là phần tốn nhất).
