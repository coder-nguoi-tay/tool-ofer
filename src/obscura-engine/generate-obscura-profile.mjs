import { execFileSync } from 'node:child_process';
import { resolveObscuraBinary } from './resolve-obscura-binary.mjs';

/**
 * Sinh cấu hình Anti-Detect Profile từ Obscura Rust Engine.
 *
 * @param {object} params
 * @param {number|string} [params.seed=42] Seed định danh cho phiên / IP / slot.
 * @param {'windows'|'mac'|'android'} [params.os='windows'] Hệ điều hành đích.
 * @return {object} Đối tượng profile Anti-Detect hoàn chỉnh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export function generateObscuraProfile({ seed = 42, os = 'windows' } = {}) {
  const binary = resolveObscuraBinary();
  const rawOutput = execFileSync(binary, ['profile', String(seed), String(os)], {
    encoding: 'utf8',
    timeout: 5000,
  });

  return JSON.parse(rawOutput.trim());
}
