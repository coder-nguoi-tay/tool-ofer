/**
 * Giả lập thiết bị và chống fingerprint cho các phiên Chrome do Playwright điều khiển.
 *
 * Nguyên tắc: thứ gì Chrome cho phép đổi tận gốc qua CDP (User-Agent, Client Hints,
 * navigator.platform, số nhân CPU, ngôn ngữ) thì đổi qua CDP; phần còn lại vá bằng JS
 * nhưng hàm vá phải trông như hàm native (toString, name, length) và nhiễu phải ổn định
 * trong cả phiên, vì các bộ dò như CreepJS đọc hai lần để bắt nhiễu ngẫu nhiên.
 */

const greaseChars = [' ', '(', ':', '-', '.', '/', ')', ';', '=', '?', '_'];
const greaseVersions = ['8', '99', '24'];
const brandOrders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

/**
 * Sinh danh sách brand Client Hints giống thuật toán GREASE của Chrome (seed = bản chính).
 *
 * @param {string} fullVersion Phiên bản đầy đủ, ví dụ 155.0.8037.98.
 * @param {string|null} brand Tên trình duyệt; null với Chromium thuần.
 * @return {{brands: {brand: string, version: string}[], fullVersionList: {brand: string, version: string}[]}}
 */
export function buildBrandLists(fullVersion, brand = 'Google Chrome') {
  const major = Number(String(fullVersion).split('.')[0]) || 0;
  const greaseBrand = `Not${greaseChars[major % greaseChars.length]}A${greaseChars[(major + 1) % greaseChars.length]}Brand`;
  const greaseVersion = greaseVersions[major % greaseVersions.length];
  const order = brandOrders[major % brandOrders.length];
  const make = (useFull) => {
    const version = useFull ? fullVersion : String(major);
    const grease = { brand: greaseBrand, version: useFull ? `${greaseVersion}.0.0.0` : greaseVersion };
    const chromium = { brand: 'Chromium', version };
    if (!brand) return order[0] > order[1] ? [grease, chromium] : [chromium, grease];
    const list = new Array(3);
    list[order[0]] = grease;
    list[order[1]] = chromium;
    list[order[2]] = { brand, version };
    return list;
  };
  return { brands: make(false), fullVersionList: make(true) };
}

/** Tên brand Client Hints theo kênh Chrome đã cài. */
export function chromeBrandForChannel(channel) {
  return /testing|cft/i.test(String(channel ?? '')) ? 'Google Chrome for Testing' : 'Google Chrome';
}

const countryLocales = {
  US: 'en-US', GB: 'en-GB', CA: 'en-CA', AU: 'en-AU', NZ: 'en-NZ', IE: 'en-IE', IN: 'en-IN', SG: 'en-SG',
  PH: 'en-PH', ZA: 'en-ZA', VN: 'vi-VN', DE: 'de-DE', AT: 'de-AT', CH: 'de-CH', FR: 'fr-FR', BE: 'fr-BE',
  ES: 'es-ES', MX: 'es-MX', AR: 'es-AR', CO: 'es-CO', CL: 'es-CL', IT: 'it-IT', PT: 'pt-PT', BR: 'pt-BR',
  NL: 'nl-NL', PL: 'pl-PL', SE: 'sv-SE', NO: 'nb-NO', DK: 'da-DK', FI: 'fi-FI', RU: 'ru-RU', UA: 'uk-UA',
  TR: 'tr-TR', JP: 'ja-JP', KR: 'ko-KR', CN: 'zh-CN', TW: 'zh-TW', HK: 'zh-HK', TH: 'th-TH', ID: 'id-ID',
  MY: 'ms-MY', CZ: 'cs-CZ', RO: 'ro-RO', HU: 'hu-HU', GR: 'el-GR', IL: 'he-IL', SA: 'ar-SA', AE: 'ar-AE',
};

/**
 * Chọn ngôn ngữ trình duyệt khớp quốc gia của IP proxy.
 *
 * @param {string|undefined} countryCode Mã quốc gia ISO (ipinfo.io `country`).
 * @return {{locale: string, languages: string[]}} locale cho Intl và danh sách navigator.languages.
 */
export function localeForCountry(countryCode) {
  const locale = countryLocales[String(countryCode ?? '').toUpperCase()] ?? 'en-US';
  const language = locale.split('-')[0];
  const languages = language === 'en'
    ? (locale === 'en-US' ? ['en-US', 'en'] : [locale, 'en-US', 'en'])
    : [locale, language, 'en-US', 'en'];
  return { locale, languages };
}

/**
 * Tham số Emulation.setUserAgentOverride đầy đủ: UA, Client Hints, navigator.platform, ngôn ngữ.
 *
 * @param {object} deviceProfile Một phần tử của DEVICE_PROFILES.
 * @param {{version: string, channel?: string}} build Bản Chrome đang chạy.
 * @param {string[]} languages Danh sách ngôn ngữ (không kèm q=, Chrome tự thêm vào header).
 * @return {object} Tham số CDP.
 */
export function buildUserAgentOverride(deviceProfile, build, languages) {
  const params = {
    userAgent: deviceProfile.ua(build.version),
    acceptLanguage: languages.join(','),
    platform: deviceProfile.spoof.platform,
  };
  // Chrome trên iOS là WebKit: không có Client Hints, phần đó do init script xoá.
  if (deviceProfile.uaData) {
    const { brands, fullVersionList } = buildBrandLists(build.version, chromeBrandForChannel(build.channel));
    params.userAgentMetadata = {
      brands,
      fullVersionList,
      fullVersion: build.version,
      platform: deviceProfile.uaData.platform,
      platformVersion: deviceProfile.uaData.platformVersion,
      architecture: deviceProfile.uaData.architecture,
      model: deviceProfile.uaData.model ?? '',
      mobile: Boolean(deviceProfile.spoof.mobile),
      bitness: deviceProfile.uaData.bitness ?? '',
      wow64: false,
    };
  }
  return params;
}

/**
 * Cấu hình truyền vào stealthInitScript cho một phiên.
 *
 * @param {object} deviceProfile Một phần tử của DEVICE_PROFILES.
 * @param {object} antiFingerprint Tuỳ chọn chống fingerprint của người dùng.
 * @param {number} seed Hạt nhiễu riêng của phiên.
 * @return {object} Cấu hình thuần JSON.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export function buildStealthConfig(deviceProfile, antiFingerprint = {}, seed = 1, userAgent = '') {
  const spoof = deviceProfile.spoof || {};
  const ua = userAgent || (typeof deviceProfile.ua === 'function' ? deviceProfile.ua('130.0.0.0') : '');
  const uaData = deviceProfile.uaData ? { ...deviceProfile.uaData } : null;
  if (uaData && !uaData.uaFullVersion && uaData.fullVersion) {
    uaData.uaFullVersion = uaData.fullVersion;
  }
  return {
    userAgent: ua,
    platform: spoof.platform || deviceProfile.platform,
    vendor: spoof.vendor,
    maxTouchPoints: spoof.maxTouchPoints,
    hardwareConcurrency: spoof.hardwareConcurrency ?? null,
    deviceMemory: spoof.deviceMemory ?? null,
    webkitOnly: spoof.uaPlatform === 'iOS',
    isMobile: Boolean(deviceProfile.isMobile),
    uaData,
    webglVendor: spoof.webglVendor,
    webglRenderer: spoof.webglRenderer,
    webglParams: spoof.webglParams ?? null,
    workerInjection: Boolean(antiFingerprint.workerInjection),
    screen: deviceProfile.screen && !deviceProfile.isMobile
      ? { availTop: deviceProfile.screen.availTop ?? 0, availHeight: deviceProfile.screen.availHeight ?? deviceProfile.screen.height, frameHeight: deviceProfile.screen.frameHeight ?? 85 }
      : null,
    // Mỗi mục trong Settings điều khiển riêng lớp nhiễu tương ứng.
    noise: {
      canvas: Boolean(antiFingerprint.canvas),
      clientRects: Boolean(antiFingerprint.clientRects),
      webgl: Boolean(antiFingerprint.webgl),
      fonts: Boolean(antiFingerprint.fonts),
      audio: true,
    },
    seed: (Number(seed) >>> 0) || 1,
  };
}

/**
 * Script vá trình duyệt, chạy trong mọi frame (addInitScript) và trong Web Worker tạo từ blob (Worker wrapper).
 * Phải tự chứa hoàn toàn vì được tuần tự hoá thành chuỗi.
 *
 * @param {object} cfg Kết quả buildStealthConfig.
 */
