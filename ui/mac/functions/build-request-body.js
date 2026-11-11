/**
 * Build request body.
 * @param {object} overrides overrides.
 * @return {*} Kết quả xử lý build request body.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function buildRequestBody(overrides = {}) {
      const autoSubmitEl = form.elements.namedItem('autoSubmitForm');
      const enableLeadCheckEl = form.elements.namedItem('enableLeadCheck');
      const cloakEl = document.querySelector('#use-cloak-browser');
      return {
        ...Object.fromEntries(new FormData(form)),
        autoSubmitForm: autoSubmitEl ? autoSubmitEl.checked : true,
        enableLeadCheck: enableLeadCheckEl ? enableLeadCheckEl.checked : false,
        autoCloseNoLead: Boolean((form.elements.namedItem('autoCloseNoLead') || {}).checked),
        useCloakBrowser: cloakEl ? cloakEl.checked : false,
        ...overrides,
      };
    }
