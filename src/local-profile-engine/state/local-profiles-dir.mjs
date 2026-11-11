import { homedir } from 'node:os';
import { join } from 'node:path';
const LOCAL_PROFILES_DIR = join(homedir(), '.autoleadpc', 'Profiles');
export { LOCAL_PROFILES_DIR };
