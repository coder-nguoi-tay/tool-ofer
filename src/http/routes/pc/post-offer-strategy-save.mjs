import { getAutoLeadPCDir } from '../../../config/paths.mjs';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { offerStrategyState } from '../../../runtime/constants/offer-strategy-state.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Xử lý API pc-offer-strategy-save.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostPcOfferStrategySave(request, response) {
  if (request.method === 'POST' && request.url === '/pc/offer-strategy/save') {
    try {
      const body = JSON.parse(await readRequestBody(request));
      const offerNum = Number(body.offerNumber);
      if (!Number.isInteger(offerNum) || offerNum < 1 || offerNum > 30) {
        respondWithJson(response, 400, {
          error: 'offerNumber is required'
        });
        return true;
      }
      offerStrategyState.set(offerNum, {
        mode: ['auto_full', 'consent_only', 'manual', 'skip'].includes(body.mode) ? body.mode : 'auto_full',
        autoSubmit: body.autoSubmit !== false,
        maxPick: Number.isInteger(Number(body.maxPick)) && Number(body.maxPick) > 0 ? Number(body.maxPick) : null,
        pickRandom: body.pickRandom === true,
        notes: String(body.notes || ''),
        link: String(body.link || offerStrategyState.get(offerNum)?.link || '').trim()
      });
      const offerDir = join(getAutoLeadPCDir(), 'Config', 'Offer');
      await mkdir(offerDir, {
        recursive: true
      });
      await writeFile(join(offerDir, 'offer-methods.json'), JSON.stringify([...offerStrategyState].map(([offerNumber, strategy]) => ({
        offerNumber,
        ...strategy
      })), null, 2), 'utf8');
      respondWithJson(response, 200, {
        success: true
      });
    } catch (err) {
      respondWithJson(response, 400, {
        error: err.message
      });
    }
    return true;
  }
  return false;
}
