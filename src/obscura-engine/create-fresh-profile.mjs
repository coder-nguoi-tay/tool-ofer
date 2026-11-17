import { randomInt } from 'node:crypto';
import { generateObscuraProfile } from './generate-obscura-profile.mjs';
import { getObscuraProfileIdentity } from './profile-identity.mjs';

/**
 * Sinh fingerprint và phiên bản khác phiên vừa dừng, trong nhóm thiết bị được phép.
 * @param {object} options Seed tùy chọn cho fixture, OS và metadata phiên trước của slot.
 * @return {{seed: number, profile: object}} Seed và profile dùng chung cho native/JS/HTTP.
 * @throws {Error} Khi không tìm được cặp thiết bị/phiên bản mới trong 64 lần sinh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export function createFreshObscuraProfile({ seed = null, os, previousIdentity = null }) {
  for (let attempt = 0; attempt < 64; attempt++) {
    const candidateSeed = attempt === 0 && seed !== null ? seed : randomInt(1, 0x100000000);
    const profile = generateObscuraProfile({ seed: candidateSeed, os });
    const identity = getObscuraProfileIdentity(profile);
    if (!previousIdentity || (String(candidateSeed) !== previousIdentity.seed &&
      identity.browserVersion !== previousIdentity.browserVersion &&
      identity.deviceFingerprint !== previousIdentity.deviceFingerprint)) {
      return { seed: candidateSeed, profile };
    }
  }
  throw new Error('Không tạo được thiết bị và phiên bản Obscura khác phiên cũ; không mở lại fingerprint cũ.');
}
