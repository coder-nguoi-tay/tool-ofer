use crate::profile::{AntiDetectProfile, BrandVersion, ClientHintsConfig, ScreenConfig, WebGlConfig};
use crate::noise::XorShift64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetOs {
    Windows,
    MacOS,
    Linux,
    Android,
    IPhone,
    IPad,
}

pub const CHROME_VERSION_POOL: &[(&str, &str)] = &[
    ("148", "148.0.7712.112"),
    ("149", "149.0.7780.95"),
    ("150", "150.0.7850.106"),
    ("151", "151.0.7915.88"),
    ("152", "152.0.7985.120"),
    ("153", "153.0.8050.105"),
    ("154", "154.0.8120.98"),
    ("156", "156.0.8260.115"),
];

pub struct ProfileGenerator;

/// Hàm tiện ích sinh profile theo seed số nguyên và hệ điều hành mong muốn.
pub fn generate_profile(seed: u64, os: TargetOs) -> AntiDetectProfile {
    ProfileGenerator::generate(&seed.to_string(), Some(os))
}

impl ProfileGenerator {
    /// Tạo ra một chuỗi băm 64-bit từ string seed
    pub fn hash_seed(seed_str: &str) -> u64 {
        let mut hash: u64 = 0xcbf29ce484222325;
        for byte in seed_str.as_bytes() {
            hash ^= *byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        hash
    }

    /// Tạo một AntiDetectProfile hoàn chỉnh dựa trên seed hoặc ngẫu nhiên
    pub fn generate(seed_str: &str, preferred_os: Option<TargetOs>) -> AntiDetectProfile {
        let seed = Self::hash_seed(seed_str);
        let mut rng = XorShift64::new(seed);

        let os = preferred_os.unwrap_or_else(|| {
            let roll = rng.next_u64() % 100;
            if roll < 35 {
                TargetOs::Windows
            } else if roll < 55 {
                TargetOs::MacOS
            } else if roll < 70 {
                TargetOs::Android
            } else if roll < 85 {
                TargetOs::IPhone
            } else if roll < 95 {
                TargetOs::IPad
            } else {
                TargetOs::Linux
            }
        });

        match os {
            TargetOs::Windows => Self::generate_windows(&mut rng, seed_str, seed),
            TargetOs::MacOS => Self::generate_mac(&mut rng, seed_str, seed),
            TargetOs::Linux => Self::generate_linux(&mut rng, seed_str, seed),
            TargetOs::Android => Self::generate_android(&mut rng, seed_str, seed),
            TargetOs::IPhone => Self::generate_iphone(&mut rng, seed_str, seed),
            TargetOs::IPad => Self::generate_ipad(&mut rng, seed_str, seed),
        }
    }

    fn generate_windows(rng: &mut XorShift64, seed_str: &str, _seed: u64) -> AntiDetectProfile {
        let (major_ver, chrome_ver) = CHROME_VERSION_POOL[(rng.next_u64() as usize) % CHROME_VERSION_POOL.len()];

        let gpu_options = [
            ("Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            ("Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            ("Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            ("Google Inc. (Intel)", "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            ("Google Inc. (Intel)", "ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)"),
        ];
        let gpu_choice = gpu_options[(rng.next_u64() as usize) % gpu_options.len()];

        let screen_options = [
            (1920, 1080, 1920, 1040),
            (2560, 1440, 2560, 1400),
            (1680, 1050, 1680, 1010),
            (1536, 864, 1536, 824),
        ];
        let screen_choice = screen_options[(rng.next_u64() as usize) % screen_options.len()];

        let cores = [4, 8, 12, 16][(rng.next_u64() as usize) % 4];
        let memory = [8, 16, 32][(rng.next_u64() as usize) % 3];

        let canvas_seed = rng.next_u64();
        let audio_seed = rng.next_u64();

        AntiDetectProfile {
            id: seed_str.to_string(),
            os: "Windows 11".to_string(),
            platform: "Win32".to_string(),
            vendor: "Google Inc.".to_string(),
            user_agent: format!("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{chrome_ver} Safari/537.36"),
            chrome_version: chrome_ver.to_string(),
            hardware_concurrency: cores,
            device_memory: memory,
            max_touch_points: 0,
            is_mobile: false,
            is_safari_ios: false,
            languages: vec!["en-US".to_string(), "en".to_string()],
            timezone: "America/New_York".to_string(),
            screen: ScreenConfig {
                width: screen_choice.0,
                height: screen_choice.1,
                avail_width: screen_choice.2,
                avail_height: screen_choice.3,
                color_depth: 24,
                pixel_depth: 24,
                device_pixel_ratio: 1.0,
            },
            webgl: WebGlConfig {
                unmasked_vendor: gpu_choice.0.to_string(),
                unmasked_renderer: gpu_choice.1.to_string(),
                vendor: "WebKit".to_string(),
                renderer: "WebKit WebGL".to_string(),
            },
            client_hints: Some(ClientHintsConfig {
                brands: vec![
                    BrandVersion { brand: "Chromium".to_string(), version: major_ver.to_string() },
                    BrandVersion { brand: "Google Chrome".to_string(), version: major_ver.to_string() },
                    BrandVersion { brand: "Not?A_Brand".to_string(), version: "99".to_string() },
                ],
                mobile: false,
                platform: "Windows".to_string(),
                platform_version: "15.0.0".to_string(),
                architecture: "x86".to_string(),
                bitness: "64".to_string(),
                model: "".to_string(),
            }),
            canvas_noise_seed: canvas_seed,
            audio_noise_seed: audio_seed,
        }
    }

    fn generate_mac(rng: &mut XorShift64, seed_str: &str, _seed: u64) -> AntiDetectProfile {
        let (major_ver, chrome_ver) = CHROME_VERSION_POOL[(rng.next_u64() as usize) % CHROME_VERSION_POOL.len()];

        let gpu_options = [
            ("Google Inc. (Apple)", "ANGLE (Apple, Apple M1, OpenGL 4.1)"),
            ("Google Inc. (Apple)", "ANGLE (Apple, Apple M2, OpenGL 4.1)"),
            ("Google Inc. (Apple)", "ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)"),
            ("Google Inc. (Apple)", "ANGLE (Apple, Apple M3, OpenGL 4.1)"),
        ];
        let gpu_choice = gpu_options[(rng.next_u64() as usize) % gpu_options.len()];

        let screen_options = [
            (1728, 1117, 1728, 1080, 2.0),
            (1512, 982, 1512, 945, 2.0),
            (1440, 900, 1440, 860, 2.0),
        ];
        let screen_choice = screen_options[(rng.next_u64() as usize) % screen_options.len()];

        let cores = [8, 10, 12][(rng.next_u64() as usize) % 3];
        let memory = [8, 16, 24, 32][(rng.next_u64() as usize) % 4];

        let canvas_seed = rng.next_u64();
        let audio_seed = rng.next_u64();

        AntiDetectProfile {
            id: seed_str.to_string(),
            os: "macOS Sonoma".to_string(),
            platform: "MacIntel".to_string(),
            vendor: "Google Inc.".to_string(),
            user_agent: format!("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{chrome_ver} Safari/537.36"),
            chrome_version: chrome_ver.to_string(),
            hardware_concurrency: cores,
            device_memory: memory,
            max_touch_points: 0,
            is_mobile: false,
            is_safari_ios: false,
            languages: vec!["en-US".to_string(), "en".to_string()],
            timezone: "America/New_York".to_string(),
            screen: ScreenConfig {
                width: screen_choice.0,
                height: screen_choice.1,
                avail_width: screen_choice.2,
                avail_height: screen_choice.3,
                color_depth: 30,
                pixel_depth: 30,
                device_pixel_ratio: screen_choice.4,
            },
            webgl: WebGlConfig {
                unmasked_vendor: gpu_choice.0.to_string(),
                unmasked_renderer: gpu_choice.1.to_string(),
                vendor: "WebKit".to_string(),
                renderer: "WebKit WebGL".to_string(),
            },
            client_hints: Some(ClientHintsConfig {
                brands: vec![
                    BrandVersion { brand: "Chromium".to_string(), version: major_ver.to_string() },
                    BrandVersion { brand: "Google Chrome".to_string(), version: major_ver.to_string() },
                    BrandVersion { brand: "Not?A_Brand".to_string(), version: "99".to_string() },
                ],
                mobile: false,
                platform: "macOS".to_string(),
                platform_version: "14.5.0".to_string(),
                architecture: "arm".to_string(),
                bitness: "64".to_string(),
                model: "".to_string(),
            }),
            canvas_noise_seed: canvas_seed,
            audio_noise_seed: audio_seed,
        }
    }

    fn generate_linux(rng: &mut XorShift64, seed_str: &str, _seed: u64) -> AntiDetectProfile {
        let (major_ver, chrome_ver) = CHROME_VERSION_POOL[(rng.next_u64() as usize) % CHROME_VERSION_POOL.len()];

        let gpu_options = [
            ("Google Inc. (Intel)", "ANGLE (Intel, Mesa Intel(R) UHD Graphics 770 (ADL-S GT1), OpenGL 4.6)"),
            ("Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060/PCIe/SSE2, OpenGL 4.6)"),
        ];
        let gpu_choice = gpu_options[(rng.next_u64() as usize) % gpu_options.len()];

        let canvas_seed = rng.next_u64();
        let audio_seed = rng.next_u64();

        AntiDetectProfile {
            id: seed_str.to_string(),
            os: "Linux Ubuntu 24.04".to_string(),
            platform: "Linux x86_64".to_string(),
            vendor: "Google Inc.".to_string(),
            user_agent: format!("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{chrome_ver} Safari/537.36"),
            chrome_version: chrome_ver.to_string(),
            hardware_concurrency: 8,
            device_memory: 16,
            max_touch_points: 0,
            is_mobile: false,
            is_safari_ios: false,
            languages: vec!["en-US".to_string(), "en".to_string()],
            timezone: "America/New_York".to_string(),
            screen: ScreenConfig {
                width: 1920,
                height: 1080,
                avail_width: 1920,
                avail_height: 1040,
                color_depth: 24,
                pixel_depth: 24,
                device_pixel_ratio: 1.0,
            },
            webgl: WebGlConfig {
                unmasked_vendor: gpu_choice.0.to_string(),
                unmasked_renderer: gpu_choice.1.to_string(),
                vendor: "WebKit".to_string(),
                renderer: "WebKit WebGL".to_string(),
            },
            client_hints: Some(ClientHintsConfig {
                brands: vec![
                    BrandVersion { brand: "Chromium".to_string(), version: major_ver.to_string() },
                    BrandVersion { brand: "Google Chrome".to_string(), version: major_ver.to_string() },
                    BrandVersion { brand: "Not?A_Brand".to_string(), version: "99".to_string() },
                ],
                mobile: false,
                platform: "Linux".to_string(),
                platform_version: "6.8.0".to_string(),
                architecture: "x86".to_string(),
                bitness: "64".to_string(),
                model: "".to_string(),
            }),
            canvas_noise_seed: canvas_seed,
            audio_noise_seed: audio_seed,
        }
    }

    fn generate_android(rng: &mut XorShift64, seed_str: &str, _seed: u64) -> AntiDetectProfile {
        let (major_ver, chrome_ver) = CHROME_VERSION_POOL[(rng.next_u64() as usize) % CHROME_VERSION_POOL.len()];

        let models = [
            ("SM-S928B", "Galaxy S24 Ultra", "Qualcomm", "Adreno (TM) 750", 412, 915, 3.5),
            ("SM-S918B", "Galaxy S23 Ultra", "Qualcomm", "Adreno (TM) 740", 412, 915, 3.5),
            ("Pixel 8 Pro", "Pixel 8 Pro", "ARM", "Mali-G715", 412, 892, 3.0),
        ];
        let m = models[(rng.next_u64() as usize) % models.len()];

        let canvas_seed = rng.next_u64();
        let audio_seed = rng.next_u64();

        AntiDetectProfile {
            id: seed_str.to_string(),
            os: "Android 14".to_string(),
            platform: "Linux armv8l".to_string(),
            vendor: "Google Inc.".to_string(),
            user_agent: format!("Mozilla/5.0 (Linux; Android 14; {}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{} Mobile Safari/537.36", m.0, chrome_ver),
            chrome_version: chrome_ver.to_string(),
            hardware_concurrency: 8,
            device_memory: 8,
            max_touch_points: 5,
            is_mobile: true,
            is_safari_ios: false,
            languages: vec!["en-US".to_string(), "en".to_string()],
            timezone: "America/New_York".to_string(),
            screen: ScreenConfig {
                width: m.4,
                height: m.5,
                avail_width: m.4,
                avail_height: m.5,
                color_depth: 24,
                pixel_depth: 24,
                device_pixel_ratio: m.6,
            },
            webgl: WebGlConfig {
                unmasked_vendor: m.2.to_string(),
                unmasked_renderer: m.3.to_string(),
                vendor: "WebKit".to_string(),
                renderer: "WebKit WebGL".to_string(),
            },
            client_hints: Some(ClientHintsConfig {
                brands: vec![
                    BrandVersion { brand: "Chromium".to_string(), version: major_ver.to_string() },
                    BrandVersion { brand: "Google Chrome".to_string(), version: major_ver.to_string() },
                    BrandVersion { brand: "Not?A_Brand".to_string(), version: "99".to_string() },
                ],
                mobile: true,
                platform: "Android".to_string(),
                platform_version: "14.0.0".to_string(),
                architecture: "".to_string(),
                bitness: "".to_string(),
                model: m.0.to_string(),
            }),
            canvas_noise_seed: canvas_seed,
            audio_noise_seed: audio_seed,
        }
    }

    fn generate_iphone(rng: &mut XorShift64, seed_str: &str, _seed: u64) -> AntiDetectProfile {
        let iphone_models = [
            ("iPhone 15 Pro", "17_5_1", 393, 852, 3.0),
            ("iPhone 15 Pro Max", "17_5_1", 430, 932, 3.0),
            ("iPhone 14 Pro", "17_4_1", 393, 852, 3.0),
            ("iPhone 13", "16_6_1", 390, 844, 3.0),
        ];
        let m = iphone_models[(rng.next_u64() as usize) % iphone_models.len()];

        let canvas_seed = rng.next_u64();
        let audio_seed = rng.next_u64();

        AntiDetectProfile {
            id: seed_str.to_string(),
            os: format!("iOS {}", m.1.replace('_', ".")),
            platform: "iPhone".to_string(),
            vendor: "Apple Computer, Inc.".to_string(),
            user_agent: format!("Mozilla/5.0 (iPhone; CPU iPhone OS {} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", m.1),
            chrome_version: "".to_string(),
            hardware_concurrency: 6,
            device_memory: 8,
            max_touch_points: 5,
            is_mobile: true,
            is_safari_ios: true,
            languages: vec!["en-US".to_string(), "en".to_string()],
            timezone: "America/New_York".to_string(),
            screen: ScreenConfig {
                width: m.2,
                height: m.3,
                avail_width: m.2,
                avail_height: m.3,
                color_depth: 32,
                pixel_depth: 32,
                device_pixel_ratio: m.4,
            },
            webgl: WebGlConfig {
                unmasked_vendor: "Apple Inc.".to_string(),
                unmasked_renderer: "Apple GPU".to_string(),
                vendor: "Apple Inc.".to_string(),
                renderer: "Apple GPU".to_string(),
            },
            client_hints: None, // Safari trên iOS thật không có Client Hints (userAgentData)
            canvas_noise_seed: canvas_seed,
            audio_noise_seed: audio_seed,
        }
    }

    fn generate_ipad(rng: &mut XorShift64, seed_str: &str, _seed: u64) -> AntiDetectProfile {
        let ipad_models = [
            ("iPad Air (5th gen)", "17_5_1", 820, 1180, 2.0),
            ("iPad Pro 11-inch", "17_5_1", 834, 1194, 2.0),
            ("iPad Pro 12.9-inch", "17_4_1", 1024, 1366, 2.0),
        ];
        let m = ipad_models[(rng.next_u64() as usize) % ipad_models.len()];

        let canvas_seed = rng.next_u64();
        let audio_seed = rng.next_u64();

        AntiDetectProfile {
            id: seed_str.to_string(),
            os: format!("iPadOS {}", m.1.replace('_', ".")),
            platform: "iPad".to_string(),
            vendor: "Apple Computer, Inc.".to_string(),
            user_agent: format!("Mozilla/5.0 (iPad; CPU OS {} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", m.1),
            chrome_version: "".to_string(),
            hardware_concurrency: 8,
            device_memory: 8,
            max_touch_points: 5,
            is_mobile: true,
            is_safari_ios: true,
            languages: vec!["en-US".to_string(), "en".to_string()],
            timezone: "America/New_York".to_string(),
            screen: ScreenConfig {
                width: m.2,
                height: m.3,
                avail_width: m.2,
                avail_height: m.3,
                color_depth: 24,
                pixel_depth: 24,
                device_pixel_ratio: m.4,
            },
            webgl: WebGlConfig {
                unmasked_vendor: "Apple Inc.".to_string(),
                unmasked_renderer: "Apple GPU".to_string(),
                vendor: "Apple Inc.".to_string(),
                renderer: "Apple GPU".to_string(),
            },
            client_hints: None, // Safari trên iPad thật không có Client Hints
            canvas_noise_seed: canvas_seed,
            audio_noise_seed: audio_seed,
        }
    }
}
