import { lstat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { collectRecordingFiles } from './collect-recording-files.mjs';

/**
 * Dọn lịch sử quá 7 ngày, vượt 500 MB hoặc 200 file, theo phiên cũ nhất đã đóng.
 * Giữ phiên đang chạy/có ghi chú; orphan có thời gian an toàn 15 phút khi vượt trần file.
 * @param {object} options Thư mục, mảng sessions, Set activeIds và ngưỡng test tùy chọn.
 * @return {Promise<object>} Số phiên/file đã dọn và số byte file recorder còn lại.
 * @throws {Error} Khi không thể liệt kê hoặc xóa file do recorder sở hữu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function pruneStoredRecordings({ directory, sessions, activeIds, persist = async () => true, now = Date.now(), maxBytes = 500 * 1024 * 1024, maxAgeMs = 7 * 86_400_000, maxFiles = 200 }) {
  const files = await collectRecordingFiles(directory);
  const protectedIds = new Set(activeIds);
  const owners = new Map();
  const candidates = [];
  for (const session of sessions) {
    const endedAt = Date.parse(session.endedAt || session.startedAt);
    if (session.feedback?.length || !Number.isFinite(endedAt) || now - endedAt < 60_000) protectedIds.add(session.id);
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
  const metadataBytes = (await lstat(join(directory, 'browser-logs.json')).catch(() => null))?.size || 0;
  const originalBytes = files.reduce((sum, file) => sum + file.size, metadataBytes);
  let remainingBytes = originalBytes;
  let remainingFiles = files.length;
  for (const { session, endedAt } of candidates.sort((a, b) => a.endedAt - b.endedAt)) {
    if (protectedIds.has(session.id)) continue;
    if (now - endedAt < maxAgeMs && remainingBytes <= maxBytes && remainingFiles <= maxFiles) continue;
    removable.add(session.id);
    remainingBytes -= Math.min(metadataBytes, Buffer.byteLength(JSON.stringify(session)));
    for (const file of sessionFiles.get(session.id) || []) {
      const fileOwners = owners.get(file.path);
      if (fileOwners?.has(session.id) && [...fileOwners].every(id => removable.has(id))) { remainingBytes -= file.size; remainingFiles--; }
    }
  }
  const removed = sessions.filter(session => removable.has(session.id));
  for (let index = sessions.length - 1; index >= 0; index--) if (removable.has(sessions[index].id)) sessions.splice(index, 1);
  if (removed.length && !await persist()) {
    sessions.push(...removed);
    return { removedSessions: 0, removedFiles: 0, remainingBytes: originalBytes };
  }
  const retainedIds = new Set(sessions.filter(session => !removable.has(session.id)).map(session => session.id));
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
  return { removedSessions: removable.size, removedFiles, remainingBytes: Math.max(0, remainingBytes) };
}
