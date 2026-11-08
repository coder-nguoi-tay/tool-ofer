import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getProxyUniqueKey,
  proxyIdentity,
  parseProxyLine,
  isProxyUsedByAllOffers,
  getNextCollisionFreeProxy,
  multiOfferState,
} from './app.mjs';

test('getProxyUniqueKey differentiates rotating residential proxies with same gateway', () => {
  const line1 = 'http://Subpass%3D-session-aaa:pass@us.rotgbapi.trustsource.live:10000';
  const line2 = 'http://Subpass%3D-session-bbb:pass@us.rotgbapi.trustsource.live:10000';

  const p1 = { ...parseProxyLine(line1, 1, 'http'), _queueLine: line1 };
  const p2 = { ...parseProxyLine(line2, 2, 'http'), _queueLine: line2 };

  assert.equal(p1.server, p2.server, 'Both proxies share gateway host');
  assert.notEqual(getProxyUniqueKey(p1), getProxyUniqueKey(p2), 'Unique keys must differ');
  assert.notEqual(proxyIdentity(p1), proxyIdentity(p2), 'Identities must differ');
});

test('getNextCollisionFreeProxy iterates through all residential proxies sharing same gateway host', () => {
  const line1 = 'http://Subpass%3D-session-1:pass@us.rotgbapi.trustsource.live:10000';
  const line2 = 'http://Subpass%3D-session-2:pass@us.rotgbapi.trustsource.live:10000';
  const line3 = 'http://Subpass%3D-session-3:pass@us.rotgbapi.trustsource.live:10000';

  const proxies = [
    { ...parseProxyLine(line1, 1, 'http'), _queueLine: line1 },
    { ...parseProxyLine(line2, 2, 'http'), _queueLine: line2 },
    { ...parseProxyLine(line3, 3, 'http'), _queueLine: line3 },
  ];

  multiOfferState.offerUsed.clear();
  multiOfferState.offerCursors.clear();

  const picked1 = getNextCollisionFreeProxy(1, proxies, 1);
  assert.ok(picked1, 'Must pick proxy 1');
  assert.equal(getProxyUniqueKey(picked1), line1);

  const picked2 = getNextCollisionFreeProxy(1, proxies, 1);
  assert.ok(picked2, 'Must pick proxy 2, not fail as duplicate server');
  assert.equal(getProxyUniqueKey(picked2), line2);

  const picked3 = getNextCollisionFreeProxy(1, proxies, 1);
  assert.ok(picked3, 'Must pick proxy 3');
  assert.equal(getProxyUniqueKey(picked3), line3);
});

test('deduplicating available proxies preserves multiple rotating sessions on same gateway', () => {
  const queue = [
    'http://Subpass%3D-session-1:pass@us.rotgbapi.trustsource.live:10000',
    'http://Subpass%3D-session-2:pass@us.rotgbapi.trustsource.live:10000',
    'http://Subpass%3D-session-3:pass@us.rotgbapi.trustsource.live:10000',
    'http://Subpass%3D-session-1:pass@us.rotgbapi.trustsource.live:10000', // duplicate
  ];

  const seenProxyKeys = new Set();
  const availableProxies = queue.map((line) => {
    try { return { ...parseProxyLine(line.trim(), 1, 'http'), _queueLine: line }; }
    catch { return null; }
  }).filter((proxy) => {
    if (!proxy) return false;
    const key = getProxyUniqueKey(proxy);
    if (seenProxyKeys.has(key)) return false;
    seenProxyKeys.add(key);
    return true;
  });

  assert.equal(availableProxies.length, 3, 'Must keep 3 distinct rotating sessions, not reduce to 1');
});
