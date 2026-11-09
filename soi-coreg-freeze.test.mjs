import assert from 'node:assert/strict';
import test from 'node:test';
import { handleAlphaIntentSoiCards, findSubmitButton } from './autofill.mjs';
import { pageHasWork, detectSmartFallbackAction } from './ai-assist.mjs';

test('handleAlphaIntentSoiCards: detects and answers co-reg offer question with Yes/No buttons', async () => {
  let clickedBtnId = null;
  let consentChecked = false;
  let cardAttrs = {};

  const mockYesBtn = {
    id: 'ct-creative-submit-yes',
    className: 'ct-creative-submit ai-submit-button',
    innerText: 'Yes',
    tagName: 'A',
    getAttribute: (attr) => (attr === 'data-tf-element-role' ? 'submit' : null),
    setAttribute: (attr, val) => {},
    getBoundingClientRect: () => ({ width: 200, height: 50 }),
  };

  const mockNoBtn = {
    id: 'ct-creative-submit-no',
    className: 'ct-creative-submit ai-skip',
    innerText: 'No',
    tagName: 'A',
    getAttribute: (attr) => (attr === 'name' ? 'skip-link' : null),
    setAttribute: (attr, val) => {},
    getBoundingClientRect: () => ({ width: 200, height: 50 }),
  };

  const mockConsent = {
    checked: false,
    getAttribute: (attr) => (attr === 'data-tf-element-role' ? 'consent-opt-in' : null),
    dispatchEvent: () => {},
    get checked() { return consentChecked; },
    set checked(val) { consentChecked = val; },
  };

  const mockCard = {
    getAttribute: (attr) => cardAttrs[attr] || null,
    setAttribute: (attr, val) => { cardAttrs[attr] = val; },
    getBoundingClientRect: () => ({ width: 600, height: 400 }),
    querySelectorAll: (sel) => [mockYesBtn, mockNoBtn],
    querySelector: (sel) => (sel.includes('consent') ? mockConsent : null),
  };

  const mockFrame = {
    evaluate: async (fn, arg) => {
      const origDoc = globalThis.document;
      const origWin = globalThis.window;
      globalThis.document = {
        querySelectorAll: (sel) => [mockCard],
        querySelector: (sel) => mockCard,
      };
      globalThis.window = {
        getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
      };
      try {
        return await fn(arg);
      } finally {
        globalThis.document = origDoc;
        globalThis.window = origWin;
      }
    },
    locator: (sel) => ({
      first() { return this; },
      count: async () => 1,
      click: async () => { clickedBtnId = sel; return true; },
    }),
  };

  const logs = [];
  const done = await handleAlphaIntentSoiCards(null, mockFrame, {
    onLog: (l) => logs.push(l),
  });

  assert.ok(done >= 1, 'handleAlphaIntentSoiCards must process the card and return done >= 1');
  assert.equal(cardAttrs['data-ux-soi-done'], '1', 'Card must be marked data-ux-soi-done="1"');
  assert.equal(cardAttrs['data-ux-opened'], '1', 'Card must be marked data-ux-opened="1"');
  assert.ok(clickedBtnId !== null, 'A button locator must be clicked');
  assert.ok(logs.some((l) => l.type === 'soi_answered'), 'Log must record soi_answered event');
});

test('handleAlphaIntentSoiCards: handles single CTA Yes button on co-reg card', async () => {
  let clicked = false;
  let cardAttrs = {};

  const mockYesBtn = {
    id: 'ct-creative-submit-01',
    className: 'ct-creative-submit',
    innerText: 'Yes',
    tagName: 'BUTTON',
    getAttribute: (attr) => (attr === 'data-mock-secondary-offer-action' ? 'accept' : null),
    setAttribute: () => {},
    getBoundingClientRect: () => ({ width: 250, height: 50 }),
  };

  const mockCard = {
    getAttribute: (attr) => cardAttrs[attr] || null,
    setAttribute: (attr, val) => { cardAttrs[attr] = val; },
    getBoundingClientRect: () => ({ width: 500, height: 300 }),
    querySelectorAll: () => [mockYesBtn],
    querySelector: () => null,
  };

  const mockFrame = {
    evaluate: async (fn, arg) => {
      const origDoc = globalThis.document;
      const origWin = globalThis.window;
      globalThis.document = {
        querySelectorAll: () => [mockCard],
        querySelector: () => mockCard,
      };
      globalThis.window = {
        getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
      };
      try {
        return await fn(arg);
      } finally {
        globalThis.document = origDoc;
        globalThis.window = origWin;
      }
    },
    locator: () => ({
      first() { return this; },
      count: async () => 1,
      click: async () => { clicked = true; return true; },
    }),
  };

  const done = await handleAlphaIntentSoiCards(null, mockFrame, {});
  assert.ok(done >= 1, 'Single Yes button must be handled');
  assert.ok(clicked, 'Button must be clicked');
  assert.equal(cardAttrs['data-ux-soi-done'], '1');
});

