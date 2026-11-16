import { appDataDirectory } from '../../../config/paths.mjs';
import { join } from 'node:path';
const OFFER_HTML_FULL_DIR = process.platform === 'win32' ? join(appDataDirectory, 'offer-html-full') : '/Users/codernguoitay/offer-html-full';
export { OFFER_HTML_FULL_DIR };
