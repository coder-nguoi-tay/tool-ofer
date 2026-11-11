const applicationState = {
  chromeBuildRotationCounter: 0,
  deviceProfileRotationCounter: 0,
  limitRunCount: 0,
  limitRunMax: 0,
  proxyHistoryWriteQueue: Promise.resolve(),
  saveLeadStatsTimer: null,
  templateProfileContext: null,
  autofillUsedKeys: new Set(),
  proxy711AutoRefilling: false,
  autofillRejectedKeys: new Set(),
  recordRotationCounter: 0,
  exclusiveQueue: Promise.resolve()
};
export { applicationState };
