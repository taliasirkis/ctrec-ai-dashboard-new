# CTREC AI Initiatives dashboard (GitHub Pages + live Airtable)

This repo is the **live** version of the dashboard: **`index.html`** + **`dashboard.js`** load data in the browser from Airtable and refresh on a timer.

**`q4_ctrec_ai_dashboard.html`** is the original **static** prototype (hard-coded data). Keep it as a design reference if you like; **do not rely on it for production** — it has no Airtable connection. The Pages site should use **`index.html`** as the entry URL (default for GitHub Pages).

---

## What you get

- **GitHub Pages**: static hosting from this repo’s root.
- **Live data**: each visitor’s browser calls the Airtable API. By default the **PAT** is stored in **localStorage** (via **Setup**). Optionally, **GitHub Actions** can inject a read-only PAT at deploy time so **everyone** loads the same base without Setup (see below).
- **Always up to date while the tab is open**: automatic refetch (default **5 minutes**) + **Refresh now**.

> **Reality check:** “Live all the time” in the browser means **when someone has the page open**, it keeps polling Airtable. There is no background server in this stack. For 24/7 server-side sync you would need a backend (out of scope here).

---

## From scratch: ship to GitHub Pages

### 1) Put the site in a GitHub repo

- Create a repository (or use an existing one).
- Put these files at the **root** (or the folder you choose for Pages):
  - `index.html`, `dashboard.js`, `config.example.js`, `token.example.txt`
  - `.nojekyll` (empty file — tells GitHub **not** to run Jekyll)
  - Optional: `README.md` (this file)
- **Never commit** a real PAT. `config.js` (if you use it) and `token.txt` are listed in **`.gitignore`**.

### 2) Enable GitHub Pages

**Option A — Deploy from branch (simplest, per-visitor Setup)**

1. Repo → **Settings** → **Pages**.
2. **Build and deployment** → **Source** → **Deploy from a branch**.
3. Branch **main**, folder **`/ (root)`**, **Save**.

**Option B — GitHub Actions (recommended if everyone should see the same data)**

1. Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - `AIRTABLE_PAT` — read-only PAT (`data.records:read`, scoped to this base only).
   - `AIRTABLE_BASE_ID` — e.g. `appXXXXXXXXXXXXXX`.
   - Optional: `AIRTABLE_TABLE_NAME` (default `Initiatives`), `AIRTABLE_VIEW_NAME`.
2. **Settings** → **Pages** → **Build and deployment** → **Source** → **GitHub Actions** (not the branch option).
3. Push to **`main`** (or run the **Deploy GitHub Pages** workflow manually). The workflow in `.github/workflows/deploy-pages.yml` copies the static files into an artifact, writes **`config.js`** from those secrets (never committed), and publishes the site.

After either option, open the site URL, e.g. `https://<YOUR_USER>.github.io/<YOUR_REPO>/`

### 3) Connect Airtable on first visit

1. Open the **Pages URL** (must be `index.html` at root, which is the default).
2. Click **Setup**.
3. Fill in:
   - **Personal access token** — [Create token](https://airtable.com/create/tokens) with **`data.records:read`** on your base.  
     Recommended: also add **`schema.bases:read`** so the app can detect the table primary field and likely Status/Org columns.
   - **Base ID** — from the base URL: `https://airtable.com/<BASE_ID>/...` (starts with `app`).
   - **Table name** — exactly as in Airtable (or the table ID `tbl…`).
   - **View** (optional) — limits which rows load.
   - **Only load Q4 initiatives** (on by default) — adds an Airtable `filterByFormula` so the `Quarter` column (name editable) must contain `Q4` (e.g. `Q4 FY26`). Uncheck if your table has no such field, or use a view/table that is already Q4-only. You can also paste a **custom** `filterByFormula` to override.

4. **Save & load**. The token is stored **only in that browser** (`localStorage`), not in the repo.

5. Use **Auto-detect** if column names differ from defaults, then **Save & load** again.

### Everyone should see the same data (no per-visitor Setup)

**Preferred:** use **Option B** above — the **Deploy GitHub Pages** workflow writes `config.js` at build time with `siteWideConnection: true` and your secrets. The token **never** appears in git history on `main`.

**Manual:** in **`index.html`** (inside `window.DASHBOARD_CONFIG`) or in a **`config.js`** you upload with the site, set `siteWideConnection: true`, `airtablePat`, `baseId`, and table/view as needed. Anything in public HTML/JS can be copied; use a **read-only** PAT scoped to **one base** only.

### 4) Match your grid (if needed)

Defaults live in `index.html` inside `window.DASHBOARD_CONFIG` (`fields`, `orgSlugMap`, `refreshMs`).  
You can copy **`config.example.js`** → **`config.js`** for overrides; **`config.js` is gitignored** so you do not commit secrets.

---

## Files (short)

| File | Role |
|------|------|
| `index.html` | Pages entry: layout, styles, default `DASHBOARD_CONFIG` |
| `dashboard.js` | Airtable fetch, schema hints, rendering, filters, Setup modal |
| `q4_ctrec_ai_dashboard.html` | Static reference only (no live data) |
| `.nojekyll` | Disable Jekyll on Pages |
| `config.example.js` | Example `config.js` overrides |
| `.github/workflows/deploy-pages.yml` | Optional: Pages deploy + inject PAT from Actions secrets |
| `token.example.txt` | Notes for local `curl` only |

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| 404 on Pages | Confirm Pages source (branch **or** Actions) matches how you deploy; wait a few minutes after first push. |
| Actions deploy fails / site empty | **Pages** source must be **GitHub Actions** if you use the workflow; approve the `github-pages` environment the first time if prompted. |
| Auth / permission errors | PAT scopes; re-paste token in Setup; base + table names correct. |
| Untitled / missing status or org | **Auto-detect**; add `schema.bases:read`; or type **exact** Airtable column names in Setup. Linked-record fields need a **Lookup/Formula** that exposes text. |
| Old UI after deploy | Hard refresh (`Cmd+Shift+R`). `dashboard.js` is versioned with `?v=` in `index.html` — bump when you change JS so browsers fetch the new file. |
| Airtable error about `filterByFormula` / unknown field | In **Setup**, uncheck “Only load Q4” or set the correct **Quarter / FY column name**, or point at a Q4-only **view** and turn the checkbox off. |

---

## Optional: local `curl` test

See **`token.example.txt`** for a safe pattern to verify the token against the API from your machine (not used by the Pages app itself).
