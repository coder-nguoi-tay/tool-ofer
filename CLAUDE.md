# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AutoLeadPC Mac: a macOS app that opens many anti-detect browser windows (one proxy + one fingerprint each), verifies the exit IP, loads a target offer/lead page, and autofills forms / solves survey steps. Plain Node.js ESM (`"type": "module"`, Node 20+; CI runs 22 and 24), no build step for JS. User-facing text, comments and docs are mostly Vietnamese; new code uses JSDoc blocks with `@author ductv <ductv@getflycrm.com>` and `@since`.

## Commands

```sh
npm install
npm start                          # node app.mjs — serves the local UI (port comes from the .app's Info.plist; see app.mjs listen())
npm test                           # node tests/run-tests.mjs: tests/selfcheck.mjs first, then `node --test` over TEST_FILES
node --test tests/script.test.mjs        # run a single test file
node --test --test-name-pattern="<name>" tests/stealth.test.mjs   # single test
node --check app.mjs               # CI also syntax-checks app/ai-assist/autofill/cloakbrowser-engine/tests/run-tests
./build-app.sh                     # compiles AutoLeadPCMacApp.swift (swiftc) and assembles the signed .app bundles
node mock-html-simulator.mjs       # regenerate mock-pages/offer-sample.html from saved HTML snapshots
```

Automated tests use mocks or offline browser fixtures. The optional captured-screen test skips if its local samples or Chromium are missing. Scripts under `tests/manual/` are run separately and may contact real websites.

**Add automatic test files to `TEST_FILES` in `tests/run-tests.mjs`.** The runner checks that every listed test exists, then runs `tests/selfcheck.mjs` and the suite from the project root. All automatic test files live in `tests/` or `tests/mock-pages/`; the offline helper is `tests/integration/test-offline-screens.mjs`. `build-app.sh` copies `tests/`, `mock-pages/`, `src/`, and `ui/` recursively. Root runtime facades still use the explicit source file list in the build script.

## Architecture

- **`app.mjs`** is the entry point and public compatibility exports. HTTP handlers live in `src/http/routes/`, browser operations in `src/browser/`, form steps in `src/autofill/`, and state in dedicated `state/` files. Root runtime modules re-export the implementations in `src/`. The Swift wrapper (`AutoLeadPCMacApp.swift`) hosts the local UI; `build-app.sh` builds the AdsPower app variant for instance 2 / port 3211.
- **Browser engines** (selected in Settings > Browser), each a separate module that app.mjs dispatches to:
  - Chrome (installed / Chrome-for-Testing builds, profile copied from a template; `chrome-versions.mjs`),
  - AdsPower SunBrowser (`adspower-profile.mjs`, local API + API key),
  - CloakBrowser (`cloakbrowser-engine.mjs`), and local profile engine (`local-profile-engine.mjs`, uses a `zero_profile` template under `~/.autoleadpc/Profiles`).
  Each engine attaches to Playwright (often via CDP), then goes through the same IP-verify → open-target → autofill flow.
- **`stealth.mjs`**: per-session fingerprint (seed → consistent GPU/CPU/RAM/screen/OS), CDP overrides (UA, Client Hints, languages/timezone from proxy country) and the in-page patch script. Details in `README.md` (limitations listed there).
- **Proxy plumbing**: `relay.mjs` runs local unauthenticated relays in front of authenticated HTTP/SOCKS5 proxies; `lead-check.mjs` and IP-verification code decide whether an exit IP/page is usable; proxy status history prevents reuse.
- **Page automation**: `autofill.mjs` (field matching Anh–Việt names, iframes, redirects) → `survey-solver.mjs` (survey/offerwall step answering) → `ai-assist.mjs` and `codex-form-agent.mjs` (LLM / Codex SDK + `@playwright/mcp` fallback for hard cases) → `captcha.mjs`. `script.mjs` runs user-authored step scripts. `observer.mjs`/`analyze-ops.mjs` record manual operations. `tgbot.mjs` is Telegram notifications; `mcp-server.mjs` exposes the app to Codex/Claude via MCP over stdio.
- **Offline testing**: `mock-pages/` and `mock-html-simulator.mjs` build local fixtures from saved offer HTML (see `mock-pages/README.md`); tests exercise the production selectors against them. `tests/selfcheck.mjs` is the big non-`node:test` assertion suite run first by `npm test`.
- **Research notes**: `PLAYWRIGHT_CORE_INTEGRATION_RESEARCH.md` contains only §17 (age/preference/vehicle question rules), implemented by `handleSurveySemanticQuestions` in `autofill.mjs` — keep doc and code in sync; `QA_TEST_CASES.md` lists manual QA.

## Things to know

- Runtime data lives outside the repo: `~/Library/Application Support/AutoLeadPC/` (preferences.sqlite, chrome-profiles, etc.; unencrypted), `AutoLeadPC-2/` for the second app. Chrome profiles are deleted when their window closes, and deletion is restricted to paths inside `chrome-profiles`.
- `Config/Settings/Settings.ini` is a git-ignored local file that may still hold an old GoLogin API token; don't copy it into logs, docs or commits. GoLogin support has been removed; `app.mjs` only ignores old saved `browserMode: 'Gologin'` settings.
- `app.mjs` hard-codes a debug HTML capture directory (`/Users/codernguoitay/offer-html-full`) near the top; be aware when running on other machines.
- Many top-level `test-*.mjs`, `debug-sweep.mjs`, `verify-fingerprint-live.mjs`, `record-offer-flow.mjs` etc. are ad-hoc scripts, not part of `npm test`.
