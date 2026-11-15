import { getAgent } from './agent-registry.mjs';

/**
 * Trạng thái ngắn của agent một tab cho UI/API; không chứa record, token hay HTML.
 * @param {object} page Tab cần tra.
 * @return {object|null} status, detail, actionCount, turnCount, lastProgressAt, startedAt hoặc null.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function getContinuousAgentState(page) {
  const agent = getAgent(page);
  if (!agent) return null;
  const { status, detail, actionCount, turnCount, lastProgressAt, startedAt } = agent;
  return { status, detail, actionCount, turnCount, lastProgressAt, startedAt };
}
