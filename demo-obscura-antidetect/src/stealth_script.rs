//! Stealth JavaScript Injection Generator for Obscura (V8 / CDP)
//!
//! Generates a self-contained, bullet-proof JavaScript script that overrides
//! browser fingerprinting APIs (Navigator, Canvas, WebGL, AudioContext, Screen, Client Hints).
//! Can be injected via CDP `Page.addScriptToEvaluateOnNewDocument` or evaluated
//! directly in Obscura's V8 context before executing web scripts.

use crate::profile::AntiDetectProfile;

/// Sinh đoạn mã JavaScript stealth hoàn chỉnh từ thông tin `AntiDetectProfile`.
pub fn generate_stealth_js(profile: &AntiDetectProfile) -> String {
    let profile_json = serde_json::to_string(profile).unwrap_or_else(|_| "{}".to_string());

    format!(
        r#"(() => {{
  // === AUTO-GENERATED OBSCURA ANTI-DETECT STEALTH INJECTION ===
  // Seeded Profile Data
  const __PROFILE__ = {profile_json};

  // Hàm giả in ra '[native code]' qua một registry WeakMap, không gắn own property 'toString' lên từng hàm
  // (Object.getOwnPropertyNames(fn) có 'toString' là dấu hiệu bị hook).
  const nativeToString = Function.prototype.toString;
  const nativeStrings = new WeakMap();
  const patchedToString = function toString() {{
    return nativeStrings.has(this) ? nativeStrings.get(this) : nativeToString.call(this);
  }};
  nativeStrings.set(patchedToString, 'function toString() {{ [native code] }}');
  // Chỉ thay Function.prototype.toString khi thật sự có hàm cần giả (engine native thì không cần).
  let toStringPatched = false;
  const spoofToString = (fn, name) => {{
    if (!toStringPatched) {{ Function.prototype.toString = patchedToString; toStringPatched = true; }}
    nativeStrings.set(fn, `function ${{name || fn.name || ''}}() {{ [native code] }}`);
    return fn;
  }};
  // Ghi đè trên prototype (như Chrome), bỏ qua khi engine đã trả đúng giá trị: không để lại dấu vết thừa.
  const defineGetter = (target, key, val) => {{
    if (target[key] === val) return;
    Object.defineProperty(Object.getPrototypeOf(target), key, {{
      // Getter dạng accessor shorthand: không có prototype, không gọi new được, giống getter native.
      get: spoofToString(Object.getOwnPropertyDescriptor({{ get [key]() {{ return val; }} }}, key).get, `get ${{key}}`),
      configurable: true,
      enumerable: true
    }});
    if (Object.prototype.hasOwnProperty.call(target, key)) delete target[key];
  }};

  // 1. Remove / Mask navigator.webdriver
  try {{
    // Chrome thật (không automation) trả false; engine Obscura cũng trả false trên prototype.
    defineGetter(navigator, 'webdriver', false);
  }} catch (_) {{}}

  // 2. Emulate window.chrome (Chỉ cho Chromium; Safari iOS KHÔNG có window.chrome)
  try {{
    if (__PROFILE__.is_safari_ios) {{
      try {{ delete window.chrome; }} catch (_) {{}}
    }} else if (!window.chrome) {{
      window.chrome = {{
        app: {{
          isInstalled: false,
          InstallState: {{ DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }},
          RunningState: {{ CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }}
        }},
        csi: spoofToString(function csi() {{
          return {{
            startE: Date.now(),
            onloadT: Date.now() + 200,
            pageT: 250,
            tran: 15
          }};
        }}, 'csi'),
        loadTimes: spoofToString(function loadTimes() {{
          const now = Date.now() / 1000;
          return {{
            requestTime: now - 0.5,
            startLoadTime: now - 0.4,
            commitLoadTime: now - 0.2,
            finishDocumentLoadTime: now - 0.1,
            finishLoadTime: now,
            firstPaintTime: now - 0.15,
            firstPaintAfterLoadTime: 0,
            navigationType: 'Other',
            wasFetchedViaSpdy: true,
            wasNpnNegotiated: true,
            npnNegotiatedProtocol: 'h2',
            wasAlternateProtocolAvailable: false,
            connectionInfo: 'h2'
          }};
        }}, 'loadTimes'),
        runtime: {{
          OnInstalledReason: {{ CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' }},
          OnRestartRequiredReason: {{ APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' }},
          PlatformArch: {{ ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' }},
          PlatformNaclArch: {{ ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' }},
          PlatformOs: {{ ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' }},
          RequestUpdateCheckStatus: {{ NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' }}
        }}
      }};
    }}
  }} catch (_) {{}}

  // 3. Spoof Navigator properties
  try {{
    const navProps = {{
      userAgent: __PROFILE__.user_agent,
      appVersion: __PROFILE__.user_agent.replace(/^Mozilla\//, ''),
      platform: __PROFILE__.platform,
      vendor: __PROFILE__.vendor,
      languages: Object.freeze([...__PROFILE__.languages]),
      language: __PROFILE__.languages[0] || 'en-US',
      hardwareConcurrency: __PROFILE__.hardware_concurrency,
      deviceMemory: __PROFILE__.device_memory,
      maxTouchPoints: __PROFILE__.max_touch_points
    }};

    for (const [key, val] of Object.entries(navProps)) {{
      if (key === 'languages' && JSON.stringify(navigator.languages) === JSON.stringify(val)) continue;
      defineGetter(navigator, key, val);
    }}

    if (__PROFILE__.is_safari_ios) defineGetter(navigator, 'standalone', false);
  }} catch (_) {{}}

  // 4. Spoof navigator.userAgentData (Client Hints)
  try {{
    if (__PROFILE__.client_hints && !__PROFILE__.is_safari_ios) {{
      const ch = __PROFILE__.client_hints;
      const uaData = {{
        brands: Object.freeze(ch.brands.map(b => ({{ brand: b.brand, version: b.version }}))),
        mobile: ch.mobile,
        platform: ch.platform,
        getHighEntropyValues: spoofToString(function getHighEntropyValues(hints) {{
          return Promise.resolve({{
            brands: uaData.brands,
            mobile: uaData.mobile,
            platform: uaData.platform,
            architecture: ch.architecture,
            bitness: ch.bitness,
            model: ch.model,
            platformVersion: ch.platform_version,
            uaFullVersion: __PROFILE__.chrome_version
          }});
        }}, 'getHighEntropyValues'),
        toJSON: spoofToString(function toJSON() {{
          return {{
            brands: uaData.brands,
            mobile: uaData.mobile,
            platform: uaData.platform
          }};
        }}, 'toJSON')
      }};

      const native = navigator.userAgentData;
      const sameHints = native && native.platform === uaData.platform && native.mobile === uaData.mobile &&
        JSON.stringify(native.brands) === JSON.stringify(uaData.brands);
      if (!sameHints) defineGetter(navigator, 'userAgentData', uaData);
    }} else {{
      try {{
        delete Object.getPrototypeOf(navigator).userAgentData;
        delete navigator.userAgentData;
      }} catch (_) {{}}
    }}
  }} catch (_) {{}}

  // 5. Spoof Screen properties
  try {{
    const sc = __PROFILE__.screen;
    const screenOverrides = {{
      width: sc.width,
      height: sc.height,
      availWidth: sc.avail_width,
      availHeight: sc.avail_height,
      colorDepth: sc.color_depth,
      pixelDepth: sc.pixel_depth
    }};

    for (const [key, val] of Object.entries(screenOverrides)) defineGetter(screen, key, val);

    if (window.devicePixelRatio !== sc.device_pixel_ratio) {{
      Object.defineProperty(window, 'devicePixelRatio', {{
        get: spoofToString(Object.getOwnPropertyDescriptor({{ get devicePixelRatio() {{ return sc.device_pixel_ratio; }} }}, 'devicePixelRatio').get, 'get devicePixelRatio'),
        configurable: true,
        enumerable: true
      }});
    }}
  }} catch (_) {{}}

  // 6. PRNG Noise Generator for Canvas & Audio (Ported from C# XorShift64)
  class XorShift64 {{
    constructor(seed) {{
      // BigInt 64-bit seed
      this.state = BigInt(seed || 1) & 0xFFFFFFFFFFFFFFFFn;
      if (this.state === 0n) this.state = 0x853c49e6748fea9bn;
    }}
    next() {{
      let x = this.state;
      x ^= (x << 13n) & 0xFFFFFFFFFFFFFFFFn;
      x ^= (x >> 7n) & 0xFFFFFFFFFFFFFFFFn;
      x ^= (x << 17n) & 0xFFFFFFFFFFFFFFFFn;
      this.state = x;
      return Number(x & 0xFFFFFFFFn);
    }}
    nextFloat() {{
      return (this.next() >>> 0) / 4294967296.0;
    }}
  }}

  // 7. Canvas Fingerprint Noise
  // Nhiễu cố định theo (seed, vị trí điểm ảnh): đọc lại bao nhiêu lần cũng ra cùng hash, khác nhau giữa các profile.
  // Bản cũ dùng PRNG có trạng thái nên mỗi lần đọc ra hash khác, và toDataURL ghi nhiễu cộng dồn vào canvas.
  try {{
    const canvasSeed = Number(BigInt.asUintN(32, BigInt(__PROFILE__.canvas_noise_seed || 1)));
    const pixelDelta = (x, y) => {{
      let h = Math.imul(canvasSeed ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663), 0x45d9f3b);
      h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
      return ((h ^ (h >>> 16)) >>> 0) % 3 - 1;
    }};
    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    const origPutImageData = CanvasRenderingContext2D.prototype.putImageData;
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;

    const applyCanvasNoise = (imageData, sx, sy) => {{
      const d = imageData.data;
      const w = imageData.width;
      for (let i = 0; i < d.length; i += 16) {{
        const p = i >> 2;
        d[i] = Math.max(0, Math.min(255, d[i] + pixelDelta(sx + (p % w), sy + Math.floor(p / w))));
      }}
      return imageData;
    }};

    CanvasRenderingContext2D.prototype.getImageData = spoofToString(function getImageData(sx, sy, sw, sh, settings) {{
      return applyCanvasNoise(origGetImageData.call(this, sx, sy, sw, sh, settings), Math.round(sx) || 0, Math.round(sy) || 0);
    }}, 'getImageData');

    HTMLCanvasElement.prototype.toDataURL = spoofToString(function toDataURL(type, quality) {{
      let ctx = null, original = null;
      try {{
        ctx = this.getContext('2d');
        if (ctx && this.width > 0 && this.height > 0) {{
          const w = Math.min(16, this.width), h = Math.min(16, this.height);
          original = origGetImageData.call(ctx, 0, 0, w, h);
          origPutImageData.call(ctx, applyCanvasNoise(origGetImageData.call(ctx, 0, 0, w, h), 0, 0), 0, 0);
        }}
      }} catch (_) {{}}
      try {{
        return origToDataURL.call(this, type, quality);
      }} finally {{
        if (original) origPutImageData.call(ctx, original, 0, 0);
      }}
    }}, 'toDataURL');
  }} catch (_) {{}}

  // 8. Audio Fingerprint Noise
  // Mỗi buffer chỉ nhận nhiễu một lần, cố định theo (seed, chỉ số mẫu). Bản cũ cộng thêm nhiễu mỗi lần gọi
  // getChannelData nên hai lần đọc cùng buffer ra hai giá trị khác nhau (dấu hiệu bị can thiệp).
  try {{
    const audioSeed = Number(BigInt.asUintN(32, BigInt(__PROFILE__.audio_noise_seed || 1)));
    const sampleDelta = (i) => {{
      let h = Math.imul(audioSeed ^ Math.imul(i, 2654435761), 0x45d9f3b);
      h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
      return (((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5) * 0.0000002;
    }};
    if (typeof AudioBuffer !== 'undefined') {{
      const origGetChannelData = AudioBuffer.prototype.getChannelData;
      const noised = new WeakSet();
      const noiseOnce = (data) => {{
        if (!noised.has(data)) {{
          noised.add(data);
          for (let i = 0; i < data.length; i += 64) data[i] += sampleDelta(i);
        }}
        return data;
      }};
      AudioBuffer.prototype.getChannelData = spoofToString(function getChannelData(channel) {{
        return noiseOnce(origGetChannelData.call(this, channel));
      }}, 'getChannelData');
      if (AudioBuffer.prototype.copyFromChannel) {{
        AudioBuffer.prototype.copyFromChannel = spoofToString(function copyFromChannel(destination, channelNumber, startInChannel) {{
          const source = noiseOnce(origGetChannelData.call(this, channelNumber));
          const start = startInChannel || 0;
          for (let i = 0; i < destination.length && start + i < source.length; i++) destination[i] = source[start + i];
        }}, 'copyFromChannel');
      }}
    }}
  }} catch (_) {{}}

  // 9. WebGL Spoofing (Vendor & Renderer)
  try {{
    const glParams = {{
      37445: __PROFILE__.webgl.unmasked_vendor,   // UNMASKED_VENDOR_WEBGL
      37446: __PROFILE__.webgl.unmasked_renderer, // UNMASKED_RENDERER_WEBGL
      7936: __PROFILE__.webgl.vendor,             // VENDOR
      7937: __PROFILE__.webgl.renderer,           // RENDERER
      35724: __PROFILE__.webgl.shading_language_version // SHADING_LANGUAGE_VERSION
    }};

    const hookWebGL = (proto) => {{
      if (!proto) return;
      const origGetParameter = proto.getParameter;
      proto.getParameter = spoofToString(function getParameter(param) {{
        if (param in glParams) {{
          return glParams[param];
        }}
        return origGetParameter.call(this, param);
      }}, 'getParameter');

      const origGetExtension = proto.getExtension;
      proto.getExtension = spoofToString(function getExtension(name) {{
        const ext = origGetExtension.call(this, name);
        if (ext && (name === 'WEBGL_debug_renderer_info')) {{
          return {{
            UNMASKED_VENDOR_WEBGL: 37445,
            UNMASKED_RENDERER_WEBGL: 37446
          }};
        }}
        return ext;
      }}, 'getExtension');
    }};

    if (typeof WebGLRenderingContext !== 'undefined') {{
      hookWebGL(WebGLRenderingContext.prototype);
    }}
    if (typeof WebGL2RenderingContext !== 'undefined') {{
      hookWebGL(WebGL2RenderingContext.prototype);
    }}

    // Polyfill lightweight WebGL context for headless engines without native GPU
    if (typeof HTMLCanvasElement !== 'undefined') {{
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = spoofToString(function getContext(type, attributes) {{
        const ctx = origGetContext ? origGetContext.call(this, type, attributes) : null;
        if (ctx) return ctx;

        if (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2') {{
          return {{
            canvas: this,
            getParameter: spoofToString(function getParameter(param) {{
              return glParams[param] || null;
            }}, 'getParameter'),
            getExtension: spoofToString(function getExtension(name) {{
              if (name === 'WEBGL_debug_renderer_info') {{
                return {{
                  UNMASKED_VENDOR_WEBGL: 37445,
                  UNMASKED_RENDERER_WEBGL: 37446
                }};
              }}
              return null;
            }}, 'getExtension')
          }};
        }}
        return ctx;
      }}, 'getContext');
    }}
  }} catch (_) {{}}

  // 7. Auto-follow HTML <meta http-equiv="refresh"> redirects (for Offerwall Trackers like Toffers)
  try {{
    const handleMetaRefresh = () => {{
      if (window.__meta_refresh_navigating) return;
      const meta = document.querySelector('meta[http-equiv="refresh" i]');
      if (meta) {{
        const content = meta.getAttribute('content') || '';
        const match = content.match(/url=(.+)$/i);
        if (match && match[1]) {{
          window.__meta_refresh_navigating = true;
          const target = match[1].trim().replace(/['"]/g, '');
          const delayMatch = content.match(/^(\d+)/);
          const delayMs = delayMatch ? parseInt(delayMatch[1], 10) * 1000 : 0;
          setTimeout(() => {{
            try {{
              const absUrl = new URL(target, window.location.href).href;
              window.location.replace(absUrl);
            }} catch (_) {{
              window.location.replace(target);
            }}
          }}, delayMs);
        }}
      }}
    }};

    if (document.readyState === 'loading') {{
      document.addEventListener('DOMContentLoaded', handleMetaRefresh, {{ once: true }});
    }} else {{
      handleMetaRefresh();
    }}

    if (typeof MutationObserver !== 'undefined' && document.documentElement) {{
      const observer = new MutationObserver(() => handleMetaRefresh());
      observer.observe(document.documentElement, {{ childList: true, subtree: true }});
    }}
  }} catch (_) {{}}

}})();
"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generator::{generate_profile, TargetOs};

    #[test]
    fn test_generate_stealth_js_contains_expected_fields() {
        let profile = generate_profile(42, TargetOs::Windows);
        let js = generate_stealth_js(&profile);

        assert!(js.contains("navigator.webdriver"));
        assert!(js.contains("window.chrome"));
        assert!(js.contains(&profile.user_agent));
        assert!(js.contains(&profile.webgl.unmasked_renderer));
        assert!(js.contains("XorShift64"));
        assert!(js.contains("UNMASKED_RENDERER_WEBGL"));
    }
}
