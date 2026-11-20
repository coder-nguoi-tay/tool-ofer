//! Chẩn đoán vòng đời lệnh bấm CDP, chỉ ghi mã và trạng thái của engine.
use crate::{dispatch::CdpContext, types::CdpRequest};
use std::{
    io::{self, Write},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

static ENABLED: OnceLock<bool> = OnceLock::new();
static WINDOW: Mutex<Option<(Instant, u64, u32)>> = Mutex::new(None);
const MAX_PER_MINUTE: u32 = 60;

/// Đọc cờ chẩn đoán cố định cho một tiến trình engine.
/// @return True khi launcher bật log thao tác.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-20
fn enabled() -> bool {
    *ENABLED.get_or_init(|| std::env::var("AUTOLEADPC_OBSCURA_INPUT_LOG").as_deref() == Ok("1"))
}

/// Đánh dấu engine đang lắng nghe kể cả khi chưa nhận thao tác.
/// @return Không có giá trị.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-20
pub(crate) fn ready() {
    if enabled() {
        let _ = writeln!(io::stderr().lock(), "[ObscuraInput] ready");
    }
}

pub(crate) struct InputTrace {
    sequence: u64,
    started: Instant,
}

impl InputTrace {
    /// Ghi nhận lệnh bấm trước khi đợi khóa V8. Số thứ tự là duy nhất trong tiến trình.
    /// @param req Lệnh CDP. @param ctx Context dùng để ánh xạ tab.
    /// @return Trace khi được bật và còn hạn mức của phút hiện tại.
    /// @author ductv <ductv@getflycrm.com> @since 2026-11-20
    pub(crate) fn begin(req: &CdpRequest, ctx: &CdpContext) -> Option<Self> {
        if !matches!(
            req.method.as_str(),
            "Input.dispatchMouseEvent" | "Input.dispatchTouchEvent"
        ) || !enabled()
        {
            return None;
        }
        let op = match (req.method.as_str(), req.params.get("type")?.as_str()?) {
            ("Input.dispatchMouseEvent", "mousePressed") => "down",
            ("Input.dispatchMouseEvent", "mouseReleased") => "up",
            ("Input.dispatchTouchEvent", "touchStart") => "touch_start",
            ("Input.dispatchTouchEvent", "touchEnd") => "touch_end",
            _ => return None,
        };
        let started = Instant::now();
        let mut window = WINDOW.lock().ok()?;
        let (since, sequence, count) = window.get_or_insert((started, 0, 0));
        if since.elapsed() >= Duration::from_secs(60) {
            *since = started;
            *count = 0;
        }
        if *count >= MAX_PER_MINUTE {
            if *count == MAX_PER_MINUTE {
                *count += 1;
                let _ = writeln!(io::stderr().lock(), "[ObscuraInput] rate_limited");
            }
            return None;
        }
        *count += 1;
        *sequence += 1;
        let sequence = *sequence;
        drop(window);
        let tab = ctx
            .get_session_page(&req.session_id)
            .and_then(|page| page.id.strip_prefix("page-")?.parse::<u64>().ok())
            .unwrap_or(0);
        let _ = writeln!(
            io::stderr().lock(),
            "[ObscuraInput] begin seq={sequence} tab={tab} id={} op={op}",
            req.id
        );
        Some(Self { sequence, started })
    }

    /// Ghi nhận kết quả đồng bộ ngay khi handler xử lý xong thao tác.
    /// @param handler_started Thời điểm bắt đầu xử lý input sau khi chờ dispatcher.
    /// @param frame Document nhận thao tác. @param outcome Trạng thái đã lọc từ engine.
    /// @return Không có giá trị.
    /// @author ductv <ductv@getflycrm.com> @since 2026-11-20
    pub(crate) fn finish(self, handler_started: Instant, frame: u32, outcome: &str) {
        let result = match outcome {
            "pressed" | "clicked" | "checked" | "unchecked" | "label_activated" | "cancelled"
            | "disabled" | "unmatched_press" | "no_target" | "no_tab" | "touch_unhandled" => {
                outcome
            }
            _ => "unknown",
        };
        let _ = writeln!(
            io::stderr().lock(),
            "[ObscuraInput] end seq={} frame={} result={} wait_ms={} run_ms={}",
            self.sequence,
            frame,
            result,
            handler_started.duration_since(self.started).as_millis(),
            handler_started.elapsed().as_millis()
        );
    }
}
