import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const executeFile = promisify(execFile);
export { executeFile };
