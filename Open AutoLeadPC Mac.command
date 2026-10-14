#!/bin/zsh
cd "$(dirname "$0")" || exit 1

hold() { read -k1 "?Nhan phim bat ky de dong..."; }

if ! command -v node >/dev/null 2>&1; then
  echo "Chua co Node.js. Cai tai https://nodejs.org roi mo lai file nay."
  hold; exit 1
fi

# Lan dau chay: tai dependency va Chromium cho Playwright.
if [[ ! -d node_modules ]]; then
  npm install && npx playwright install chromium || { hold; exit 1; }
fi

npm start
exit_code=$?

# Giu cua so lai de doc duoc loi, Terminal mac dinh dong ngay khi shell thoat.
hold
exit $exit_code
