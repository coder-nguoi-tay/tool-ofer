# Hiệu năng nhiều trình duyệt — 2026-11-11

## Phạm vi đã làm

- Offerwall dùng chung trần `MAX_OFFER_TABS = 3`, tương đương tối đa hai tab khác khi chỉ có một tab gốc. Đặt chỗ theo context trước các lệnh await để nhiều offerwall không cùng lấy chỗ cuối. Chỉ đánh dấu thẻ sau khi thao tác mở không báo lỗi; hai cách click đều lỗi thì giữ thẻ để thử lại.
- Thumbnail desktop hỏi mỗi 5 giây thay vì 2,5 giây; chỉ tải ô đang giao viewport và vùng cuộn. Callback chờ cũng kiểm tra trang ẩn, ô bị tháo và slot đã mở modal. Footer không gán lại HTML nếu không đổi.
- Cache thumbnail 10 giây, tối đa hai lượt chụp trên toàn ứng dụng. Không xếp hàng vô hạn; chưa có ảnh và hết chỗ thì API trả 503, client thử lại ở lượt sau. Cache theo Page + URL; kết quả chụp của trang đã điều hướng không được trả về. Đây là thumbnail, không thay thế ảnh bằng chứng trong replay.
- Watcher vòng đời/URL vẫn chạy mỗi giây. Đọc lỗi DOM cùng tài liệu tối đa mỗi 3 giây; điều hướng làm hết cache, URL chrome-error/duplicate được bắt ngay. Frame evaluate bị treo không được phát thêm evaluate kiểm tra lỗi trước khi promise cũ kết thúc. Không đọc lặp cả body và documentElement khi đã có body.
- Screen View lấy một trong hai frame bằng `everyNthFrame: 2`, không phải cam kết FPS cố định. Trang tĩnh chỉ chụp bù sau 1,5 giây thay vì 250ms; giữ ping và backpressure. Viewport và tọa độ chuột không đổi.
- Phiên chưa có lead im 5 phút chỉ ghi cảnh báo một lần mỗi mốc hoạt động. Không đóng theo thời gian sống; manual/skip/checking/giữ để kiểm tay được bỏ qua. IP có lead vẫn được watcher bảo vệ trước các nhánh này.

## Log thao tác và bằng chứng (2026-11-11)

Mặc định ghi **tiến trình và lỗi**; ghi chi tiết chỉ bật có thời hạn cho từng phiên.

| Phần | Chế độ thường | Ghi chi tiết (bật trong Replay, 1–600 giây, mặc định 300) |
|---|---|---|
| Nhập, cuộn, click nhỏ | Không ghi log, không chụp; giữ 100 thao tác gần nhất / tab trong RAM, hết hạn sau 60 giây | Ghi JSONL `manual-ops-*.jsonl` theo lô |
| Submit, chuyển màn, mở tab, lead, trang chính tải xong | Ghi + chụp ảnh/HTML | Như thường |
| Lỗi (`error|failed|timeout|stalled|stuck|crashed|unverified|invalid|session_idle|unresponsive|traffic_blocked`) | Ghi + chụp, kèm bộ đệm thao tác gần nhất | Như thường |
| Request mạng | Thành công / bị Data Saver chặn → gộp thành thống kê; lỗi giống nhau gộp trong 60 giây kèm số lần | Chi tiết từng request |
| Console | Bỏ `warning`, `ERR_BLOCKED_BY_CLIENT`, `Failed to load resource`; giữ `error` khác | Giữ tất cả warning/error |

Giới hạn tải:
- JSONL debug ghi bất đồng bộ theo lô mỗi 1 giây, tối đa 256 KB chờ trong RAM (quá thì bỏ dòng cũ và báo số dòng đã bỏ), xoay file khi vượt 5 MB.
- Sự kiện lặp trong 10 giây (lỗi: 60 giây) được gộp một bản ghi kèm số lần; tối đa 200 nhóm theo dõi.
- Timeline mỗi phiên giữ 2.000 sự kiện mới nhất, cộng sự kiện có ghi chú và bằng chứng được tham chiếu.
- Chụp bằng chứng tối đa 2 tab toàn app cùng lúc; đọc HTML/trạng thái có hạn 3 giây, không gửi lặp lệnh vào renderer đang treo. Ảnh/HTML giống nhau dùng lại file cũ.
- Nhật ký phiên lưu theo revision (lần lưu sau thay lần trước, không ghi chồng toàn bộ mỗi giây).

**Tự dọn log cũ** (`pruneStoredRecordings`, chạy khi mở app và tối đa 10 phút một lần sau khi lưu): xóa phiên đã đóng quá **7 ngày** hoặc khi tổng dung lượng vượt **500 MB** (xóa phiên cũ nhất trước). Luôn giữ phiên đang chạy, phiên có ghi chú, phiên vừa đóng dưới 60 giây; file không rõ phiên sở hữu được giữ 1 ngày; không theo symlink ra ngoài thư mục log.

