import { join } from 'node:path';
import { homedir } from 'node:os';
import { appDataDirectory, baseDataDirectory, dataDirName } from '../config/paths.mjs';
export const chromeProfileDirectory = join(appDataDirectory, 'chrome-profiles');
export const chromeProfileCacheDirectory = join(homedir(), 'Library', 'Caches', dataDirName, 'chrome-profiles');
export const installedChromeAppPath = process.env.AUTOLEADPC_CHROME_APP || '/Applications/Google Chrome.app';
export const chromeChannelDirectory = join(baseDataDirectory, 'chrome-channels');
export const chromeRegularBuildDirectory = join(baseDataDirectory, 'chrome-regular-builds');
export const roboFormExtensionId = 'pnlccmojcmeohlpggmfnbbiapkmbliob';
export const chromeTemplateProfileDirectory = join(baseDataDirectory, 'chrome-template-profile');
export const chromeTemplateMetadataName = 'autoleadpc-template.json';
// Khóa tiến trình, cache và phiên tab của profile mẫu không được chép sang profile mới.
export const chromeTemplateSkippedNames = new Set(['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'RunningChromeVersion', chromeTemplateMetadataName, 'Cache', 'Code Cache', 'GPUCache', 'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Crashpad', 'Sessions']);
