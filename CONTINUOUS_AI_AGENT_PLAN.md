# Kế hoạch: AI Agent liên tục theo từng tab offer

> **Trạng thái 2026-11-15:** đã có **bản đầu tích hợp agy** trong `src/continuous-agent/` (xem §6). Chưa có MCP nghiệp vụ, lease/generation, checkpoint, UI trạng thái; chưa soak. Mode `continuous` + `cliBinary: agy` chạy bản mới; mọi mode khác giữ nguyên luồng cũ.
>
> **Nguồn duy nhất** cho hiện trạng source, thiết kế chi tiết, rủi ro, nghiệp vụ bắt buộc và bộ test: [CONTINUOUS_AI_MCP_RESEARCH_REPORT.md](CONTINUOUS_AI_MCP_RESEARCH_REPORT.md) (gọi tắt **REPORT**). File này chỉ giữ mục tiêu, nguyên tắc đã chốt, phạm vi bản đầu, tiêu chí nghiệm thu và thứ tự làm. Khi hai file lệch nhau, theo REPORT.
>
> Bản kế hoạch cũ (§1–§14 trước đây) nằm ở [Phụ lục A](#phụ-lục-a--bản-kế-hoạch-cũ-đã-thay-thế) để tra cứu, không dùng làm căn cứ triển khai.

## 1. Mục tiêu

Mỗi tab offer có một phiên AI theo suốt workflow:

```text
Mở offer → gắn agent cho tab → đọc giao diện → điền/chọn/trả lời
→ xác minh → chờ trang mới (không đóng phiên, không chiếm lượt AI)
→ đọc giao diện mới và tiếp tục → hoàn tất hoặc người dùng dừng
→ thu hồi quyền, hủy turn/tool, giải phóng tài nguyên
```

Không chấp nhận:

- Tạo lại phiên AI hoặc gửi lại toàn bộ HTML/lịch sử sau mỗi vài thao tác.
- AI, autofill và người dùng cùng thao tác một tab.
- Click lặp khi website không đổi; tự submit lại khi chưa rõ kết quả lần trước.
- Agent, tool hoặc timer còn chạy sau khi tab đã đóng hoặc đã Stop.

## 2. Nguyên tắc thiết kế đã chốt

| # | Nguyên tắc | Chi tiết |
|---|---|---|
| 1 | Supervisor sống theo tab; turn AI có hạn thời gian. Không gọi model khi chỉ đang chờ trang/lead. | REPORT §6.1 |
| 2 | Mỗi tab một owner (`autofill` / `agent` / `manual` / `paused`) với lease + generation; kiểm lại trước mọi tác động và sau mỗi await quan trọng. Áp dụng cho mọi đường tự thao tác, không chỉ `fillVisibleForms`. | REPORT §6.3, P0-1 |
| 3 | Agent chỉ thao tác qua MCP nghiệp vụ hẹp của app (observe, fill_field, select_option, answer_question, save_subform, continue_step, wait_for_change). Tắt raw click/type/select/evaluate. Giá trị field do app lấy từ record. | REPORT §6.4, P0-2 |
| 4 | Worker Codex bị giới hạn quyền; không để shell/CDP đi vòng qua guard. Lời nhắc trong prompt không thay được guard. | REPORT P0-5 |
| 5 | Chỉ giữ capacity khi turn/tool đang chạy; ticket chờ phải hủy được; vẫn ưu tiên IP có lead. Không đổi timeout 15s thành Infinity. | REPORT §9, P1-4 |
| 6 | Stop = thu hồi lease → hủy turn/tool → đợi tác động in-flight kết thúc/timeout → nhả slot đúng một lần. | REPORT P0-4, §6.3 |
| 7 | Chỉ tính một thao tác khi website xác nhận; `unknown_outcome` không tự retry submit. | REPORT §6.4 |
| 8 | Luật site và lead policy chạy qua handler hiện có, không viết lại bằng prompt. | REPORT §7 |

## 3. Phạm vi bản đầu (đề xuất, chốt sau spike)

**Làm:**

- Owner/lease theo tab cho watcher, repair, late-progress, lead recovery; người dùng thao tác ở Screen View thì agent nhường quyền.
- MCP nghiệp vụ hẹp (§2 dòng 3), chỉ nghe loopback, có token theo phiên/lease.
- Transport: **SDK turn dài**, chỉ resume khi bị ngắt (REPORT §6.2, dòng 1), đi qua seam fake transport để test deterministic.
- Ticket chờ capacity hủy được; Stop theo tab; trạng thái cơ bản trên UI (`queued` / `acting` / `waiting_page` / `waiting_lead` / `failed`).
- Pilot local trên một engine. MCP nghiệp vụ thao tác qua `Page` của app nên không bắt buộc engine có CDP endpoint (REPORT §10).

**Chưa làm, thêm khi có nhu cầu:**

| Hạng mục | Thêm khi |
|---|---|
| Worker `codex app-server` sống lâu | Spike đo được việc spawn lại khi resume là nút thắt, hoặc cần process sống lâu thật |
| Checkpoint bền qua app restart | Có yêu cầu resume sau restart (hiện app reset về idle khi khởi động, REPORT §8) |
| Pause/Resume theo tab | Stop không đủ cho vận hành thực tế |
| GoLogin Cloud / worker trên máy chủ | Pilot local đạt (REPORT §10) |
| Pool worker, dynamic tools | Có số đo chứng minh cần |

Soak 24h là điều kiện trước khi gọi tính năng "sẵn sàng 24/7", không phải điều kiện cho pilot.

## 4. Tiêu chí nghiệm thu

1. Mọi thời điểm một tab chỉ có một owner; hai lệnh start đồng thời chỉ tạo một owner và một thread binding.
2. Thread được giữ qua nhiều màn; chuyển màn không gửi lại full HTML/lịch sử. Số process mỗi turn/resume được đo và ghi lại.
3. Trang tải chậm hoặc đang chờ lead: agent không thoát, không tạo agent mới, không chiếm slot AI.
4. Không có nhập/click trùng giữa AI, autofill và người dùng.
5. `tools/list` của worker không có raw click/type/evaluate hay tool quản trị; worker không có đường vòng qua shell/CDP.
6. Kết quả thao tác phân biệt `verified` / `progressed` / `blocked` / `stale_action` / `cancelled` / `unknown_outcome`; tool trả muộn sau khi đổi màn, đổi record hoặc refill bị loại.
7. Checkbox nhiều đáp án chọn đúng 2 ô ngẫu nhiên; không submit khi form còn required/invalid/hidden/disabled/busy; Adsmith No, Yes/No, Save trước Continue chạy qua handler hiện có.
8. Stop/đóng tab: thu hồi quyền ngay, nhả slot đúng một lần, không còn timer/process/listener.
9. Nhiều tab: tối đa 4 lượt active, ticket chờ hủy được, IP có lead vẫn được ưu tiên.
10. Lead policy giữ nguyên như REPORT §7; `auto_on_stuck`, `heuristic_only`, `disabled`, manual, `consent_only` giữ hành vi cũ.
11. Test dùng fake transport, không phụ thuộc AI thật; test mới được đăng ký vào `TEST_FILES`; toàn bộ suite đạt.

## 5. Thứ tự làm

| Bước | Nội dung | Tương ứng REPORT §13 |
|---|---|---|
| 0 | Spike: fake transport + MCP hẹp trên fixture offline nhiều màn; đo process/turn, thời gian mỗi màn, token. Chốt turn dài hay app-server. | Giai đoạn 0 |
| 1 | Owner/lease, Stop, takeover Screen View | Giai đoạn 1 |
| 2 | MCP nghiệp vụ qua handler/primitive của app | Giai đoạn 2 |
| 3 | Transport turn dài + resume + capacity ticket | Giai đoạn 3 |
| 4 | Pilot local một form QA với AI thật, giới hạn thời gian/token; không gửi offer/lead thật | Giai đoạn 5 |

Sau bản đầu: REPORT giai đoạn 4 (checkpoint/quota breaker), 6 (nhiều tab, soak), 7 (cloud), 8 (phát hành). Chưa chốt ngày công trước khi có kết quả spike.

Các quyết định còn mở: REPORT §14.

## 6. Bản đầu đã làm: agy stream (2026-11-15)

Thư mục riêng `src/continuous-agent/`; chỉ import lại (không sửa) `readVisiblePageState`, `inspectAiStateGate`, `waitForAiCapacity`, `executeAction`, `parseActions`. Sửa luồng cũ đúng 3 chỗ (5 dòng): hook `startContinuousAgent` trong `attach-autofill.mjs` (no-op nếu không phải mode continuous) và guard `page._continuousAgent` ở `run-ai-assist.mjs`, `inspect-and-fix-form-with-ai.mjs`.

- **Transport:** `agy --input-format stream-json --output-format stream-json`, một process sống cho cả tab; mỗi lượt một dòng `{"event":"user","message":{"content":...}}`, nhận một event `result`. Hội thoại giữ trong process → lượt sau chỉ gửi giao diện mới. Đã chạy thật: 2 màn, 1 conversation, ~3–5s/lượt.
- **Thực thi:** agy chỉ trả JSON action; app chạy qua `executeAction` (`allowSubmit:false`, `providedValuesOnly:true`) nên giá trị luôn lấy từ record, guard submit/scope/Adsmith giữ nguyên. Nút gửi/Continue vẫn do pipeline autofill bấm.
- **Quyền tab:** dùng lại cờ `_aiAssistRunning` mà watcher đã tôn trọng. AI giữ tab khi đang thực thi, nhả + `triggerAutofillScan()` để autofill gửi, rồi chờ giao diện đổi (không gọi model, không giữ chỗ AI). **Đây là luân phiên, chưa phải lease độc quyền** (§2 dòng 2 còn mở).
- **Capacity:** dùng chung `agtRunningCount`; chỉ giữ trong lúc agy trả lời; chờ chỗ thì lặp lại (trạng thái `queued`), không bỏ tab sau 15s.
- **Lỗi:** backoff lũy thừa (tối đa 5 phút), không đổi provider, không thoát; giao diện đứng yên 3 lượt thì `blockAiForState` và chờ đổi. Stop/đóng tab: abort + SIGKILL agy + nhả cờ; process thoát cũng giết agy. Nút Stop/Đóng tất cả (`/stop`, `/close` → `closeActiveBrowsers`) gọi `stopAllContinuousAgents`; mọi đường đóng phiên lẻ được watchdog 1s trong agent bắt (hủy lượt đang bay, nhả capacity). Quá 25 lượt thì mở hội thoại mới (context cộng dồn).
- **Test:** `tests/continuous-agent.test.mjs` (fake transport/child + Chromium offline, trong `TEST_FILES`); `tests/manual/continuous-agy-smoke.mjs` chạy agy thật.

**Transport API (URL + key):** `api-chat-session.mjs` gọi endpoint OpenAI chat-completions (base URL + Bearer key + model); app giữ lịch sử (lượt đầu + đuôi 4 message). Cấu hình ở `Config/agent-config.json` trong thư mục dữ liệu app (chmod 600), tách khỏi `ai-config.json`; API `GET/POST /agent/api/config`, `POST /agent/api/test` (ghi/test chỉ loopback, GET không trả key); biến môi trường `AUTOLEAD_AGENT_API_URL/KEY/MODEL` ghi đè. Chỉ https (http cho localhost). Hỗ trợ 3 giao thức qua `apiFormat`: `openai` (mặc định), `anthropic` (Messages, header `x-api-key`), `gemini` (generateContent, header `x-goog-api-key`); URL có thể là base hoặc endpoint đầy đủ của gateway tùy chỉnh. Thiếu/sai cấu hình thì báo log, không âm thầm đổi sang agy. Với API transport, rủi ro tool của agy không áp dụng (model chỉ trả text).

**Rủi ro còn mở (REPORT P0-5):** agy có sẵn tool shell/file/browser và `permission_mode: always-proceed`; `--mode plan` không đổi điều đó. Đã giảm bằng cwd rỗng riêng, `--sandbox`, prompt cấm dùng tool, nhưng chưa chặn được ở mức cấu hình. Cần tìm cách khóa tool (settings/agent) trước khi chạy rộng.

---

## Phụ lục A — Bản kế hoạch cũ (đã thay thế)

Giữ nguyên văn để tra cứu. Số mục trong phụ lục là số cũ; các tham chiếu `§x` bên trong phụ lục trỏ tới số cũ. **Không triển khai theo phụ lục.**

| Mục cũ | Trạng thái | Thay bằng |
|---|---|---|
| A.1 Mục tiêu | Đã chuyển lên §1 | §1 |
| A.2 Cây module, registry `WeakMap<Page>` | Thay thế: không tạo trước module; WeakMap không giữ được khi Page bị thay lúc reconnect | §2, REPORT §6.3, §11 |
| A.3 Giữ phiên, Playwright MCP qua CDP để thao tác | Thay thế: SDK chạy lại process mỗi lần run/resume; raw MCP không thao tác | REPORT §6.1–6.2 |
| A.4 `run-agent-tool` gọi trực tiếp primitive | Không khả thi: tool chạy ở process khác | §2 dòng 3, REPORT P0-2 |
| A.5 Phân quyền AI/autofill | Thay thế bằng owner/lease | REPORT §6.3 |
| A.6 Agent không nhả slot | Thay thế: chỉ giữ slot khi đang hoạt động | §2 dòng 5, REPORT §9 |
| A.7 Chờ/lỗi/compact context | Thay thế: app không cắt được lịch sử thread của SDK | REPORT §8–9 |
| A.8 Stop | Thay thế | §2 dòng 6, REPORT P0-4 |
| A.9 UI/nhật ký | Còn đúng một phần | §3, REPORT §9 |
| A.10 Thứ tự | Thay thế | §5, REPORT §13 |
| A.11 Nghiệm thu | Thay thế | §4 |
| A.12 AdsPower trước | Lỗi thời: GoLogin cũng có CDP; MCP nghiệp vụ không cần CDP | §3, REPORT §10 |
| A.13 Khả thi 2026-11-12 | Đã gộp vào REPORT. A.13.5 sai; ước lượng ngày công ở A.13.7 hủy | REPORT §5–6 |
| A.14 Phiên Kimi 2026-11-15 | Đã gộp vào REPORT | REPORT toàn bộ |

### A.1. Mục tiêu

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

### A.2. Kiến trúc đề xuất

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

#### A.2.1. `agent-registry.mjs`

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

### A.3. Giữ phiên AI và kết nối trình duyệt

#### A.3.1. `start-continuous-agent.mjs`

Nhiệm vụ:

1. Kiểm tra `page`, `session`, chế độ offer và cấu hình AI.
2. Nếu tab đã có agent thì trả agent hiện tại, không tạo thêm.
3. Đặt khóa `initializing` đồng bộ trước mọi `await`.
4. Xin một chỗ AI qua cơ chế capacity hiện có.
5. Tạo Codex thread và kết nối Playwright MCP qua CDP.
6. Gắn agent vào vòng đời tab.
7. Bắt đầu turn đầu tiên.

Tái sử dụng nền tảng tại `src/codex-form-agent/run-codex-form-agent.mjs`, nhưng tách phần tạo `Codex`, `thread`, MCP và `AbortController` ra khỏi hàm chạy một lần hiện tại.

#### A.3.2. `run-agent-turn.mjs`

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

### A.4. Đưa mọi thao tác qua một lớp kiểm soát chung

Hiện `playwright-mcp-human.cjs` mới ép nhập chậm và kiểm tra quyền repair. Cần mở rộng thành policy cho continuous agent.

#### A.4.1. `run-agent-tool.mjs`

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

### A.5. Phân quyền giữa AI và autofill

Đây là phần bắt buộc để tránh nhập/click hai lần.

#### A.5.1. Khi bật `continuous`

- Agent giữ quyền điều khiển tab từ màn đầu.
- Watcher autofill chỉ quan sát trạng thái, điều hướng, lead và vòng đời tab.
- Không chạy `fillVisibleForms()` song song với agent.
- Agent có thể gọi autofill như một công cụ nội bộ cho field đã biết.
- Submit vẫn do pipeline chung thực hiện.

#### A.5.2. Khi agent gặp lỗi tạm thời

- Giữ thread và chuyển sang `backing_off`.
- Không nhả ngay quyền điều khiển nếu chỉ là model chậm hoặc trang đang tải.
- Nếu không phục hồi được sau số lần quy định, mới chuyển quyền về autofill.
- Việc chuyển quyền phải đảm bảo request/tool cũ đã bị hủy trước.

#### A.5.3. Khi tắt continuous hoặc dùng `auto_on_stuck`

Giữ nguyên luồng hiện tại: autofill chạy trước, AI chỉ hỗ trợ khi bị kẹt.

### A.6. Hàng đợi, ưu tiên lead và tài nguyên

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

### A.7. Xử lý chờ và lỗi mà không mất ngữ cảnh

#### A.7.1. Trang đang tải

- Dùng sự kiện `DOMContentLoaded`, điều hướng main frame hoặc thay đổi DOM.
- Giữ nguyên `thread`, `record`, lịch sử hành động và `offerUrl`.
- Không gọi model liên tục trong lúc chưa có giao diện mới.

#### A.7.2. AI trả thao tác không hiệu quả

- Gửi lại cho cùng thread: thao tác nào thất bại, lý do và trạng thái hiện tại.
- Không thực hiện lại nguyên xi cùng action trên cùng signature.
- Sau nhiều thất bại liên tiếp, backoff rồi tiếp tục hoặc chuyển autofill.
- Không xóa lịch sử ngay khi một action thất bại.

#### A.7.3. Lỗi mạng, quota hoặc model

- Phân loại lỗi để chọn thời gian backoff.
- Không tạo hàng loạt request khi quota đã hết.
- Giữ checkpoint gồm URL, bước hiện tại, record, action gần nhất và lỗi gần nhất.
- Nếu bắt buộc tạo thread mới, chỉ gửi checkpoint/tóm tắt thay vì toàn bộ HTML từ đầu.

#### A.7.4. Context quá dài

`compact-agent-context.mjs` chỉ giữ:

- Offer và bước hiện tại.
- Các trường đã được website xác nhận.
- Câu hỏi đã trả lời.
- Các action thất bại cần tránh lặp.
- Lỗi validation hiện tại.

Không giữ HTML cũ của từng màn trong prompt.

### A.8. Vòng đời và nút dừng

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

### A.9. Giao diện và nhật ký

Dùng chế độ **Continuous** đã có trên giao diện.

Bổ sung:

- Trạng thái agent trên từng preview tab.
- Nút **Tạm dừng/Tiếp tục/Dừng AI** cho từng tab.
- Số thao tác đã xác minh.
- Thời điểm có tiến triển gần nhất.
- Lý do đang chờ: tải trang, lead, CAPTCHA, quota hoặc chỗ AI.
- Không hiển thị token, proxy credentials hoặc dữ liệu record đầy đủ.

Khi chọn Continuous, `Max Rounds` không còn áp dụng cho vòng đời agent; cần đổi nhãn hoặc vô hiệu hóa để tránh hiểu nhầm.

### A.10. Thứ tự triển khai

#### A.Giai đoạn 1 — Nền tảng vòng đời

- Tạo registry, start/stop, trạng thái theo tab.
- Kiểm tra không tạo hai agent cho cùng page.
- Hủy được agent khi Stop/đóng tab.
- Chưa đổi hành vi `auto_on_stuck`.

#### A.Giai đoạn 2 — Persistent thread

- Tách thread/MCP khỏi `runCodexFormAgent()`.
- Cho phép nhiều turn trên cùng thread.
- Giữ ngữ cảnh khi trang đổi.
- Chờ trang không tạo lại process.

#### A.Giai đoạn 3 — Kiểm soát thao tác

- Đưa type/click/select/check qua policy và primitive chung.
- Giữ guard submit, record, form scope, checkbox và lead.
- Một tab chỉ có một bên điều khiển tại một thời điểm.

#### A.Giai đoạn 4 — Continuous end-to-end

- Kích hoạt từ màn đầu khi chọn Continuous.
- Tự chuyển bước qua nhiều trang.
- Xử lý trang tải chậm, lỗi validation và thao tác thất bại.
- Ưu tiên IP có lead.

#### A.Giai đoạn 5 — UI, test và đóng gói

- Thêm trạng thái và nút điều khiển.
- Chạy test offline và toàn bộ suite.
- Chạy thử một funnel offline nhiều bước bằng Chromium thật.
- Sau khi đạt mới build và cập nhật đúng app trong `/Applications`.

### A.11. Tiêu chí nghiệm thu

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

### A.12. Phạm vi triển khai đề xuất

Triển khai trước cho AdsPower/CDP vì đã có Codex + Playwright MCP. Sau khi ổn định mới mở rộng cho Chrome thường qua cùng CDP bridge.

Tài liệu này là kế hoạch triển khai; chưa thay đổi implementation cho tính năng continuous agent.

### A.13. Kết quả nghiên cứu khả thi (2026-11-12)

Đối chiếu kế hoạch với code và thư viện đang cài. Chưa sửa implementation.

#### A.13.1. Điều kế hoạch nói đúng

- `continuous` chỉ có ở UI (`ui/desktop/index.html:1263` và cả `ui/mac/index.html:182`) và một comment trong `src/ai-assist/state/global-ai-config.mjs:4`. `run-ai-assist.mjs` / `inspect-and-fix-form-with-ai.mjs` chỉ rẽ nhánh `disabled` và `heuristic_only` → chọn Continuous hiện **chạy y như `auto_on_stuck`**.
- Giới hạn `MAX_CONCURRENT_AGT = 4`, `waitForAiCapacity(..., maxWaitMs = 15000)` trả `queue_timeout`, đã ưu tiên IP có lead (`src/ai-assist/wait-for-ai-capacity.mjs`).
- Codex SDK 0.163 có `thread.runStreamed()`, `startThread()`, `resumeThread(id)` và `AbortController` (`node_modules/@openai/codex-sdk/dist/index.d.ts:214,280,288`).

#### A.13.2. Vướng mắc 1 — "khởi tạo thread/MCP một lần" không làm được bằng SDK hiện tại

`@openai/codex-sdk` mỗi lần `run`/`runStreamed` **spawn một process `codex exec --experimental-json [resume <threadId>]` mới** (`dist/index.js:178,241,267`). Mỗi turn vì vậy cũng khởi động lại MCP Playwright (`startup_timeout_sec: 8` trong `run-codex-form-agent.mjs`). Thread chỉ giữ **lịch sử hội thoại**, không giữ process.

→ Tiêu chí nghiệm thu §11.1 và yêu cầu §1 "không tạo process AI lại sau mỗi vài thao tác" cần chọn một trong:

| Phương án | Giữ process | Rủi ro |
|---|---|---|
| A. **Một turn dài cho cả offer**: prompt yêu cầu agent tự lặp observe→act→verify qua nhiều màn trong cùng `runStreamed`; chỉ `resume` khi bị ngắt (lỗi/timeout/Stop) | Có, trong suốt turn | Turn dài nhiều phút; `tool_timeout_sec` từng tool vẫn 8s; cần watchdog phía app để abort khi không tiến triển |
| B. `codex app-server` (CLI 0.163 có, đánh dấu **experimental**) — JSON-RPC process sống lâu | Có | API chưa ổn định, đổi theo phiên bản CLI |
| C. Gọi model trực tiếp + vòng tool trong process app | Có | Phải dùng API key riêng (Codex đang chạy theo tài khoản `codex login`), viết lại vòng agent |

Đề xuất: **A** cho giai đoạn đầu (ít thay đổi nhất, dùng được SDK hiện có), giữ thiết kế để đổi sang B khi app-server ổn định.

#### A.13.3. Vướng mắc 2 — §4 "mọi tool đi qua run-agent-tool.mjs" bị chặn bởi ranh giới process

Tool Playwright MCP chạy **trong process con** (`playwright-mcp-human.cjs`, do Codex CLI spawn) với **kết nối CDP riêng** tới trình duyệt. Các primitive của app (`humanType`, `selectOptionWithHumanInteraction`, `performSurveyAnswer`, guard `submitFrameForm`, `frame._activeAutofillFormScope`, quy tắc Adsmith No) sống trong process app và làm việc trên đối tượng `Page` của app — process MCP không gọi được. Wrapper hiện chỉ vá `browser_type` (gõ chậm) và chính sách repair.

→ Cần thêm vào kế hoạch: **MCP server riêng của app cho thao tác**, theo đúng mẫu `mcp-server.mjs` (đã gọi app qua `appGet/appPost` tới `127.0.0.1:<port>`):

```text
Codex thread
 ├─ browser_snapshot / browser_wait_for   (Playwright MCP — chỉ ĐỌC)
 └─ autolead_fill_field / autolead_answer / autolead_select / autolead_submit / autolead_observe
        → HTTP nội bộ tới app → run-agent-tool.mjs → primitive hiện có trên Page của app
```

Tắt `browser_click`, `browser_type`, `browser_select_option` thô khi ở chế độ continuous. Đây là cách duy nhất để giữ guard submit, record, form scope, checkbox 2 ô và luật Adsmith như §4 yêu cầu. Endpoint nội bộ phải chỉ nghe loopback và kiểm tra token phiên (app đang có thể chạy `--public`/LAN).

#### A.13.4. Vướng mắc 3 — giữ chỗ AI suốt offer gây đói slot

Với 4 chỗ và 10–20 trình duyệt, "agent đang tiến triển không nhả chỗ" (§6) làm 4 tab giữ chỗ nhiều phút, các tab khác đứng chờ; hàng đợi hiện còn `queue_timeout` 15s. Cần chính sách cụ thể:

- Nhả chỗ khi `waiting_page` > ~5s, `waiting_lead`, `backing_off`, `queued` (không tiêu request).
- Hạn mức giữ chỗ liên tục (ví dụ 3 phút) rồi nhường lượt nếu có tab chờ; IP có lead ưu tiên khi cấp lại.
- Continuous không dùng `queue_timeout` 15s (chờ không giới hạn nhưng có trạng thái `queued` trên UI).

#### A.13.5. Vướng mắc 4 — chỉ AdsPower có CDP endpoint

`browserWebSocketUrl` chỉ được gán ở `open-ads-power-browser.mjs:114` (từ `startProfile`). Phiên Chrome thường mở bằng Playwright không có ws endpoint cho MCP → §12 (AdsPower trước) là bắt buộc, không chỉ là ưu tiên. Mở rộng Chrome cần mở `--remote-debugging-port` riêng cho từng profile (thêm rủi ro bị phát hiện, cổng trùng).

#### A.13.6. Các điểm cần bổ sung khác

- **Khóa quyền điều khiển**: watcher hiện có nhiều đường tự chạy thao tác ngoài `fillVisibleForms()` (`recoverEmptyProgress`, `repairVisibleFieldsFromRecord`, cổng AI khi stall trong `attach-autofill-page-watcher.mjs`). Cần một cờ duy nhất (ví dụ `page._uxController = 'agent' | 'autofill'`) kiểm tra ở đầu `fillPageForms` và mọi nhánh repair/AI của watcher.
- **Luật riêng theo site** (Adsmith No, financialhelp completion, Yes/No step): agent phải gọi các handler này như tool, không tự quyết; hiện `executeAction` trả `survey_owned_by_autofill` cho iframe Adsmith — continuous cần cùng quy tắc.
- **Compact context (§7.4)**: với SDK, lịch sử thread do Codex giữ — app **không cắt bớt được**; "compact" thực tế = mở thread mới với checkpoint tóm tắt. Nên ghi rõ.
- **Fake transport (§11.11)**: cần seam rõ ràng — một interface `createAgentTransport({ onEvent })` với bản thật (Codex SDK) và bản giả cho test, thay vì gọi `new Codex()` trực tiếp.
- **Nhật ký**: mỗi tool call của agent đi qua `session.addBrowserLog` (đã có coalescer), không ghi raw snapshot vào log.

#### A.13.7. Thứ tự đề xuất điều chỉnh

0. **Spike 1–2 ngày**: phương án A trên một funnel offline (AdsPower giả lập CDP bằng Chromium `--remote-debugging-port`), đo số process/turn, thời gian mỗi màn, token.
1. Giai đoạn 1 như kế hoạch (registry, start/stop, khóa quyền điều khiển).
2. MCP server thao tác của app (§13.3) + tắt tool click/type thô.
3. Turn dài + resume khi ngắt (§13.2-A), chính sách giữ/nhả chỗ (§13.4).
4. UI trạng thái/nút dừng; test fake transport; build.

Ước lượng: spike 1–2 ngày; triển khai đầy đủ ~6–9 ngày công (MCP server thao tác và khóa quyền điều khiển là phần tốn nhất).

### A.14. Tiếp tục nghiên cứu phiên Kimi — AI/MCP vận hành 24/7 (2026-11-15)

#### A.14.1. Điểm tiếp nhận và phạm vi

Đã đọc phiên Kimi `session_d7afa0bf-5373-46d3-a182-bb7ae0886746`. Yêu cầu cuối: nghiên cứu lại AI kết nối MCP điều khiển autofill 24/24. Turn 42 dừng vì hết quota; lần Edit thêm nghiên cứu bị lỗi `old_string not found`, nên phần đó chưa được ghi vào file. Phần này tiếp tục từ yêu cầu đó, không phải triển khai kế hoạch cũ ngay lập tức.

Chỉ đọc source, kiểm tra CLI/help, sinh schema giao thức trong `/tmp` và đọc tài liệu chính thức. Chưa chạy AI thật, chưa khởi động app-server/daemon, chưa sửa runtime/build app.

#### A.14.2. Những gì xác minh lại được

| Hạng mục | Hiện trạng | Kết luận |
|---|---|---|
| Continuous | Có lựa chọn UI desktop/mac/mini; tìm trong src chưa thấy controller continuous | Chưa coi checkbox là tính năng đã chạy từ đầu tới cuối |
| SDK cài trong dự án | `@openai/codex-sdk` 0.163.0 | `runStreamedInternal` gọi exec.run; exec spawn process cho mỗi lượt run/resume |
| CLI hệ thống | `/opt/homebrew/bin/codex`, 0.169.0 | Khác phiên bản SDK; không suy từ CLI hệ thống sang binary SDK đóng gói |
| App server | CLI có `app-server`, daemon/proxy, schema generator; help vẫn ghi experimental | Có thể nghiên cứu process sống lâu, chưa đủ bằng chứng vận hành ổn định 24/7 |
| Schema local | Xuất thành công 329 JSON schema, không gọi model | Có thread/start, thread/resume, turn/start, turn/interrupt, thread/compact/start |
| Playwright MCP | 0.0.83, wrapper có policy repair-only | Chưa có cổng thao tác continuous dùng primitive của app |
| AI capacity | 4 lượt đồng thời, hàng đợi mặc định 15s | Phải quản lý lượt hoạt động, không giữ cả bốn chỗ khi chờ lead |
| GoLogin | Đã có `browserWebSocketUrl` và runtime CDP | Nhận định §13.5 “chỉ AdsPower có endpoint” đã lỗi thời |
| MCP gốc | `mcp-server.mjs` chủ yếu điều khiển cấp app/queue | Không đưa nguyên bộ tool app_stop/mua proxy cho agent điền một tab |

Bằng chứng SDK: `node_modules/@openai/codex-sdk/dist/index.js`, các đoạn `runStreamedInternal`, `commandArgs = ["exec", "--experimental-json"]`, `spawn(...)`. Giữ threadId giữ hội thoại, không giữ process. Không giả định cùng thread sẽ không tính lại token.

Tài liệu App Server mô tả initialize, thread/start/resume, turn/start/interrupt và thread/compact/start. Schema local 0.169.0 xác nhận các tên đó; trường/API experimental cần xuất schema riêng khi dùng, không sao chép mọi ví dụ từ web vào binary khác phiên bản. [OpenAI App Server](https://developers.openai.com/codex/app-server/)

#### A.14.3. Thiết kế phù hợp với “24/7”

Tách ba vòng đời:

1. Supervisor của app: sống theo session/tab; quan sát navigation/DOM/lead, quản lý quyền điều khiển, checkpoint và retry.
2. Worker Codex: một process app-server được quản lý, phục vụ các thread; được khởi động lại khi crash. Không cần một process cho mỗi tab.
3. Turn AI: có hạn thời gian và công việc cụ thể; kết thúc/chờ khi chưa có trạng thái mới. Không giữ một request model liên tục 24 giờ.

```text
Browser event → supervisor theo tab → hàng đợi lượt AI
    → Codex thread/turn → MCP thao tác của app
    → guard + primitive hiện có → xác minh → checkpoint
    → chờ event mới hoặc lên lịch lượt tiếp
```

Một process phục vụ nhiều thread là phương án phải benchmark, không phải kết quả đã đo. Chỉ tạo pool nếu đo được bottleneck; không tạo mặc định 10–20 worker để tương ứng 10–20 browser.

Mất mạng/quota/auth: chuyển trạng thái rõ ràng, ngừng gọi lặp và giữ browser theo policy hiện tại. Supervisor không tự đóng IP có lead để cứu AI. “24/7” phụ thuộc app/worker còn chạy, máy không sleep, mạng và quota; app-server không tự biến worker thành dịch vụ cloud.

#### A.14.4. Quyền thao tác phải khóa tại app

Mỗi tab chỉ có một chủ điều khiển. Dùng registry runtime theo Page và một lease có generation tăng khi đổi owner/record/navigation chính/CDP context. Mỗi action mang định danh session/tab, generation, actionId và revision của trạng thái đã quan sát.

Trước thao tác: kiểm owner, Stop, lead, record, frame/scope còn sống và trạng thái form. Sau mỗi await quan trọng: kiểm lại lease trước tác động tiếp. Tool cũ trả muộn phải bị loại, không được click lên màn mới hoặc tab khác.

Không dùng URL làm định danh tab: nhiều tab có thể cùng URL. Khi nối lại CDP, object Page mới cần được bind lại theo dữ kiện phiên; không coi URL trùng là đủ để gán record.

MCP continuous chỉ công bố tool công việc hẹp: observe, fill_field, select, answer, save_subform, continue, wait_for_change. Fill nhận field handle/record key; app tự lấy giá trị chuẩn. Không cấp evaluate tùy ý, raw click/type/navigation hoặc tool đóng browser/mua proxy cho worker. Chỉ đặt prompt “không submit sai” không đủ bảo vệ.

Observe và action nên dùng cùng bộ định danh element/frame do app phát ra; không giả định ref trong snapshot Playwright MCP có thể dùng thẳng với Page object của app. Token hẹp theo phiên/lease; tool thao tác chỉ gọi loopback hoặc IPC riêng, không mở đường write mới qua HTTP public hiện tại.

Giữ nguyên ngoại lệ Adsmith No, Yes/No fallback, Save trước Continue, consent, scope iframe và shouldStopAfterLead. Agent gọi handler nghiệp vụ tương ứng; không tự quyết lại luật của site. Verify trả `acted`, `verified`, `progress`, `blocker`, không tăng đếm chỉ vì tool đã trả thành công.

#### A.14.5. Chờ, chia lượt và hủy

- Một thread logic/tab; không đồng nghĩa luôn chiếm một capacity slot.
- Chỉ giữ capacity khi turn/tool đang hoạt động; nhả đúng một lần trong finally. Chờ DOM/lead/quota ở supervisor không chiếm chỗ model.
- Dùng hàng đợi có thể hủy theo lease; giữ ưu tiên lead hiện có. Thêm quy tắc chống đói chỉ sau khi xác định rõ mức ưu tiên, không âm thầm đổi hành vi cũ.
- Không truyền Infinity vào waiter hiện tại để chữa timeout. Continuous có ticket được đánh thức lại; không quay vòng xin chỗ mỗi nhịp watcher.
- Giới hạn thời gian turn/thao tác và thời gian không tiến triển là riêng; không dùng Max Rounds để kết thúc toàn bộ browser workflow.
- Stop: thu hồi lease ngay, chặn tool mới, yêu cầu interrupt và đợi tool in-flight kết thúc/timeout rồi mới cho controller khác thao tác. Không thể bảo đảm rút lại click đã được browser tiếp nhận.
- Nếu worker crash: thu hồi lease trước restart; không replay submit cũ nếu chưa biết kết quả. Đọc DOM/validation/network evidence trước hành động tiếp.

#### A.14.6. Checkpoint, quota và log

WeakMap chỉ đủ cho runtime; không khôi phục qua app restart. Checkpoint bền vững cần version/schema, session/profile/tab identity, record ID, threadId, URL/step revision, kết quả action đã xác minh và action chưa rõ kết quả. Không lưu token, endpoint có credential hoặc toàn bộ record/HTML vào nhật ký.

Sau restart: người dùng vẫn phải được bảo đảm app không tự chạy lại khi trước đó đã Stop; chỉ resume theo chính sách được bật. Phải quan sát lại DOM, bind tab/record và cấp lease mới trước thao tác.

Compaction của app-server và checkpoint nghiệp vụ là hai lớp khác nhau. Compact hội thoại không thay việc ghi trạng thái submit/lead; checkpoint vẫn cần khi thread hỏng hoặc phải tạo thread mới.

Chế độ access log hiện tại cần giữ ít log: chỉ chuyển trạng thái quan trọng/lỗi terminal, chống lặp cùng lý do. UI lấy trạng thái waiting_page/queued/quota/lead từ runtime; không ghi từng mouse move hoặc raw MCP snapshot. Có bộ đếm lượt/token và backoff/circuit breaker khi lỗi provider để tránh trường hợp hết quota mà app vẫn gọi liên tục.

#### A.14.7. File dự kiến cần chạm khi triển khai

| Nhóm | File/module | Vai trò |
|---|---|---|
| Điều phối | `src/ai-assist/continuous/` | Registry, lease, supervisor, turn, checkpoint, start/stop theo trách nhiệm |
| Transport | Module app-server riêng cạnh `src/codex-form-agent/` | Spawn/initialize JSON-RPC, map id/event thread/turn, interrupt, restart; không nhồi vào runner repair |
| MCP hẹp | Entry MCP riêng + handler action trong src | Tool observe/fill/answer/submit qua primitive app; facade mới phải đăng ký build |
| Autofill | `attach-autofill.mjs`, `attach-autofill-page-watcher.mjs` và các nhánh repair | Khóa owner cho mọi đường tự thao tác, không chỉ fillVisibleForms |
| AI hiện tại | `run-ai-assist.mjs`, `inspect-and-fix-form-with-ai.mjs`, `wait-for-ai-capacity.mjs` | Dispatch đúng mode; tái sử dụng capacity, giữ các mode cũ |
| Browser | Lifecycle GoLogin/AdsPower, đóng tab/browser, reconnect | Thu hồi lease/hủy worker binding đúng tab; không đổi guard lead/close |
| UI/API | Route registry, desktop/mac/mini, assets/bundles | Trạng thái chờ và Pause/Resume/Stop theo tab |
| Test | `tests/` + `tests/run-tests.mjs` | Fake transport, race lease/Stop, site rules, restart/quota, soak offline |

Tên module chi tiết sẽ chốt sau spike; không tạo trước các abstraction chưa dùng. Wrapper Playwright repair hiện có tiếp tục phục vụ repair, không giả định vá wrapper đó sẽ gọi được primitive ở process app.

#### A.14.8. Spike và điều kiện chuyển sang code đầy đủ

1. Pin transport/binary/schema cùng phiên bản. Dựng fake transport và MCP hẹp trên fixture offline, chưa gọi model thật.
2. Một tab nhiều màn: observe → nhập/select → Save → Continue → verify; giữ thread, lease và record đúng qua navigation.
3. Race tests: Stop giữa await, tab đóng, record đổi, CDP mất, tool trả muộn, submit đã gửi nhưng response mất. Không click lại vô điều kiện.
4. Ca nghiệp vụ: Adsmith No; Yes/No fallback; required/disabled/hidden; có lead rồi reload; chế độ dừng sau lead; phiên không chờ lead.
5. Nhiều tab giả lập vượt capacity: không hơn 4 lượt active, waiting không giữ slot, mọi ticket hủy được, không controller kép.
6. Sau offline đạt mới thử một worker AI thật trong thời gian/token giới hạn, trên form QA; đo process, thời gian, token và cleanup. Không gửi offer/lead thật để thử.
7. Soak offline 24 giờ, fault injection worker/network/quota; đo timer/listener/memory/queue không tăng vô hạn. Chưa có soak thì không gọi tính năng sẵn sàng 24/7.

Hướng nghiên cứu ưu tiên: app-server cho yêu cầu process sống lâu; SDK turn dài là phương án nhỏ hơn nếu chấp nhận process thay đổi khi resume. Chưa lựa chọn dựa riêng vào tài liệu, chưa cam kết ước lượng ngày công ở §13.7 trước kết quả spike.
