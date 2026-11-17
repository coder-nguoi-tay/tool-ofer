import { execFileSync } from 'node:child_process';
import { resolveObscuraBinary } from './resolve-obscura-binary.mjs';

/**
 * Sinh chuỗi mã nguồn JavaScript stealth injection từ Obscura Rust Engine.
 *
 * @param {object} params
 * @param {number|string} [params.seed=42] Seed định danh cho phiên.
 * @param {'windows'|'mac'|'android'} [params.os='windows'] Hệ điều hành đích.
 * @param {object|null} [params.profile] Profile đã đồng bộ geo/ngôn ngữ.
 * @param {object} [params.antiFingerprint] Lựa chọn nhiễu của người dùng.
 * @throws {Error} Khi không sinh được script từ binary.
 * @return {string} Đoạn mã JavaScript sẵn sàng tiêm qua CDP Page.addScriptToEvaluateOnNewDocument.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export function buildObscuraStealthScript({ seed = 42, os = 'windows', profile = null, antiFingerprint = {} } = {}) {
  const binary = resolveObscuraBinary();
  const scriptOutput = execFileSync(binary, ['script', String(seed), String(os)], {
    encoding: 'utf8',
    timeout: 5000,
  });

  let script = scriptOutput.trim();
  if (profile) script = script.replace(/const __PROFILE__ = .*;/, `const __PROFILE__ = ${JSON.stringify(profile)};`);
  // Engine đã tự lo canvas (nhiễu theo seed), audio (OfflineAudioContext theo seed) và WebGL theo danh tính phiên,
  // nên bỏ hẳn các hook tiêm này: hook tiêm để lại khung "<preload>" trong stack và hàm không giống native.
  const start = script.indexOf('// 7. Canvas Fingerprint Noise');
  const end = script.indexOf('// 7. Auto-follow HTML');
  if (start !== -1 && end > start) script = script.slice(0, start) + script.slice(end);
  return script;

}
