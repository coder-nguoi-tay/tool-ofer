# Đánh giá khả thi kế hoạch nâng cấp Obscura

Ngày đánh giá: 19/11/2026.
Tài liệu gốc: [OBSCURA_CORE_RUST_100_GOLOGIN_PLAN.md](../OBSCURA_CORE_RUST_100_GOLOGIN_PLAN.md).
Phương pháp: đọc đủ 170 dòng của kế hoạch, đối chiếu source hiện tại và tài liệu chính thức. Đợt này chỉ nghiên cứu; không thay source, build app hoặc thực hiện thử nghiệm trên hệ thống chống bot bên ngoài.

## 1. Kết luận để ra quyết định

**Có thể nâng cấp Obscura theo từng nhóm khả năng web. Chưa có cơ sở để duyệt mục tiêu “100% Orbita parity / zero bot detection” hoặc lịch khoảng sáu tuần như tài liệu.**

Orbita dùng Chromium [S1]. Obscura hiện dùng V8 qua `deno_core`, DOM và renderer riêng. V8 xử lý JavaScript; Blink cùng các lớp khác của Chromium cung cấp phần lớn hành vi trình duyệt [S2]. Bổ sung mười hạng mục không đồng nghĩa có toàn bộ Blink, lịch tải trang, origin isolation, CSS, media và lifecycle của Chromium.

Tài liệu hiện phù hợp làm danh sách hướng nghiên cứu. Cần thay phần mục tiêu, baseline, thứ tự ưu tiên và tiêu chí nghiệm thu trước khi chuyển thành kế hoạch triển khai.

Nếu mục tiêu vận hành là tải form ổn định, ít đứng hình và chạy nhiều phiên, ưu tiên đầu tiên nên là lifecycle/CDP, module/resource loading, giới hạn tài nguyên và lưu trữ thực. GPU/audio/WebRTC là các dự án tính năng riêng, cần chứng minh trang thực sự cần chúng.

## 2. “Core Rust” và “100% Rust” là hai yêu cầu khác nhau

- Core quản lý DOM, trạng thái, network, scheduling bằng Rust: khả thi và phù hợp hướng hiện tại.
- Web API được nối vào V8 bằng bindings: vẫn phải hiện ra thành các object/prototype JavaScript đúng chuẩn cho website.
- Loại dần phần nghiệp vụ khỏi `bootstrap.js`: có thể làm theo từng API, cần test brand checks, cross-realm, GC, exception và lifecycle. Chuyển ngôn ngữ không tự khắc phục sai hành vi.
- Toàn bộ stack chỉ có Rust: không đúng với phương án đang đề xuất. V8 dùng API nhúng C++; BoringSSL và các thư viện như ANGLE/Skia đưa thêm native dependency, toolchain và chi phí cập nhật [S3][S4].

Cần ghi mục tiêu cụ thể là **state và thuật toán do core sở hữu, bindings mỏng, API đúng chuẩn**, thay cho tiêu chí đếm số dòng JavaScript.

## 3. Đối chiếu mười hạng mục với code

Độ khó trong bảng là nhận định kỹ thuật cho việc triển khai đúng chức năng, không phải mức độ vượt qua một bộ chấm fingerprint. Chưa phải báo giá hoặc thời hạn cam kết.

