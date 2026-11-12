import { summarizeRecordingSession } from './summarize-recording-session.mjs';
import { lstat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { collectRecordingFiles } from './collect-recording-files.mjs';

/**
 * Dọn lịch sử quá 7 ngày; khi vượt dung lượng/file thì giữ tóm tắt và bỏ artifact theo phiên cũ nhất.
 * Giữ phiên đang chạy/có ghi chú; orphan có thời gian an toàn 15 phút khi vượt trần file.
 * @param {object} options Thư mục, mảng sessions, Set activeIds và ngưỡng test tùy chọn.
 * @return {Promise<object>} Số phiên/file đã dọn và số byte file recorder còn lại.
 * @throws {Error} Khi không thể liệt kê hoặc xóa file do recorder sở hữu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function pruneStoredRecordings({ directory, sessions, activeIds, persist = async () => true, now = Date.now(), maxBytes = 500 * 1024 * 1024, maxAgeMs = 7 * 86_400_000, maxFiles = 200, maxSummaries = 1000 }) {
  const files = await collectRecordingFiles(directory);
  const protectedIds = new Set(activeIds);
  const owners = new Map();
  const candidates = [];
  for (const session of sessions) {
    const endedAt = Date.parse(session.endedAt || session.startedAt);
    if (session.endedAt === null && now - endedAt < maxAgeMs || session.feedback?.length || !Number.isFinite(endedAt) || now - endedAt < 60_000) protectedIds.add(session.id);
    else candidates.push({ session, endedAt });
    for (const entry of session.logs || []) {
      for (const path of [entry.htmlPath, entry.screenshotPath]) {
        if (!path) continue;
        const key = resolve(path);
        if (!owners.has(key)) owners.set(key, new Set());
        owners.get(key).add(session.id);
      }
    }
  }
  const knownIds = new Set([...sessions.map(session => session.id), ...activeIds]);
  const sessionFiles = new Map();
  for (const file of files) {
    const rawId = file.name.replace(/^manual-ops-/, '').replace(/\.jsonl$/, '');
    const id = knownIds.has(rawId) ? rawId : rawId.slice(0, 36);
    if (file.name.startsWith('manual-ops-') && knownIds.has(id)) {
      if (!owners.has(file.path)) owners.set(file.path, new Set());
      owners.get(file.path).add(id);
    }
    for (const owner of owners.get(file.path) || []) {
      if (!sessionFiles.has(owner)) sessionFiles.set(owner, []);
      sessionFiles.get(owner).push(file);
    }
  }
  const removable = new Set();
  const prunedEvidence = new Set();
  const replacements = new Map();
  const metadataBytes = (await lstat(join(directory, 'browser-logs.json')).catch(() => null))?.size || 0;
  const originalBytes = files.reduce((sum, file) => sum + file.size, metadataBytes);
  let remainingBytes = originalBytes;
  let remainingFiles = files.length;
  for (const { session, endedAt } of candidates.sort((a, b) => a.endedAt - b.endedAt)) {
    if (protectedIds.has(session.id)) continue;
    const expired = now - endedAt >= maxAgeMs;
    const owned = sessionFiles.get(session.id) || [];
    const pressured = remainingBytes > maxBytes || remainingFiles > maxFiles && owned.length > 0;
    if (!expired && !pressured) continue;
    if (expired) removable.add(session.id);
    else if (!session.summaryOnly) replacements.set(session.id, summarizeRecordingSession(session, now));
    prunedEvidence.add(session.id);
    const replacement = replacements.get(session.id);
    remainingBytes += (expired ? 0 : Buffer.byteLength(JSON.stringify(replacement || session))) - Buffer.byteLength(JSON.stringify(session));
    for (const file of owned) {
      const fileOwners = owners.get(file.path);
      if (fileOwners?.has(session.id) && [...fileOwners].every(id => prunedEvidence.has(id))) { remainingBytes -= file.size; remainingFiles--; }
    }
  }
  const summaries = candidates.filter(({ session }) => !protectedIds.has(session.id) && !removable.has(session.id) && (session.summaryOnly || replacements.has(session.id)));
  for (const { session } of summaries.slice(0, Math.max(0, summaries.length - maxSummaries))) {
    removable.add(session.id);
    remainingBytes -= Buffer.byteLength(JSON.stringify(replacements.get(session.id) || session));
    if (!prunedEvidence.has(session.id)) {
      prunedEvidence.add(session.id);
      for (const file of sessionFiles.get(session.id) || []) {
        if ([...(owners.get(file.path) || [])].every(id => prunedEvidence.has(id))) { remainingBytes -= file.size; remainingFiles--; }
      }
    }
  }
  const originalSessions = [...sessions];
  if (removable.size || replacements.size) {
    sessions.splice(0, sessions.length, ...sessions.filter(session => !removable.has(session.id)).map(session => replacements.get(session.id) || session));
    try {
      if (!await persist()) {
        sessions.splice(0, sessions.length, ...originalSessions);
        return { removedSessions: 0, summarizedSessions: 0, removedFiles: 0, remainingBytes: originalBytes };
      }
    } catch (error) { sessions.splice(0, sessions.length, ...originalSessions); throw error; }
  }
  const retainedIds = new Set(sessions.filter(session => !prunedEvidence.has(session.id)).map(session => session.id));
  const orphanCandidates = [];
  let removedFiles = 0;
  for (const file of files) {
    const fileOwners = owners.get(file.path);
    if (fileOwners?.size) {
      if ([...fileOwners].some(id => protectedIds.has(id) || retainedIds.has(id))) continue;
      await unlink(file.path).catch(error => { if (error.code !== 'ENOENT') throw error; });
      removedFiles++;
    } else orphanCandidates.push(file);
  }
  for (const file of orphanCandidates.sort((a, b) => a.modifiedAt - b.modifiedAt)) {
    const graceMs = remainingFiles > maxFiles ? 15 * 60_000 : 86_400_000;
    if (now - file.modifiedAt < graceMs || !file.name.endsWith('.tmp') && now - file.modifiedAt < maxAgeMs && remainingBytes <= maxBytes && remainingFiles <= maxFiles) continue;
    await unlink(file.path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    remainingBytes -= file.size;
    remainingFiles--;
    removedFiles++;
  }
  return { removedSessions: removable.size, summarizedSessions: [...replacements.keys()].filter(id => !removable.has(id)).length, removedFiles, remainingBytes: Math.max(0, remainingBytes) };
}
