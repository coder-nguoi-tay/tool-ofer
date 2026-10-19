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

/**
 * Chrome đã giảm User-Agent: chỉ giữ số phiên bản chính, các số sau là 0.
 *
 * @param {string} fullVersion Phiên bản đầy đủ.
 * @return {string} Ví dụ 155.0.0.0.
 */
export function reducedChromeVersion(fullVersion) {
  return `${String(fullVersion).split('.')[0]}.0.0.0`;
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
 */
export function buildStealthConfig(deviceProfile, antiFingerprint = {}, seed = 1) {
  const spoof = deviceProfile.spoof;
  const anyNoise = Boolean(antiFingerprint.canvas || antiFingerprint.clientRects || antiFingerprint.webgl
    || antiFingerprint.fonts || antiFingerprint.webrtc || antiFingerprint.apiFakeIP);
  return {
    platform: spoof.platform,
    vendor: spoof.vendor,
    maxTouchPoints: spoof.maxTouchPoints,
    hardwareConcurrency: spoof.hardwareConcurrency ?? null,
    deviceMemory: spoof.deviceMemory ?? null,
    webkitOnly: spoof.uaPlatform === 'iOS',
    webglVendor: spoof.webglVendor,
    webglRenderer: spoof.webglRenderer,
    webglParams: spoof.webglParams ?? null,
    screen: deviceProfile.screen && !deviceProfile.isMobile
      ? { availTop: deviceProfile.screen.availTop ?? 0, availHeight: deviceProfile.screen.availHeight ?? deviceProfile.screen.height, frameHeight: deviceProfile.screen.frameHeight ?? 85 }
      : null,
    noise: {
      canvas: Boolean(antiFingerprint.canvas),
      clientRects: Boolean(antiFingerprint.clientRects),
      webgl: Boolean(antiFingerprint.webgl),
      fonts: Boolean(antiFingerprint.fonts),
      audio: anyNoise,
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
    const desc = proto && Object.getOwnPropertyDescriptor(proto, name);
    if (!desc || typeof desc.get !== 'function') return;
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
    if (cfg.platform && nav.platform !== cfg.platform) replaceGetter(navProto, 'platform', () => cfg.platform);
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
 * Áp các override tận gốc qua CDP cho một tab, kèm worker và iframe khác tiến trình của tab đó.
 * Với worker chỉ đặt được số nhân CPU (có thể trễ); phần còn lại do Worker wrapper trong stealthInitScript lo.
 *
 * @param {import('playwright').BrowserContext} context Context của phiên.
 * @param {import('playwright').Page} page Tab cần áp.
 * @param {{userAgentOverride: object, hardwareConcurrency?: number|null}} options
 * @return {Promise<void>}
 */
export async function applyNativeOverrides(context, page, { userAgentOverride, hardwareConcurrency }) {
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setUserAgentOverride', userAgentOverride);
  if (hardwareConcurrency) {
    await session.send('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency }).catch(() => {});
  }
  let messageId = 1;
  session.on('Target.attachedToTarget', async ({ sessionId, targetInfo, waitingForDebugger }) => {
    const send = (method, params = {}) => session.send('Target.sendMessageToTarget', {
      sessionId,
      message: JSON.stringify({ id: messageId++, method, params }),
    }).catch(() => {});
    try {
      if (targetInfo.type === 'iframe') {
        await send('Emulation.setUserAgentOverride', userAgentOverride);
      }
      if (hardwareConcurrency) await send('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency });
    } finally {
      if (waitingForDebugger) await send('Runtime.runIfWaitingForDebugger');
    }
  });
  await session.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: false });
}
