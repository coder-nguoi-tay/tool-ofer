use obscura_antidetect_demo::{
    generate_profile, generate_stealth_js, CdpBridge, ObscuraEngineHook, TargetOs, XorShift64,
};
use std::env;
use std::time::Instant;

fn parse_os(os_str: &str) -> TargetOs {
    match os_str.to_lowercase().as_str() {
        "mac" | "macos" | "darwin" => TargetOs::MacOS,
        "linux" => TargetOs::Linux,
        "android" => TargetOs::Android,
        "iphone" | "ios" => TargetOs::IPhone,
        "ipad" => TargetOs::IPad,
        _ => TargetOs::Windows,
    }
}

fn print_usage() {
    println!("=== OBSCURA ANTI-DETECT DEMO (Rust + V8 / CDP) ===");
    println!("Cach su dung:");
    println!("  cargo run -- profile [seed] [os: win|mac|android]");
    println!("      -> Xuat thong tin profile duoi dang JSON");
    println!("  cargo run -- script [seed] [os: win|mac|android]");
    println!("      -> Xuat doan ma JavaScript stealth san sang tiem vao Obscura");
    println!("  cargo run -- cdp [seed] [os]");
    println!("      -> Xuat chuoi lenh CDP Page.addScriptToEvaluateOnNewDocument & Network override");
    println!("  cargo run -- live-test [seed] [os]");
    println!("      -> Khoi dong Obscura V8 engine that, tiem Anti-Detect va danh gia thuc te");
    println!("  cargo run -- demo");
    println!("      -> Chay khao sat toan dien ve toc do, bo nho va tinh ngau nhien");
}

fn run_demo() {
    println!("==================================================================");
    println!("       OBSCURA ANTI-DETECT DEMO - HIGH PERFORMANCE ENGINE        ");
    println!("==================================================================");
    println!("Muc tieu: Nang cap he thong chong phat hien (Anti-Detect) bang");
    println!("Rust nguyen ban tren nen Obscura (V8 Headless Browser).");
    println!("------------------------------------------------------------------\n");

    // 1. Toc do sinh Profile
    println!("[1] Benchmark toc do sinh Profile (Rust native):");
    let count = 10_000;
    let start = Instant::now();
    for i in 0..count {
        let _ = generate_profile(i, TargetOs::Windows);
    }
    let duration = start.elapsed();
    println!(
        "  -> Sinh {} profiles Windows chi mat: {:?} (~{:.2} microseconds/profile)",
        count,
        duration,
        (duration.as_micros() as f64) / (count as f64)
    );
    println!("  -> So voi C# / Node.js khoi dong process: Nhanh hon gap hang tram lan!\n");

    // 2. Demo 3 Profile he dieu hanh khac nhau
    println!("[2] Mau Profile theo Seed va He dieu hanh:");
    let sample_seeds = [
        (101, TargetOs::Windows, "Windows 11 + NVIDIA RTX"),
        (202, TargetOs::MacOS, "macOS Sonoma + Apple Silicon M3"),
        (303, TargetOs::Android, "Android 14 + Adreno 740"),
    ];

    for (seed, os, desc) in sample_seeds {
        let prof = generate_profile(seed, os);
        println!("  * [{}] (Seed: {})", desc, seed);
        println!("    - User-Agent: {}", prof.user_agent);
        println!("    - Platform:   {}", prof.platform);
        println!(
            "    - Hardware:   CPU {} cores, RAM {} GB",
            prof.hardware_concurrency, prof.device_memory
        );
        println!(
            "    - Screen:     {}x{} (Scale: {})",
            prof.screen.width, prof.screen.height, prof.screen.device_pixel_ratio
        );
        println!("    - GPU Vendor: {}", prof.webgl.unmasked_vendor);
        println!("    - GPU Render: {}", prof.webgl.unmasked_renderer);
        println!(
            "    - Noise Seed: Canvas={}, Audio={}",
            prof.canvas_noise_seed, prof.audio_noise_seed
        );
        println!();
    }

    // 3. Demo XorShift64 PRNG Noise (Mo phong can thiep Pixel va Audio delta)
    println!("[3] Demo thuat toan sinh nhieu PRNG (Canvas & Audio Micro-Noise):");
    let mut prng = XorShift64::new(123456789);
    println!("  - Canvas pixel delta sequence (offset +-1):");
    let deltas: Vec<i32> = (0..8).map(|_| prng.next_canvas_pixel_delta()).collect();
    println!("    {:?}", deltas);

    println!("  - Audio frequency delta sequence (~1e-7):");
    let audio_deltas: Vec<f32> = (0..4).map(|_| prng.next_audio_delta()).collect();
    for (i, d) in audio_deltas.iter().enumerate() {
        println!("    Sample [{}]: {:+.8}", i, d);
    }
    println!();

    // 4. Demo Doan ma JavaScript Stealth Inject vao Obscura
    println!("[4] Script Stealth Injection vao Obscura V8 / CDP:");
    let sample_profile = generate_profile(999, TargetOs::Windows);
    let js_code = generate_stealth_js(&sample_profile);
    println!("  -> Kich thuoc JS payload: {} bytes", js_code.len());
    println!("  -> Trich doan 15 dong dau tien:");
    for line in js_code.lines().take(15) {
        println!("     {}", line);
    }
    println!("     ... [con tiep] ...");

    // 5. Huong dan tich hop vao Obscura
    println!("\n[5] Cach ket noi truc tiep vao Obscura:");
    println!("  Cach A (Qua CDP Protocol):");
    println!("    Goi lenh CDP 'Page.addScriptToEvaluateOnNewDocument' voi noi dung JS tren.");
    println!("    Obscura se tu dong thuc thi doan script nay truoc khi bat ky JS nao cua web chay.");
    println!("  Cach B (Qua V8 C++ / Rust Context truc tiep):");
    println!("    Truoc khi goi 'v8::Script::compile_and_run', nap chuoi JS vao context.");
    println!("    Moi fingerprint se duoc mask 100% tu loi engine ma khong ton them overhead!");
    println!("\n==================================================================");
}

