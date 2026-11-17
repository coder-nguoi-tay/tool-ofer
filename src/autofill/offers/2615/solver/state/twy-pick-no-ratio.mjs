// Bản giải riêng của offer 2615, chép từ src/autofill/state/twy-pick-no-ratio.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { manualOpsRules } from './manual-ops-rules.mjs';
const twyPickNoRatio = manualOpsRules && typeof manualOpsRules.twyYesRatio === 'number' && manualOpsRules.twyYesRatio >= 0 && manualOpsRules.twyYesRatio <= 1 ? 1 - manualOpsRules.twyYesRatio : 0.3;
export { twyPickNoRatio };
