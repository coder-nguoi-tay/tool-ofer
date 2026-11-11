import { desktopWebglParams } from './desktop-webgl-params.mjs';
const DEVICE_PROFILES = {
  windows: {
    label: 'Windows Desktop',
    ua: v => {
      const ver = String(v || '130.0.0.0');
      const safeVer = ver.includes('.') ? ver : `${ver}.0.0.0`;
      return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${safeVer} Safari/537.36`;
    },
    viewport: null,
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    screen: {
      width: 1920,
      height: 1080,
      availHeight: 1032,
      frameHeight: 87
    },
    uaData: {
      platform: 'Windows',
      platformVersion: '10.0.0',
      architecture: 'x86',
      bitness: '64',
      model: ''
    },
    spoof: {
      platform: 'Win32',
      maxTouchPoints: 0,
      mobile: false,
      uaPlatform: 'Windows',
      dpr: 1,
      vendor: 'Google Inc.',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      webglVendor: 'Google Inc. (NVIDIA)',
      webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      webglParams: desktopWebglParams
    }
  },
  macos: {
    label: 'macOS Desktop',
    // Chrome trên Apple Silicon vẫn gửi "Intel Mac OS X 10_15_7"; kiến trúc thật nằm trong Client Hints.
    ua: v => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`,
    viewport: null,
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 2,
    screen: {
      width: 1440,
      height: 900,
      availTop: 25,
      availHeight: 875,
      frameHeight: 79
    },
    uaData: {
      platform: 'macOS',
      platformVersion: '14.6.1',
      architecture: 'arm',
      bitness: '64',
      model: ''
    },
    spoof: {
      platform: 'MacIntel',
      maxTouchPoints: 0,
      mobile: false,
      uaPlatform: 'macOS',
      dpr: 2,
      vendor: 'Google Inc.',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      webglVendor: 'Google Inc. (Apple)',
      webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
      webglParams: desktopWebglParams
    }
  },
  linux: {
    label: 'Linux Desktop',
    ua: v => `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`,
    viewport: null,
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    screen: {
      width: 1920,
      height: 1080,
      availHeight: 1053,
      frameHeight: 77
    },
    uaData: {
      platform: 'Linux',
      platformVersion: '6.8.0',
      architecture: 'x86',
      bitness: '64',
      model: ''
    },
    spoof: {
      platform: 'Linux x86_64',
      maxTouchPoints: 0,
      mobile: false,
      uaPlatform: 'Linux',
      dpr: 1,
      vendor: 'Google Inc.',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      webglVendor: 'Google Inc. (Intel)',
      webglRenderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)',
      webglParams: desktopWebglParams
    }
  },
  android: {
    label: 'Android (Chrome)',
    ua: v => `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Mobile Safari/537.36`,
    viewport: {
      width: 412,
      height: 915
    },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2.625,
    screen: {
      width: 412,
      height: 915
    },
    uaData: {
      platform: 'Android',
      platformVersion: '14.0.0',
      architecture: '',
      bitness: '',
      model: 'Pixel 8'
    },
    spoof: {
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
      mobile: true,
      uaPlatform: 'Android',
      dpr: 2.625,
      vendor: 'Google Inc.',
      hardwareConcurrency: 9,
      deviceMemory: 8,
      webglVendor: 'ARM',
      webglRenderer: 'Mali-G715'
    }
  },
  // iPad/iPhone: Chrome trên iOS là WebKit nên giả lập từ Blink chỉ ở mức bề mặt (UA, platform, màn hình).
  ipad: {
    label: 'iPad (Chrome)',
    ua: v => `Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${v} Mobile/15E148 Safari/604.1`,
    viewport: {
      width: 820,
      height: 1180
    },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    screen: {
      width: 820,
      height: 1180
    },
    spoof: {
      platform: 'iPad',
      maxTouchPoints: 5,
      mobile: false,
      uaPlatform: 'iOS',
      dpr: 2,
      vendor: 'Apple Computer, Inc.',
      hardwareConcurrency: 8,
      webglVendor: 'Apple Inc.',
      webglRenderer: 'Apple GPU'
    }
  },
  ios: {
    label: 'iPhone (Chrome)',
    ua: v => `Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${v} Mobile/15E148 Safari/604.1`,
    viewport: {
      width: 390,
      height: 844
    },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    screen: {
      width: 390,
      height: 844
    },
    spoof: {
      platform: 'iPhone',
      maxTouchPoints: 5,
      mobile: true,
      uaPlatform: 'iOS',
      dpr: 3,
      vendor: 'Apple Computer, Inc.',
      hardwareConcurrency: 6,
      webglVendor: 'Apple Inc.',
      webglRenderer: 'Apple GPU'
    }
  }
};
export { DEVICE_PROFILES };
