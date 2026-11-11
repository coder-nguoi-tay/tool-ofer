import { existsSync } from 'node:fs';
import { getAutoLeadPCDir } from '../../../config/paths.mjs';
import { join } from 'node:path';
import { loadOfferStrategies } from '../../../leads/actions/load-offer-strategies.mjs';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { writeFileSync } from 'node:fs';

/**
 * Xử lý API pc-offer-save.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostPcOfferSave(request, response) {
  if (request.method === 'POST' && request.url === '/pc/offer/save') {
    try {
      const body = JSON.parse(await readRequestBody(request));
      const baseDir = getAutoLeadPCDir();
      const offerDir = join(baseDir, 'Config', 'Offer');
      if (!existsSync(offerDir)) {
        mkdirSync(offerDir, {
          recursive: true
        });
      }
      const filePath = join(offerDir, 'Offer.ini');
      const link1 = (body.LinkOffer || '').replace(/[\r\n]+/g, '\\n');
      const link2 = (body.LinkOffer2 || '').trim();
      const link3 = (body.LinkOffer3 || '').trim();
      const link4 = (body.LinkOffer4 || '').trim();
      const iniContent = `[Setting]\nProxy=Direct\nAuto=Manual work\nCheckDuplicate=False\n[Data]\nLinkOffer=${link1}\nLinkOffer2=${link2}\nLinkOffer3=${link3}\nLinkOffer4=${link4}\nNameOffer=${body.NameOffer || ''}\nScript=${body.Script || ''}\nComplete=${body.Complete || ''}\nTimeload1=${body.TimeLimit || '30'}\nTimeload2=40\ndelayStart=${body.delayStart || '1'}\ndelayStop=${body.delayStop || '1'}\nThread=${body.Thread || '1'}\nLimitRun=${body.LimitRun || '0'}\n`;
      writeFileSync(filePath, iniContent, 'utf8');

      // Lưu / cập nhật danh sách preset saved-offers.json
      const listPath = join(offerDir, 'saved-offers.json');
      let savedList = [];
      if (existsSync(listPath)) {
        try {
          savedList = JSON.parse(readFileSync(listPath, 'utf8'));
          if (!Array.isArray(savedList)) savedList = [];
        } catch {}
      }
      const offerName = (body.NameOffer || '').trim() || (body.LinkOffer || '').trim().split('\n')[0] || 'Offer ' + (savedList.length + 1);
      const offerItem = {
        id: body.id || `offer-${Date.now()}`,
        NameOffer: offerName,
        LinkOffer: body.LinkOffer || '',
        LinkOffer2: body.LinkOffer2 || '',
        LinkOffer3: body.LinkOffer3 || '',
        LinkOffer4: body.LinkOffer4 || '',
        Complete: body.Complete || '',
        TimeLimit: body.TimeLimit || '30',
        delayStart: body.delayStart || '1',
        delayStop: body.delayStop || '1',
        Thread: body.Thread || '1',
        LimitRun: body.LimitRun || '0',
        methodConfigs: Array.isArray(body.methodConfigs) ? body.methodConfigs : [],
        updatedAt: new Date().toISOString()
      };
      const existingIdx = savedList.findIndex(item => item.id && item.id === offerItem.id || item.NameOffer === offerName);
      if (existingIdx !== -1) {
        savedList[existingIdx] = {
          ...savedList[existingIdx],
          ...offerItem
        };
      } else {
        savedList.unshift(offerItem);
      }
      if (savedList.length > 50) savedList.length = 50;
      writeFileSync(listPath, JSON.stringify(savedList, null, 2), 'utf8');

      // Lưu 4 cách giải (Cách 1 → Offer 1, Cách 2 → Offer 2, ...)
      if (Array.isArray(body.methodConfigs)) {
        const methodPath = join(offerDir, 'offer-methods.json');
        writeFileSync(methodPath, JSON.stringify(body.methodConfigs, null, 2), 'utf8');
        await loadOfferStrategies();
      }
      respondWithJson(response, 200, {
        success: true,
        savedItem: offerItem,
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
