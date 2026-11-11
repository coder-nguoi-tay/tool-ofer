import { dualStreamState } from '../constants/dual-stream-state.mjs';
import { dualStreamStatePath } from '../constants/dual-stream-state-path.mjs';
import { multiOfferState } from '../constants/multi-offer-state.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Load dual stream state.
 * @return {Promise<void>} Kết quả xử lý load dual stream state.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function loadDualStreamState() {
  try {
    const data = JSON.parse(await readFile(dualStreamStatePath, 'utf8'));
    if (data && typeof data === 'object') {
      dualStreamState.enabled = Boolean(data.enabled);
      dualStreamState.websiteUrl1 = data.websiteUrl1 || '';
      dualStreamState.websiteUrl2 = data.websiteUrl2 || '';
      dualStreamState.stream1Index = Number(data.stream1Index) || 0;
      dualStreamState.stream2Index = Number.isInteger(data.stream2Index) ? data.stream2Index : -1;
      dualStreamState.stream1Used = new Set(Array.isArray(data.stream1Used) ? data.stream1Used : []);
      dualStreamState.stream2Used = new Set(Array.isArray(data.stream2Used) ? data.stream2Used : []);
      if (data.multiOffer && typeof data.multiOffer === 'object') {
        multiOfferState.enabled = Boolean(data.multiOffer.enabled ?? dualStreamState.enabled);
        multiOfferState.offerCount = Number(data.multiOffer.offerCount) || 2;
        multiOfferState.offerUrls = Array.isArray(data.multiOffer.offerUrls) ? data.multiOffer.offerUrls : [];
        if (data.multiOffer.offerCursors) {
          multiOfferState.offerCursors = new Map(Object.entries(data.multiOffer.offerCursors).map(([k, v]) => [Number(k), Number(v)]));
        }
        if (data.multiOffer.offerUsed) {
          multiOfferState.offerUsed = new Map(Object.entries(data.multiOffer.offerUsed).map(([k, v]) => [Number(k), new Set(v)]));
        }
      } else {
        multiOfferState.offerUsed.set(1, dualStreamState.stream1Used);
        multiOfferState.offerUsed.set(2, dualStreamState.stream2Used);
        multiOfferState.offerCursors.set(1, dualStreamState.stream1Index);
        multiOfferState.offerCursors.set(2, dualStreamState.stream2Index);
      }
    }
  } catch {}
}
