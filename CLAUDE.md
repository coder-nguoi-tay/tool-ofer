# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AutoLeadPC Mac: a macOS app that opens many anti-detect browser windows (one proxy + one fingerprint each), verifies the exit IP, loads a target offer/lead page, and autofills forms / solves survey steps. Plain Node.js ESM (`"type": "module"`, Node 20+; CI runs 22 and 24), no build step for JS. User-facing text, comments and docs are mostly Vietnamese; new code uses JSDoc blocks with `@author ductv <ductv@getflycrm.com>` and `@since`.

## Commands

```sh
npm install
npm start                          # node app.mjs — serves the local UI (port comes from the .app's Info.plist; see app.mjs listen())
npm test                           # node run-tests.mjs: selfcheck.mjs first, then `node --test` over TEST_FILES
node --test script.test.mjs        # run a single test file
node --test --test-name-pattern="<name>" stealth.test.mjs   # single test
node --check app.mjs               # CI also syntax-checks app/ai-assist/autofill/cloakbrowser-engine/run-tests
./build-app.sh                     # compiles AutoLeadPCMacApp.swift (swiftc) and assembles the signed .app bundles
node mock-html-simulator.mjs       # regenerate mock-pages/offer-sample.html from saved HTML snapshots
```

Tests never open a real browser or hit the Internet (CI sets `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`).

**Adding a test file requires adding it to `TEST_FILES` in `run-tests.mjs`** — that list is the single source of truth, and the runner fails if a listed file is missing (`node --test` silently exits 0 on missing files). `build-app.sh` copies `./*.test.mjs` by glob but copies source modules by an **explicit file list**: a new runtime `.mjs` module must also be added to the `cp -p app.mjs autofill.mjs ...` line in `build-app.sh`, or it will be missing from the packaged `.app`. Some `mock-pages/*.test.mjs` files exist but are not in `TEST_FILES`.

## Architecture

- **`app.mjs`** (~8.6k lines) is the orchestrator and HTTP server. It serves `index.html` (Mac UI) / `index-pc.html` (PC-style UI) and a JSON API to them, manages proxy lists/history, slots ("windows"), auto-replace (tự bù) of closed sessions, SQLite preferences, and launches browsers via Playwright (`playwright`'s `chromium`). The Swift wrapper (`AutoLeadPCMacApp.swift`) is just a native shell around this local server; `build-app.sh` produces multiple `.app` variants with different instance ID / port / bundle ID.
- **Browser engines** (selected in Settings > Browser), each a separate module that app.mjs dispatches to:
  - Chrome (installed / Chrome-for-Testing builds, profile copied from a template; `chrome-versions.mjs`),
  - AdsPower SunBrowser (`adspower-profile.mjs`, local API + API key),
  - CloakBrowser (`cloakbrowser-engine.mjs`), and local profile engine (`local-profile-engine.mjs`, uses a `zero_profile` template under `~/.autoleadpc/Profiles`).
  Each engine attaches to Playwright (often via CDP), then goes through the same IP-verify → open-target → autofill flow.
- **`stealth.mjs`**: per-session fingerprint (seed → consistent GPU/CPU/RAM/screen/OS), CDP overrides (UA, Client Hints, languages/timezone from proxy country) and the in-page patch script. Details in `README.md` (limitations listed there).
- **Proxy plumbing**: `relay.mjs` runs local unauthenticated relays in front of authenticated HTTP/SOCKS5 proxies; `lead-check.mjs` and IP-verification code decide whether an exit IP/page is usable; proxy status history prevents reuse.
- **Page automation**: `autofill.mjs` (field matching Anh–Việt names, iframes, redirects) → `survey-solver.mjs` (survey/offerwall step answering) → `ai-assist.mjs` and `codex-form-agent.mjs` (LLM / Codex SDK + `@playwright/mcp` fallback for hard cases) → `captcha.mjs`. `script.mjs` runs user-authored step scripts. `observer.mjs`/`analyze-ops.mjs` record manual operations. `tgbot.mjs` is Telegram notifications; `mcp-server.mjs` exposes the app to Codex/Claude via MCP over stdio.
- **Offline testing**: `mock-pages/` and `mock-html-simulator.mjs` build local fixtures from saved offer HTML (see `mock-pages/README.md`); tests exercise the production selectors against them. `selfcheck.mjs` (~2.6k lines) is the big non-`node:test` assertion suite run first by `npm test`.
- **Research notes**: `PLAYWRIGHT_CORE_INTEGRATION_RESEARCH.md` contains only §17 (age/preference/vehicle question rules), implemented by `handleSurveySemanticQuestions` in `autofill.mjs` — keep doc and code in sync; `QA_TEST_CASES.md` lists manual QA.

## Things to know

- Runtime data lives outside the repo: `~/Library/Application Support/AutoLeadPC/` (preferences.sqlite, chrome-profiles, etc.; unencrypted), `AutoLeadPC-2/` for the second app. Chrome profiles are deleted when their window closes, and deletion is restricted to paths inside `chrome-profiles`.
- `Config/Settings/Settings.ini` is a git-ignored local file that may still hold an old GoLogin API token; don't copy it into logs, docs or commits. GoLogin support has been removed; `app.mjs` only ignores old saved `browserMode: 'Gologin'` settings.
- `app.mjs` hard-codes a debug HTML capture directory (`/Users/codernguoitay/offer-html-full`) near the top; be aware when running on other machines.
- Many top-level `test-*.mjs`, `debug-sweep.mjs`, `verify-fingerprint-live.mjs`, `record-offer-flow.mjs` etc. are ad-hoc scripts, not part of `npm test`.
