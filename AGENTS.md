# opencode-monitor

Local read-only web monitor: renders opencode's execution as a live flow diagram and diagnoses "why is it stuck now". Never call opencode APIs that mutate state; only read the event stream, polling endpoints, and Strata metrics.

## Structure

- `src/server.js` — zero-dependency node:http server: discovers opencode service port every 3s (password from `~/.config/opencode/service.json`, never sent to the browser), SSE `/api/stream` (`snap` events), `/api/snap`, `/api/health`.
- `src/state.js` — pure state machine + diagnosis (`diagnoseZh`/`diagnoseEn` mirror pair; wrapper returns `headlineEn`/`reasonsEn`). Chinese logic is the source of truth; keep `diagnoseEn` in sync with `diagnoseZh`.
- `public/app.js` — vanilla JS renderer (SVG flow diagram, i18n, theme). No framework, no bundling.
- Root `index.html` — GitHub Pages redirect only: `location.replace("/public/index.html" + search)`, forwarding `?demo=1` / `?theme=…`. Pages source path can only be `/` or `/docs`, so the real UI stays in `public/`. Local server.js serves `public/` directly and ignores this file.
- Demo mode: `?demo=1` skips EventSource and plays a scripted snapshot loop (`startDemo()` in app.js) — works on GitHub Pages with no backend: https://aifeifei798.github.io/opencode-monitor/?demo=1

## Commands

- Manage everything via `./server.sh install|build|start|stop|restart|status|test|logs [-f]` (pid `/tmp/opencode/monitor.pid`, log `/tmp/opencode/monitor.log`; ports via `MONITOR_PORT` 7788, `MONITOR_HOST` 127.0.0.1, `STRATA_URL` http://127.0.0.1:8080).
- Changed `src/` → `./server.sh restart`. Changed `public/` → just reload the browser, no restart.
- New Tailwind utility classes in `public/` → must run `npm run build` (Tailwind v4 is precompiled into `public/tailwind.css`; stale classes silently have no effect). `public/style.css` is plain CSS served directly — never needs a build.
- `npm test` runs `tests/state-test.mjs` + `tests/ui-test.mjs`. ui-test fetches live `/api/snap` from 127.0.0.1:7788, so the server must be running; `./server.sh test` auto-starts it first.

## Conventions (easy to break)

- **i18n**: Chinese strings are the single source of truth. `TE` maps whole Chinese sentences → English; `TD` reverse. `tr()` only matches whole sentences exactly — strings with dynamic numbers must be translated per fragment. The translation function must stay named `tr` (local variable `t` is taken).
- **Theme**: every color goes through CSS variables. Dark defaults in `:root`; light overrides for both custom vars and Tailwind `--color-*` tokens in `style.css` under `html[data-theme="light"]` (loads after `tailwind.css`, equal specificity, wins by order). Adding a hardcoded hex in `app.js` or `style.css` breaks the light theme — SVG arrow markers use `.mk-*` classes, not `fill` attributes.
- **Anti-jitter**: in-progress nodes must keep stable height — `padLines()` reserves fixed line counts for running steps/chips/compaction. Layout-shifting panels (diagnosis card, metric chips) live at the page bottom so wrapping never pushes content above the pipeline.
- **jsdom test quirks** (`tests/ui-test.mjs`): JSDOM uses `runScripts: "outside-only"` (index.html's inline theme script never runs — `app.js` init sets `data-theme`); `app.js` has an `inited` guard against duplicate DOMContentLoaded; `offsetWidth`/`clientHeight` must be mocked via `Object.defineProperty`; clipboard is stubbed; MutationObserver assertions need `await setTimeout(0)`.

## Key domain fact

Strata has exactly **1 inference slot** (`/slots`); `pool_workers: 7` is a memory pool, not concurrency. Parallel tool calls / subagents queue serially on the GPU — most "looks stuck" cases are `queued N`, rendered as yellow flowing edges.
