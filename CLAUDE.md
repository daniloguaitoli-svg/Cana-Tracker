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
| Tests / lint | **None configured.** No test runner, no ESLint, no Prettier. Verify with `npm run build` and by reading the code — don't invent an `npm test`. |
| Node | 18+ |

`.npmrc` sets `legacy-peer-deps=true` so Vercel's strict install doesn't fail on
peer-dependency drift. Don't remove it.

## Commands

```bash
npm install
npm run dev        # Vite + the dev /api middleware; host exposed on the LAN
npm run build      # production build — the de facto check that a change is sound
npm run preview

node .github/scripts/coletar-cepea.mjs   # run the CEPEA collector by hand
```

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
public/               PWA manifest + service worker
```

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
| `unidade` | native unit: `BRL_LITRO`, `BRL_M3`, `USD_GALAO`, `BRL_SACA50`, `BRL_5KG`, `BRL_KG`, `USD_CENT_LB`, `BRL_KG_ATR`, `BRL_TON` |
| `produto` | `"acucar"` / `"hidratado"` / `"anidro"` — picks the CONSECANA coefficient for the R$/kg-ATR conversion; `null` when it doesn't apply |
| `periodicidade` | `"diaria"` / `"semanal"` / `"mensal"` — decides when a price counts as stale |
| `principal` | feeds the panel's "cotações desatualizadas" warning |
| `cepeaId`, `viaWidget` | CEPEA widget id; `viaWidget` means the widget is the *only* source |
| `yahoo` | Yahoo symbol when free history exists |

To add an indicator: add its catalogue entry, then make sure some provider can
actually read it (a Notícias Agrícolas table match, a `cepeaId`, or a Yahoo
symbol). The ATR price per state and Paraná's *cana básica* are **not** in the
catalogue — they're dynamic rows scraped per-state in
`providers/noticiasagricolas.js`.

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

**These constants are duplicated in `src/components/Conversor.jsx`** so the
converter can compute as the user types without a round trip. If you change a
coefficient in `server/util.js`, change it there too — they must stay in sync.

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
   Vercel it lands in `/tmp` and **dies on every cold start**.
3. **Versioned CEPEA cache** (`server/cepea-cache.json`) — written by the
   scheduled GitHub Actions job. This is the **only** history for the CEPEA
   indicators that survives, because it lives in the repo.

`serieCompleta(slug)` in `datalayer.js` merges (2) and (3). When a series is too
short the API returns `notaHistorico` explaining that the chart grows over time —
keep surfacing that honestly rather than faking a series.

### Why the CEPEA collector exists (important)

`cepea.org.br` sits behind a Cloudflare anti-bot challenge that returns **403 to
Vercel functions in every region**, but responds normally from GitHub Actions
runners. So:

- `.github/workflows/coletar-cepea.yml` runs twice a day (12:00 and 21:00 UTC =
  9h/18h Brasília) and on `workflow_dispatch`.
- `.github/scripts/coletar-cepea.mjs` reads every catalogue entry with a
  `cepeaId` (with retries — the first 403 per run is expected), keeps the
  previous value on failure, appends to the history, and writes
  `server/cepea-cache.json`. It only fails the job if **nothing** was collected.
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
  `sinal`, `dataBR`, `dataCurtaBR`, `casasDaUnidade`) and render with the mono
  class. Prices in R$/litro and R$/kg de ATR need **4 decimals** — that's what
  `casasDaUnidade` decides. `Intl` locale is `pt-BR`; times use
  `America/Sao_Paulo`.
- **Design tokens only** — the custom properties at the top of `src/styles.css`
  (`--bg`, `--surface`, `--line`, `--muted`, `--up`, `--down`, `--accent`,
  `--s1`…`--s7`). No hard-coded hexes or pixel gaps in components. Amber
  `--accent` is for the active tab and focus.
- **Loading / error states** come from `components/States.jsx` (`Loading`,
  `Skeletons`, `ErroBox`). Extend those rather than hand-rolling.
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
  params off `req.query`, `Cache-Control: s-maxage=600, stale-while-revalidate=3600`,
  400 on a missing param, 502 on upstream failure. Keep them thin.
- `src/main.jsx` registers the service worker in production, checks for updates
  hourly, and reloads **once** when a new version installs over an existing
  controller — so users of the installed PWA pick up deploys automatically.
- Alerts are stored per device in `localStorage` under `cana-tracker-alertas`.
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
