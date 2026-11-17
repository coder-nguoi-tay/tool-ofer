import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
process.env.AUTOLEADPC_LOG_MODE = 'access';
process.env.AUTOLEADPC_DATA_DIR = `AutoLeadPC-tests-obscura-${process.pid}`;
const directory = join(homedir(), process.platform === 'win32' ? 'AppData/Roaming' : 'Library/Application Support', process.env.AUTOLEADPC_DATA_DIR);
mkdirSync(directory, { recursive: true });
process.once('exit', () => rmSync(directory, { recursive: true, force: true }));
