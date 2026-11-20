# Obscura Anti-Detect Demo (Rust Native Engine)

Bản demo độc lập triển khai kiến trúc **Anti-Detect Engine viết bằng Rust** dành riêng cho trình duyệt headless siêu nhẹ **Obscura** (Rust + V8 engine), chuyển đổi trực tiếp các thuật toán Anti-Detect (từ C# / .NET) sang Rust native để đạt hiệu năng tối đa mà không phụ thuộc vào .NET runtime.

---

## 1. Mục tiêu kiến trúc (Cách 2)

Thay vì chạy một tiến trình C# bên ngoài (gây tốn RAM ~100MB+ và độ trễ IPC/process spawn), toàn bộ logic Anti-Detect được viết bằng Rust thuần:
1. **Profile Generator**: Sinh cấu hình thiết bị phần cứng thực tế (Windows 11 + NVIDIA RTX/Intel Iris, macOS Sonoma + Apple Silicon M1/M2/M3, Android 14 + Adreno 740/Mali).
2. **Deterministic PRNG (XorShift64Star)**: Thuật toán sinh số ngẫu nhiên giả lập theo seed của profile, tạo độ lệch vi mô cho pixel Canvas (`[-1, 0, 1]`) và tần số AudioContext (`[-1e-7, 1e-7]`). Đảm bảo mỗi seed ra một fingerprint độc nhất nhưng cố định xuyên suốt phiên.
3. **Stealth Script Generator**: Tự động sinh mã JavaScript injection chuẩn native code (`function () { [native code] }`) can thiệp vào `navigator.webdriver`, `window.chrome`, `WebGL`, `Screen`, `Client Hints`, `Canvas`, và `AudioBuffer`.
4. **CDP Bridge & Engine Hook**: Cung cấp cả 2 cách kết nối:
   - **Cách A (CDP Protocol)**: Tự động tạo chuỗi lệnh `Page.addScriptToEvaluateOnNewDocument`, `Network.setUserAgentOverride`, `Emulation.setDeviceMetricsOverride`.
   - **Cách B (In-Process V8 Engine)**: Kết nối trực tiếp vào Obscura Page Lifecycle qua `page.add_preload_script()`.
5. **Zero Overhead & Siêu nhẹ**: Khởi động instance Obscura V8 chỉ mất **0.5 mili-giây** (500 micro-giây) với dung lượng RAM chỉ **~30MB**.

---

## 2. Cấu trúc thư mục

```
demo-obscura-antidetect/
├── Cargo.toml                  # Khai báo crate và dependencies (obscura, tokio, serde)
├── README.md                   # Tài liệu hướng dẫn (file này)
└── src/
    ├── lib.rs                  # Export API thư viện để Obscura nhúng vào
    ├── main.rs                 # CLI Runner kiểm thử và live test với Obscura V8
    ├── profile.rs              # Khai báo cấu trúc AntiDetectProfile
    ├── noise.rs                # PRNG XorShift64Star sinh nhiễu Canvas & Audio
    ├── generator.rs            # Sinh profile Windows, Mac, Android thực tế
    ├── stealth_script.rs       # Sinh JavaScript stealth injection cho V8 / CDP
    ├── cdp_bridge.rs           # Bộ sinh payload và bridge cho giao thức CDP
    └── engine_hook.rs          # Hook trực tiếp vào Obscura Page và HTTP client
```

---

## 3. Cách chạy và kiểm thử

Di chuyển vào thư mục demo:
```bash
cd demo-obscura-antidetect
```

### A. Chạy toàn bộ bài test tự động
```bash
cargo test
```

### B. Chạy kiểm thử LIVE với Obscura V8 Engine thực tế
Khởi động trình duyệt Obscura V8 thật, tiêm stealth script và đọc trực tiếp các biến môi trường trong V8:
```bash
# Cú pháp: cargo run -- live-test [seed] [os: win|mac|android]
cargo run -- live-test 101 win
cargo run -- live-test 202 mac
cargo run -- live-test 303 android
```
*Kết quả mẫu thực thi:*
- `Obscura khởi tạo`: 511 micro-giây
- `navigator.webdriver`: `null` (Ẩn hoàn toàn)
- `window.chrome`: `true` (Giả lập đầy đủ `csi`, `loadTimes`, `runtime`)
- `navigator.userAgent`: Khớp 100% với profile
- `WebGL Unmasked Renderer`: Khớp GPU mục tiêu (Intel Iris Xe / RTX 3060 / Apple M1)

### C. Xuất cấu hình Profile dạng JSON
```bash
cargo run -- profile 101 win
```

### D. Xuất chuỗi lệnh CDP Batch Initialization
```bash
cargo run -- cdp 101 win
```

### E. Chạy Benchmark và khảo sát hiệu năng
```bash
cargo run -- demo
```

---

### Đo thời gian chuyển tab trong Screen View

Đặt `AUTOLEADPC_OBSCURA_PERF=1` trong môi trường khởi động app. Mỗi tiến trình Obscura mới đọc cờ một lần. Wrapper macOS chuyển các dòng `[ObscuraPerf]` vào `/tmp/autoleadpc-<instance>.log` kể cả khi app dùng chế độ log `access`. Mỗi dòng của app có thời điểm, slot, cổng và PID. Trường `tab` và `loading_tab` là số nội bộ theo thứ tự tạo trang trong kết nối. Đối chiếu `conn` và `id` để theo cùng một lệnh.

| Dấu mốc | Cách đọc |
| --- | --- |
| `navigation_wait`, `queue_full` | Core hoãn lệnh đến sau điều hướng, hoặc từ chối vì hàng đợi đầy. |
| `begin`, `end` | `queue_ms` là thời gian từ lúc đưa lệnh vào hàng đợi Rust đến lúc bắt đầu xử lý. `run_ms` là thời gian xử lý trong core. |
| `first_frame` | `render_us` đo dựng và đổi kích thước ảnh đầu. `encode_pack_us` đo mã hóa và đóng gói sự kiện trước khi gửi qua WebSocket. |
| `ack_wait`, `ack_resume` | Luồng ảnh có thay đổi nhưng phải chờ bên xem xác nhận ảnh trước. Core ghi nhận lần chờ từ 250 ms. |
| `navigation_end` | `requested_post=1` khi điều hướng yêu cầu POST. `http_status` là mã phản hồi tài liệu chính cuối cùng quan sát được, hoặc 0 nếu chưa có. |

## 4. Cách tích hợp vào repo Obscura thật

### Phương án A: Tích hợp qua CDP (`Page.addScriptToEvaluateOnNewDocument`)
Khi Obscura khởi tạo một tab mới qua CDP:
```rust
use obscura_antidetect_demo::{generate_profile, CdpBridge, TargetOs};

let profile = generate_profile(session_seed, TargetOs::Windows);
let cdp_commands = CdpBridge::build_full_init_sequence(1, &profile);

for cmd in cdp_commands {
    cdp_session.send_raw(&cmd.to_string()).await?;
}
```

### Phương án B: Tích hợp trực tiếp vào Obscura Rust Engine
```rust
use obscura::Browser;
use obscura_antidetect_demo::{generate_profile, ObscuraEngineHook, TargetOs};

let browser = Browser::builder().build()?;
let mut page = browser.new_page().await?;

// Lấy stealth script và nạp vào preload script của Obscura
let profile = generate_profile(session_seed, TargetOs::Windows);
let stealth_js = ObscuraEngineHook::get_page_preload_script(&profile);
page.add_preload_script(&stealth_js);

// Điều hướng trang web
page.goto("https://bot.sannysoft.com").await?;
```

## Nhật ký thao tác bấm trong app Mac

Khi mở engine từ app, Rust ghi `[ObscuraInput] ready` vào nhật ký của instance. Với instance 2, có thể theo dõi bằng lệnh sau.

```sh
tail -F /tmp/autoleadpc-2.log | rg --line-buffered -F '[ObscuraInput]'
```

Ghép hai dòng `begin` và `end` bằng cùng `pid` và `seq`. Dòng đầu ghi slot, tab và lệnh trước khi dispatcher đợi khóa V8. Dòng cuối ghi frame, kết quả xử lý, thời gian đợi vào handler (`wait_ms`) và thời gian chạy handler (`run_ms`). `checked` và `unchecked` cho biết trạng thái của ô native vừa được bấm trực tiếp. `cancelled` nghĩa là trang đã hủy sự kiện click. `label_activated` ghi nhận việc chuyển kích hoạt qua nhãn. `touch_unhandled` cho biết engine đã nhận lệnh chạm nhưng chưa phát sự kiện DOM. Việc trang đổi câu hỏi hoặc nhận dữ liệu trên server cần bằng chứng riêng.

Mỗi engine ghi tối đa 60 lệnh nhấn/thả trong mỗi cửa sổ 60 giây và báo `rate_limited` một lần khi vượt ngưỡng. Log chỉ chứa mã số, trạng thái và thời gian. Có thể tắt cho các engine mở sau bằng `AUTOLEADPC_OBSCURA_INPUT_LOG=0` trong môi trường launcher. Khi chạy binary độc lập, đặt biến này bằng `1` để bật.

## Chẩn đoán stylesheet trên Obscura

Đặt `AUTOLEADPC_CSS_DEBUG=1` khi khởi động AutoLeadPC để theo dõi các tab Obscura mở trong phiên đó. Với app macOS instance 2, đọc log bằng `tail -F /tmp/autoleadpc-2.log | grep -F '[CSS]'`.

Mỗi dòng ghi slot và số tab. `event=response` ghi mã HTTP và nhóm MIME. `unexpected_mime` cho biết máy chủ trả kiểu khác `text/css`. `event=failed` ghi lý do request thất bại mà trình duyệt cung cấp. `asset` là mã băm của origin và đường dẫn, bỏ query và fragment. Đối chiếu mã này trong cùng phiên để theo dõi một tài nguyên.

Sau khi trang tải hoặc khi có phản hồi CSS, `event=dom_snapshot` đếm các thẻ link có stylesheet, đang tắt hoặc không khớp media, và đang thiếu stylesheet tại thời điểm lấy mẫu. Một stylesheet có mặt vẫn có thể chứa selector không khớp phần tử. Các sự kiện sát nhau dùng chung một lượt đọc, tối đa 10 frame mỗi lượt và 60 dòng chi tiết mỗi phút cho mỗi tab, trong đó tối đa 10 phản hồi thành công thông thường.