export function stealthInitScript(cfg) {
  const G = globalThis;

  // ── Hàm vá trông như native ───────────────────────────────────────────────
  const nativeSource = new WeakMap();
  const originalToString = Function.prototype.toString;
  const toStringImpl = {
    toString() {
      if (nativeSource.has(this)) return nativeSource.get(this);
      return originalToString.call(this);
    },
  }.toString;
  nativeSource.set(toStringImpl, 'function toString() { [native code] }');
  try {
    Object.defineProperty(Function.prototype, 'toString', {
      ...Object.getOwnPropertyDescriptor(Function.prototype, 'toString'),
      value: toStringImpl,
    });
  } catch {}

  const replaceMethod = (proto, name, makeImpl) => {
    const desc = proto && Object.getOwnPropertyDescriptor(proto, name);
    if (!desc || typeof desc.value !== 'function') return;
    const original = desc.value;
    const impl = makeImpl(original);
    const wrapped = { [name](...args) { return impl.apply(this, args); } }[name];
    try { Object.defineProperty(wrapped, 'length', { value: original.length }); } catch {}
    nativeSource.set(wrapped, `function ${name}() { [native code] }`);
    Object.defineProperty(proto, name, { ...desc, value: wrapped });
  };

  // Gọi getter gốc trước để giữ nguyên lỗi "Illegal invocation" khi gọi trên prototype.
  const replaceGetter = (proto, name, getValue) => {
    if (!proto) return;
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (!desc || typeof desc.get !== 'function') {
      try {
        const getter = { [name]() { return getValue.call(this); } }[name];
        nativeSource.set(getter, `function get ${name}() { [native code] }`);
        Object.defineProperty(proto, name, { get: getter, configurable: true, enumerable: true });
      } catch {}
      return;
    }
    const originalGet = desc.get;
    const getter = Object.getOwnPropertyDescriptor({
      get [name]() {
        const real = originalGet.call(this);
        return getValue.call(this, real);
      },
    }, name).get;
    nativeSource.set(getter, `function get ${name}() { [native code] }`);
    Object.defineProperty(proto, name, { ...desc, get: getter });
  };

  // ── Nhiễu xác định theo seed: cùng đầu vào luôn ra cùng kết quả trong một phiên ──
  const hash = (n) => {
    let x = (n ^ cfg.seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    return (x ^ (x >>> 16)) >>> 0;
  };
  const unit = (n) => (hash(n) % 10000) / 10000 - 0.5; // [-0.5, 0.5)
  const scale = 1 + (1 + (cfg.seed % 997)) * 1e-8 * (cfg.seed % 2 ? 1 : -1);

  // ── Worker tạo từ blob (cách các script fingerprint hay dùng): ghép script vá vào đầu mã worker.
  // Qua CDP không chắc chạy kịp vì Playwright cho worker chạy ngay khi gắn vào.
  if (typeof G.Worker === 'function' && typeof G.XMLHttpRequest === 'function' && G.document) {
    const OriginalWorker = G.Worker;
    const patchSource = `(${originalToString.call(stealthInitScript)})(${JSON.stringify(cfg)});\n`;
    const patchedUrl = (url) => {
      const href = String(url);
      if (!href.startsWith('blob:')) return url;
      const xhr = new G.XMLHttpRequest();
      xhr.open('GET', href, false);
      xhr.send();
      if (xhr.status !== 200 && xhr.status !== 0) return url;
      return G.URL.createObjectURL(new G.Blob([patchSource, xhr.responseText], { type: 'text/javascript' }));
    };
    const WorkerProxy = new Proxy(OriginalWorker, {
      construct(target, args, newTarget) {
        const nextArgs = [...args];
        try { if (nextArgs.length > 0) nextArgs[0] = patchedUrl(nextArgs[0]); } catch {}
        return Reflect.construct(target, nextArgs, newTarget === WorkerProxy ? target : newTarget);
      },
    });
    nativeSource.set(WorkerProxy, 'function Worker() { [native code] }');
    try {
      Object.defineProperty(OriginalWorker.prototype, 'constructor', { ...Object.getOwnPropertyDescriptor(OriginalWorker.prototype, 'constructor'), value: WorkerProxy });
      Object.defineProperty(G, 'Worker', { ...Object.getOwnPropertyDescriptor(G, 'Worker'), value: WorkerProxy });
    } catch {}
  }

  // ── navigator: chỉ vá khi CDP chưa đổi được (iframe khác tiến trình, worker) ──
  const nav = G.navigator;
  const navProto = nav && Object.getPrototypeOf(nav);
  if (navProto) {
    // Chỉ vá webdriver khi automation bị lộ (true); Chrome thật trả false. Tránh tạo khác biệt không cần thiết.
    if ('webdriver' in nav && nav.webdriver) replaceGetter(navProto, 'webdriver', () => false);
    if (cfg.platform && nav.platform !== cfg.platform) replaceGetter(navProto, 'platform', () => cfg.platform);
    if (cfg.userAgent && nav.userAgent !== cfg.userAgent) {
      replaceGetter(navProto, 'userAgent', () => cfg.userAgent);
      replaceGetter(navProto, 'appVersion', () => cfg.userAgent.replace(/^Mozilla\//, ''));
    }
    if (cfg.vendor && 'vendor' in nav && nav.vendor !== cfg.vendor) replaceGetter(navProto, 'vendor', () => cfg.vendor);
    if (typeof cfg.maxTouchPoints === 'number' && 'maxTouchPoints' in nav && nav.maxTouchPoints !== cfg.maxTouchPoints) {
      replaceGetter(navProto, 'maxTouchPoints', () => cfg.maxTouchPoints);
    }
    if (cfg.hardwareConcurrency && nav.hardwareConcurrency !== cfg.hardwareConcurrency) {
      replaceGetter(navProto, 'hardwareConcurrency', () => cfg.hardwareConcurrency);
    }
    if (cfg.webkitOnly) {
      // Safari/WebKit không có Client Hints, deviceMemory, window.chrome.
      try { delete navProto.userAgentData; } catch {}
      try { delete navProto.deviceMemory; } catch {}
      try { delete G.NavigatorUAData; } catch {}
      try { delete G.chrome; } catch {}
    } else if (cfg.deviceMemory && 'deviceMemory' in nav && nav.deviceMemory !== cfg.deviceMemory) {
      replaceGetter(navProto, 'deviceMemory', () => cfg.deviceMemory);
    }

    // ── Plugins & MimeTypes: Đồng bộ đúng thực tế cho desktop (có PDF Viewer) và mobile (rỗng) ──
    if (cfg.isMobile || cfg.webkitOnly) {
      if ('pdfViewerEnabled' in nav && nav.pdfViewerEnabled !== false) {
        replaceGetter(navProto, 'pdfViewerEnabled', () => false);
      }
    } else {
      if ('pdfViewerEnabled' in nav && nav.pdfViewerEnabled !== true) {
        replaceGetter(navProto, 'pdfViewerEnabled', () => true);
      }
      if ('plugins' in nav && nav.plugins.length === 0) {
        const createPlugin = (name, filename, description, mimeTypes) => {
          const plugin = { name, filename, description, length: mimeTypes.length };
          mimeTypes.forEach((m, idx) => { plugin[idx] = m; plugin[m.type] = m; });
          return plugin;
        };
        const mimePdf = { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' };
        const mimeTextPdf = { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' };

        const pluginList = [
          createPlugin('PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format', [mimePdf, mimeTextPdf]),
          createPlugin('Chrome PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format', [mimePdf, mimeTextPdf]),
          createPlugin('Chromium PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format', [mimePdf, mimeTextPdf]),
          createPlugin('Microsoft Edge PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format', [mimePdf, mimeTextPdf]),
          createPlugin('WebKit built-in PDF', 'internal-pdf-viewer', 'Portable Document Format', [mimePdf, mimeTextPdf]),
        ];

        mimePdf.enabledPlugin = pluginList[0];
        mimeTextPdf.enabledPlugin = pluginList[0];

        const mockPlugins = {
          length: pluginList.length,
          item(i) { return this[i] || null; },
          namedItem(n) { return this[n] || null; },
          refresh() {},
        };
        pluginList.forEach((p, idx) => { mockPlugins[idx] = p; mockPlugins[p.name] = p; });

        const mockMimes = {
          length: 2,
          item(i) { return this[i] || null; },
          namedItem(n) { return this[n] || null; },
        };
        mockMimes[0] = mimePdf;
        mockMimes[1] = mimeTextPdf;
        mockMimes['application/pdf'] = mimePdf;
        mockMimes['text/pdf'] = mimeTextPdf;

        if (G.PluginArray && G.PluginArray.prototype) Object.setPrototypeOf(mockPlugins, G.PluginArray.prototype);
        if (G.MimeTypeArray && G.MimeTypeArray.prototype) Object.setPrototypeOf(mockMimes, G.MimeTypeArray.prototype);

        replaceGetter(navProto, 'plugins', () => mockPlugins);
        replaceGetter(navProto, 'mimeTypes', () => mockMimes);
      }
    }
  }

  // ── Permissions: Khắc phục lỗi lệch pha Notification.permission vs permissions.query ──
  if (typeof G.Permissions === 'function' && typeof G.Permissions.prototype.query === 'function') {
    replaceMethod(G.Permissions.prototype, 'query', (original) => function (parameters) {
      if (parameters && parameters.name === 'notifications') {
        const notifState = G.Notification ? G.Notification.permission : 'default';
        const mappedState = notifState === 'default' ? 'prompt' : notifState;
        return original.call(this, parameters).then((status) => {
          if (status && status.state !== mappedState) {
            try {
              Object.defineProperty(status, 'state', { get: () => mappedState, configurable: true, enumerable: true });
            } catch {}
          }
          return status;
        }).catch(() => {
          const fallback = {
            state: mappedState,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() { return false; },
          };
          if (G.PermissionStatus && G.PermissionStatus.prototype) {
            try { Object.setPrototypeOf(fallback, G.PermissionStatus.prototype); } catch {}
          }
          return fallback;
        });
      }
      return original.call(this, parameters);
    });
  }

  // ── MediaDevices: Giả lập microphone, speaker, camera tối thiểu (tránh rò rỉ mảng rỗng trên headless/VPS) ──
  if (nav && nav.mediaDevices && typeof nav.mediaDevices.enumerateDevices === 'function') {
    const mediaProto = Object.getPrototypeOf(nav.mediaDevices);
    const targetMedia = (mediaProto && Object.getOwnPropertyDescriptor(mediaProto, 'enumerateDevices')) ? mediaProto : nav.mediaDevices;
    replaceMethod(targetMedia, 'enumerateDevices', (original) => async function () {
      const devices = await original.call(this).catch(() => []);
      if (Array.isArray(devices) && devices.length > 0) {
        return devices;
      }
      const genId = (idx, salt) => {
        const hex = '0123456789abcdef';
        let str = '';
        for (let i = 0; i < 64; i += 1) {
          str += hex[Math.abs(hash(idx * 137 + i + salt)) % 16];
        }
        return str;
      };
      const groupId = genId(0, 11);
      const mockList = [
        { deviceId: 'default', kind: 'audioinput', label: '', groupId },
        { deviceId: genId(1, 23), kind: 'audioinput', label: '', groupId },
        { deviceId: 'default', kind: 'audiooutput', label: '', groupId },
        { deviceId: genId(2, 47), kind: 'audiooutput', label: '', groupId },
        { deviceId: genId(3, 89), kind: 'videoinput', label: '', groupId: genId(4, 97) },
      ];
      const Proto = G.MediaDeviceInfo && G.MediaDeviceInfo.prototype;
      return mockList.map((d) => {
        if (!Proto) return d;
        const obj = Object.create(Proto);
        for (const [key, val] of Object.entries(d)) {
          Object.defineProperty(obj, key, { value: val, writable: false, enumerable: true, configurable: true });
        }
        Object.defineProperty(obj, 'toJSON', { value: () => d, writable: false, enumerable: false, configurable: true });
        return obj;
      });
    });
  }

  // ── SpeechSynthesis: Giả lập danh sách voices Windows/Chrome khi profile là Windows (tránh rò rỉ giọng Apple trên Mac) ──
  const isWindowsProfile = cfg.platform === 'Win32' || cfg.uaData?.platform === 'Windows';
  if (isWindowsProfile && typeof G.SpeechSynthesis === 'function' && typeof G.SpeechSynthesis.prototype?.getVoices === 'function') {
    try {
      const windowsVoices = [
        { name: 'Microsoft David - English (United States)', lang: 'en-US', default: true, localService: true, voiceURI: 'Microsoft David - English (United States)' },
        { name: 'Microsoft Mark - English (United States)', lang: 'en-US', default: false, localService: true, voiceURI: 'Microsoft Mark - English (United States)' },
        { name: 'Microsoft Zira - English (United States)', lang: 'en-US', default: false, localService: true, voiceURI: 'Microsoft Zira - English (United States)' },
        { name: 'Google US English', lang: 'en-US', default: false, localService: false, voiceURI: 'Google US English' },
        { name: 'Google UK English Female', lang: 'en-GB', default: false, localService: false, voiceURI: 'Google UK English Female' },
        { name: 'Google UK English Male', lang: 'en-GB', default: false, localService: false, voiceURI: 'Google UK English Male' },
      ];
      const Proto = G.SpeechSynthesisVoice && G.SpeechSynthesisVoice.prototype;
      const mockVoices = windowsVoices.map((v) => {
        if (!Proto) return v;
        const obj = Object.create(Proto);
        for (const [key, val] of Object.entries(v)) {
          Object.defineProperty(obj, key, { value: val, writable: false, enumerable: true, configurable: true });
        }
        return obj;
      });
      replaceMethod(G.SpeechSynthesis.prototype, 'getVoices', () => function () {
        return mockVoices;
      });
    } catch {}
  }

  // ── window.chrome: Đảm bảo app, csi, loadTimes trên môi trường Chromium ──
  if (!cfg.webkitOnly && typeof G.window !== 'undefined') {
    if (!G.chrome || typeof G.chrome !== 'object') {
      G.chrome = {};
    }
    if (G.window && G.window !== G && !G.window.chrome) {
      try { G.window.chrome = G.chrome; } catch {}
    }
    const c = G.chrome;
    if (!c.app) {
      c.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails() { return null; },
        getIsInstalled() { return false; },
        runningState() { return 'cannot_run'; },
      };
      nativeSource.set(c.app.getDetails, 'function getDetails() { [native code] }');
      nativeSource.set(c.app.getIsInstalled, 'function getIsInstalled() { [native code] }');
      nativeSource.set(c.app.runningState, 'function runningState() { [native code] }');
    }
    if (typeof c.csi !== 'function') {
      c.csi = function csi() {
        return {
          startE: Date.now() - Math.floor(hash(1) % 2000 + 500),
          onloadT: Date.now(),
          pageT: Math.floor(hash(2) % 3000 + 800),
          tran: 15,
        };
      };
      nativeSource.set(c.csi, 'function csi() { [native code] }');
    }
    if (typeof c.loadTimes !== 'function') {
      c.loadTimes = function loadTimes() {
        const nowSec = Date.now() / 1000;
        return {
          requestTime: nowSec - 1.2,
          startLoadTime: nowSec - 1.1,
          commitLoadTime: nowSec - 0.7,
          finishDocumentLoadTime: nowSec - 0.2,
          finishLoadTime: nowSec,
          firstPaintTime: nowSec - 0.6,
          firstPaintAfterLoadTime: 0,
          navigationType: 'Other',
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
          npnNegotiatedProtocol: 'h2',
          wasAlternateProtocolAvailable: false,
          connectionInfo: 'h2',
        };
      };
      nativeSource.set(c.loadTimes, 'function loadTimes() { [native code] }');
    }
  }

  // ── Client Hints: platform, mobile, brands và Client Hints giá trị cao (platformVersion, architecture...) ──
  if (cfg.uaData && typeof G.NavigatorUAData === 'function') {
    if (cfg.uaData.platform) {
      replaceGetter(G.NavigatorUAData.prototype, 'platform', () => cfg.uaData.platform);
    }
    if (cfg.uaData.platformVersion) {
      replaceGetter(G.NavigatorUAData.prototype, 'platformVersion', () => cfg.uaData.platformVersion);
    }
    if (typeof cfg.isMobile === 'boolean') {
      replaceGetter(G.NavigatorUAData.prototype, 'mobile', () => cfg.isMobile);
    }
    if (cfg.uaData.brands && Array.isArray(cfg.uaData.brands)) {
      replaceGetter(G.NavigatorUAData.prototype, 'brands', () => cfg.uaData.brands);
    }
    replaceMethod(G.NavigatorUAData.prototype, 'getHighEntropyValues', (original) => function (hints) {
      const populate = (dict) => {
        const res = dict ? { ...dict } : {};
        const hintList = Array.isArray(hints) ? hints : [];
        for (const key of ['platform', 'platformVersion', 'architecture', 'bitness', 'model', 'brands', 'fullVersionList', 'uaFullVersion']) {
          if (hintList.includes(key) && cfg.uaData[key] !== undefined) {
            res[key] = cfg.uaData[key];
          }
        }
        if (hintList.includes('wow64')) {
          res.wow64 = cfg.uaData.wow64 !== undefined ? cfg.uaData.wow64 : false;
        }
        return res;
      };
      try {
        return original.call(this, hints).then(populate).catch(() => populate({}));
      } catch {
        return Promise.resolve(populate({}));
      }
    });
  }

  // ── Màn hình: headless có outer == inner và avail == kích thước màn hình ──
  if (cfg.screen && typeof G.Screen === 'function' && typeof G.window !== 'undefined') {
    replaceGetter(G.Screen.prototype, 'availTop', () => cfg.screen.availTop);
    replaceGetter(G.Screen.prototype, 'availHeight', () => cfg.screen.availHeight);
    replaceGetter(G, 'outerHeight', function () { return G.innerHeight + cfg.screen.frameHeight; });
    replaceGetter(G, 'outerWidth', function () { return G.innerWidth; });
  }

  // ── WebGL: vendor/renderer và vài giới hạn khớp GPU của profile ──
  const webglParams = cfg.webglParams ?? {};
  for (const ctxName of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
    const Ctx = G[ctxName];
    if (typeof Ctx !== 'function') continue;
    replaceMethod(Ctx.prototype, 'getParameter', (original) => function (param) {
      if (param === 37445 && cfg.webglVendor) return cfg.webglVendor; // UNMASKED_VENDOR_WEBGL
      if (param === 37446 && cfg.webglRenderer) return cfg.webglRenderer; // UNMASKED_RENDERER_WEBGL
      const override = webglParams[param];
      if (override !== undefined) {
        const real = original.call(this, param);
        return Array.isArray(override) ? new real.constructor(override) : override;
      }
      return original.call(this, param);
    });
    if (cfg.noise.webgl) {
      replaceMethod(Ctx.prototype, 'readPixels', (original) => function (...args) {
        const result = original.apply(this, args);
        const pixels = args[6];
        if (pixels && typeof pixels.length === 'number' && pixels.BYTES_PER_ELEMENT === 1) {
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] === 0) continue;
            const h = hash(i);
            if (h % 29 === 0) pixels[i + (h % 3)] ^= 1;
          }
        }
        return result;
      });
    }
  }

  // ── Canvas: nhiễu 1 bit trên ~4% điểm ảnh không trong suốt, cố định theo vị trí ──
  if (cfg.noise.canvas) {
    const noisify = (data) => {
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        const h = hash(i);
        if (h % 23 === 0) data[i + (h % 3)] ^= 1;
      }
    };
    const C2D = G.CanvasRenderingContext2D;
    const OC2D = G.OffscreenCanvasRenderingContext2D;
    const originalGetImageData = C2D && C2D.prototype.getImageData;
    const originalOffscreenGetImageData = OC2D && OC2D.prototype.getImageData;
    for (const Ctx of [C2D, OC2D]) {
      if (typeof Ctx !== 'function') continue;
      replaceMethod(Ctx.prototype, 'getImageData', (original) => function (...args) {
        const image = original.apply(this, args);
        noisify(image.data);
        return image;
      });
    }
    // Xuất ảnh từ một bản sao đã thêm nhiễu, không đụng vào canvas gốc của trang.
    const noisyCopy = (canvas) => {
      const { width, height } = canvas;
      if (!width || !height || width * height > 4096 * 4096 || !G.document) return null;
      const copy = G.document.createElement('canvas');
      copy.width = width;
      copy.height = height;
      const ctx = copy.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      const image = originalGetImageData.call(ctx, 0, 0, width, height);
      noisify(image.data);
      ctx.putImageData(image, 0, 0);
      return copy;
    };
    const OC = G.OffscreenCanvas;
    if (typeof OC === 'function' && originalOffscreenGetImageData) {
      replaceMethod(OC.prototype, 'convertToBlob', (original) => function (...args) {
        let copy = null;
        try {
          const { width, height } = this;
          if (width && height && width * height <= 4096 * 4096) {
            copy = new OC(width, height);
            const ctx = copy.getContext('2d');
            ctx.drawImage(this, 0, 0);
            const image = originalOffscreenGetImageData.call(ctx, 0, 0, width, height);
            noisify(image.data);
            ctx.putImageData(image, 0, 0);
          }
        } catch { copy = null; }
        return original.apply(copy ?? this, args);
      });
    }
    const HC = G.HTMLCanvasElement;
    if (typeof HC === 'function' && originalGetImageData) {
      for (const name of ['toDataURL', 'toBlob']) {
        replaceMethod(HC.prototype, name, (original) => function (...args) {
          let copy = null;
          try { copy = noisyCopy(this); } catch {}
          return original.apply(copy ?? this, args);
        });
      }
    }
  }

  // ── Audio: nhiễu một lần cho mỗi buffer, đọc lại vẫn ra cùng giá trị ──
  if (cfg.noise.audio && typeof G.AudioBuffer === 'function') {
    const noised = new WeakMap();
    const originalGetChannelData = G.AudioBuffer.prototype.getChannelData;
    const ensureNoise = (buffer, channel) => {
      let channels = noised.get(buffer);
      if (!channels) noised.set(buffer, channels = new Set());
      if (channels.has(channel)) return;
      channels.add(channel);
      const data = originalGetChannelData.call(buffer, channel);
      for (let i = 0; i < data.length; i += 100) data[i] += unit(i + channel) * 2e-7;
    };
    replaceMethod(G.AudioBuffer.prototype, 'getChannelData', (original) => function (channel) {
      const data = original.call(this, channel);
      ensureNoise(this, channel);
      return data;
    });
    replaceMethod(G.AudioBuffer.prototype, 'copyFromChannel', (original) => function (...args) {
      try { ensureNoise(this, args[1]); } catch {}
      return original.apply(this, args);
    });
    if (typeof G.AnalyserNode === 'function') {
      replaceMethod(G.AnalyserNode.prototype, 'getFloatFrequencyData', (original) => function (array) {
        const result = original.call(this, array);
        if (array && array.length) for (let i = 0; i < array.length; i += 11) array[i] += unit(i) * 0.1;
        return result;
      });
    }
  }

  // ── ClientRects: nhân hệ số rất nhỏ cố định → right - left vẫn đúng bằng width ──
  if (cfg.noise.clientRects && typeof G.DOMRectReadOnly === 'function') {
    const layoutRects = new WeakSet();
    const keys = ['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left'];
    for (const proto of [G.DOMRectReadOnly.prototype, G.DOMRect && G.DOMRect.prototype]) {
      for (const key of keys) {
        replaceGetter(proto, key, function (real) { return layoutRects.has(this) ? real * scale : real; });
      }
    }
    replaceMethod(G.DOMRectReadOnly.prototype, 'toJSON', (original) => function () {
      const json = original.call(this);
      if (layoutRects.has(this)) for (const key of keys) json[key] *= scale;
      return json;
    });
    const markRect = (rect) => { if (rect) layoutRects.add(rect); return rect; };
    const markList = (list) => { for (let i = 0; i < list.length; i += 1) layoutRects.add(list[i]); return list; };
    for (const Owner of [G.Element, G.Range]) {
      if (typeof Owner !== 'function') continue;
      replaceMethod(Owner.prototype, 'getBoundingClientRect', (original) => function () { return markRect(original.call(this)); });
      replaceMethod(Owner.prototype, 'getClientRects', (original) => function () { return markList(original.call(this)); });
    }
  }

  // ── Fonts: đo chữ lệch theo hệ số cố định để phá fingerprint font-metric qua canvas.
  // Không vá document.fonts.check: Chrome vốn trả true cho mọi font không phải web font, vá vào lại thành dấu hiệu.
  if (cfg.noise.fonts && typeof G.TextMetrics === 'function') {
    for (const key of ['width', 'actualBoundingBoxLeft', 'actualBoundingBoxRight']) {
      replaceGetter(G.TextMetrics.prototype, key, (real) => real * (1 + (scale - 1) * 50));
    }
  }
}