| Hạng mục | Source hiện có | Khoảng trống / nhận định khả thi | Ưu tiên |
| --- | --- | --- | --- |
| 1. WebGL/ANGLE | `getContext('webgl'/'webgl2')` hiện trả null khi chưa có backend thật | **Rất lớn.** Cần context, shader, texture/framebuffer, readback, lỗi, context loss, đồng bộ renderer và bindings. ANGLE là lớp dịch API sang backend GPU, không phải bộ giả lập mọi GPU/driver [S5]. `wgpu` cũng không tự cung cấp toàn bộ WebGL. | Chỉ mở dự án khi có fixture nghiệp vụ yêu cầu GPU |
| 2. Web Audio | Có `AudioBuffer`; test hiện yêu cầu AudioContext/OfflineAudioContext không được quảng bá khi thiếu backend | **Rất lớn.** DSP graph, routing, automation, clock, offline rendering, decode và AudioWorklet là các phần khác nhau. Một vài node không tạo thành Web Audio đầy đủ [S6]. | Sau giai đoạn ổn định cơ bản |
| 3. Font/typography | Renderer dùng `cosmic-text`, `rustybuzz`, `swash`, `ab_glyph`; có mô hình font theo profile trong Rust | **Lớn nhưng có thể chia nhỏ.** Hiện `browser_fonts::measure` dùng bảng/mô hình advance, khác đường shaping/render thật. Cần thống nhất nguồn font và metrics giữa DOM, canvas và ảnh, rồi đối chiếu từng OS. Đưa typography vào `obscura-dom` như kế hoạch chưa đúng trách nhiệm hiện tại; phần chính thuộc renderer/platform. | Cao nếu đang sai layout hoặc vị trí input |
| 4. Canvas/encoding | Canvas `toDataURL()` đi qua `_encodePNG` trong bootstrap; screenshot có đường encode Rust riêng | **Vừa → lớn tùy mục tiêu.** Nên xác định rõ đang sửa canvas hay screenshot. Đổi encoder không sửa được pixel đầu vào khác nhau do font, alpha hoặc color handling. Skia có zlib mặc định 6, nhưng tài liệu Skia nói đó cũng là mặc định libpng [S7]; không phải một chữ ký riêng đủ chứng minh parity. | Sửa tính đúng đắn và hiệu năng trước yêu cầu byte giống hệt |
| 5. TLS/HTTP | Đã có `wreq`/transport BoringSSL qua feature `stealth`, cùng transport thường; script parser vừa được thống nhất đường transport với page | **Đã có nền tảng, không bắt đầu từ số 0.** BoringSSL không tự cung cấp toàn bộ network stack Chromium. Kế hoạch chưa mô tả HTTP/3, session reuse, proxy và cache. Mốc Chrome 130–136 cũng không thống nhất với cấu hình/test hiện tại của repo. | Kiểm chứng tính nhất quán và độ bền; không cam kết kết quả từ JA4 |
| 6. WebRTC | Capability profile đang đặt `web_rtc=false`; không có backend ICE/DTLS/SRTP/codec đầy đủ | **Rất lớn.** SDP chỉ là một phần signaling. IP phải phản ánh đường truyền có thật; sửa IP trong chuỗi SDP không tạo ra kết nối tương ứng. Proxy HTTP không đương nhiên vận chuyển được media/UDP [S8]. | Hoãn nếu các luồng mục tiêu không dùng gọi/media/data channel |
| 7. Resource/Navigation Timing | Có navigation milestones trong Rust, User Timing mark/measure; registry `getEntriesByType` chưa có timeline resource/navigation đầy đủ | **Khả thi, có ích trực tiếp.** Thu thập timestamp từ transport thật, xử lý redirect/cache/connection reuse và giới hạn cross-origin. W3C yêu cầu một số trường được che/zero tùy Timing-Allow-Origin [S9]. | Cao |
| 8. Event loop/input | Đã có V8 task/microtask, timer, RAF và CDP input; lifecycle vừa được bổ sung test đối chiếu Chromium | **Lớn nhưng chia được.** Sửa thứ tự task, user activation, timestamp và phản hồi input trước. DOM định nghĩa `isTrusted` theo nguồn phát sự kiện, không phải chứng nhận “người thật” [S10]. Clock/jitter tự tạo không thay thế một scheduler đúng. | Rất cao |
| 9. Permissions | Rust `browser_identity.permission()` đã tồn tại; hiện nhiều permission trả prompt cố định | **Vừa → lớn.** Cần state theo origin/context, policy, override, onchange và tính nhất quán với API thực sự có backend. Đặt một manager trong DOM không đủ cho UI/policy và network/media. | Cao khi trang cần quyền thật |
| 10. Storage/Crypto | Đã có Rust IndexedDB storage/transaction cùng JS bindings; backend hiện là cấu trúc trong bộ nhớ. Có digest, HMAC, AES, PBKDF2, HKDF. RSA/ECDSA chưa được triển khai đầy đủ; CacheStorage chưa được quảng bá | **Vừa → lớn, cần tách nhỏ.** IndexedDB cần durability, versionchange/blocked, transaction scheduling, serialization, quota; một thư viện SQLite không tự thực hiện semantics [S11]. Crypto cần thuật toán, key formats/usages/errors và secure-context đúng chuẩn [S12]. | Cao theo API trang mục tiêu sử dụng |