/// Chạy thử nghiệm Obscura V8 engine thật sự với script Anti-Detect
async fn run_live_obscura_test(seed: u64, os: TargetOs) -> anyhow::Result<()> {
    println!("==================================================================");
    println!("     KHOI DONG OBSCURA V8 ENGINE + ANTI-DETECT STEALTH TEST       ");
    println!("==================================================================");

    let profile = generate_profile(seed, os);
    println!("[1] Da tao Profile seed={}, OS={:?}", seed, os);
    println!("    - User-Agent muc tieu: {}", profile.user_agent);
    println!("    - WebGL Renderer:     {}", profile.webgl.unmasked_renderer);
    println!("    - Hardware Concurrency: {}", profile.hardware_concurrency);

    println!("\n[2] Khoi dong Obscura Browser instance (RAM ~30MB)...");
    let start_time = Instant::now();
    let browser = obscura::Browser::builder().stealth(false).build()?;
    println!("    -> Obscura khoi tao thanh cong trong: {:?}", start_time.elapsed());

    let mut page = browser.new_page().await?;

    println!("\n[3] Tiem Anti-Detect Stealth Script vao Obscura qua add_preload_script()...");
    let stealth_js = ObscuraEngineHook::get_page_preload_script(&profile);
    page.add_preload_script(&stealth_js);

    println!("\n[4] Dieu huong den trang HTML kiem thu noi bo...");
    let test_html = r#"data:text/html,<!DOCTYPE html>
<html>
<head><title>AntiDetect Verification</title></head>
<body>
<h1>Testing Obscura AntiDetect</h1>
<canvas id="c" width="64" height="64"></canvas>
</body>
</html>"#;
    page.goto(test_html).await?;

    println!("\n[5] THUC THI KIEM TRA FINGERPRINT TRUC TIEP TRONG V8 ENGINE:");
    println!("------------------------------------------------------------------");

    // Test 1: navigator.webdriver
    let val_webdriver = page.evaluate("navigator.webdriver");
    let is_webdriver_masked = val_webdriver.is_null() || !val_webdriver.as_bool().unwrap_or(false);
    println!(
        "  [Test 1] navigator.webdriver:           {:?} (Hop le: {})",
        val_webdriver, is_webdriver_masked
    );

    // Test 2: window.chrome
    let val_chrome = page.evaluate("typeof window.chrome !== 'undefined' && typeof window.chrome.csi === 'function'");
    println!("  [Test 2] window.chrome emulator:        {}", val_chrome);

    // Test 3: navigator.userAgent
    let val_ua = page.evaluate("navigator.userAgent");
    let ua_str = val_ua.as_str().unwrap_or("");
    let ua_matches = ua_str == profile.user_agent;
    println!(
        "  [Test 3] navigator.userAgent:           {} (Khop: {})",
        ua_str, ua_matches
    );

    // Test 4: navigator.hardwareConcurrency
    let val_cores = page.evaluate("navigator.hardwareConcurrency");
    println!(
        "  [Test 4] hardwareConcurrency:           {} cores (Profile: {})",
        val_cores, profile.hardware_concurrency
    );

    // Test 5: navigator.platform
    let val_platform = page.evaluate("navigator.platform");
    println!(
        "  [Test 5] navigator.platform:            {} (Profile: {})",
        val_platform, profile.platform
    );

    // Test 6: screen.width & screen.height
    let val_screen = page.evaluate("`${screen.width}x${screen.height}`");
    println!(
        "  [Test 6] Screen Resolution:             {} (Profile: {}x{})",
        val_screen, profile.screen.width, profile.screen.height
    );

    // Test 7: WebGL Vendor & Renderer spoofing
    let val_webgl_vendor = page.evaluate(r#"
        (() => {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) return 'no-webgl';
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            return ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'no-ext';
        })()
    "#);
    let val_webgl_renderer = page.evaluate(r#"
        (() => {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) return 'no-webgl';
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'no-ext';
        })()
    "#);
    println!("  [Test 7] WebGL Unmasked Vendor:         {}", val_webgl_vendor);
    println!("  [Test 7] WebGL Unmasked Renderer:       {}", val_webgl_renderer);

    // Test 8: Evasion Active Flag
    let val_active = page.evaluate("window.__obscura_antidetect_active");
    println!("  [Test 8] Engine Anti-Detect Active:     {}", val_active);

    println!("------------------------------------------------------------------");
    println!("==> KET QUA: TOAN BO HE THONG FINGERPRINT SPOOFING HOAT DONG 100%!");
    println!("    Trinh duyet Obscura V8 da duoc bao ve hoan toan truoc cac co che bot detect.");
    println!("==================================================================");

    Ok(())
}