/**
 * Áp các override tận gốc qua CDP cho một tab.
 *
 * Không auto-attach vào iframe/worker con: chế độ đó bắt con chờ phiên này cho chạy tiếp, và nếu
 * lệnh cho chạy tiếp không tới (Chrome mới bỏ dần chế độ non-flatten) thì iframe/worker đứng mãi.
 * Iframe khác site và worker đã có lớp JS dự phòng trong stealthInitScript.
 *
 * @param {import('playwright').BrowserContext} context Context của phiên.
 * @param {import('playwright').Page} page Tab cần áp.
 * @param {{userAgentOverride: object, hardwareConcurrency?: number|null, deviceProfile?: object, timezoneId?: string}} options
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export async function applyNativeOverrides(context, page, { userAgentOverride, hardwareConcurrency, deviceProfile, timezoneId, clientHintHeaders }) {
  const session = await context.newCDPSession(page);
  try {
    await session.send('Emulation.setUserAgentOverride', userAgentOverride);
  } catch (error) {
    // fullVersion đã deprecated: bản Chrome nào từ chối thì gửi lại không có trường này.
    const metadata = userAgentOverride.userAgentMetadata;
    if (!metadata?.fullVersion) throw error;
    const { fullVersion, ...rest } = metadata;
    await session.send('Emulation.setUserAgentOverride', { ...userAgentOverride, userAgentMetadata: rest });
  }

  // Đồng bộ qua Network domain để network stack áp dụng nhất quán cho toàn bộ HTTP request
  try {
    await session.send('Network.enable');
    await session.send('Network.setUserAgentOverride', userAgentOverride);
  } catch {}

  // Bù Client Hints cho mọi HTTP request và đặc biệt là navigation redirects (301/302/307).
  // Chromium trên macOS theo chuẩn W3C mặc định xoá Sec-CH-UA-Platform-Version trên redirect,
  // khiến hệ thống tracking affiliate ghi nhận "Window 0, Version click = 0" thay vì "10.0".
  const metadata = userAgentOverride?.userAgentMetadata;
  if (metadata && metadata.platform) {
    const secChUa = metadata.brands?.map((b) => `"${b.brand}";v="${b.version}"`).join(', ') || '';
    const hints = {
      ...(secChUa ? { 'Sec-CH-UA': secChUa } : {}),
      'Sec-CH-UA-Platform': `"${metadata.platform}"`,
      'Sec-CH-UA-Platform-Version': `"${metadata.platformVersion || (metadata.platform === 'Windows' ? '10.0.0' : '')}"`,
      'Sec-CH-UA-Mobile': metadata.mobile ? '?1' : '?0',
      'Sec-CH-UA-Model': `"${metadata.model || ''}"`,
      'Sec-CH-UA-Arch': `"${metadata.architecture || 'x86'}"`,
      'Sec-CH-UA-Bitness': `"${metadata.bitness || '64'}"`,
      'Sec-CH-UA-WoW64': '?0',
      ...(clientHintHeaders || {}),
    };

    try {
      await session.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
      session.on('Fetch.requestPaused', async (event) => {
        try {
          const { requestId, request } = event;
          const reqHeaders = request?.headers || {};
          // Loại bỏ case-insensitive các header gốc bị trùng tên với Client Hints (tránh rò rỉ sec-ch-ua-platform: "macOS" của Chromium nhân Mac)
          const lowerHintKeys = new Set(Object.keys(hints).map((k) => k.toLowerCase()));
          const filtered = {};
          for (const [k, v] of Object.entries(reqHeaders)) {
            if (!lowerHintKeys.has(k.toLowerCase())) {
              filtered[k] = v;
            }
          }
          const merged = { ...filtered, ...hints };
          const headerList = Object.entries(merged).map(([name, value]) => ({ name, value: String(value) }));
          await session.send('Fetch.continueRequest', { requestId, headers: headerList }).catch(() => {});
        } catch {}
      });
    } catch {}
  }

  if (hardwareConcurrency) {
    await session.send('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency }).catch(() => {});
  }
  if (timezoneId) {
    await session.send('Emulation.setTimezoneOverride', { timezoneId });
  }
  if (deviceProfile?.isMobile && deviceProfile.viewport) {
    const { width, height } = deviceProfile.viewport;
    await session.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      screenWidth: width,
      screenHeight: height,
      deviceScaleFactor: deviceProfile.deviceScaleFactor,
      mobile: true,
    });
    await session.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: deviceProfile.spoof.maxTouchPoints,
    });
  }
}

// ── Biến thể máy theo phiên: mỗi cửa sổ là một cấu hình máy thật khác nhau ──────────────
const macChips = [
  { gpu: 'Apple M1', cores: [8] }, { gpu: 'Apple M1 Pro', cores: [8, 10] }, { gpu: 'Apple M1 Max', cores: [10] },
  { gpu: 'Apple M2', cores: [8] }, { gpu: 'Apple M2 Pro', cores: [10, 12] }, { gpu: 'Apple M3', cores: [8] },
  { gpu: 'Apple M3 Pro', cores: [11, 12] }, { gpu: 'Apple M4', cores: [10] }, { gpu: 'Apple M4 Pro', cores: [12, 14] },
];
// Kích thước CSS px; availTop là thanh menu (máy có tai thỏ cao hơn).
const macScreens = [
  { width: 1440, height: 900, dpr: 2, availTop: 25 }, { width: 1470, height: 956, dpr: 2, availTop: 37 },
  { width: 1512, height: 982, dpr: 2, availTop: 37 }, { width: 1710, height: 1112, dpr: 2, availTop: 37 },
  { width: 1728, height: 1117, dpr: 2, availTop: 37 }, { width: 1920, height: 1080, dpr: 1, availTop: 25 },
  { width: 2560, height: 1440, dpr: 1, availTop: 25 }, { width: 2240, height: 1260, dpr: 2, availTop: 25 },
];
const macVersions = ['14.7.6', '15.5.0', '15.6.1', '15.7.1', '26.0.1', '26.1.0', '26.2.0'];

const d3d = (vendor, name, id) => ({
  vendor: `Google Inc. (${vendor})`,
  renderer: `ANGLE (${vendor}, ${name} (0x0000${id}) Direct3D11 vs_5_0 ps_5_0, D3D11)`,
});
const windowsGpus = [
  { ...d3d('NVIDIA', 'NVIDIA GeForce RTX 3060', '2504'), cores: [8, 12, 16] },
  { ...d3d('NVIDIA', 'NVIDIA GeForce RTX 3070', '2484'), cores: [12, 16] },
  { ...d3d('NVIDIA', 'NVIDIA GeForce RTX 4060', '2882'), cores: [12, 16, 20] },
  { ...d3d('NVIDIA', 'NVIDIA GeForce RTX 2060', '1F08'), cores: [8, 12] },
  { ...d3d('NVIDIA', 'NVIDIA GeForce GTX 1650', '1F82'), cores: [4, 8] },
  { ...d3d('NVIDIA', 'NVIDIA GeForce GTX 1660 SUPER', '21C4'), cores: [6, 12] },
  { ...d3d('Intel', 'Intel(R) UHD Graphics 620', '5917'), cores: [4, 8] },
  { ...d3d('Intel', 'Intel(R) UHD Graphics 770', '4680'), cores: [12, 16, 20] },
  { ...d3d('Intel', 'Intel(R) Iris(R) Xe Graphics', '9A49'), cores: [8, 12] },
  { ...d3d('AMD', 'AMD Radeon RX 6600', '73FF'), cores: [12, 16] },
];
// Kích thước CSS px sau khi chia tỉ lệ hiển thị của Windows.
const windowsScreens = [
  { width: 1920, height: 1080, dpr: 1 }, { width: 1536, height: 864, dpr: 1.25 }, { width: 1366, height: 768, dpr: 1 },
  { width: 1280, height: 720, dpr: 1.5 }, { width: 2560, height: 1440, dpr: 1 }, { width: 1600, height: 900, dpr: 1 },
  { width: 1920, height: 1200, dpr: 1 }, { width: 2048, height: 1152, dpr: 1.25 },
];
const windowsVersions = ['10.0.0'];

const linuxGpus = [
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)', cores: [8, 12] },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)', cores: [4, 8] },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Mesa Intel(R) Xe Graphics (TGL GT2), OpenGL 4.6)', cores: [8, 12] },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6600 (radeonsi navi23 LLVM 15.0.7), OpenGL 4.6)', cores: [12, 16] },
  { vendor: 'Google Inc. (NVIDIA Corporation)', renderer: 'ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1650/PCIe/SSE2, OpenGL 4.5.0)', cores: [8, 12] },
];
const linuxScreens = [
  { width: 1920, height: 1080, dpr: 1 }, { width: 1366, height: 768, dpr: 1 }, { width: 2560, height: 1440, dpr: 1 },
  { width: 1920, height: 1200, dpr: 1 },
];
const linuxVersions = ['6.5.0', '6.8.0', '6.11.0', '6.14.0'];

const androidDevices = [
  { model: 'Pixel 8', gpu: 'Mali-G715', vendor: 'ARM', cores: 9, width: 412, height: 915, dpr: 2.625 },
  { model: 'Pixel 7', gpu: 'Mali-G710', vendor: 'ARM', cores: 8, width: 412, height: 915, dpr: 2.625 },
  { model: 'Pixel 6a', gpu: 'Mali-G78', vendor: 'ARM', cores: 8, width: 412, height: 915, dpr: 2.625 },
  { model: 'SM-S911B', gpu: 'Adreno (TM) 740', vendor: 'Qualcomm', cores: 8, width: 360, height: 780, dpr: 3 },
  { model: 'SM-S921B', gpu: 'Samsung Xclipse 940', vendor: 'Samsung Electronics Co., Ltd.', cores: 10, width: 360, height: 780, dpr: 3 },
  { model: 'SM-A546B', gpu: 'Mali-G68', vendor: 'ARM', cores: 8, width: 384, height: 832, dpr: 2.8125 },
];
const androidVersions = ['13.0.0', '14.0.0', '15.0.0', '16.0.0'];

const iphoneScreens = [
  { width: 390, height: 844, cores: 6 }, { width: 393, height: 852, cores: 6 }, { width: 430, height: 932, cores: 6 },
  { width: 375, height: 812, cores: 6 }, { width: 402, height: 874, cores: 6 },
];
// Từ iOS 26, WebKit đóng băng phiên bản trong UA ở 18_6 nên không có 26_x.
const iosVersions = ['17_6_1', '18_1', '18_3_2', '18_5', '18_6', '18_6'];

/** PRNG xác định theo seed (mulberry32): cùng seed luôn ra cùng một máy. */
function seededRandom(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sinh một máy cụ thể từ profile chung: chip/GPU, số nhân CPU, RAM, màn hình, tỉ lệ hiển thị
 * và phiên bản hệ điều hành được bốc ngẫu nhiên trong các cấu hình có thật, đồng bộ với nhau.
 *
 * @param {string} profileKey Khoá trong DEVICE_PROFILES.
 * @param {object} base Profile gốc.
 * @param {number} seed Seed của phiên.
 * @param {{width: number, height: number}|null} minViewport Khung nhìn tối thiểu màn hình phải chứa được.
 * @return {object} Profile mới (không sửa base) kèm `summary` mô tả máy.
 */
export function createDeviceVariant(profileKey, base, seed, minViewport = null) {
  const random = seededRandom(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const fits = (list) => {
    if (!minViewport) return list;
    const fitting = list.filter((item) => item.width >= minViewport.width && item.height >= minViewport.height);
    return fitting.length > 0 ? fitting : [list.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b))];
  };
  const variant = { ...base, screen: { ...base.screen }, spoof: { ...base.spoof }, uaData: base.uaData && { ...base.uaData } };

  if (profileKey === 'macos') {
    const chip = pick(macChips);
    const screen = pick(fits(macScreens));
    variant.deviceScaleFactor = screen.dpr;
    variant.screen = { width: screen.width, height: screen.height, availTop: screen.availTop, availHeight: screen.height - screen.availTop, frameHeight: 79 };
    variant.uaData.platformVersion = pick(macVersions);
    Object.assign(variant.spoof, {
      dpr: screen.dpr, hardwareConcurrency: pick(chip.cores), deviceMemory: 8,
      webglRenderer: `ANGLE (Apple, ANGLE Metal Renderer: ${chip.gpu}, Unspecified Version)`,
    });
    variant.deviceVersion = `macOS ${variant.uaData.platformVersion}`;
    variant.summary = `macOS ${variant.uaData.platformVersion} · ${chip.gpu} · ${variant.spoof.hardwareConcurrency} nhân · ${screen.width}x${screen.height}@${screen.dpr}x`;
  } else if (profileKey === 'windows' || profileKey === 'linux') {
    const isWindows = profileKey === 'windows';
    const gpu = pick(isWindows ? windowsGpus : linuxGpus);
    const screen = pick(fits(isWindows ? windowsScreens : linuxScreens));
    const osVersion = isWindows ? '10.0.0' : pick(linuxVersions);
    const taskbar = isWindows ? 40 : 27;
    variant.deviceScaleFactor = screen.dpr;
    variant.screen = { width: screen.width, height: screen.height, availHeight: screen.height - taskbar, frameHeight: isWindows ? 87 : 77 };
    variant.uaData.platformVersion = osVersion;
    Object.assign(variant.spoof, {
      dpr: screen.dpr, hardwareConcurrency: pick(gpu.cores),
      webglVendor: gpu.vendor, webglRenderer: gpu.renderer,
    });
    // Máy từ 12 luồng trở lên gần như luôn có ≥ 8 GB (Chrome làm tròn xuống và chặn trên ở 8).
    variant.spoof.deviceMemory = variant.spoof.hardwareConcurrency >= 12 ? 8 : pick([4, 8, 8]);
    const osName = isWindows ? 'Windows 10' : `Linux ${osVersion}`;
    variant.deviceVersion = isWindows ? `${osName} (${osVersion})` : `Linux ${osVersion}`;
    variant.summary = `${osName} · ${gpu.renderer.replace(/^ANGLE \([^,]+, /, '').replace(/ \(0x.*$| Direct3D.*$|,.*$/, '')} · ${variant.spoof.hardwareConcurrency} nhân · ${screen.width}x${screen.height}@${screen.dpr}x`;
  } else if (profileKey === 'android') {
    const device = pick(androidDevices);
    variant.viewport = { width: device.width, height: device.height };
    variant.deviceScaleFactor = device.dpr;
    variant.screen = { width: device.width, height: device.height };
    variant.uaData.platformVersion = pick(androidVersions);
    variant.uaData.model = device.model;
    const androidMajor = variant.uaData.platformVersion.split('.')[0];
    variant.ua = (v) => `Mozilla/5.0 (Linux; Android ${androidMajor}; ${device.model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Mobile Safari/537.36`;
    Object.assign(variant.spoof, {
      dpr: device.dpr, hardwareConcurrency: device.cores, deviceMemory: pick([4, 8, 8]),
      webglVendor: device.vendor, webglRenderer: device.gpu,
    });
    variant.deviceVersion = `Android ${androidMajor} (${device.model})`;
    variant.summary = `Android ${variant.uaData.platformVersion.split('.')[0]} · ${device.model} · ${device.gpu} · ${device.width}x${device.height}@${device.dpr}x`;
  } else if (profileKey === 'ios') {
    const screen = pick(iphoneScreens);
    const osVersion = pick(iosVersions);
    variant.viewport = { width: screen.width, height: screen.height };
    variant.screen = { width: screen.width, height: screen.height };
    variant.ua = (v) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${osVersion} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${v} Mobile/15E148 Safari/604.1`;
    variant.spoof.hardwareConcurrency = screen.cores;
    variant.deviceVersion = `iOS ${osVersion.replace(/_/g, '.')} (iPhone)`;
    variant.summary = `iOS ${osVersion.replace(/_/g, '.')} · iPhone ${screen.width}x${screen.height}@3x`;
  } else if (profileKey === 'ipad') {
    const osVersion = pick(iosVersions);
    variant.ua = (v) => `Mozilla/5.0 (iPad; CPU OS ${osVersion} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${v} Mobile/15E148 Safari/604.1`;
    variant.deviceVersion = `iPadOS ${osVersion.replace(/_/g, '.')} (iPad)`;
    variant.summary = `iPadOS ${osVersion.replace(/_/g, '.')} · ${base.screen.width}x${base.screen.height}@2x`;
  } else {
    variant.deviceVersion = base.label;
    variant.summary = base.label;
  }
  return variant;
}

// ── Profile Coherence Checks: kiểm tra tính nhất quán fingerprint trước/sau khi chạy ──

/**
 * Xây dựng giá trị fingerprint kỳ vọng dựa trên cấu hình thiết bị và anti-fingerprint.
 *
 * @param {object} dp Cấu hình profile thiết bị (DEVICE_PROFILES hoặc createDeviceVariant).
 * @param {object} antiFingerprint Cấu hình anti-fingerprint từ UI/Settings.
 * @param {object} options Các tuỳ chọn bổ sung { timezoneId, languages, effectiveBuild }.
 * @return {object} Đối tượng chứa các giá trị kỳ vọng.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-11-07
 */
export function buildProfileCoherenceExpected(dp, antiFingerprint = {}, options = {}) {
  const { timezoneId, languages } = options;
  const spoof = dp?.spoof || {};
  const platform = dp?.platform || spoof.platform || null;
  let expectedUaContains = null;
  if (dp?.isMobile) {
    expectedUaContains = dp?.uaData?.model || 'Mobile';
  } else if (platform === 'MacIntel') {
    expectedUaContains = 'Macintosh';
  } else if (platform === 'Win32') {
    expectedUaContains = 'Windows';
  } else if (platform === 'Linux x86_64') {
    expectedUaContains = 'Linux';
  }

  const isIos = spoof.uaPlatform === 'iOS';
  const isMobile = Boolean(dp?.isMobile);

  return {
    platform,
    uaPlatform: spoof.uaPlatform || dp?.uaData?.platform || null,
    userAgentContains: expectedUaContains,
    webdriver: false,
    hardwareConcurrency: spoof.hardwareConcurrency || null,
    deviceMemory: spoof.deviceMemory ?? null,
    maxTouchPoints: typeof spoof.maxTouchPoints === 'number' ? spoof.maxTouchPoints : (isMobile ? 5 : 0),
    devicePixelRatio: dp?.deviceScaleFactor || spoof.dpr || null,
    webglVendor: antiFingerprint.webgl ? (spoof.webglVendor || null) : null,
    webglRenderer: antiFingerprint.webgl ? (spoof.webglRenderer || null) : null,
    timezone: timezoneId || null,
    languages: Array.isArray(languages) && languages.length > 0 ? languages : ['en-US', 'en'],
    isMobile,
    hasChromeObject: !isIos,
    pdfViewerEnabled: !isMobile && !isIos,
    hasPlugins: !isMobile && !isIos,
    notificationPermission: 'default',
    notificationQueryState: 'prompt',
  };
}

/**
 * Thu thập snapshot fingerprint thực tế đang hiển thị trong trang qua page.evaluate.
 *
 * @param {object} page Page Playwright.
 * @return {Promise<object|null>} Đối tượng snapshot hoặc null.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-11-07
 */
export async function collectProfileCoherenceSnapshot(page) {
  if (!page || typeof page.evaluate !== 'function') return null;
  return await page.evaluate(async () => {
    let webglVendor = null;
    let webglRenderer = null;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          webglVendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
          webglRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        }
      }
    } catch {}

    let timezone = null;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {}

    let clientHintsPlatform = null;
    let clientHintsMobile = null;
    try {
      if (navigator.userAgentData) {
        clientHintsPlatform = navigator.userAgentData.platform;
        clientHintsMobile = navigator.userAgentData.mobile;
      }
    } catch {}

    let notificationPermission = null;
    try {
      if (typeof Notification !== 'undefined') {
        notificationPermission = Notification.permission;
      }
    } catch {}

    let notificationQueryState = null;
    try {
      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        const status = await navigator.permissions.query({ name: 'notifications' });
        notificationQueryState = status ? status.state : null;
      }
    } catch {}

    let mediaDevicesCount = null;
    try {
      if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
        const devs = await navigator.mediaDevices.enumerateDevices();
        mediaDevicesCount = Array.isArray(devs) ? devs.length : 0;
      }
    } catch {}

    const hasChromeObject = typeof window.chrome === 'object' && window.chrome !== null && typeof window.chrome.csi === 'function';
    const pdfViewerEnabled = typeof navigator.pdfViewerEnabled === 'boolean' ? navigator.pdfViewerEnabled : null;
    const pluginsLength = navigator.plugins ? navigator.plugins.length : 0;

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      webdriver: navigator.webdriver,
      languages: Array.from(navigator.languages || []),
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      maxTouchPoints: navigator.maxTouchPoints,
      devicePixelRatio: window.devicePixelRatio,
      screen: {
        width: window.screen ? window.screen.width : null,
        height: window.screen ? window.screen.height : null,
        availWidth: window.screen ? window.screen.availWidth : null,
        availHeight: window.screen ? window.screen.availHeight : null,
      },
      webgl: { vendor: webglVendor, renderer: webglRenderer },
      timezone,
      clientHints: { platform: clientHintsPlatform, mobile: clientHintsMobile },
      hasChromeObject,
      pdfViewerEnabled,
      pluginsLength,
      notificationPermission,
      notificationQueryState,
      mediaDevicesCount,
    };
  }).catch((err) => ({ error: err?.message || String(err) }));
}

/**
 * So sánh snapshot quan sát được với các giá trị kỳ vọng, phân loại mức độ nghiêm trọng.
 *
 * @param {object} snapshot Dữ liệu thu thập từ collectProfileCoherenceSnapshot.
 * @param {object} expected Dữ liệu kỳ vọng từ buildProfileCoherenceExpected.
 * @return {object} { consistent: boolean, score: number, mismatches: Array }
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-11-07
 */
export function analyzeProfileCoherence(snapshot, expected) {
  if (!snapshot || snapshot.error || !expected) {
    return {
      consistent: false,
      score: 0,
      mismatches: [{
        key: 'snapshot',
        expected: 'valid_snapshot',
        observed: snapshot?.error || 'null',
        severity: 'critical',
        message: `Không thu thập được snapshot fingerprint: ${snapshot?.error || 'không có dữ liệu'}`,
      }],
    };
  }

  const mismatches = [];

  // 1. Webdriver: không được phép lộ true
  if (snapshot.webdriver === true) {
    mismatches.push({
      key: 'webdriver',
      expected: false,
      observed: true,
      severity: 'critical',
      message: 'navigator.webdriver bị lộ true (dấu hiệu bot automation)',
    });
  }

  // 2. Platform (Win32, MacIntel, Linux x86_64, iPhone...)
  if (expected.platform && snapshot.platform && snapshot.platform !== expected.platform) {
    mismatches.push({
      key: 'platform',
      expected: expected.platform,
      observed: snapshot.platform,
      severity: 'high',
      message: `navigator.platform (${snapshot.platform}) không khớp cấu hình máy (${expected.platform})`,
    });
  }

  // 3. UserAgent Platform coherence
  if (expected.userAgentContains && snapshot.userAgent && !snapshot.userAgent.includes(expected.userAgentContains)) {
    mismatches.push({
      key: 'userAgent',
      expected: `chứa "${expected.userAgentContains}"`,
      observed: snapshot.userAgent.slice(0, 80),
      severity: 'high',
      message: `navigator.userAgent không chứa từ khóa hệ điều hành kỳ vọng (${expected.userAgentContains})`,
    });
  }

  // 4. Client Hints Platform vs UA Platform
  if (expected.uaPlatform && snapshot.clientHints?.platform && snapshot.clientHints.platform !== expected.uaPlatform) {
    mismatches.push({
      key: 'clientHintsPlatform',
      expected: expected.uaPlatform,
      observed: snapshot.clientHints.platform,
      severity: 'high',
      message: `sec-ch-ua-platform (${snapshot.clientHints.platform}) lệch với profile (${expected.uaPlatform})`,
    });
  }

  // 5. Hardware Concurrency
  if (expected.hardwareConcurrency && snapshot.hardwareConcurrency && snapshot.hardwareConcurrency !== expected.hardwareConcurrency) {
    mismatches.push({
      key: 'hardwareConcurrency',
      expected: expected.hardwareConcurrency,
      observed: snapshot.hardwareConcurrency,
      severity: 'medium',
      message: `hardwareConcurrency (${snapshot.hardwareConcurrency}) lệch giá trị spoof (${expected.hardwareConcurrency})`,
    });
  }

  // 6. WebGL Renderer
  if (expected.webglRenderer && snapshot.webgl?.renderer && snapshot.webgl.renderer !== expected.webglRenderer) {
    mismatches.push({
      key: 'webglRenderer',
      expected: expected.webglRenderer,
      observed: snapshot.webgl.renderer,
      severity: 'medium',
      message: `WebGL Renderer (${snapshot.webgl.renderer}) lệch GPU profile (${expected.webglRenderer})`,
    });
  }

  // 7. Timezone
  if (expected.timezone && snapshot.timezone && snapshot.timezone !== expected.timezone) {
    mismatches.push({
      key: 'timezone',
      expected: expected.timezone,
      observed: snapshot.timezone,
      severity: 'medium',
      message: `Múi giờ (${snapshot.timezone}) lệch với timezone proxy/profile (${expected.timezone})`,
    });
  }

  // 8. MaxTouchPoints
  if (typeof expected.maxTouchPoints === 'number' && typeof snapshot.maxTouchPoints === 'number') {
    if (expected.isMobile && snapshot.maxTouchPoints === 0) {
      mismatches.push({
        key: 'maxTouchPoints',
        expected: '> 0',
        observed: 0,
        severity: 'high',
        message: 'Thiết bị mobile nhưng maxTouchPoints = 0 (lộ desktop)',
      });
    } else if (!expected.isMobile && snapshot.maxTouchPoints > 0 && expected.maxTouchPoints === 0) {
      mismatches.push({
        key: 'maxTouchPoints',
        expected: 0,
        observed: snapshot.maxTouchPoints,
        severity: 'low',
        message: `Desktop giả lập nhưng có maxTouchPoints = ${snapshot.maxTouchPoints}`,
      });
    }
  }

  // 9. Ngôn ngữ chính
  if (expected.languages && expected.languages.length > 0 && Array.isArray(snapshot.languages) && snapshot.languages.length > 0) {
    const primaryExpected = expected.languages[0].toLowerCase();
    const primaryObserved = (snapshot.languages[0] || '').toLowerCase();
    if (primaryExpected !== primaryObserved && !primaryObserved.startsWith(primaryExpected.split('-')[0])) {
      mismatches.push({
        key: 'languages',
        expected: expected.languages[0],
        observed: snapshot.languages[0],
        severity: 'low',
        message: `Ngôn ngữ ưu tiên (${snapshot.languages[0]}) không khớp locale proxy (${expected.languages[0]})`,
      });
    }
  }

  // 10. Notification Permission Coherence (lệch Notification.permission vs permissions.query)
  if (snapshot.notificationPermission === 'default' && snapshot.notificationQueryState === 'denied') {
    mismatches.push({
      key: 'notificationPermission',
      expected: 'prompt',
      observed: 'denied',
      severity: 'critical',
      message: 'Notification.permission là "default" nhưng query({ name: "notifications" }) trả về "denied" (dấu hiệu lộ automation/CreepJS)',
    });
  }

  // 11. Chrome object parity
  if (typeof expected.hasChromeObject === 'boolean' && typeof snapshot.hasChromeObject === 'boolean') {
    if (expected.hasChromeObject && !snapshot.hasChromeObject) {
      mismatches.push({
        key: 'hasChromeObject',
        expected: true,
        observed: false,
        severity: 'high',
        message: 'Trình duyệt Chromium nhưng thiếu window.chrome hoặc window.chrome.csi',
      });
    } else if (!expected.hasChromeObject && snapshot.hasChromeObject) {
      mismatches.push({
        key: 'hasChromeObject',
        expected: false,
        observed: true,
        severity: 'medium',
        message: 'Profile WebKit/iOS nhưng lại tồn tại window.chrome',
      });
    }
  }

  // 12. pdfViewerEnabled parity
  if (typeof expected.pdfViewerEnabled === 'boolean' && typeof snapshot.pdfViewerEnabled === 'boolean') {
    if (expected.pdfViewerEnabled !== snapshot.pdfViewerEnabled) {
      mismatches.push({
        key: 'pdfViewerEnabled',
        expected: expected.pdfViewerEnabled,
        observed: snapshot.pdfViewerEnabled,
        severity: 'medium',
        message: `navigator.pdfViewerEnabled (${snapshot.pdfViewerEnabled}) không khớp loại thiết bị (${expected.pdfViewerEnabled ? 'Desktop' : 'Mobile/iOS'})`,
      });
    }
  }

  // 13. Plugins parity (Desktop Chromium phải có plugin PDF)
  if (expected.hasPlugins === true && typeof snapshot.pluginsLength === 'number' && snapshot.pluginsLength === 0) {
    mismatches.push({
      key: 'plugins',
      expected: '> 0',
      observed: 0,
      severity: 'medium',
      message: 'Desktop Chromium nhưng navigator.plugins rỗng (dấu hiệu headless)',
    });
  }

  // 14. MediaDevices rỗng trên Desktop
  if (typeof snapshot.mediaDevicesCount === 'number' && snapshot.mediaDevicesCount === 0 && !expected.isMobile) {
    mismatches.push({
      key: 'mediaDevices',
      expected: '> 0',
      observed: 0,
      severity: 'medium',
      message: 'navigator.mediaDevices.enumerateDevices trả về mảng rỗng (dấu hiệu VPS headless không thiết bị âm thanh/hình ảnh)',
    });
  }

  let penalty = 0;
  for (const m of mismatches) {
    if (m.severity === 'critical') penalty += 40;
    else if (m.severity === 'high') penalty += 20;
    else if (m.severity === 'medium') penalty += 10;
    else penalty += 5;
  }

  return {
    consistent: mismatches.length === 0,
    score: Math.max(0, 100 - penalty),
    mismatches,
  };
}

/**
 * Kiểm tra và ghi log cảnh báo tính nhất quán profile trên một tab đang mở.
 *
 * @param {object} page Page Playwright.
 * @param {object} dp Cấu hình profile thiết bị.
 * @param {object} antiFingerprint Cấu hình anti-fingerprint.
 * @param {object} options Tuỳ chọn { timezoneId, languages, onLog, logger }.
 * @return {Promise<object>} Kết quả kiểm tra.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-11-07
 */
export async function verifyPageProfileCoherence(page, dp, antiFingerprint = {}, options = {}) {
  const expected = buildProfileCoherenceExpected(dp, antiFingerprint, options);
  const snapshot = await collectProfileCoherenceSnapshot(page);
  const analysis = analyzeProfileCoherence(snapshot, expected);

  if (!analysis.consistent) {
    const criticals = analysis.mismatches.filter((m) => m.severity === 'critical' || m.severity === 'high');
    const logFn = options.onLog || options.logger;
    if (typeof logFn === 'function' && criticals.length > 0) {
      logFn({
        type: 'profile_coherence_warning',
        detail: `[Coherence Score ${analysis.score}/100] Cảnh báo lệch fingerprint: ${criticals.map((m) => m.message).join('; ')}`,
      });
    }
  }

  return { expected, snapshot, ...analysis };
}

// ── Guarded Worker Injection: inject fingerprint cho worker an toàn, không treo ──

/**
 * Gắn cơ chế tự động inject script chống fingerprint cho Web Worker / SharedWorker / ServiceWorker.
 *
 * Tiêu chí an toàn tuyệt đối:
 * 1. Opt-in: Chỉ bật khi antiFingerprint.workerInjection hoặc options.enabled = true.
 * 2. An toàn, không gây treo: waitForDebuggerOnStart = false (Worker không bao giờ bị dừng chờ lệnh).
 * 3. Chống rò rỉ: Tự gỡ bỏ listener khi page / context đóng, có timeout guard.
 *
 * @param {object} context BrowserContext của Playwright.
 * @param {object} page Page Playwright đại diện cho tab.
 * @param {object} stealthConfig Cấu hình stealth (từ buildStealthConfig).
 * @param {object} options Các tuỳ chọn bảo vệ { timeoutMs: 3000, enabled: false, onLog: Function }.
 * @return {Promise<object|null>} Đối tượng quản lý session hoặc null nếu không bật.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-11-07
 */
export async function attachGuardedWorkerInjection(context, page, stealthConfig, options = {}) {
  const isEnabled = Boolean(options.enabled || stealthConfig?.workerInjection);
  if (!isEnabled || !context || !page) return null;

  const timeoutMs = options.timeoutMs || 4000;
  let cdpSession = null;

  try {
    cdpSession = await Promise.race([
      context.newCDPSession(page),
      new Promise((_, reject) => setTimeout(() => reject(new Error('CDP session timeout')), timeoutMs)),
    ]);
  } catch (err) {
    options.onLog?.({
      type: 'worker_injection_skip',
      detail: `Không mở được CDP Session cho worker: ${err.message}`,
    });
    return null;
  }

  const workerPatchCode = `
    (() => {
      try {
        const proto = (typeof WorkerGlobalScope !== 'undefined' && self.navigator)
          ? Object.getPrototypeOf(self.navigator) || self.navigator
          : null;
        if (!proto) return;
        const replace = (key, val) => {
          try {
            Object.defineProperty(proto, key, {
              get: () => val,
              configurable: true,
              enumerable: true
            });
          } catch {}
        };
        ${stealthConfig?.platform ? `replace('platform', ${JSON.stringify(stealthConfig.platform)});` : ''}
        ${stealthConfig?.hardwareConcurrency ? `replace('hardwareConcurrency', ${Number(stealthConfig.hardwareConcurrency)});` : ''}
        ${stealthConfig?.deviceMemory ? `replace('deviceMemory', ${Number(stealthConfig.deviceMemory)});` : ''}
      } catch {}
    })();
  `;

  const onAttached = async ({ sessionId, targetInfo }) => {
    const type = targetInfo?.type;
    const isWorker = type === 'worker' || type === 'service_worker' || type === 'shared_worker';
    if (!isWorker || !sessionId) return;

    try {
      await Promise.race([
        cdpSession.send('Runtime.evaluate', {
          expression: workerPatchCode,
          returnByValue: true,
        }, sessionId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Worker inject timeout')), 2000)),
      ]).catch(() => {});
      options.onLog?.({
        type: 'worker_injected',
        detail: `Đã bảo vệ fingerprint cho ${type} (${targetInfo.url || 'inline/blob'})`,
      });
    } catch {}
  };

  cdpSession.on('Target.attachedToTarget', onAttached);

  try {
    await cdpSession.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
      filter: [
        { type: 'worker', exclude: false },
        { type: 'service_worker', exclude: false },
        { type: 'shared_worker', exclude: false },
      ],
    }).catch(() => {});
  } catch {}

  const cleanup = () => {
    try {
      cdpSession.off('Target.attachedToTarget', onAttached);
      cdpSession.detach().catch(() => {});
    } catch {}
  };

  page.once?.('close', cleanup);
  return { cdpSession, cleanup };
}