### Source đã đối chiếu

- [Cargo của engine](../demo-obscura-antidetect/Cargo.toml): Rust host và `obscura-cdp` render/stealth.
- [Cargo của runtime](../demo-obscura-antidetect/obscura-upstream/crates/obscura-js/Cargo.toml): `deno_core`, primitive crypto và feature renderer.
- [Cargo của renderer](../demo-obscura-antidetect/obscura-upstream/crates/obscura-render/Cargo.toml): renderer/text hiện tại.
- [bootstrap.js](../demo-obscura-antidetect/obscura-upstream/crates/obscura-js/js/bootstrap.js): WebGL, PNG canvas, Performance, SubtleCrypto và CacheStorage.
- [browser_fonts.rs](../demo-obscura-antidetect/obscura-upstream/crates/obscura-js/src/browser_fonts.rs): mô hình metrics theo profile.
- [browser_identity.rs](../demo-obscura-antidetect/obscura-upstream/crates/obscura-js/src/browser_identity.rs): capabilities và permission policy.
- [indexed_db.rs](../demo-obscura-antidetect/obscura-upstream/crates/obscura-js/src/indexed_db.rs): dữ liệu, transactions và context ownership.
- [context.rs](../demo-obscura-antidetect/obscura-upstream/crates/obscura-browser/src/context.rs): storage theo browser context; đường lưu localStorage không chứng minh IndexedDB đã lưu bền.
- [wreq_client.rs](../demo-obscura-antidetect/obscura-upstream/crates/obscura-net/src/wreq_client.rs): transport hiện có.
- [test native configuration](../tests/obscura-native-configuration.test.mjs): kiểm tra capability thực sự được xuất hiện trên page.

## 4. Các giả định cần sửa trong tài liệu gốc

1. **“100% Orbita” chưa có định nghĩa baseline.** Cần chốt bản engine, OS, architecture, viewport, font assets, backend GPU, tập Web API và loại workload. Nền Chromium của Orbita là khác biệt kiến trúc, không chỉ mười thông số.
2. **“Pass 100%” các hệ thống chống bot không phải tiêu chí đủ để nghiệm thu một browser.** Tài liệu không cung cấp môi trường, dữ liệu baseline hay phương pháp chứng minh các điểm số. Test key của Turnstile tạo đáp án có kiểm soát và không chứng minh hành vi production [S13].
3. **Nhiễu số và đầu ra giống hệt là hai mục tiêu cần tách.** Chủ động đổi pixel/PCM khiến yêu cầu so sánh bit-for-bit không còn là cùng một phép thử. Nên kiểm tra thuật toán/rendering đúng trước khi đánh giá các lựa chọn bảo vệ riêng tư.
4. **Metadata thiết bị không thay thế backend.** Một bảng tên GPU/font hoặc object có prototype hợp lệ không chứng minh shader, shaping, DSP hay ICE đã thực thi đúng.
5. **Waterfall phải đo sự kiện thật.** Không suy ra DNS/connect/request timings bằng cách phân phối độ trễ proxy. Kết nối tái sử dụng và chính sách cross-origin làm một số mốc vắng/zero một cách hợp lệ [S9].
6. **Lịch trình đang bỏ sót nền tảng.** Chưa có công việc rõ cho lifecycle/CDP streaming, module graph, origin/security semantics, iframe/worker, cancellation, durability và test theo từng OS. Đây là những lớp tác động trực tiếp đến form hiện tại.
7. **Không đánh đổi năng lực kiểm chứng để lấy lịch ngắn.** Đầu ra “5 ngày DSP”, “8 ngày ANGLE” có thể phù hợp một spike rất hẹp; chưa đủ cơ sở để gọi là backend đầy đủ và parity sản xuất.

