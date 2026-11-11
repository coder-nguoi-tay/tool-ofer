import { interactionLogDirectory } from './interaction-log-directory.mjs';
import { join } from 'node:path';
const interactionHtmlDirectory = join(interactionLogDirectory, 'html');
export { interactionHtmlDirectory };
