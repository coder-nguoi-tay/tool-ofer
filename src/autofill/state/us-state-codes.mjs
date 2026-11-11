import { usStateNames } from './us-state-names.mjs';
const usStateCodes = Object.fromEntries(Object.entries(usStateNames).map(([code, name]) => [name.toLowerCase(), code]));
export { usStateCodes };
