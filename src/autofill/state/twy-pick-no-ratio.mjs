import { manualOpsRules } from './manual-ops-rules.mjs';
const twyPickNoRatio = manualOpsRules && typeof manualOpsRules.twyYesRatio === 'number' && manualOpsRules.twyYesRatio >= 0 && manualOpsRules.twyYesRatio <= 1 ? 1 - manualOpsRules.twyYesRatio : 0.3;
export { twyPickNoRatio };
