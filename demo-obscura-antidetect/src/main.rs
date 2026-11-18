use obscura_antidetect_demo::{generate_profile, CdpBridge, ObscuraEngineHook, TargetOs};
use std::env;

/// Chọn hệ điều hành của cấu hình thiết bị từ tham số CLI.
/// @param value Tên hệ điều hành. @return Hệ điều hành đã chuẩn hóa.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-18
fn parse_os(value: &str) -> TargetOs {
    match value.to_lowercase().as_str() {
        "mac" | "macos" | "darwin" => TargetOs::MacOS,
        "linux" => TargetOs::Linux,
        "android" => TargetOs::Android,
        "iphone" | "ios" => TargetOs::IPhone,
        "ipad" => TargetOs::IPad,
        _ => TargetOs::Windows,
    }
}

/// In các lệnh cấu hình native, không hướng dẫn chèn script vá API.
/// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
fn print_usage() {
    println!("Obscura native: profile [seed] [os] | cdp [seed] [os] | live-test [seed] [os] | serve [port] [proxy]");
    println!("Danh tinh duoc cau hinh trong Rust truoc dieu huong; lenh script cu khong con phat JavaScript.");
}

/// Kiểm chứng API native bằng một document nội bộ, không sửa navigator bằng JavaScript.
/// @param seed Seed của cấu hình. @param os Hệ điều hành mục tiêu.
/// @return Kết quả kiểm chứng. @throws anyhow::Error Khi engine hoặc các giá trị native không khớp.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-18
async fn run_live_obscura_test(seed: u64, os: TargetOs) -> anyhow::Result<()> {
    let profile = generate_profile(seed, os);
    let browser = obscura::Browser::builder().stealth(false).build()?;
    let mut page = browser.new_page().await?;
    ObscuraEngineHook::apply_browser_identity(&mut page, &profile)?;
    page.goto("data:text/html,<!doctype html><html><body>Native identity fixture</body></html>").await?;
    let actual = page.evaluate("({userAgent:navigator.userAgent, platform:navigator.platform, hardwareConcurrency:navigator.hardwareConcurrency})");
    anyhow::ensure!(actual["userAgent"] == profile.user_agent, "Native user agent mismatch");
    anyhow::ensure!(actual["platform"] == profile.platform, "Native platform mismatch");
    anyhow::ensure!(actual["hardwareConcurrency"].as_f64() == Some(profile.hardware_concurrency as f64), "Native hardware configuration mismatch");
    println!("{}", serde_json::json!({"native_identity_verified":true,"platform":profile.platform}));
    Ok(())
}

/// Chạy CLI cấu hình/profile hoặc server CDP với backend Rust.
/// @return Kết quả lệnh. @throws anyhow::Error Khi cấu hình, kiểm chứng hoặc server lỗi.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-18
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args: Vec<String> = env::args().collect();
    let command = args.get(1).map(String::as_str).unwrap_or("demo");
    match command {
        "profile" | "cdp" | "live-test" => {
            let seed = args.get(2).and_then(|value| value.parse::<u64>().ok()).unwrap_or(42);
            let os = args.get(3).map(|value| parse_os(value)).unwrap_or(TargetOs::Windows);
            match command {
                "profile" => println!("{}", serde_json::to_string(&generate_profile(seed, os))?),
                "cdp" => println!("{}", serde_json::to_string(&CdpBridge::build_full_init_sequence(1, &generate_profile(seed, os)))?),
                _ => run_live_obscura_test(seed, os).await?,
            }
        }
        "script" => eprintln!("Legacy script API: no JavaScript emitted; configure native browser identity instead."),
        "serve" => {
            let port = args.get(2).and_then(|value| value.parse::<u16>().ok()).unwrap_or(9222);
            let proxy = args.get(3).cloned();
            obscura_cdp::start_with_full_serve_options(
                port, "127.0.0.1", proxy,
                env::var("AUTOLEADPC_OBSCURA_STEALTH").as_deref() != Ok("0"),
                env::var("AUTOLEADPC_OBSCURA_USER_AGENT").ok().filter(|value| !value.is_empty()),
                false, None, true,
            ).await?;
        }
        _ => print_usage(),
    }
    Ok(())
}
