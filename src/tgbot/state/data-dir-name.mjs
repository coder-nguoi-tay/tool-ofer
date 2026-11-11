import { instanceSuffix } from './instance-suffix.mjs';
const dataDirName = process.env.AUTOLEADPC_DATA_DIR || `AutoLeadPC${instanceSuffix}`;
export { dataDirName };
