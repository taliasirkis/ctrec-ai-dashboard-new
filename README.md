# CTREC AI Initiatives dashboard (GitHub Pages + live Airtable)

This repo is the **live** version of the dashboard: **`index.html`** + **`dashboard.js`** load data in the browser from Airtable and refresh on a timer.

**`q4_ctrec_ai_dashboard.html`** is the original **static** prototype (hard-coded data). Keep it as a design reference if you like; **do not rely on it for production** — it has no Airtable connection. The Pages site should use **`index.html`** as the entry URL (default for GitHub Pages).

---

## What you get

- **GitHub Pages**: static hosting from this repo’s root.
- **Live data**: each visitor’s browser calls the Airtable API using a **Personal Access Token (PAT)** stored in that browser’s **localStorage** (via **Setup**). No server required.
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

1. Repo → **Settings** → **Pages**.
2. **Build and deployment** → **Source** → **Deploy from a branch**.
3. Branch **main** (or your default), folder **`/ (root)`**, **Save**.
4. After a minute, open the published URL (shown on the same page), e.g.  
   `https://<YOUR_USER>.github.io/<YOUR_REPO>/`

### 3) Connect Airtable on first visit

1. Open the **Pages URL** (must be `index.html` at root, which is the default).
2. Click **Setup**.
3. Fill in:
   - **Personal access token** — [Create token](https://airtable.com/create/tokens) with **`data.records:read`** on your base.  
     Recommended: also add **`schema.bases:read`** so the app can detect the table primary field and likely Status/Org columns.
   - **Base ID** — from the base URL: `https://airtable.com/<BASE_ID>/...` (starts with `app`).
   - **Table name** — exactly as in Airtable (or the table ID `tbl…`).
   - **View** (optional) — limits which rows load.

4. **Save & load**. The token is stored **only in that browser** (`localStorage`), not in the repo.

5. Use **Auto-detect** if column names differ from defaults, then **Save & load** again.

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
| `token.example.txt` | Notes for local `curl` only |

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| 404 on Pages | Confirm Pages source is branch + `/ (root)`; wait a few minutes after first push. |
| Auth / permission errors | PAT scopes; re-paste token in Setup; base + table names correct. |
| Untitled / missing status or org | **Auto-detect**; add `schema.bases:read`; or type **exact** Airtable column names in Setup. Linked-record fields need a **Lookup/Formula** that exposes text. |
| Old UI after deploy | Hard refresh (`Cmd+Shift+R`). `dashboard.js` is versioned with `?v=` in `index.html` — bump when you change JS so browsers fetch the new file. |

---

## Optional: local `curl` test

See **`token.example.txt`** for a safe pattern to verify the token against the API from your machine (not used by the Pages app itself).
