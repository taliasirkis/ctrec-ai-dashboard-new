(function () {
  'use strict';

  const STORAGE_KEY = 'airtable_dashboard_config_v1';

  /** Trim + strip BOM / zero-width chars; strip accidental leading "Bearer " so we do not double-prefix. */
  function normalizeToken(t) {
    if (t == null) return '';
    let s = String(t).trim().replace(/^\uFEFF/, '');
    s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
    s = s.trim().replace(/^["']|["']$/g, '');
    s = s.replace(/^bearer\s+/i, '').trim();
    return s;
  }

  const DEFAULT_FIELDS = {
    name: 'Name',
    description: 'Description',
    status: 'Status',
    priority: 'Priority',
    impact: 'Impact',
    org: 'Org',
    isNew: 'New',
  };

  function loadMergedConfig() {
    const base = Object.assign(
      {
        airtablePat: '',
        baseId: '',
        tableName: 'Initiatives',
        viewName: '',
        refreshMs: 5 * 60 * 1000,
        fields: Object.assign({}, DEFAULT_FIELDS),
        orgSlugMap: {},
      },
      window.DASHBOARD_CONFIG || {}
    );
    let merged;
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      merged = Object.assign({}, base, saved);
    } catch {
      merged = base;
      saved = {};
    }
    merged.fields = Object.assign({}, DEFAULT_FIELDS, base.fields || {}, saved.fields || {});
    merged.orgSlugMap = Object.assign({}, base.orgSlugMap || {}, saved.orgSlugMap || {});
    merged.airtablePat = normalizeToken(merged.airtablePat);
    merged.baseId = String(merged.baseId || '').trim();
    merged.tableName = String(merged.tableName || '').trim() || 'Initiatives';
    merged.viewName = String(merged.viewName || '').trim();
    return merged;
  }

  function saveLocalConfig(patch) {
    const cur = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const next = Object.assign({}, cur, patch);
    if (patch.fields && typeof patch.fields === 'object') {
      next.fields = Object.assign({}, cur.fields || {}, patch.fields);
    }
    if (patch.orgSlugMap && typeof patch.orgSlugMap === 'object') {
      next.orgSlugMap = Object.assign({}, cur.orgSlugMap || {}, patch.orgSlugMap);
    }
    if (next.airtablePat != null) next.airtablePat = normalizeToken(next.airtablePat);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      window.alert(
        'Could not save to browser storage: ' +
          (e && e.message ? e.message : String(e)) +
          '. Try turning off private browsing or freeing disk space.'
      );
      throw e;
    }
    Object.assign(window.DASHBOARD_CONFIG || {}, next);
  }

  function clearStoredConnectionAndReload() {
    if (
      !confirm(
        'Remove saved Airtable token and settings from this browser and reload? You will enter them again in Setup.'
      )
    )
      return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    location.reload();
  }
  window.__clearDashboardConnection = clearStoredConnectionAndReload;

  /** Base / table / view only — never put PAT in the DOM. */
  function fillSetupFormNonSecret() {
    const c = loadMergedConfig();
    const baseEl = document.getElementById('setup-base');
    const tableEl = document.getElementById('setup-table');
    const viewEl = document.getElementById('setup-view');
    const patEl = document.getElementById('setup-pat');
    if (baseEl) baseEl.value = c.baseId || '';
    if (tableEl) tableEl.value = c.tableName || '';
    if (viewEl) viewEl.value = c.viewName || '';
    if (patEl) patEl.value = '';
    const f = c.fields || {};
    const setF = (id, key) => {
      const el = document.getElementById(id);
      if (el) el.value = f[key] != null ? String(f[key]) : '';
    };
    setF('setup-f-name', 'name');
    setF('setup-f-description', 'description');
    setF('setup-f-status', 'status');
    setF('setup-f-priority', 'priority');
    setF('setup-f-impact', 'impact');
    setF('setup-f-org', 'org');
    setF('setup-f-isNew', 'isNew');
  }

  function cellValue(record, fieldName) {
    if (!fieldName || !record.fields) return '';
    const v = record.fields[fieldName];
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === 'object' && v[0].url) return v.map((a) => a.url).join(', ');
      return v.map((x) => (typeof x === 'object' && x.name ? x.name : String(x))).join(', ');
    }
    if (typeof v === 'object' && v.name != null) return String(v.name);
    return String(v);
  }

  function norm(s) {
    return String(s || '')
      .trim()
      .toLowerCase();
  }

  function orgToSlug(raw, orgSlugMap) {
    const key = norm(raw);
    if (!key) return '';
    const map = orgSlugMap || {};
    if (map[key]) return map[key];
    for (const k of Object.keys(map)) {
      if (norm(k) === key) return map[k];
    }
    return key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
  }

  function statusClass(status) {
    const s = norm(status);
    if (s === 'on track') return 'status-on-track';
    if (s === 'in progress') return 'status-in-progress';
    if (s === 'not started') return 'status-not-started';
    return 'status-unknown';
  }

  function statusBadgeHtml(status) {
    const s = norm(status);
    if (s === 'on track')
      return '<span class="badge badge-status-on-track">✅ On Track</span>';
    if (s === 'in progress')
      return '<span class="badge badge-status-in-progress">🟡 In Progress</span>';
    if (s === 'not started')
      return '<span class="badge badge-status-not-started">⭕ Not Started</span>';
    return '<span class="badge badge-status-unknown">Status TBD</span>';
  }

  function priorityBadge(priority) {
    const p = String(priority || '').trim().toUpperCase();
    if (p === 'P0') return '<span class="badge badge-priority-p0">🔴 P0</span>';
    if (p === 'P1') return '<span class="badge badge-priority-p1">P1</span>';
    if (p === 'P2') return '<span class="badge badge-priority-p2">P2</span>';
    return '';
  }

  function impactBadge(impact) {
    const i = norm(impact);
    if (i === 'high') return '<span class="badge badge-impact-high">💚 High Impact</span>';
    if (i === 'medium') return '<span class="badge badge-impact-medium">Medium Impact</span>';
    if (i === 'low') return '<span class="badge badge-impact-low">Low Impact</span>';
    return '';
  }

  function parseRow(record, cfg) {
    const f = cfg.fields || {};
    const name = cellValue(record, f.name) || 'Untitled';
    const desc = cellValue(record, f.description);
    const status = cellValue(record, f.status) || 'unknown';
    const priority = cellValue(record, f.priority);
    const impact = cellValue(record, f.impact);
    const orgRaw = cellValue(record, f.org);
    const orgSlug = orgToSlug(orgRaw, cfg.orgSlugMap);
    let isNew = false;
    if (f.isNew && record.fields[f.isNew] != null) {
      const v = record.fields[f.isNew];
      if (v === true || v === 'true' || norm(v) === 'yes' || norm(v) === 'new')
        isNew = true;
      if (typeof v === 'object' && v.name && /^(yes|new|true)$/i.test(String(v.name))) isNew = true;
    }
    const created = record.createdTime ? new Date(record.createdTime) : null;
    return {
      id: record.id,
      name,
      desc,
      status: norm(status) || 'unknown',
      priority: String(priority || '').trim(),
      impact: norm(impact),
      orgSlug,
      orgLabel: orgRaw || orgSlug,
      isNew,
      created,
    };
  }

  async function fetchAllRecords(cfg) {
    const table = encodeURIComponent(cfg.tableName);
    const base = cfg.baseId.trim();
    let url = `https://api.airtable.com/v0/${base}/${table}?pageSize=100`;
    if (cfg.viewName) url += `&view=${encodeURIComponent(cfg.viewName)}`;
    const token = normalizeToken(cfg.airtablePat);
    if (!token) throw new Error('Missing token after normalize — paste your PAT in Setup and save again.');
    const headers = { Authorization: 'Bearer ' + token };
    const rows = [];
    let offset = '';
    for (;;) {
      const res = await fetch(offset ? `${url}&offset=${encodeURIComponent(offset)}` : url, {
        method: 'GET',
        mode: 'cors',
        headers,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText || String(res.status));
      }
      const data = await res.json();
      (data.records || []).forEach((r) => rows.push(r));
      offset = data.offset;
      if (!offset) break;
    }
    return rows;
  }

  const ORG_META = {
    oz: { title: 'OZ (TnS IL)', dot: 'dot-oz' },
    'tns-us': { title: 'TnS US', dot: 'dot-tns-us' },
    iai: { title: 'IAI', dot: 'dot-iai' },
    dsx: { title: 'DSX/TISO AI', dot: 'dot-dsx' },
    finance: { title: 'Finance', dot: 'dot-finance' },
    mle: { title: 'MLE', dot: 'dot-mle' },
    research: { title: 'Research', dot: 'dot-research' },
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderCards(items) {
    return items
      .map((it) => {
        const stClass = statusClass(it.status);
        const dataName = escapeHtml(norm(it.name));
        const nameNew = it.isNew ? ' <span class="badge badge-new">🆕 New</span>' : '';
        const tags = [statusBadgeHtml(it.status), priorityBadge(it.priority), impactBadge(it.impact)]
          .filter(Boolean)
          .join('');
        return `<div class="card ${stClass}" data-name="${dataName}" data-status="${escapeHtml(
          it.status
        )}" data-priority="${escapeHtml(it.priority)}" data-impact="${escapeHtml(
          it.impact
        )}" data-org="${escapeHtml(it.orgSlug)}">
        <div class="card-name">${escapeHtml(it.name)}${nameNew}</div>
        <div class="card-desc">${escapeHtml(it.desc || '—')}</div>
        <div class="card-tags">${tags}</div>
      </div>`;
      })
      .join('');
  }

  function renderMain(rows, cfg) {
    const parsed = rows.map((r) => parseRow(r, cfg));
    const byOrg = {};
    parsed.forEach((it) => {
      const slug = it.orgSlug || 'unknown';
      if (!byOrg[slug]) byOrg[slug] = [];
      byOrg[slug].push(it);
    });
    const slugOrder = Object.keys(ORG_META);
    const extra = Object.keys(byOrg).filter((k) => slugOrder.indexOf(k) === -1).sort();
    const orderedSlugs = slugOrder.concat(extra);

    let html = '';
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const recent = parsed.filter((it) => it.created && it.created.getTime() >= dayAgo);
    if (recent.length) {
      const lis = recent
        .slice(0, 24)
        .map((it) => `<li>${escapeHtml(it.name)} — ${escapeHtml(it.orgLabel)}${it.isNew ? ' [New]' : ''}</li>`)
        .join('');
      html += `<div class="update-banner" id="update-banner">
        <div class="icon">🔄</div>
        <div style="flex:1">
          <h3>Added or seen in the last 24 hours — ${recent.length} record(s)</h3>
          <ul>${lis}</ul>
        </div>
      </div>`;
    }

    orderedSlugs.forEach((slug) => {
      const items = byOrg[slug];
      if (!items || !items.length) return;
      const meta = ORG_META[slug] || { title: slug, dot: 'dot-oz' };
      html += `<div class="org-section" data-org="${escapeHtml(slug)}">
        <div class="org-header">
          <div class="org-dot ${meta.dot}"></div>
          <div class="org-title">${escapeHtml(meta.title)}</div>
          <div class="org-count">${items.length} initiative${items.length === 1 ? '' : 's'}</div>
        </div>
        <div class="cards-grid">${renderCards(items)}</div>
      </div>`;
    });

    html += `<div class="no-results hidden" id="no-results">
    <p style="font-size: 32px; margin-bottom: 12px;">🔍</p>
    <p style="font-size: 16px; font-weight: 600; color: #475569;">No initiatives match your filters</p>
    <p style="font-size: 13px; margin-top: 6px;">Try adjusting your filters or <a href="#" onclick="resetFilters(); return false;" style="color: #3b82f6;">reset all filters</a></p>
  </div>`;

    return html;
  }

  function computeStats(parsed) {
    const total = parsed.length;
    const onTrack = parsed.filter((p) => p.status === 'on track' || p.status === 'in progress').length;
    const notStarted = parsed.filter((p) => p.status === 'not started').length;
    const p0 = parsed.filter((p) => String(p.priority).toUpperCase() === 'P0').length;
    const high = parsed.filter((p) => p.impact === 'high').length;
    const orgs = new Set(parsed.map((p) => p.orgSlug).filter(Boolean));
    return { total, onTrack, notStarted, p0, high, activeOrgs: orgs.size };
  }

  function updateStats(parsed) {
    const s = computeStats(parsed);
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(v);
    };
    set('stat-ontrack', s.onTrack);
    set('stat-notstarted', s.notStarted);
    set('stat-p0', s.p0);
    set('stat-high', s.high);
    set('stat-orgs', s.activeOrgs);
    const tc = document.getElementById('total-count');
    if (tc) tc.textContent = String(s.total);
  }

  function setLoading(msg) {
    const el = document.getElementById('dashboard-mount');
    if (!el) return;
    el.innerHTML = `<div style="padding:40px;text-align:center;color:#64748b;font-size:14px;">${escapeHtml(
      msg
    )}</div>`;
  }

  function setError(msg) {
    const el = document.getElementById('dashboard-mount');
    if (!el) return;
    const authHint =
      msg.indexOf('AUTHENTICATION_REQUIRED') !== -1
        ? `<p style="margin-top:10px;font-size:13px;color:#7f1d1d;line-height:1.5;"><strong>If you see “Authentication required”:</strong> copy the token again from Airtable (long string starting with <code>pat</code>… or legacy <code>key</code>…). Re‑paste it in Setup — no spaces before/after. Then <strong>Save &amp; load</strong>. Create a <em>new</em> token if unsure.</p>`
        : '';
    el.innerHTML = `<div style="padding:32px;margin:24px 32px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;color:#991b1b;font-size:14px;">
      <strong>Could not load data</strong><p style="margin-top:8px;line-height:1.5;">${escapeHtml(msg)}</p>
      ${authHint}
      <p style="margin-top:12px;font-size:13px;color:#7f1d1d;">Check Personal Access Token scopes (data.records:read), base id, and table name. Open setup below if you need to change credentials.</p>
      <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px;">
        <button type="button" class="reset-btn" onclick="window.__openDashboardSetup()">Open setup</button>
        <button type="button" class="reset-btn" onclick="window.__clearDashboardConnection()">Clear saved connection &amp; reload</button>
      </div>
    </div>`;
  }

  let refreshTimer = null;
  let lastParsed = [];

  async function refresh() {
    const cfg = loadMergedConfig();
    if (!cfg.airtablePat || !cfg.baseId || !cfg.tableName) {
      setError('Missing Airtable configuration. Use Setup to add your token and base id.');
      return;
    }
    setLoading('Loading from Airtable…');
    try {
      const records = await fetchAllRecords(cfg);
      const parsed = records.map((r) => parseRow(r, cfg));
      lastParsed = parsed;
      const mount = document.getElementById('dashboard-mount');
      mount.innerHTML = renderMain(records, cfg);
      updateStats(parsed);
      const hdr = document.getElementById('header-updated');
      if (hdr) {
        hdr.textContent = 'Last refreshed: ' + new Date().toLocaleString();
      }
      if (typeof window.applyFilters === 'function') window.applyFilters();
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  function ensureRefreshTimer() {
    if (refreshTimer) clearInterval(refreshTimer);
    const cfg = loadMergedConfig();
    const ms = Math.max(30000, Number(cfg.refreshMs) || 300000);
    refreshTimer = setInterval(refresh, ms);
  }

  function injectSetupModal() {
    if (document.getElementById('setup-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'setup-overlay';
    overlay.className = 'hidden';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = `<div style="background:white;border-radius:14px;max-width:440px;width:100%;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,0.2);">
      <h2 style="font-size:18px;margin-bottom:6px;color:#0f172a;">Airtable connection</h2>
      <p style="font-size:12px;color:#64748b;margin-bottom:16px;line-height:1.5;">Values are stored only in this browser (localStorage). For a public GitHub repo, do not commit tokens in <code>config.js</code>.</p>
      <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px;">Personal Access Token</label>
      <p style="font-size:11px;color:#64748b;margin:-4px 0 6px;line-height:1.4;">Shown as plain text so the browser does not block saving long tokens. Paste the full <code>pat…</code> secret. Leave blank and save to keep an existing token when only changing base/table.</p>
      <input id="setup-pat" type="text" spellcheck="false" autocapitalize="off" autocomplete="off" style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;" placeholder="pat… (paste full token)" />
      <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px;">Base ID</label>
      <input id="setup-base" type="text" style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:13px;" placeholder="appXXXXXXXXXXXXXX" />
      <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px;">Table name</label>
      <input id="setup-table" type="text" style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:13px;" />
      <label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px;">View (optional)</label>
      <input id="setup-view" type="text" style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:13px;" />
      <details style="margin-bottom:14px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
        <summary style="font-weight:600;cursor:pointer;font-size:13px;color:#334155;">Airtable column names (if you see “Untitled”, “Status TBD”, or one “unknown” org)</summary>
        <p style="font-size:11px;color:#64748b;margin:10px 0 8px;line-height:1.45;">Each value must match a <strong>column name</strong> in your Airtable table exactly (same spelling and spaces as the grid header).</p>
        <div style="display:grid;gap:8px;margin-top:8px;">
          <label style="font-size:11px;font-weight:600;color:#475569;">Title / name <input id="setup-f-name" type="text" class="setup-f-in" style="width:100%;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;" /></label>
          <label style="font-size:11px;font-weight:600;color:#475569;">Description <input id="setup-f-description" type="text" class="setup-f-in" style="width:100%;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;" /></label>
          <label style="font-size:11px;font-weight:600;color:#475569;">Status <input id="setup-f-status" type="text" class="setup-f-in" style="width:100%;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;" /></label>
          <label style="font-size:11px;font-weight:600;color:#475569;">Priority <input id="setup-f-priority" type="text" class="setup-f-in" style="width:100%;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;" /></label>
          <label style="font-size:11px;font-weight:600;color:#475569;">Impact <input id="setup-f-impact" type="text" class="setup-f-in" style="width:100%;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;" /></label>
          <label style="font-size:11px;font-weight:600;color:#475569;">Org / team <input id="setup-f-org" type="text" class="setup-f-in" style="width:100%;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;" /></label>
          <label style="font-size:11px;font-weight:600;color:#475569;">“New” flag (checkbox) <input id="setup-f-isNew" type="text" class="setup-f-in" style="width:100%;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;" /></label>
        </div>
      </details>
      <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;">
        <button type="button" id="setup-clear" class="reset-btn" style="font-size:12px;">Clear saved connection…</button>
        <div style="display:flex;gap:10px;">
          <button type="button" id="setup-cancel" class="reset-btn">Cancel</button>
          <button type="button" id="setup-save" style="background:#1e293b;color:white;border:0;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;">Save &amp; load</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    fillSetupFormNonSecret();

    function close() {
      overlay.classList.add('hidden');
    }
    function open() {
      fillSetupFormNonSecret();
      overlay.classList.remove('hidden');
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.getElementById('setup-cancel').addEventListener('click', close);
    document.getElementById('setup-clear').addEventListener('click', clearStoredConnectionAndReload);
    document.getElementById('setup-save').addEventListener('click', () => {
      const pat = normalizeToken(document.getElementById('setup-pat').value);
      const patch = {
        baseId: document.getElementById('setup-base').value.trim(),
        tableName: document.getElementById('setup-table').value.trim() || 'Initiatives',
        viewName: document.getElementById('setup-view').value.trim(),
      };
      if (pat) {
        if (pat.length < 30) {
          if (
            !window.confirm(
              'This token looks very short. Airtable personal access tokens are usually a long string starting with pat. Continue saving anyway?'
            )
          )
            return;
        }
        patch.airtablePat = pat;
      }
      const gv = (id) => document.getElementById(id).value.trim();
      patch.fields = {
        name: gv('setup-f-name') || DEFAULT_FIELDS.name,
        description: gv('setup-f-description') || DEFAULT_FIELDS.description,
        status: gv('setup-f-status') || DEFAULT_FIELDS.status,
        priority: gv('setup-f-priority') || DEFAULT_FIELDS.priority,
        impact: gv('setup-f-impact') || DEFAULT_FIELDS.impact,
        org: gv('setup-f-org') || DEFAULT_FIELDS.org,
        isNew: gv('setup-f-isNew') || DEFAULT_FIELDS.isNew,
      };
      saveLocalConfig(patch);
      const verify = loadMergedConfig();
      if (!verify.airtablePat || verify.airtablePat.length < 12) {
        window.alert(
          'No token was saved in this browser. Paste your full Airtable PAT in the token field and click Save again.\n\nNote: token.txt is only for Terminal curl — the website keeps a separate copy here in Setup.'
        );
        return;
      }
      close();
      ensureRefreshTimer();
      refresh();
    });
    window.__openDashboardSetup = open;
    window.__closeDashboardSetup = close;
  }

  window.resetFilters = function resetFilters() {
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-priority').value = '';
    document.getElementById('filter-impact').value = '';
    document.getElementById('filter-org').value = '';
    document.getElementById('search-box').value = '';
    document.querySelectorAll('.card').forEach((c) => c.classList.remove('hidden'));
    document.querySelectorAll('.org-section').forEach((s) => s.classList.remove('hidden'));
    const nr = document.getElementById('no-results');
    if (nr) nr.classList.add('hidden');
    if (lastParsed.length) updateStats(lastParsed);
    else {
      const n = document.querySelectorAll('#dashboard-mount .card').length;
      const tc = document.getElementById('total-count');
      if (tc) tc.textContent = String(n);
    }
  };

  window.applyFilters = function applyFilters() {
    const statusFilter = document.getElementById('filter-status').value.toLowerCase();
    const priorityFilter = document.getElementById('filter-priority').value;
    const impactFilter = document.getElementById('filter-impact').value.toLowerCase();
    const orgFilter = document.getElementById('filter-org').value.toLowerCase();
    const searchText = document.getElementById('search-box').value.toLowerCase().trim();

    let totalVisible = 0;

    document.querySelectorAll('.org-section').forEach((section) => {
      const sectionOrg = section.getAttribute('data-org');
      let sectionVisible = 0;

      section.querySelectorAll('.card').forEach((card) => {
        const cardName = card.getAttribute('data-name') || '';
        const cardStatus = card.getAttribute('data-status') || '';
        const cardPriority = card.getAttribute('data-priority') || '';
        const cardImpact = card.getAttribute('data-impact') || '';
        const cardDesc = card.querySelector('.card-desc')
          ? card.querySelector('.card-desc').textContent.toLowerCase()
          : '';

        let show = true;

        if (statusFilter && cardStatus !== statusFilter) show = false;
        if (priorityFilter && cardPriority !== priorityFilter) show = false;
        if (impactFilter && cardImpact !== impactFilter) show = false;
        if (orgFilter && sectionOrg !== orgFilter) show = false;
        if (searchText && !cardName.includes(searchText) && !cardDesc.includes(searchText)) show = false;

        card.classList.toggle('hidden', !show);
        if (show) {
          sectionVisible++;
          totalVisible++;
        }
      });

      const orgMatch = !orgFilter || sectionOrg === orgFilter;
      section.classList.toggle('hidden', !orgMatch || sectionVisible === 0);
    });

    const nr = document.getElementById('no-results');
    if (nr) nr.classList.toggle('hidden', totalVisible > 0);
    const tc = document.getElementById('total-count');
    if (tc) tc.textContent = String(totalVisible);
  };

  window.__refreshDashboard = function () {
    ensureRefreshTimer();
    return refresh();
  };

  function init() {
    injectSetupModal();
    const cfg = loadMergedConfig();
    if (!cfg.airtablePat || !cfg.baseId) {
      setError('Configure Airtable to load live data.');
      window.__openDashboardSetup();
    } else {
      ensureRefreshTimer();
      refresh();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
