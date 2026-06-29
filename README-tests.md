# Tests for the Chinese vocabulary gallery

End-to-end tests powered by **Playwright**. They cover everything we
shipped today: empty state, multi-dictionary selection, search, the
training flow (correct/wrong/accuracy/reset), and stability checks.

## Run

```bash
npm install
npx playwright install chromium
npm test                # headless
npm run test:headed     # see the browser
npm run test:ui         # Playwright inspector UI
```

`playwright.config.js` boots `python3 -m http.server` on
`127.0.0.1:8765` automatically, so tests run against a real static
server, not `file://`.

## Layout

- `tests/vocabulary.spec.js` — all assertions, grouped by feature.
- Tests run in two projects: `desktop` (1280×900) and `mobile` (Pixel 5).

## CI

Pushing to `main` (or opening a PR) triggers `.github/workflows/tests.yml`,
which runs the full Playwright suite on `ubuntu-latest` in both desktop
and mobile viewports. HTML report + screenshots are uploaded as
artifacts on failure.

Status badge (replace the owner segment if you fork):

```markdown
[![Tests](https://github.com/LaraCroft-AI/lara-pages/actions/workflows/tests.yml/badge.svg)](https://github.com/LaraCroft-AI/lara-pages/actions/workflows/tests.yml)
```
