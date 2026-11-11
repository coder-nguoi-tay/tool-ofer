import { dualStreamState } from '../constants/dual-stream-state.mjs';
import { dualStreamStatePath } from '../constants/dual-stream-state-path.mjs';
import { multiOfferState } from '../constants/multi-offer-state.mjs';
import { syncDualStreamState } from './sync-dual-stream-state.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Save dual stream state.
 * @return {Promise<void>} Kết quả xử lý save dual stream state.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function saveDualStreamState() {
  try {
    syncDualStreamState(multiOfferState.offerCount || 2);
    const data = {
      enabled: dualStreamState.enabled,
      websiteUrl1: dualStreamState.websiteUrl1,
      websiteUrl2: dualStreamState.websiteUrl2,
      stream1Index: dualStreamState.stream1Index,
      stream2Index: dualStreamState.stream2Index,
      stream1Used: [...dualStreamState.stream1Used],
      stream2Used: [...dualStreamState.stream2Used],
      multiOffer: {
        enabled: multiOfferState.enabled,
        offerCount: multiOfferState.offerCount,
        offerUrls: multiOfferState.offerUrls,
        offerCursors: Object.fromEntries(multiOfferState.offerCursors.entries()),
        offerUsed: Object.fromEntries([...multiOfferState.offerUsed.entries()].map(([k, set]) => [k, [...set]]))
      }
    };
    await writeFile(dualStreamStatePath, JSON.stringify(data, null, 2)).catch(() => {});
  } catch {}
}
