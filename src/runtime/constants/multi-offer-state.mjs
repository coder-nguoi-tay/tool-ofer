const multiOfferState = {
  enabled: false,
  offerCount: 1,
  offerUrls: [],
  offerUsed: new Map(),
  // offerNumber -> Set(pKey)
  offerCursors: new Map(),
  // offerNumber -> current index
  offerDirections: new Map() // offerNumber -> 1 (forward) | -1 (reverse)
};
export { multiOfferState };
