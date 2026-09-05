# CLAUDE.md — Cana & Etanol Tracker

Guidance for AI assistants working in this repository.

## What this is

A React + Vite PWA that tracks prices across the Brazilian sugar-and-ethanol
sector (*setor sucroenergético*): sugarcane paid by **ATR** (CONSECANA), CEPEA
ethanol and sugar indicators, futures on B3 / New York / Chicago, official FX,
rainfall in the cane regions, and the sugar-vs-ethanol parity per kg of ATR.

It mirrors the architecture of the sibling ETF Tracker / Soja Tracker / Café
Tracker projects. Deployed on Vercel; pushes to `main` auto-deploy.

**The whole app is in Portuguese (pt-BR)** — UI copy, code comments, identifiers,
commit messages. Keep writing in Portuguese here. (This file is in English only
because it's assistant-facing.)

**Design voice:** "painel de usina" — dark burnt-earth browns with an amber
(molasses/ethanol) accent, every number in tabular monospace.

## Stack and constraints

| | |
|---|---|
| Language | **Plain JavaScript (ESM)** + JSX. **No TypeScript** — do not add it. |
| UI | React 18, function components + hooks only. |
| Build | Vite 5 (`"type": "module"`) |
| Dependencies | **react + react-dom only.** No UI kit, no chart library, no HTML parser, no state manager. Charts are hand-rolled SVG (`Sparkline.jsx`, `AreaChart.jsx`, `DualChart.jsx`); scraping is done with plain regex. Keep it that way unless asked. |
| Styling | One global stylesheet, `src/styles.css`. No CSS modules, no Tailwind. |
| Tests / lint | **No test runner, no ESLint, no Prettier** — don't invent an `npm test`. What exists is `npm run verificar` (`scripts/verificar.mjs`, dependency-free) plus `npm run build`; CI runs both on every PR. |
| Node | 18+ |

`.npmrc` sets `legacy-peer-deps=true` so Vercel's strict install doesn't fail on
peer-dependency drift. Don't remove it.

## Commands

```bash
npm install
npm run dev        # Vite + the dev /api middleware; host exposed on the LAN
npm run build      # production build
npm run verificar  # loads server/ + asserts the invariants this file declares
npm run preview

node .github/scripts/coletar-cepea.mjs   # run the CEPEA collector by hand
```

**Run both `build` and `verificar` — neither covers the other.** `vite build`
only bundles `src/`, so it never even parses `server/`: a broken import, a
catalogue entry missing a required field, a cache slug orphaned by a rename, or
a constant that drifted out of sync between `server/util.js` and
`Conversor.jsx` all pass the build and fail at request time in production
instead. `scripts/verificar.mjs` is what covers that half, and
`.github/workflows/ci.yml` runs both on every PR.

`vite.config.js` sets `watch: { ignored: ["**/data/**"] }` — the snapshot store
writes `data/snapshots.json` on every quote read, and without this the watcher
reloads the page mid-use and kicks the user back to the "Painel" tab. Don't
remove it.

## Architecture

```
index.html            entry, fonts, PWA tags (lang="pt-BR")
src/
  main.jsx            mounts React + service worker (PROD only, with auto-reload on update)
  App.jsx             frame: topbar (brand + USD/BRL), 5 tabs, full-screen Detalhe
  api.js              the only data import for the UI — thin fetch wrappers over /api
  format.js           pt-BR formatting (num, preco, reais, pct, sinal, dataBR, …)
  components/         Painel, Cotacoes, Mercado, Conversor, Alertas, Detalhe + widgets
  styles.css          design tokens at the top, then components
server/
  catalogo.js         THE CATALOGUE: every fixed indicator and how to read/display it
  datalayer.js        facade — combines all sources, normalises units, builds payloads
  util.js             unit conversions, CONSECANA coefficients, pt-BR parsing
  store.js            "history that grows": daily snapshots per slug
  cepea-cache.json    versioned CEPEA cache + accumulated history (written by CI)
  providers/
    noticiasagricolas.js  PRIMARY source (regex-scraped HTML)
    cepea.js              CEPEA widget + fallback to the versioned cache
    yahoo.js              free history for NY sugar (SB=F) and Brent (BZ=F)
    bcb.js                official PTAX FX (USD/BRL, EUR/BRL) with history
    openmeteo.js          rainfall vs. historical average in the cane regions
api/                  Vercel serverless functions: cotacoes, detalhe, cambio, mercado, clima
.github/
  workflows/coletar-cepea.yml   scheduled CEPEA collection (12:00 & 21:00 UTC)
  scripts/coletar-cepea.mjs     the collector itself
.claude/launch.json   dev launch config (npm run dev, port 5173)
public/               PWA manifest + service worker
```

The five tabs in `App.jsx` are `Painel · Cotações · Mercado · Conversor ·
Alertas`, one component each, and `Detalhe` replaces the whole frame when a slug
is selected. `App.jsx` loads `getCotacoes()` **once** and passes `dados` down to
Painel / Cotações / Conversor / Alertas; `Mercado` and `Detalhe` fetch their own
endpoints. So a new field on the `getCotacoes` payload reaches four screens for
free, and the footer `aviso` comes from that same payload.

### The one data path

The UI never fetches a source directly. `src/api.js` exposes five calls:

```
getCotacoes()          -> { fetchedAt, cambio, cepeaCacheEm, atrPadrao, coeficientes,
                            categorias: [{ nome, itens: [...] }], aviso }
getDetalhe(slug, tf)   -> { slug, item, tf, pontos, estatisticas, notaHistorico, aviso }
getCambio()            -> PTAX USD/BRL + EUR/BRL
getMercado()           -> índices (1D/30D/12M), mix açúcar × etanol, séries dos gráficos
getClima()             -> chuva 30d vs. média histórica por região canavieira
```

Each maps to same-origin `/api/*`, served **twice from the same module**:

- **dev** — the `devApi()` middleware in `vite.config.js`
- **prod** — the Vercel functions in `api/*.js`

Both import `server/datalayer.js`. Change the payload shape there and both
environments follow. Adding a *new* endpoint means wiring **three** places: a
`datalayer.js` export, the `devApi()` middleware, and a new `api/<name>.js`.
Forgetting the last one means it works in dev and 404s in production.

### The catalogue is the source of truth

`server/catalogo.js` defines every fixed indicator. Each entry declares:

| Field | Meaning |
|---|---|
| `slug` | stable id used in `/api` routes, snapshots and the cache — **never rename casually**, it breaks accumulated history |
| `nome`, `descricao` | pt-BR label and explanatory note shown in the UI |
| `categoria` | groups it on the Cotações screen (`CATEGORIAS`) |
| `unidade` | native unit: `BRL_LITRO`, `BRL_M3`, `USD_GALAO`, `BRL_SACA50`, `BRL_5KG`, `BRL_KG`, `USD_CENT_LB` |
| `moeda` | the unit's display label (`"R$/m³"`, `"¢US$/lb"`, …) |
| `fonte` | attribution string shown in the UI (exchange / CEPEA / via Notícias Agrícolas) |
| `produto` | `"acucar"` / `"hidratado"` / `"anidro"` — picks the CONSECANA coefficient for the R$/kg-ATR conversion; `null` when it doesn't apply |
| `periodicidade` | `"diaria"` / `"semanal"` / `"mensal"` — decides when a price counts as stale |
| `principal` | feeds the panel's "cotações desatualizadas" warning |
| `cepeaId`, `viaWidget` | CEPEA widget id; `viaWidget` means the widget is the *only* source |
| `yahoo` | Yahoo symbol when free history exists |
| `bloomberg` | optional reference ticker — not fetched, but **displayed** as a pill in Detalhe |

`catalogo.js` also exports the derived helpers everything else reads:
`porSlug` (lookup map), `SO_WIDGET` (the `viaWidget` subset), `LIMITE_DIAS_UTEIS`
(the staleness thresholds) and `ROTULO_PERIODICIDADE` (UI labels). They live
here, not in `datalayer.js`.

There are currently **22 fixed indicators** across the six `CATEGORIAS`.

To add one: add its catalogue entry, then make sure some provider can actually
read it (a Notícias Agrícolas table match, a `cepeaId`, or a Yahoo symbol).

**Not everything on screen comes from the catalogue.** The ATR price per state
and Paraná's *cana básica* are dynamic rows scraped per-state in
`providers/noticiasagricolas.js`, and the parity and R$/tonne rows are synthesised
in `datalayer.js`. That's why `BRL_KG_ATR` and `BRL_TON` are valid `unidade`
values handled throughout `util.js`, `format.js` and the components, yet never
appear on a catalogue entry — only on rows built at request time.

### Units and the ATR ruler

The sector mixes units constantly, so `server/util.js` owns all conversions and
constants. Everything is normalised to comparable rulers:

- ethanol → **R$/litro** (and R$/m³)
- sugar → **R$/kg** (and R$/saca de 50 kg)
- everything possible → **R$ per kg of ATR**, the sector's common ruler

CONSECANA-SP coefficients (kg of ATR per unit of product):
`ATR_POR_KG_ACUCAR = 1.0495`, `ATR_POR_L_HIDRATADO = 1.6913`,
`ATR_POR_L_ANIDRO = 1.7651`; `ATR_PADRAO = 140` kg/t is the default cane ATR
used to estimate R$/tonne.

**The three coefficients are duplicated in `src/components/Conversor.jsx`** so
the converter can compute as the user types without a round trip. If you change
one in `server/util.js`, change it there too — they must stay in sync.
`ATR_PADRAO` is *not* duplicated: it reaches the converter as `dados.atrPadrao`
on the `getCotacoes` payload, and the user can override it in the form.

#### Constants duplicated on purpose

The `server/` and `src/` halves never import from each other — the client only
ever sees JSON from `/api`. So a few values are hand-copied across that line and
**must be changed in both places**:

| Value | Server | Client |
|---|---|---|
| CONSECANA coefficients | `server/util.js` | `src/components/Conversor.jsx` |
| periodicity labels | `ROTULO_PERIODICIDADE` in `server/catalogo.js` | `PERIODICIDADE` in `src/format.js` |

`parseNumBR` handles pt-BR numbers (`"1.712,39"` → `1712.39`) and returns `null`
for "s/ cotação", `***`, `-`, etc. `isoDeBR` handles the three date shapes the
sources publish: daily `dd/mm/aaaa`, a CEPEA week range `20 - 24/07/2026` (uses
the end), and monthly `mm/aaaa` (→ first of month).

### History: three different mechanisms

Only NY sugar, Brent and FX have free historical series. Everything else has to
be accumulated:

1. **Yahoo** (`providers/yahoo.js`) — real series for `SB=F` and `BZ=F`, by
   timeframe. Only `ny-acucar` is timeframe-capable in the Detalhe screen
   (`COM_TF` in `Detalhe.jsx`).
2. **Local snapshots** (`server/store.js`) — one point per slug per day, written
   on every `getCotacoes()`. Persists to `data/snapshots.json` locally, but on
   Vercel (`process.env.VERCEL`) it lands in `/tmp/cana-snapshots.json` and
   **dies on every cold start**. The local path is anchored to the module's own
   location, not `process.cwd()`, so it doesn't matter who starts the server;
   writes are best-effort and swallow errors on a read-only filesystem.
3. **Versioned CEPEA cache** (`server/cepea-cache.json`) — written by the
   scheduled GitHub Actions job. This is the **only** history for the CEPEA
   indicators that survives, because it lives in the repo.

`serieCompleta(slug)` in `datalayer.js` merges (2) and (3). When a series is too
short the API returns `notaHistorico` explaining that the chart grows over time —
keep surfacing that honestly rather than faking a series.

### Why the CEPEA collector exists (important)

`cepea.org.br` sits behind a Cloudflare anti-bot challenge that returns **403 to
Vercel functions in every region**. GitHub Actions runners are normally served —
which is the whole reason collection runs there and not in a Vercel function.

**That access is not guaranteed: it lapsed once already.** From 02/09/2026 until
midday 04/09/2026 Cloudflare returned **403 to GitHub Actions runners too**. A
probe tried six routes from a runner — full browser header set (`Sec-Fetch-*`,
`Sec-Ch-Ua`, `Referer`), the USP host `cepea.esalq.usp.br`, with and without
`www`, the indicator page, and a home-then-widget flow carrying cookies. **All
six returned 403, including the site's own home page.** That is an IP-range
block, not a request-shape problem — so if it recurs, don't spend a round on
header tweaks: the probe already settled that question. The only routes left
would be solving the Cloudflare JS challenge, or collecting from an IP the site
serves (your own machine, or a small VPS pushing `cepea-cache.json` to the repo).

**Recovered 04/09/2026.** The runner has been served since that evening: real
values landed in `cepea-cache.json` with their dates moving to `04/09/2026`, and
every scheduled run since has collected. So treat a 403 as a condition that
comes and goes, not a standing verdict — and check before assuming either way.
`atualizadoEm` is the reliable signal, because the failure policy below moves it
*only* on a genuine collection: if it advanced, the runner got through.

**What a block does NOT break:** Notícias Agrícolas is the *primary* source here
and kept responding throughout; the CEPEA widget is reinforcement plus the
versioned history. The apps stayed up, serving the cache flagged `viaCache`.
 So:

- `.github/workflows/coletar-cepea.yml` runs twice a day (12:00 and 21:00 UTC =
  9h/18h Brasília) and on `workflow_dispatch`.
- `.github/scripts/coletar-cepea.mjs` reads every catalogue entry with a
  `cepeaId`, keeps the previous value on failure, appends to the history, and
  writes `server/cepea-cache.json`. Two failure classes get two waiting
  ladders, because they resolve on different timescales: the anti-bot challenge
  (`403`, expected on the first request of a run) waits 1.5s · 3s · 4.5s · 6s,
  while an origin that is simply down (`5xx`, network error) waits
  15s · 30s · 60s · 90s drawn from a 4-minute budget shared by the whole run —
  without that budget a general outage would keep the job alive for the better
  part of an hour. If nothing comes back even then, the workflow retries the
  lot 15 minutes later. That retry is gated on the **number collected**
  (`coletados == 0`), not on the exit code, because the failure policy below
  exits 0 on a short block — gating on the exit code would leave it inert in
  exactly the passing outage it exists to cover.

  **Failure policy (changed 03/09/2026).** A run that collects nothing no longer
  fails outright — that turned a known, ongoing block into two emails a day. Now:

  | Outcome | `atualizadoEm` | File | Exit |
  |---|---|---|---|
  | anything collected | set to now | written | 0 |
  | nothing, cache ≤ `LIMITE_DIAS_BLOQUEIO` (3d) | untouched | **not written** | 0, loud warning |
  | nothing, cache older than that | untouched | **not written** | 1 — a real defect, email it |

  Two properties are load-bearing. `atualizadoEm` now moves **only on a real
  collection** — it used to be rewritten on every run, stamping today's date on
  three-day-old data, and the app shows that stamp to the user. And a blocked run
  writes nothing at all, so there is no diff, no commit and no pointless deploy.
- The workflow commits the file with `github-actions[bot]`, and that commit
  triggers a fresh Vercel deploy — that's how new data reaches production.
- In dev the app reads CEPEA live; in production it falls back to the cache and
  flags the value with `viaCache: true` so the UI can say so.

Consequences to remember: expect frequent bot commits titled "Cache CEPEA:
coleta automatica dos indicadores"; and GitHub suspends scheduled workflows
after 60 days of repo inactivity (re-enable in the Actions tab).

`providers/cepea.js` loads the JSON via `createRequire` rather than `fs` **on
purpose** — a static require makes Vercel's file tracer bundle the JSON into the
function. Don't "modernise" it to `readFile`.

### Staleness is periodicity-aware

`anotarData()` in `datalayer.js` tags every item with `data` (ISO),
`periodicidade`, `diasSemAtualizar` and `desatualizado`, using business days and
`LIMITE_DIAS_UTEIS = { diaria: 2, semanal: 7, mensal: 32 }`. A weekly CEPEA
ethanol indicator is not stale at 3 days; the monthly ATR price is not stale at
3 weeks. Regional Nordeste indicators (PE, AL, PB) are only published during the
local harvest, which is why they aren't marked `principal` and don't trigger the
panel warning.

## Conventions

- **Portuguese everywhere** — identifiers (`carregar`, `pontos`, `desatualizado`,
  `arred`), UI copy, and comments. Don't mix in English names.
- **Comments explain *why*.** Every module opens with a header comment stating
  its job and the reasoning behind non-obvious choices (why the collector
  exists, why `/tmp` is ephemeral, why the watcher ignores `data/`). Match that
  density — it's the house style.
- **Numbers go through `src/format.js`** (`num`, `preco`, `reais`, `pct`,
  `sinal`, `dataBR`, `dataCurtaBR`, `horaBR`, `casasDaUnidade`) and render with
  the mono class. Prices in R$/litro and R$/kg de ATR need **4 decimals** —
  that's what `casasDaUnidade` decides. `Intl` locale is `pt-BR`; times use
  `America/Sao_Paulo`.
- **Design tokens only** — the custom properties at the top of `src/styles.css`.
  No hard-coded hexes or pixel gaps in components.
  - surfaces `--bg` `--surface` `--surface-2` `--line`
  - text `--text` `--muted`
  - semantics `--up` `--down` `--accent` `--accent-2`
  - type `--display` (Space Grotesk) `--ui` (Inter) `--mono` (IBM Plex Mono)
  - layout `--s1`…`--s7` (4→48px) `--radius` `--maxw`

  Amber `--accent` is for the active tab and focus. The `body` background is a
  radial gradient over `--bg`, not a flat fill — keep that when touching layout.
- **Loading / error / empty states** come from `components/States.jsx`
  (`Loading`, `Skeletons`, `ErroBox`, `Vazio`). Extend those rather than
  hand-rolling.
- **Server does the maths; components display.** Conversions, parity, staleness
  and statistics belong in `server/util.js` / `server/datalayer.js`. The one
  deliberate exception is the Conversor's live client-side arithmetic.
- **Missing data is `null`, rendered as `—`.** Providers return `null` rather
  than guessing; `Promise.allSettled` and `try/catch` keep one dead source from
  blanking the screen. Never substitute an invented number.
- Effects that set state use a local `vivo`/`active` flag to avoid updating an
  unmounted component.

## Scraping is best-effort — treat it as such

`providers/noticiasagricolas.js` parses server-rendered HTML with regex,
matching each `<table>` to the preceding `<h2>`/`<h3>`. Several headings are
substrings of each other (e.g. "Açúcar Cristal Cepea/Esalq" inside "Cristal
Empacotado Cepea/Esalq"), so matching is always via an **anchored regex on the
distinguishing fragment** — keep it that way. If the source's HTML changes, this
file is where the fix goes. The CEPEA widget and Yahoo act as reinforcement for
the headline numbers.

Provider caches are in-process with TTLs (10 min Notícias Agrícolas/Yahoo,
30 min CEPEA widget/BCB, 12 h climate). Be gentle with these free sources —
the collector even sleeps 800 ms between reads.

## Honest-caveats rule

The README lists real limitations: history for most indicators grows from daily
collection, parity and R$/tonne are **didactic approximations** (gross revenue
per kg of ATR — no industrial cost, taxes, freight, port elevation or hedge; NY
sugar converted at spot FX with no polarisation premium), regional indicators go
quiet off-harvest, and the scrape can break. Every screen carries the
`aviso`/footer disclaimer: public sources, possibly delayed, informational
only — **not investment advice**. If you add a feature with a similar caveat,
state it in the UI and the README instead of implying more precision than free
data supports.

## Deployment notes

- `api/*.js` are Vercel functions: `export default async function handler(req, res)`,
  params off `req.query`, 400 on a missing param, 502 on upstream failure. Keep
  them thin. Cache windows follow how fast the data actually moves:
  `cotacoes`, `detalhe`, `cambio` and `mercado` use
  `s-maxage=600, stale-while-revalidate=3600`; `clima` uses
  `s-maxage=21600, stale-while-revalidate=86400` (6 h / 24 h) because rainfall
  updates daily at best. Copy the neighbour that resembles your endpoint.
- `getDetalhe(slug, tf)` defaults to `tf = "3M"` in both the datalayer and the
  Detalhe screen. Only `ny-acucar` honours the timeframe switch (`COM_TF`).
- The service worker (`public/sw.js`) is **network-first for navigation** (always
  fetch the fresh `index.html`, fall back to cache only offline), **cache-first
  for hashed `/assets/*`** (immutable, the filename changes each build), and
  never caches `/api/*`. Note the naming is the inverse of the sibling ETF
  Tracker: here `CACHE` is the version string to bump (`"cana-tracker-v1"`) and
  `SHELL` is the list of precached paths.
- `src/main.jsx` registers that worker in production, checks for updates hourly,
  and reloads **once** when a new version installs over an existing controller —
  so users of the installed PWA pick up deploys automatically.
- Alerts are stored per device in `localStorage` under `cana-tracker-alertas`,
  read/written directly in `components/Alertas.jsx` (no store module).
- A broken change fails the Vercel build and the previous deploy stays live;
  `npm run build` locally is still the right pre-push check.

## Git

- Develop on the branch you were given; commit with clear pt-BR messages; push
  with `git push -u origin <branch>`.
- Don't open a PR unless the user asks.
- Expect automated `github-actions[bot]` commits touching
  `server/cepea-cache.json` — rebase/pull before pushing rather than fighting
  them, and don't hand-edit that file.
- No API keys are needed: every source (Notícias Agrícolas, CEPEA, Yahoo, BCB,
  Open-Meteo) is free and key-less. `.env` is gitignored; don't add a secret
  without asking.
