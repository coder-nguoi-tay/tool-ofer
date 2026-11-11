import { existsSync } from 'node:fs';
import { getAutoLeadPCDir } from '../../../config/paths.mjs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { writeFileSync } from 'node:fs';

/**
 * Xử lý API pc-offer-delete.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostPcOfferDelete(request, response) {
  if (request.method === 'POST' && request.url === '/pc/offer/delete') {
    try {
      const body = JSON.parse(await readRequestBody(request));
      const baseDir = getAutoLeadPCDir();
      const listPath = join(baseDir, 'Config', 'Offer', 'saved-offers.json');
      let savedList = [];
      if (existsSync(listPath)) {
        try {
          savedList = JSON.parse(readFileSync(listPath, 'utf8'));
          if (!Array.isArray(savedList)) savedList = [];
        } catch {}
      }
      savedList = savedList.filter(item => item.id !== body.id && item.NameOffer !== body.NameOffer);
      writeFileSync(listPath, JSON.stringify(savedList, null, 2), 'utf8');
      respondWithJson(response, 200, {
        success: true,
        savedList
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