test('pageHasWork: returns true when page has Yes/No action buttons without text inputs', async () => {
  const mockYesBtn = {
    tagName: 'BUTTON',
    disabled: false,
    innerText: 'Yes',
    type: 'button',
    className: 'btn-yes',
    getAttribute: () => null,
    offsetWidth: 120,
    offsetHeight: 40,
    getClientRects: () => [{ width: 120, height: 40 }],
  };

  const mockPage = {
    evaluate: async (fn) => {
      const origDoc = globalThis.document;
      const origWin = globalThis.window;
      globalThis.document = {
        body: {
          innerText: 'Co-reg survey question',
          children: [mockYesBtn],
        },
        querySelectorAll: (sel) => {
          if (sel.includes('button') || sel.includes('btn-yes')) return [mockYesBtn];
          return [];
        },
        querySelector: () => null,
      };
      globalThis.window = {
        location: { href: 'https://example.com/survey' },
        getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
      };
      try {
        return await fn();
      } finally {
        globalThis.document = origDoc;
        globalThis.window = origWin;
      }
    },
  };

  const hasWork = await pageHasWork(mockPage);
  assert.equal(hasWork, true, 'pageHasWork must return true for Yes/No survey screens to prevent freeze');
});

test('detectSmartFallbackAction: selects survey choice without requiring explicit pickRandom in config', async () => {
  const mockChoiceBtn = {
    tagName: 'BUTTON',
    disabled: false,
    innerText: 'Yes',
    type: 'button',
    className: 'btn-yes question-answer-button',
    id: 'answer-yes',
    getAttribute: () => null,
    setAttribute: () => {},
    removeAttribute: () => {},
    closest: () => null,
    matches: () => true,
    offsetWidth: 150,
    offsetHeight: 45,
    getClientRects: () => [{ width: 150, height: 45 }],
  };

  const mockPage = {
    isClosed: () => false,
    evaluate: async (fn, opts) => {
      const origDoc = globalThis.document;
      const origWin = globalThis.window;
      globalThis.document = {
        body: {
          innerText: 'Survey question',
          children: [mockChoiceBtn],
        },
        querySelectorAll: (sel) => {
          if (sel.includes('question-answer-button') || sel.includes('btn-yes') || sel.includes('button')) {
            return [mockChoiceBtn];
          }
          return [];
        },
        querySelector: () => null,
      };
      globalThis.window = {
        getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
      };
      try {
        return await fn(opts);
      } finally {
        globalThis.document = origDoc;
        globalThis.window = origWin;
      }
    },
  };

  // Config without pickRandom explicitly set
  const fallback = await detectSmartFallbackAction(mockPage, { solveSurveyCards: true });
  assert.ok(fallback !== null, 'Smart fallback must return an action for survey buttons');
  assert.equal(fallback.action, 'click');
});

test('findSubmitButton: recognizes Yes/No action buttons when no other fields exist', async () => {
  const mockYesBtn = {
    isVisible: async () => true,
    isEnabled: async () => true,
    innerText: async () => 'Yes',
    evaluate: async (fn) => fn({
      tagName: 'BUTTON',
      innerText: 'Yes',
      id: 'ct-creative-submit-yes',
      className: 'ct-creative-submit',
      closest: () => null,
      getAttribute: () => null,
      getBoundingClientRect: () => ({ top: 100, width: 200, height: 50 }),
    }),
  };

  const mockFrame = {
    locator: (sel) => ({
      all: async () => (sel.includes('button:has-text("Yes")') ? [mockYesBtn] : []),
    }),
  };

  const submitBtn = await findSubmitButton(mockFrame);
  assert.equal(submitBtn, mockYesBtn, 'findSubmitButton must recognize Yes button');
});
