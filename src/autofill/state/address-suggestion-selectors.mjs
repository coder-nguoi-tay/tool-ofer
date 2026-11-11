/**
 * Danh sách đầy đủ các selector phần tử gợi ý địa chỉ (Google Places, Loqate, Mapbox, Algolia, ARIA listbox, jQuery UI, Custom).
 */
const ADDRESS_SUGGESTION_SELECTORS = [
// 1. Google Places / PCA Predict / Loqate
'.pac-container:not([style*="display: none"]) .pac-item', '.pac-container .pac-item', '.pca .pcaitem', '.pac-item', '.pac-item-query', '.pac-matched', '.loco-dropdown .loco-item', '.loco-item',
// 2. AlphaIntent / SmartyStreets / SweepstakesAlerts
'.address-suggestions .address-item', '[data-testid="address-suggestions"] .address-item', '[data-testid="address-suggestions"] [data-testid^="address-item"]', '[data-testid^="address-item"]', '.address-suggestions a', '.address-suggestions div[data-street_line]',
// 3. Mapbox / Algolia / Radar / SmartyStreets
'.mapboxgl-ctrl-geocoder--suggestion', '.ap-suggestion', '.radar-autocomplete-item', '.smarty-suggestion',
// 4. ARIA Combobox / Listbox
'[role="listbox"]:not([style*="display: none"]) [role="option"]', '[role="listbox"] [role="option"]', '[role="combobox"] ~ [role="listbox"] [role="option"]', '[role="combobox"] + div [role="option"]', 'ul[role="listbox"] li',
// 5. Thẻ <select> trả về kết quả địa chỉ (hoặc ô vừa input vừa select)
'select.address-select option:not([value=""])', 'select[name*="address" i] option:not([value=""])', 'select[id*="address" i] option:not([value=""])', 'select[name*="street" i] option:not([value=""])', 'select[id*="street" i] option:not([value=""])', 'select[id*="suggest" i] option:not([value=""])', 'select[name*="suggest" i] option:not([value=""])', 'select[name*="verified" i] option:not([value=""])', 'select[id*="verified" i] option:not([value=""])', '.address-fields select option:not([value=""])', '.address-group select option:not([value=""])',
// 6. Datalist
'datalist option',
// 7. jQuery UI / Typeahead / Select2 / Chosen
'.ui-autocomplete:not([style*="display: none"]) .ui-menu-item', '.ui-autocomplete .ui-menu-item', '.ui-menu-item-wrapper', '.select2-results__option--selectable', '.select2-results__option', '.select2-search-choice', '.tt-suggestion', '.typeahead-suggestion', '.chosen-results li.active-result',
// 8. Generic Custom Address Autocomplete
'.address-predictions li', '.address-predictions div[role="button"]', '.address-autocomplete-item', '.address-suggestion', '.address-results li', '.address-results div[role="button"]', '.address-item', '.prediction-item', '.autocomplete-suggestion', '[class*="autocomplete"] [class*="item"]', '[class*="autocomplete"] [class*="suggestion"]', '[class*="autocomplete"] [class*="option"]', '[class*="address"] [class*="suggestion"]', '[class*="address"] [class*="item"]', '[class*="address"] [class*="result"]', '[class*="address"] [class*="prediction"]', '[data-place-id]', '[data-prediction]', '[data-address-suggestion]', '.saved-address-item', '.address-list li', '.address-list a', '.saved-addresses li', '.saved-addresses a', '.saved-addresses button'];
export { ADDRESS_SUGGESTION_SELECTORS };
