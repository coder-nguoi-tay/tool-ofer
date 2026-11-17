// Bản giải riêng của offer 2615, chép từ src/autofill/state/us-state-codes.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { usStateNames } from './us-state-names.mjs';
const usStateCodes = Object.fromEntries(Object.entries(usStateNames).map(([code, name]) => [name.toLowerCase(), code]));
export { usStateCodes };
