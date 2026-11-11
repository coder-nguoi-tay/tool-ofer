/**
 * Script vá trình duyệt, chạy trong mọi frame (addInitScript) và trong Web Worker tạo từ blob (Worker wrapper).
 * Phải tự chứa hoàn toàn vì được tuần tự hoá thành chuỗi.
 *
 * @param {object} cfg Kết quả buildStealthConfig.
 * @return {void} Kết quả xử lý stealth init script.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function stealthInitScript(cfg) {
  const G = globalThis;

  // ── Hàm vá trông như native ───────────────────────────────────────────────
  const nativeSource = new WeakMap();
  const originalToString = Function.prototype.toString;
  const toStringImpl = {
    toString() {
      if (nativeSource.has(this)) return nativeSource.get(this);
      return originalToString.call(this);
    }
  }.toString;
  nativeSource.set(toStringImpl, 'function toString() { [native code] }');
  try {
    Object.defineProperty(Function.prototype, 'toString', {
      ...Object.getOwnPropertyDescriptor(Function.prototype, 'toString'),
      value: toStringImpl
    });
  } catch {}
  const replaceMethod = (proto, name, makeImpl) => {
    const desc = proto && Object.getOwnPropertyDescriptor(proto, name);
    if (!desc || typeof desc.value !== 'function') return;
    const original = desc.value;
    const impl = makeImpl(original);
    const wrapped = {
      [name](...args) {
        return impl.apply(this, args);
      }
    }[name];
    try {
      Object.defineProperty(wrapped, 'length', {
        value: original.length
      });
    } catch {}
    nativeSource.set(wrapped, `function ${name}() { [native code] }`);
    Object.defineProperty(proto, name, {
      ...desc,
      value: wrapped
    });
  };

  // Gọi getter gốc trước để giữ nguyên lỗi "Illegal invocation" khi gọi trên prototype.
  const replaceGetter = (proto, name, getValue) => {
    if (!proto) return;
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (!desc || typeof desc.get !== 'function') {
      try {
        const getter = {
          [name]() {
            return getValue.call(this);
          }
        }[name];
        nativeSource.set(getter, `function get ${name}() { [native code] }`);
        Object.defineProperty(proto, name, {
          get: getter,
          configurable: true,
          enumerable: true
        });
      } catch {}
      return;
    }
    const originalGet = desc.get;
    const getter = Object.getOwnPropertyDescriptor({
      get [name]() {
        const real = originalGet.call(this);
        return getValue.call(this, real);
      }
    }, name).get;
    nativeSource.set(getter, `function get ${name}() { [native code] }`);
    Object.defineProperty(proto, name, {
      ...desc,
      get: getter
    });
  };

  // ── Nhiễu xác định theo seed: cùng đầu vào luôn ra cùng kết quả trong một phiên ──
  const hash = n => {
    let x = (n ^ cfg.seed) >>> 0;
    x = Math.imul(x ^ x >>> 16, 0x45d9f3b);
    x = Math.imul(x ^ x >>> 16, 0x45d9f3b);
    return (x ^ x >>> 16) >>> 0;
  };
  const unit = n => hash(n) % 10000 / 10000 - 0.5; // [-0.5, 0.5)
  const scale = 1 + (1 + cfg.seed % 997) * 1e-8 * (cfg.seed % 2 ? 1 : -1);

  // ── Worker tạo từ blob (cách các script fingerprint hay dùng): ghép script vá vào đầu mã worker.
  // Qua CDP không chắc chạy kịp vì Playwright cho worker chạy ngay khi gắn vào.
  if (typeof G.Worker === 'function' && typeof G.XMLHttpRequest === 'function' && G.document) {
    const OriginalWorker = G.Worker;
    const patchSource = `(${originalToString.call(stealthInitScript)})(${JSON.stringify(cfg)});\n`;
    const patchedUrl = url => {
      const href = String(url);
      if (!href.startsWith('blob:')) return url;
      const xhr = new G.XMLHttpRequest();
      xhr.open('GET', href, false);
      xhr.send();
      if (xhr.status !== 200 && xhr.status !== 0) return url;
      return G.URL.createObjectURL(new G.Blob([patchSource, xhr.responseText], {
        type: 'text/javascript'
      }));
    };
    const WorkerProxy = new Proxy(OriginalWorker, {
      construct(target, args, newTarget) {
        const nextArgs = [...args];
        try {
          if (nextArgs.length > 0) nextArgs[0] = patchedUrl(nextArgs[0]);
        } catch {}
        return Reflect.construct(target, nextArgs, newTarget === WorkerProxy ? target : newTarget);
      }
    });
    nativeSource.set(WorkerProxy, 'function Worker() { [native code] }');
    try {
      Object.defineProperty(OriginalWorker.prototype, 'constructor', {
        ...Object.getOwnPropertyDescriptor(OriginalWorker.prototype, 'constructor'),
        value: WorkerProxy
      });
      Object.defineProperty(G, 'Worker', {
        ...Object.getOwnPropertyDescriptor(G, 'Worker'),
        value: WorkerProxy
      });
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
      try {
        delete navProto.userAgentData;
      } catch {}
      try {
        delete navProto.deviceMemory;
      } catch {}
      try {
        delete G.NavigatorUAData;
      } catch {}
      try {
        delete G.chrome;
      } catch {}
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
          const plugin = {
            name,
            filename,
            description,
            length: mimeTypes.length
          };
          mimeTypes.forEach((m, idx) => {
            plugin[idx] = m;
            plugin[m.type] = m;
          });
          return plugin;
        };
        const mimePdf = {
          type: 'application/pdf',
          suffixes: 'pdf',
          description: 'Portable Document Format'
        };
        const mimeTextPdf = {
          type: 'text/pdf',
          suffixes: 'pdf',
          description: 'Portable Document Format'
        };
        const pluginList = [createPlugin('PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format', [mimePdf, mimeTextPdf]), createPlugin('Chrome PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format', [mimePdf, mimeTextPdf]), createPlugin('Chromium PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format', [mimePdf, mimeTextPdf]), createPlugin('Microsoft Edge PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format', [mimePdf, mimeTextPdf]), createPlugin('WebKit built-in PDF', 'internal-pdf-viewer', 'Portable Document Format', [mimePdf, mimeTextPdf])];
        mimePdf.enabledPlugin = pluginList[0];
        mimeTextPdf.enabledPlugin = pluginList[0];
        const mockPlugins = {
          length: pluginList.length,
          item(i) {
            return this[i] || null;
          },
          namedItem(n) {
            return this[n] || null;
          },
          refresh() {}
        };
        pluginList.forEach((p, idx) => {
          mockPlugins[idx] = p;
          mockPlugins[p.name] = p;
        });
        const mockMimes = {
          length: 2,
          item(i) {
            return this[i] || null;
          },
          namedItem(n) {
            return this[n] || null;
          }
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
    replaceMethod(G.Permissions.prototype, 'query', original => function (parameters) {
      if (parameters && parameters.name === 'notifications') {
        const notifState = G.Notification ? G.Notification.permission : 'default';
        const mappedState = notifState === 'default' ? 'prompt' : notifState;
        return original.call(this, parameters).then(status => {
          if (status && status.state !== mappedState) {
            try {
              Object.defineProperty(status, 'state', {
                get: () => mappedState,
                configurable: true,
                enumerable: true
              });
            } catch {}
          }
          return status;
        }).catch(() => {
          const fallback = {
            state: mappedState,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() {
              return false;
            }
          };
          if (G.PermissionStatus && G.PermissionStatus.prototype) {
            try {
              Object.setPrototypeOf(fallback, G.PermissionStatus.prototype);
            } catch {}
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
    const targetMedia = mediaProto && Object.getOwnPropertyDescriptor(mediaProto, 'enumerateDevices') ? mediaProto : nav.mediaDevices;
    replaceMethod(targetMedia, 'enumerateDevices', original => async function () {
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
      const mockList = [{
        deviceId: 'default',
        kind: 'audioinput',
        label: '',
        groupId
      }, {
        deviceId: genId(1, 23),
        kind: 'audioinput',
        label: '',
        groupId
      }, {
        deviceId: 'default',
        kind: 'audiooutput',
        label: '',
        groupId
      }, {
        deviceId: genId(2, 47),
        kind: 'audiooutput',
        label: '',
        groupId
      }, {
        deviceId: genId(3, 89),
        kind: 'videoinput',
        label: '',
        groupId: genId(4, 97)
      }];
      const Proto = G.MediaDeviceInfo && G.MediaDeviceInfo.prototype;
      return mockList.map(d => {
        if (!Proto) return d;
        const obj = Object.create(Proto);
        for (const [key, val] of Object.entries(d)) {
          Object.defineProperty(obj, key, {
            value: val,
            writable: false,
            enumerable: true,
            configurable: true
          });
        }
        Object.defineProperty(obj, 'toJSON', {
          value: () => d,
          writable: false,
          enumerable: false,
          configurable: true
        });
        return obj;
      });
    });
  }

  // ── SpeechSynthesis: Giả lập danh sách voices Windows/Chrome khi profile là Windows (tránh rò rỉ giọng Apple trên Mac) ──
  const isWindowsProfile = cfg.platform === 'Win32' || cfg.uaData?.platform === 'Windows';
  if (isWindowsProfile && typeof G.SpeechSynthesis === 'function' && typeof G.SpeechSynthesis.prototype?.getVoices === 'function') {
    try {
      const windowsVoices = [{
        name: 'Microsoft David - English (United States)',
        lang: 'en-US',
        default: true,
        localService: true,
        voiceURI: 'Microsoft David - English (United States)'
      }, {
        name: 'Microsoft Mark - English (United States)',
        lang: 'en-US',
        default: false,
        localService: true,
        voiceURI: 'Microsoft Mark - English (United States)'
      }, {
        name: 'Microsoft Zira - English (United States)',
        lang: 'en-US',
        default: false,
        localService: true,
        voiceURI: 'Microsoft Zira - English (United States)'
      }, {
        name: 'Google US English',
        lang: 'en-US',
        default: false,
        localService: false,
        voiceURI: 'Google US English'
      }, {
        name: 'Google UK English Female',
        lang: 'en-GB',
        default: false,
        localService: false,
        voiceURI: 'Google UK English Female'
      }, {
        name: 'Google UK English Male',
        lang: 'en-GB',
        default: false,
        localService: false,
        voiceURI: 'Google UK English Male'
      }];
      const Proto = G.SpeechSynthesisVoice && G.SpeechSynthesisVoice.prototype;
      const mockVoices = windowsVoices.map(v => {
        if (!Proto) return v;
        const obj = Object.create(Proto);
        for (const [key, val] of Object.entries(v)) {
          Object.defineProperty(obj, key, {
            value: val,
            writable: false,
            enumerable: true,
            configurable: true
          });
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
      try {
        G.window.chrome = G.chrome;
      } catch {}
    }
    const c = G.chrome;
    if (!c.app) {
      c.app = {
        isInstalled: false,
        InstallState: {
          DISABLED: 'disabled',
          INSTALLED: 'installed',
          NOT_INSTALLED: 'not_installed'
        },
        RunningState: {
          CANNOT_RUN: 'cannot_run',
          READY_TO_RUN: 'ready_to_run',
          RUNNING: 'running'
        },
        getDetails() {
          return null;
        },
        getIsInstalled() {
          return false;
        },
        runningState() {
          return 'cannot_run';
        }
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
          tran: 15
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
          connectionInfo: 'h2'
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
    // platformVersion KHÔNG phải thuộc tính của NavigatorUAData (chỉ có qua getHighEntropyValues bên dưới);
    // tạo getter mới sẽ lộ ngay qua `'platformVersion' in navigator.userAgentData`.
    if (typeof cfg.isMobile === 'boolean') {
      replaceGetter(G.NavigatorUAData.prototype, 'mobile', () => cfg.isMobile);
    }
    if (cfg.uaData.brands && Array.isArray(cfg.uaData.brands)) {
      replaceGetter(G.NavigatorUAData.prototype, 'brands', () => cfg.uaData.brands);
    }
    replaceMethod(G.NavigatorUAData.prototype, 'getHighEntropyValues', original => function (hints) {
      const populate = dict => {
        const res = dict ? {
          ...dict
        } : {};
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
    replaceGetter(G, 'outerHeight', function () {
      return G.innerHeight + cfg.screen.frameHeight;
    });
    replaceGetter(G, 'outerWidth', function () {
      return G.innerWidth;
    });
  }

  // ── WebGL: vendor/renderer và vài giới hạn khớp GPU của profile ──
  const webglParams = cfg.webglParams ?? {};
  for (const ctxName of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
    const Ctx = G[ctxName];
    if (typeof Ctx !== 'function') continue;
    replaceMethod(Ctx.prototype, 'getParameter', original => function (param) {
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
      replaceMethod(Ctx.prototype, 'readPixels', original => function (...args) {
        const result = original.apply(this, args);
        const pixels = args[6];
        if (pixels && typeof pixels.length === 'number' && pixels.BYTES_PER_ELEMENT === 1) {
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] === 0) continue;
            const h = hash(i);
            if (h % 29 === 0) pixels[i + h % 3] ^= 1;
          }
        }
        return result;
      });
    }
  }

  // ── Canvas: nhiễu 1 bit trên ~4% điểm ảnh không trong suốt, cố định theo vị trí ──
  if (cfg.noise.canvas) {
    const noisify = data => {
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        const h = hash(i);
        if (h % 23 === 0) data[i + h % 3] ^= 1;
      }
    };
    const C2D = G.CanvasRenderingContext2D;
    const OC2D = G.OffscreenCanvasRenderingContext2D;
    const originalGetImageData = C2D && C2D.prototype.getImageData;
    const originalOffscreenGetImageData = OC2D && OC2D.prototype.getImageData;
    for (const Ctx of [C2D, OC2D]) {
      if (typeof Ctx !== 'function') continue;
      replaceMethod(Ctx.prototype, 'getImageData', original => function (...args) {
        const image = original.apply(this, args);
        noisify(image.data);
        return image;
      });
    }
    // Xuất ảnh từ một bản sao đã thêm nhiễu, không đụng vào canvas gốc của trang.
    const noisyCopy = canvas => {
      const {
        width,
        height
      } = canvas;
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
      replaceMethod(OC.prototype, 'convertToBlob', original => function (...args) {
        let copy = null;
        try {
          const {
            width,
            height
          } = this;
          if (width && height && width * height <= 4096 * 4096) {
            copy = new OC(width, height);
            const ctx = copy.getContext('2d');
            ctx.drawImage(this, 0, 0);
            const image = originalOffscreenGetImageData.call(ctx, 0, 0, width, height);
            noisify(image.data);
            ctx.putImageData(image, 0, 0);
          }
        } catch {
          copy = null;
        }
        return original.apply(copy ?? this, args);
      });
    }
    const HC = G.HTMLCanvasElement;
    if (typeof HC === 'function' && originalGetImageData) {
      for (const name of ['toDataURL', 'toBlob']) {
        replaceMethod(HC.prototype, name, original => function (...args) {
          let copy = null;
          try {
            copy = noisyCopy(this);
          } catch {}
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
    replaceMethod(G.AudioBuffer.prototype, 'getChannelData', original => function (channel) {
      const data = original.call(this, channel);
      ensureNoise(this, channel);
      return data;
    });
    replaceMethod(G.AudioBuffer.prototype, 'copyFromChannel', original => function (...args) {
      try {
        ensureNoise(this, args[1]);
      } catch {}
      return original.apply(this, args);
    });
    if (typeof G.AnalyserNode === 'function') {
      replaceMethod(G.AnalyserNode.prototype, 'getFloatFrequencyData', original => function (array) {
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
        replaceGetter(proto, key, function (real) {
          return layoutRects.has(this) ? real * scale : real;
        });
      }
    }
    replaceMethod(G.DOMRectReadOnly.prototype, 'toJSON', original => function () {
      const json = original.call(this);
      if (layoutRects.has(this)) for (const key of keys) json[key] *= scale;
      return json;
    });
    const markRect = rect => {
      if (rect) layoutRects.add(rect);
      return rect;
    };
    const markList = list => {
      for (let i = 0; i < list.length; i += 1) layoutRects.add(list[i]);
      return list;
    };
    for (const Owner of [G.Element, G.Range]) {
      if (typeof Owner !== 'function') continue;
      replaceMethod(Owner.prototype, 'getBoundingClientRect', original => function () {
        return markRect(original.call(this));
      });
      replaceMethod(Owner.prototype, 'getClientRects', original => function () {
        return markList(original.call(this));
      });
    }
  }

  // ── Fonts: đo chữ lệch theo hệ số cố định để phá fingerprint font-metric qua canvas.
  // Không vá document.fonts.check: Chrome vốn trả true cho mọi font không phải web font, vá vào lại thành dấu hiệu.
  if (cfg.noise.fonts && typeof G.TextMetrics === 'function') {
    for (const key of ['width', 'actualBoundingBoxLeft', 'actualBoundingBoxRight']) {
      replaceGetter(G.TextMetrics.prototype, key, real => real * (1 + (scale - 1) * 50));
    }
  }
}
export { stealthInitScript };
