# ctrec-ai-dashboard

Live dashboard for **Q4 FY26 — CTREC AI Initiatives**, backed by [Airtable](https://airtable.com/) and hosted on **GitHub Pages**.

**Site (after you enable Pages, see below):**  
[https://taliasirkis.github.io/ctrec-ai-dashboard/](https://taliasirkis.github.io/ctrec-ai-dashboard/)

---

## 1. Turn on GitHub Pages (one time)

1. Open the repo on GitHub: [taliasirkis/ctrec-ai-dashboard](https://github.com/taliasirkis/ctrec-ai-dashboard).
2. Go to **Settings** → **Pages** (left sidebar).
3. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
4. Set **Branch** to `main` and folder **`/ (root)`**, then **Save**.
5. Wait up to a minute, then open the green link at the top of the same page (or use the URL above).

There is a `.nojekyll` file so GitHub does not run Jekyll on this static site.

---

## 2. Connect Airtable (first visit + credentials)

1. Open the live site URL.
2. Click **Setup** (top right).
3. Enter:
   - **Personal access token** — create at [airtable.com/create/tokens](https://airtable.com/create/tokens) with scope **`data.records:read`** for your base.
   - **Base ID** — from your base URL: `https://airtable.com/<BASE_ID>/...` (starts with `app`).
   - **Table name** — must match your table (default in code is `Initiatives`).
   - **View** (optional) — Airtable view name to filter records.

4. Click **Save & load**.  
   Values are stored in **this browser only** (`localStorage`), not in the repo — safe for a public GitHub repo.

The page **refetches on a timer** (default 5 minutes) and **Refresh now** pulls immediately.

---

## 3. Match your Airtable columns

Default field names are set in `index.html` inside `window.DASHBOARD_CONFIG.fields`. Your Airtable column names should match the **values** on the right (or edit the file and push):

| Role            | Default Airtable field name |
|----------------|-----------------------------|
| Title          | `Name`                      |
| Description    | `Description`               |
| Status         | `Status` (e.g. On track, In progress, Not started) |
| Priority       | `Priority` (e.g. P0, P1, P2) |
| Impact         | `Impact` (high / medium / low) |
| Org            | `Org` (see slug map below)  |
| New flag       | `New` (checkbox or yes/no)  |

**Org → section:** single-select labels are mapped to dashboard sections via `orgSlugMap` in the same config (e.g. `DSX/TISO AI` → `dsx`). Add entries if your labels differ.

---

## 4. Optional: `config.js`

Copy `config.example.js` to `config.js` to override defaults (field names, `refreshMs`, `orgSlugMap`).  
`config.js` is listed in `.gitignore` so you can keep local overrides without committing secrets.

---

## Files

| File               | Purpose                                      |
|--------------------|----------------------------------------------|
| `index.html`       | Layout, styles, default `DASHBOARD_CONFIG` |
| `dashboard.js`     | Airtable fetch, render, filters, setup modal |
| `config.example.js`| Example overrides (copy to `config.js`)    |
| `.nojekyll`        | Disable Jekyll on Pages                      |

---

## Troubleshooting

- **Blank or error after Setup:** Check token scopes, base id, and that table/field names match.
- **Wrong org grouping:** Extend `orgSlugMap` keys to match your Org select options exactly (case-insensitive).
- **Pages 404:** Confirm Pages source is `main` / `(root)` and wait a few minutes after the first deploy.
