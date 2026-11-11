const moduleState = {
  cfg: null,
  lastUpdateId: 0,
  notifyChatId: null,
  lastActiveCount: 0,
  lastLimitRunCount: 0,
  stuckSince: null,
  lowProxyNotified: false,
  low711BalanceNotified: false,
  sessionLeadsAtBotStart: 0,
  botStartTime: Date.now(),
  botGeneration: 0,
  notifyTimer: null
};
export { moduleState };
