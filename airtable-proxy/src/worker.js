/**
 * Cloudflare Worker: forwards GET /v0/... to api.airtable.com with a server-side PAT.
 * Dashboard sets dataProxyUrl to this worker origin (no trailing path) — browser never sees Airtable PAT.
 *
 * Secrets (wrangler secret put …):
 *   AIRTABLE_PAT      — read-only PAT
 *   AIRTABLE_BASE_ID  — app… (only this base may be requested)
 * Optional:
 *   BROWSER_KEY       — if set, browser must send header X-Proxy-Key with this value
 *   ALLOW_ORIGINS     — comma list, e.g. https://taliasirkis.github.io  (default *)
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowList = String(env.ALLOW_ORIGINS || '*')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const corsOrigin =
      allowList.includes('*') || !origin
        ? '*'
        : allowList.includes(origin)
          ? origin
          : allowList[0] || '*';

    const cors = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Key',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'GET') {
      return jsonErr(405, 'Method not allowed', cors);
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const search = url.search;

    const baseId = String(env.AIRTABLE_BASE_ID || '').trim();
    const pat = String(env.AIRTABLE_PAT || '').trim();
    if (!baseId || !pat) {
      return jsonErr(500, 'Worker missing AIRTABLE_BASE_ID or AIRTABLE_PAT', cors);
    }

    const dataPrefix = '/v0/' + baseId + '/';
    const metaPrefix = '/v0/meta/bases/' + baseId + '/';
    if (!path.startsWith(dataPrefix) && !path.startsWith(metaPrefix)) {
      return jsonErr(403, 'Path not allowed for this base', cors);
    }

    const browserKey = String(env.BROWSER_KEY || '').trim();
    if (browserKey && request.headers.get('X-Proxy-Key') !== browserKey) {
      return jsonErr(403, 'Invalid or missing X-Proxy-Key', cors);
    }

    const upstream = await fetch('https://api.airtable.com' + path + search, {
      headers: {
        Authorization: 'Bearer ' + pat,
        'User-Agent': 'ctrec-dashboard-airtable-proxy/1',
      },
    });

    const ct = upstream.headers.get('Content-Type') || 'application/json';
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': ct,
        'Cache-Control': 'private, max-age=30',
      },
    });
  },
};

function jsonErr(status, msg, cors) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
