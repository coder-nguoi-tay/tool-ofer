import { OFFER_HTML_FULL_DIR } from './offer-html-full-dir.mjs';
import { join } from 'node:path';
const OFFER_HTML_FULL_LOG = join(OFFER_HTML_FULL_DIR, `full-capture-${Date.now()}.jsonl`);
export { OFFER_HTML_FULL_LOG };