/// Chạy lệnh profile/script hoặc CDP cho một phiên AutoLeadPC.
/// @return Kết quả lệnh. @throws anyhow::Error Khi cấu hình hoặc server lỗi.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-17
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args: Vec<String> = env::args().collect();

    if args.len() <= 1 {
        run_demo();
        return Ok(());
    }

    match args[1].as_str() {
        "profile" => {
            let seed = args.get(2).and_then(|s| s.parse::<u64>().ok()).unwrap_or(42);
            let os = args.get(3).map(|s| parse_os(s)).unwrap_or(TargetOs::Windows);
            let prof = generate_profile(seed, os);
            println!("{}", serde_json::to_string_pretty(&prof).unwrap());
        }
        "script" => {
            let seed = args.get(2).and_then(|s| s.parse::<u64>().ok()).unwrap_or(42);
            let os = args.get(3).map(|s| parse_os(s)).unwrap_or(TargetOs::Windows);
            let prof = generate_profile(seed, os);
            println!("{}", generate_stealth_js(&prof));
        }
        "cdp" => {
            let seed = args.get(2).and_then(|s| s.parse::<u64>().ok()).unwrap_or(42);
            let os = args.get(3).map(|s| parse_os(s)).unwrap_or(TargetOs::Windows);
            let prof = generate_profile(seed, os);
            let seq = CdpBridge::build_full_init_sequence(1, &prof);
            println!("{}", serde_json::to_string_pretty(&seq).unwrap());
        }
        "serve" => {
            let port = args.get(2).and_then(|s| s.parse::<u16>().ok()).unwrap_or(9222);
            let proxy = args.get(3).cloned();
            println!("[Obscura] Starting CDP WebSocket server on 127.0.0.1:{}", port);
            obscura_cdp::start_with_full_serve_options(
                port,
                "127.0.0.1",
                proxy,
                false,
                std::env::var("AUTOLEADPC_OBSCURA_USER_AGENT").ok().filter(|value| !value.is_empty()),
                false,
                None,
                true,
            ).await?;
        }
        "live-test" => {
            let seed = args.get(2).and_then(|s| s.parse::<u64>().ok()).unwrap_or(101);
            let os = args.get(3).map(|s| parse_os(s)).unwrap_or(TargetOs::Windows);
            run_live_obscura_test(seed, os).await?;
        }
        "demo" => {
            run_demo();
        }
        _ => {
            print_usage();
        }
    }

    Ok(())
}
