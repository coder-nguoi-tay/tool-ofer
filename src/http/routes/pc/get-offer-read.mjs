import { existsSync } from 'node:fs';
import { getAutoLeadPCDir } from '../../../config/paths.mjs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API pc-offer-read.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetPcOfferRead(request, response) {
  if (request.method === 'GET' && request.url === '/pc/offer/read') {
    try {
      const baseDir = getAutoLeadPCDir();
      const offerDir = join(baseDir, 'Config', 'Offer');
      const filePath = join(offerDir, 'Offer.ini');
      let data = {};
      if (existsSync(filePath)) {
        const buf = readFileSync(filePath);
        let text = '';
        if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
          text = buf.toString('utf16le');
        } else {
          text = buf.toString('utf8');
        }
        const getVal = key => {
          const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
          return m ? m[1].trim().replace(/\\n/g, '\n') : '';
        };
        data = {
          NameOffer: getVal('NameOffer'),
          LinkOffer: getVal('LinkOffer'),
          LinkOffer2: getVal('LinkOffer2'),
          LinkOffer3: getVal('LinkOffer3'),
          LinkOffer4: getVal('LinkOffer4'),
          Script: getVal('Script'),
          Complete: getVal('Complete'),
          TimeLimit: getVal('Timeload1') || '30',
          delayStart: getVal('delayStart') || '1',
          delayStop: getVal('delayStop') || '1',
          Thread: getVal('Thread') || '1',
          LimitRun: getVal('LimitRun') || '0'
        };
      }
      const listPath = join(offerDir, 'saved-offers.json');
      let savedList = [];
      if (existsSync(listPath)) {
        try {
          savedList = JSON.parse(readFileSync(listPath, 'utf8'));
          if (!Array.isArray(savedList)) savedList = [];
        } catch {}
      }
      // Nạp methodConfigs từ file riêng
      let methodConfigs = [];
      const methodPath = join(offerDir, 'offer-methods.json');
      if (existsSync(methodPath)) {
        try {
          methodConfigs = JSON.parse(readFileSync(methodPath, 'utf8'));
          if (!Array.isArray(methodConfigs)) methodConfigs = [];
        } catch {}
      }
      respondWithJson(response, 200, {
        ...data,
        savedList,
        methodConfigs
      });
    } catch (err) {
      respondWithJson(response, 200, {
        savedList: []
      });
    }
    return true;
  }
  return false;
}
