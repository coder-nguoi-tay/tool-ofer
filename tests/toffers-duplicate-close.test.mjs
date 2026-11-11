import test from 'node:test';
import assert from 'node:assert/strict';
import { isToffersDuplicateOfferUrl, getDeadOrBlockedReason } from "../app.mjs";

test('isToffersDuplicateOfferUrl detects Toffers duplicate offer error URLs correctly', () => {
  // User's exact URL
  assert.equal(
    isToffersDuplicateOfferUrl('https://toffers.top/error.php?error=ip_74.124.177.158_clicked_offer_2672'),
    true
  );

  // Other IPs and offer IDs
  assert.equal(
    isToffersDuplicateOfferUrl('https://toffers.top/error.php?error=ip_103.45.12.9_clicked_offer_1450'),
    true
  );

  assert.equal(
    isToffersDuplicateOfferUrl('http://toffers.top/error.php?error=ip_8.8.8.8_clicked_offer_100'),
    true
  );

  assert.equal(
    isToffersDuplicateOfferUrl('https://toffers.top/error.php?other_param=1&error=ip_1.1.1.1_clicked_offer_500'),
    true
  );

  assert.equal(
    isToffersDuplicateOfferUrl('https://tracker.net/error.php?error=ip_2.2.2.2_clicked_offer_999'),
    true
  );

  // General toffers error page
  assert.equal(
    isToffersDuplicateOfferUrl('https://toffers.top/error.php'),
    true
  );

  // Legitimate URLs should NOT match
  assert.equal(isToffersDuplicateOfferUrl('https://toffers.top/click?id=2672'), false);
  assert.equal(isToffersDuplicateOfferUrl('https://example.com/survey'), false);
  assert.equal(isToffersDuplicateOfferUrl('about:blank'), false);
  assert.equal(isToffersDuplicateOfferUrl(''), false);
  assert.equal(isToffersDuplicateOfferUrl(null), false);
});

test('getDeadOrBlockedReason detects Toffers duplicate offer page from page URL', async () => {
  const mockPage = {
    isClosed: () => false,
    url: () => 'https://toffers.top/error.php?error=ip_74.124.177.158_clicked_offer_2672',
  };

  const reason = await getDeadOrBlockedReason(mockPage);
  assert.equal(reason, 'IP đã click offer trước đó (Toffers Duplicate IP)');
});

test('getDeadOrBlockedReason detects Toffers duplicate offer page from frame URL', async () => {
  const mockFrame = {
    url: () => 'https://toffers.top/error.php?error=ip_12.34.56.78_clicked_offer_1111',
  };

  const mockPage = {
    isClosed: () => false,
    url: () => 'https://example.com/landing',
    frames: () => [mockFrame],
  };

  const reason = await getDeadOrBlockedReason(mockPage);
  assert.equal(reason, 'IP đã click offer trước đó (Toffers Duplicate IP)');
});