## Vì sao chưa bảo đảm chạy 20 phiên website thật

Máy được đọc trước đó có RAM 16 GB, 10 CPU logic. Mỗi phiên có Chromium riêng, renderer, proxy và trang web riêng. Giảm giám sát có thể giảm CPU của ứng dụng nhưng không loại bỏ RAM, script, quảng cáo hay network của website. Chưa đo tải 20 offer thật có AdsPower, AI, recorder và màn hình native cùng chạy.

Mức vận hành thận trọng là **10 phiên**. Không tự đóng các phiên đang làm để hạ target; số trình duyệt vẫn do người dùng chọn. Chỉ tăng lên 15 rồi 20 sau khi kiểm tra trên cùng offer/proxy và thời gian chạy đủ dài. Không gán giới hạn phần cứng theo số trình duyệt chỉ từ benchmark dưới đây.

## Benchmark offline có thể chạy lại

```sh
node tests/manual/benchmark-browser-load.mjs 10 10
node tests/manual/benchmark-browser-load.mjs 20 10
```

Script mở các Chromium headless riêng, dùng form tổng hợp local, chặn mạng, không đọc record/proxy và đóng toàn bộ browser của phép đo trong finally. Mỗi chế độ chạy ít nhất 10 giây: baseline quét DOM mỗi giây/chụp mọi thumbnail; optimized dùng helper thật và giả lập chỉ bốn ô đang nhìn thấy. Dùng cùng browser cho hai chế độ, nên có ảnh hưởng warmup/thứ tự; đo nhiều lần và đảo thứ tự nếu cần kết luận hiệu năng chính thức.

Số CPU là tổng CPU time của các tiến trình Chromium chia thời gian đo (100% tương đương một core), không phải CPU toàn máy. RSS là tổng resident memory, có thể tính trùng vùng nhớ chia sẻ. `thumbnailResponses` gồm ảnh cache; `thumbnailCaptures` mới là lượt chụp thật. Event-loop p95 đo tiến trình benchmark Node, không đo độ trễ nhập của app native. Đây là bài đo riêng phần giám sát, không mô phỏng toàn bộ ứng dụng.

## Chưa thay đổi trong đợt này

- Không bỏ các flag chống background throttling: có thể làm autofill tab nền dừng; cần thử hành động background trước.
- Không cắt ảnh/CSS/captcha/API form bằng rule network rộng.
- Không xóa log thao tác hoặc giảm bằng chứng phục vụ xem lại. Recorder vẫn cần đo riêng về tần suất và tải chụp ở nhiều phiên.
- Chưa có metadata xác minh offer yêu cầu ghé trang N giây; không tự coi tab không form là đã hoàn thành nhiệm vụ.
- Skip đã mở được giữ theo lựa chọn trước; slot bù đa offer không chọn skip. Chưa bật tự đóng phiên im lâu trong khi còn chờ lựa chọn ngưỡng của người dùng.

## Nguồn kỹ thuật

- [Playwright Page.screenshot](https://playwright.dev/docs/api/class-page#page-screenshot): `scale: css` dùng một pixel ảnh cho mỗi CSS pixel; không tự biến screenshot thành ảnh thu nhỏ 320px.
- [Chrome DevTools Page.startScreencast](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-startScreencast): hỗ trợ lấy mỗi frame thứ N; nhịp này phụ thuộc frame của Chromium.
- [GoogleChrome chrome-launcher flags](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md): ý nghĩa các flag background throttling. Không coi việc bỏ flag là tối ưu an toàn mặc định.

## Kết quả đo cô lập trên máy hiện tại

Mỗi chế độ khoảng 10–11 giây; không chạy cùng suite test. Form offline tĩnh, headless, không AdsPower/AI/recorder/native UI; tối ưu giả lập bốn thumbnail nhìn thấy. Số liệu làm tròn, chỉ mô tả phép đo này.

| Trình duyệt | Chế độ | CPU Chromium tổng | RSS tổng MB | Lượt chụp thumbnail thật | Node loop p95 ms |
|---|---|---:|---:|---:|---:|
| 10 | baseline | 10% | 2690 | 40 | 21 |
| 10 | optimized | 1% | 2691 | 4 | 21 |
| 20 | baseline | 20% | 5376 | 80 | 21 |
| 20 | optimized | 1% | 5377 | 4 | 21 |

RAM gần như không giảm vì vẫn giữ nguyên số trình duyệt. Việc giảm CPU trong mẫu này không chứng minh 20 website thật hoạt động ổn định; ưu tiên vận hành 10 phiên và đo lại trên offer thực tế. Chưa đo nhiệt độ, thao tác người dùng hoặc băng thông thật.
