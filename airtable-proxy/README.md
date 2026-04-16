# Airtable read proxy (Cloudflare Worker)

Holds your **Airtable PAT on the server** so the GitHub Pages dashboard can load data **without** putting `airtablePat` in the browser.

## 1) Prerequisites

- [Cloudflare](https://dash.cloudflare.com/) account (free tier is enough).
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/): `npm i -g wrangler` then `wrangler login`.

## 2) Create secrets

From this folder (`airtable-proxy/`):

```bash
npx wrangler secret put AIRTABLE_PAT
npx wrangler secret put AIRTABLE_BASE_ID
```

Optional (recommended for a public URL):

```bash
npx wrangler secret put BROWSER_KEY
```

Use a long random string; the same value must go into the dashboard as **`dataProxyKey`** (in Setup or `config.js`).

Optional CORS lock (comma-separated origins):

```bash
npx wrangler secret put ALLOW_ORIGINS
# paste e.g. https://taliasirkis.github.io
```

## 3) Deploy

```bash
cd airtable-proxy
npx wrangler deploy
```

Note the **Worker URL** (e.g. `https://ctrec-airtable-proxy.<subdomain>.workers.dev`).

## 4) Point the dashboard at the worker

In **`index.html`** (`window.DASHBOARD_CONFIG`) or **Setup** (saved per browser):

- **`dataProxyUrl`** — full worker origin, **no trailing slash**, e.g. `https://ctrec-airtable-proxy.xxx.workers.dev`
- **`dataProxyKey`** — same value as `BROWSER_KEY` if you set it; otherwise leave blank
- **`airtablePat`** — leave **empty** when using the proxy (the worker sends the PAT)
- **`baseId`**, **`tableName`**, **`viewName`** — still required in the dashboard (same as today); paths are validated against `baseId` on the worker

Then deploy the static site. With **`siteWideConnection: true`** you can ship **`dataProxyUrl`** + **`dataProxyKey`** in Actions-generated `config.js` **without** ever injecting `AIRTABLE_PAT` into the Pages bundle (only the smaller proxy key, if any).

## GitHub Actions (Pages)

In the repo, **Settings → Secrets → Actions**, prefer:

| Secret | Purpose |
|--------|---------|
| `DATA_PROXY_URL` | Worker `https://….workers.dev` (no trailing slash) |
| `AIRTABLE_BASE_ID` | Same `app…` as on the worker |
| `DATA_PROXY_KEY` | Optional; same as Worker `BROWSER_KEY` |
| `AIRTABLE_TABLE_NAME` | Optional (default `Initiatives`) |
| `AIRTABLE_VIEW_NAME` | Optional |

If `DATA_PROXY_URL` and `AIRTABLE_BASE_ID` are set, the **Deploy GitHub Pages** workflow does **not** put `AIRTABLE_PAT` in `config.js`. Otherwise it falls back to **`AIRTABLE_PAT`** + base id.

See root **`README.md`**.
