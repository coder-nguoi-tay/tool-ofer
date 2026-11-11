import { instanceId } from './instance-id.mjs';
const instanceSuffix = instanceId !== '1' ? `-${instanceId}` : '';
export { instanceSuffix };
