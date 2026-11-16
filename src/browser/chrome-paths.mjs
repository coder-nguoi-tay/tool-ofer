import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { windowsChromePaths } from './windows-chrome-paths.mjs';
import { appDataDirectory, baseDataDirectory, dataDirName } from '../config/paths.mjs';
export const chromeProfileDirectory = join(appDataDirectory, 'chrome-profiles');
export const chromeProfileCacheDirectory = process.platform === 'win32' ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), dataDirName, 'Cache', 'chrome-profiles') : join(homedir(), 'Library', 'Caches', dataDirName, 'chrome-profiles');
export const installedChromeAppPath = process.env.AUTOLEADPC_CHROME_APP || (process.platform === 'win32' ? (windowsChromePaths().find(existsSync) || windowsChromePaths()[0]) : '/Applications/Google Chrome.app');
export const chromeChannelDirectory = join(baseDataDirectory, 'chrome-channels');
export const chromeRegularBuildDirectory = join(baseDataDirectory, 'chrome-regular-builds');
export const roboFormExtensionId = 'pnlccmojcmeohlpggmfnbbiapkmbliob';
export const chromeTemplateProfileDirectory = join(baseDataDirectory, 'chrome-template-profile');
export const chromeTemplateMetadataName = 'autoleadpc-template.json';
// Khóa tiến trình, cache và phiên tab của profile mẫu không được chép sang profile mới.
export const chromeTemplateSkippedNames = new Set(['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'RunningChromeVersion', chromeTemplateMetadataName, 'Cache', 'Code Cache', 'GPUCache', 'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Crashpad', 'Sessions']);