## 5. Lộ trình khả thi hơn

### Đợt A: baseline và ổn định các luồng mục tiêu

Chốt tập trang/fixture và Chromium đối chiếu; thống kê nguyên nhân đứng hình: document, HTTP lỗi, tài nguyên thiếu, script exception, module pending, form scope, iframe hoặc CDP timeout. Ưu tiên lifecycle/CDP streaming và lịch module, cùng giới hạn mạng/CPU/cancellation.

Đầu ra nghiệm thu: fixture tái hiện được, bằng chứng lỗi đủ dùng, không mất tài nguyên đã tải, không phát lifecycle sớm/sai, thao tác form không bị khóa khi chỉ còn request nền.

### Đợt B: hoàn thiện các API đang có và thực sự cần

Resource/Navigation Timing thực; permission state; IndexedDB durability; crypto còn thiếu theo nhu cầu đã xác nhận; thống nhất font metrics của DOM/canvas/renderer. Dùng subset WPT đã chọn và fixture app, không viết lại phần đã hoạt động chỉ vì đổi ngôn ngữ.

Đầu ra nghiệm thu: công bố rõ API hỗ trợ/không hỗ trợ, pass/fail/skip và test dữ liệu qua reload, đóng/mở profile, nhiều context, iframe/worker.

### Đợt C: spike độc lập cho graphics/media

Chọn một nền tảng và một backend trước, chẳng hạn macOS/ARM64. WebGL, Audio và WebRTC mỗi phần cần một spike có giới hạn, benchmark RAM/CPU/latency và tiêu chí dừng. Không triển khai đồng thời ba subsystem nặng trước khi chứng minh lợi ích với workload.

Đầu ra nghiệm thu: khả năng thực tế trên tập con API, lỗi/fallback đúng, conformance và chi phí tài nguyên có số đo. Việc mở rộng cross-platform là bước riêng.

### Ước lượng ở thời điểm hiện tại

Đây là **nhận định kỹ thuật**, chưa phải estimate theo backlog:

- Khoảng sáu tuần có thể đặt mục tiêu cho một đợt ổn định/tương thích hẹp và một số prototype, nếu phạm vi được khóa.
- Các API nền thường cần từ nhiều tuần đến vài tháng tùy mức conformance/durability và nhân sự.
- Backend GPU, audio và WebRTC đầy đủ là các hạng mục nhiều tháng với chuyên môn riêng; tổng parity trình duyệt là chương trình dài hạn, không thể suy ra bằng cách cộng số ngày trong Gantt.
- Trước khi chốt ngân sách/lịch, cần spike xác nhận kiến trúc và đo khối lượng test còn thiếu. Có thể timebox giai đoạn thẩm định ban đầu 2–4 tuần; timebox này không phải cam kết hoàn thiện cả ma trận.

## 6. Hiệu năng và lựa chọn kiến trúc

Bổ sung GPU/DSP/codec/persistence tăng tài nguyên, bộ nhớ native, kích thước phân phối và chi phí cập nhật. Rust giúp kiểm soát triển khai nhưng không tự làm mọi workload nhanh hơn Chromium.

Cần đo cùng fixture/viewport/seed/network/cache/settle policy: thời gian document commit, DCL, form sẵn sàng tương tác, navigation, P50/P95, peak RSS/CPU, số kết nối và tỷ lệ hoàn thành ở 1/5/10 slot. So sánh tổng tài nguyên của cả cây process, không so một process Obscura với toàn Chromium bằng hai cách đo khác nhau.

Báo cáo trước đã ghi nhận form của fixture khởi tạo sớm hơn từ trung vị 608 ms xuống 21 ms sau khi sửa loader; navigation gần như không đổi. Số đo này không chứng minh mọi website nhanh hơn hoặc tương thích đầy đủ [báo cáo ổn định](obscura-core-stability-2026-11-19.md).

Hai hướng sản phẩm cần quyết định riêng:

