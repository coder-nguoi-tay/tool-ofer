import { androidDevices } from './state/android-devices.mjs';
import { androidVersions } from './state/android-versions.mjs';
import { iosVersions } from './state/ios-versions.mjs';
import { iphoneScreens } from './state/iphone-screens.mjs';
import { linuxGpus } from './state/linux-gpus.mjs';
import { linuxScreens } from './state/linux-screens.mjs';
import { linuxVersions } from './state/linux-versions.mjs';
import { macChips } from './state/mac-chips.mjs';
import { macScreens } from './state/mac-screens.mjs';
import { macVersions } from './state/mac-versions.mjs';
import { seededRandom } from './seeded-random.mjs';
import { windowsGpus } from './state/windows-gpus.mjs';
import { windowsScreens } from './state/windows-screens.mjs';

/**
 * Sinh một máy cụ thể từ profile chung: chip/GPU, số nhân CPU, RAM, màn hình, tỉ lệ hiển thị
 * và phiên bản hệ điều hành được bốc ngẫu nhiên trong các cấu hình có thật, đồng bộ với nhau.
 *
 * @param {string} profileKey Khoá trong DEVICE_PROFILES.
 * @param {object} base Profile gốc.
 * @param {number} seed Seed của phiên.
 * @param {{width: number, height: number}|null} minViewport Khung nhìn tối thiểu màn hình phải chứa được.
 * @return {object} Profile mới (không sửa base) kèm `summary` mô tả máy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function createDeviceVariant(profileKey, base, seed, minViewport = null) {
  const random = seededRandom(seed);
  const pick = list => list[Math.floor(random() * list.length)];
  const fits = list => {
    if (!minViewport) return list;
    const fitting = list.filter(item => item.width >= minViewport.width && item.height >= minViewport.height);
    return fitting.length > 0 ? fitting : [list.reduce((a, b) => a.width * a.height >= b.width * b.height ? a : b)];
  };
  const variant = {
    ...base,
    screen: {
      ...base.screen
    },
    spoof: {
      ...base.spoof
    },
    uaData: base.uaData && {
      ...base.uaData
    }
  };
  if (profileKey === 'macos') {
    const chip = pick(macChips);
    const screen = pick(fits(macScreens));
    variant.deviceScaleFactor = screen.dpr;
    variant.screen = {
      width: screen.width,
      height: screen.height,
      availTop: screen.availTop,
      availHeight: screen.height - screen.availTop,
      frameHeight: 79
    };
    variant.uaData.platformVersion = pick(macVersions);
    Object.assign(variant.spoof, {
      dpr: screen.dpr,
      hardwareConcurrency: pick(chip.cores),
      deviceMemory: 8,
      webglRenderer: `ANGLE (Apple, ANGLE Metal Renderer: ${chip.gpu}, Unspecified Version)`
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
    variant.screen = {
      width: screen.width,
      height: screen.height,
      availHeight: screen.height - taskbar,
      frameHeight: isWindows ? 87 : 77
    };
    variant.uaData.platformVersion = osVersion;
    Object.assign(variant.spoof, {
      dpr: screen.dpr,
      hardwareConcurrency: pick(gpu.cores),
      webglVendor: gpu.vendor,
      webglRenderer: gpu.renderer
    });
    // Máy từ 12 luồng trở lên gần như luôn có ≥ 8 GB (Chrome làm tròn xuống và chặn trên ở 8).
    variant.spoof.deviceMemory = variant.spoof.hardwareConcurrency >= 12 ? 8 : pick([4, 8, 8]);
    const osName = isWindows ? 'Windows 10' : `Linux ${osVersion}`;
    variant.deviceVersion = isWindows ? `${osName} (${osVersion})` : `Linux ${osVersion}`;
    variant.summary = `${osName} · ${gpu.renderer.replace(/^ANGLE \([^,]+, /, '').replace(/ \(0x.*$| Direct3D.*$|,.*$/, '')} · ${variant.spoof.hardwareConcurrency} nhân · ${screen.width}x${screen.height}@${screen.dpr}x`;
  } else if (profileKey === 'android') {
    const device = pick(androidDevices);
    variant.viewport = {
      width: device.width,
      height: device.height
    };
    variant.deviceScaleFactor = device.dpr;
    variant.screen = {
      width: device.width,
      height: device.height
    };
    variant.uaData.platformVersion = pick(androidVersions);
    variant.uaData.model = device.model;
    const androidMajor = variant.uaData.platformVersion.split('.')[0];
    variant.ua = v => `Mozilla/5.0 (Linux; Android ${androidMajor}; ${device.model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Mobile Safari/537.36`;
    Object.assign(variant.spoof, {
      dpr: device.dpr,
      hardwareConcurrency: device.cores,
      deviceMemory: pick([4, 8, 8]),
      webglVendor: device.vendor,
      webglRenderer: device.gpu
    });
    variant.deviceVersion = `Android ${androidMajor} (${device.model})`;
    variant.summary = `Android ${variant.uaData.platformVersion.split('.')[0]} · ${device.model} · ${device.gpu} · ${device.width}x${device.height}@${device.dpr}x`;
  } else if (profileKey === 'ios') {
    const screen = pick(iphoneScreens);
    const osVersion = pick(iosVersions);
    variant.viewport = {
      width: screen.width,
      height: screen.height
    };
    variant.screen = {
      width: screen.width,
      height: screen.height
    };
    variant.ua = v => `Mozilla/5.0 (iPhone; CPU iPhone OS ${osVersion} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${v} Mobile/15E148 Safari/604.1`;
    variant.spoof.hardwareConcurrency = screen.cores;
    variant.deviceVersion = `iOS ${osVersion.replace(/_/g, '.')} (iPhone)`;
    variant.summary = `iOS ${osVersion.replace(/_/g, '.')} · iPhone ${screen.width}x${screen.height}@3x`;
  } else if (profileKey === 'ipad') {
    const osVersion = pick(iosVersions);
    variant.ua = v => `Mozilla/5.0 (iPad; CPU OS ${osVersion} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${v} Mobile/15E148 Safari/604.1`;
    variant.deviceVersion = `iPadOS ${osVersion.replace(/_/g, '.')} (iPad)`;
    variant.summary = `iPadOS ${osVersion.replace(/_/g, '.')} · ${base.screen.width}x${base.screen.height}@2x`;
  } else {
    variant.deviceVersion = base.label;
    variant.summary = base.label;
  }
  return variant;
}
export { createDeviceVariant };