| Hướng | Lợi ích | Chi phí/giới hạn |
| --- | --- | --- |
| Tiếp tục custom Obscura, công bố tập khả năng hỗ trợ | Kiểm soát Rust và tối ưu workload hẹp | Tự duy trì conformance và backend; không hứa tương đương toàn Chromium |
| Dùng Chromium cho luồng cần tương thích rộng; Obscura cho luồng đã kiểm chứng | Có đường vận hành dựa trên browser hoàn chỉnh, giữ phần tối ưu đã đo | Tốn tài nguyên hơn ở các phiên Chromium; cần policy lựa chọn engine và kiểm tra cô lập profile |

Nếu yêu cầu cứng là tương thích Chromium rộng trong thời gian ngắn, tái sử dụng engine Chromium khả thi hơn tái hiện mọi thành phần của nó. Đây là suy luận kiến trúc từ nền tảng của hai engine, không phải kết quả benchmark triển khai mới. Việc chọn GoLogin thương mại, SDK/cloud hay quản lý profile là bài toán tích hợp riêng; tên “GoLogin parity” trong kế hoạch không tự tạo ra tích hợp đó.

## 7. Tiêu chí nghiệm thu đề xuất

- Test chức năng, subset WPT và fixture app có danh sách phiên bản rõ ràng; báo pass/fail/skip, không quy đổi điểm fingerprint thành phần trăm tương thích web [S14].
- Kiểm thử mọi bước form cần dùng: HTML/CSS, module, iframe, validation, focus/input/change/submit, điều hướng, reload, back/forward và đóng/mở profile.
- API thiếu backend phải có feature detection/failure rõ; không báo thành công khi thực tế không thực hiện công việc.
- Báo regressions về tốc độ/RAM/CPU và tỷ lệ hoàn thành dưới nhiều slot, với môi trường kiểm thử tái lập.
- Kiểm chứng các tích hợp bảo vệ trên môi trường do chủ hệ thống cho phép, sử dụng chế độ/test key phù hợp; tách khỏi tuyên bố vượt hệ thống production.
- Không đặt mục tiêu “zero bot detection” hoặc đảm bảo kết quả trên một hệ thống bên ngoài làm điều kiện phát hành browser.

## 8. Nguồn chính thức

[S1] [GoLogin: Orbita browser](https://support.gologin.com/en/articles/14853789-orbita-browser) — Orbita dựa trên Chromium.

[S2] [Chrome: What is Blink?](https://developer.chrome.com/docs/web-platform/blink) — vai trò của Blink, V8 và pipeline web.

[S3] [V8: Embedding guide](https://v8.dev/docs/embed) — API nhúng C++ của V8.

[S4] [BoringSSL README](https://boringssl.googlesource.com/boringssl/+/HEAD/README.md) — thành phần SSL trong Chromium; không bảo đảm ổn định API/ABI cho bên thứ ba.

[S5] [ANGLE README](https://github.com/google/angle/blob/main/README.md) — phạm vi dịch OpenGL ES sang backend đồ họa.

[S6] [W3C Web Audio](https://www.w3.org/TR/webaudio/) — audio graph và chức năng Web Audio; một số tài liệu đang ở trạng thái draft.

[S7] [Skia PNG encoder options](https://skia.googlesource.com/skia/+/refs/heads/main/include/encode/SkPngEncoder.h) — tham số encoder, filter và default libpng.

[S8] [RFC 8828](https://datatracker.ietf.org/doc/html/rfc8828) — yêu cầu xử lý địa chỉ WebRTC và đường truyền proxy.

[S9] [W3C Resource Timing](https://www.w3.org/TR/resource-timing/) — semantics của timing và Timing-Allow-Origin.

[S10] [WHATWG DOM: isTrusted](https://dom.spec.whatwg.org/#dom-event-istrusted) — nguồn gốc sự kiện user-agent/script.

[S11] [W3C IndexedDB](https://w3c.github.io/IndexedDB/) — database, transaction lifecycle/scheduling, upgrade và connection queues.

[S12] [W3C Web Crypto](https://w3c.github.io/webcrypto/) — thuật toán và semantics của API mật mã.

[S13] [Cloudflare Turnstile testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) — test keys và khác biệt với xác minh production.

[S14] [Web Platform Tests](https://web-platform-tests.org/) — test suite chung kiểm tra khả năng tương tác giữa browser.
