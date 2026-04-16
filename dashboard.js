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

  /** Flatten Airtable cell values to a display string (selects, lookups, arrays, etc.). */
  function stringFromAirtableValue(v) {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'Yes' : '';
    if (Array.isArray(v)) {
      if (!v.length) return '';
      if (typeof v[0] === 'object' && v[0] && v[0].url != null) {
        return v
          .map((a) => (a && a.url ? String(a.url) : ''))
          .filter(Boolean)
          .join(', ');
      }
      const parts = v.map((x) => {
        if (x == null) return '';
        if (typeof x === 'string' || typeof x === 'number') return String(x);
        if (typeof x === 'object' && x.name != null) return String(x.name);
        if (typeof x === 'object' && x.id != null && x.name == null) return '';
        try {
          return String(x);
        } catch {
          return '';
        }
      });
      return parts.filter(Boolean).join(', ');
    }
    if (typeof v === 'object') {
      if (v.name != null) return String(v.name);
      if (v.email != null) return String(v.email);
      if (v.value != null) return String(v.value);
      if (v.state != null) return String(v.state);
    }
    try {
      return String(v);
    } catch {
      return '';
    }
  }

  function cellValue(record, fieldName) {
    if (!record.fields) return '';
    const fn = fieldName != null ? String(fieldName).trim() : '';
    if (!fn) return '';
    return stringFromAirtableValue(record.fields[fn]).trim();
  }

  /** First non-empty field on this row whose name matches any regex (keys sorted for stable picks). */
  function firstFieldByRegex(record, regexList, skipNormalizedNames) {
    const skip = skipNormalizedNames || new Set();
    const fields = record.fields || {};
    const keys = Object.keys(fields).sort(function (a, b) {
      return a.localeCompare(b);
    });
    for (let r = 0; r < regexList.length; r++) {
      const re = regexList[r];
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (skip.has(norm(k))) continue;
        if (!re.test(k)) continue;
        const s = stringFromAirtableValue(fields[k]).trim();
        if (s) return s;
      }
    }
    return '';
  }

  function orderedUniqueFieldKeys(keys) {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!k) continue;
      const nk = norm(k);
      if (seen.has(nk)) continue;
      seen.add(nk);
      out.push(k);
    }
    return out;
  }

  function resolveName(record, cfg) {
    const f = cfg.fields || {};
    const hints = cfg._schemaHints;
    const tryKeys = orderedUniqueFieldKeys(
      [hints && hints.primaryFieldName, f.name].filter(Boolean)
    );
    for (let i = 0; i < tryKeys.length; i++) {
      const v = cellValue(record, tryKeys[i]);
      if (v) return v;
    }
    const skip = new Set();
    if (hints && hints.primaryFieldName) skip.add(norm(hints.primaryFieldName));
    if (f.name) skip.add(norm(f.name));
    if (f.description) skip.add(norm(f.description));
    const fb = firstFieldByRegex(
      record,
      [
        /\binitiative\s*name\b/i,
        /^initiative(\b|[\s_-])/i,
        /^title$/i,
        /^project(\b|[\s_-])/i,
        /^program$/i,
        /^name$/i,
      ],
      skip
    );
    return fb || 'Untitled';
  }

  function resolveStatusDisplay(record, cfg) {
    const f = cfg.fields || {};
    const hints = cfg._schemaHints;
    const tryKeys = orderedUniqueFieldKeys([hints && hints.statusField, f.status].filter(Boolean));
    for (let i = 0; i < tryKeys.length; i++) {
      const v = cellValue(record, tryKeys[i]);
      if (v) return v;
    }
    const skip = new Set();
    if (hints && hints.statusField) skip.add(norm(hints.statusField));
    if (f.status) skip.add(norm(f.status));
    return firstFieldByRegex(
      record,
      [
        /^status$/i,
        /\bstatus\b/i,
        /^phase$/i,
        /workflow/i,
        /\bstage\b/i,
        /^state$/i,
        /\bhealth\b/i,
        /\bprogress\b/i,
        /\broadmap\b/i,
        /\bmilestone\b/i,
        /\bgate\b/i,
        /\bdelivery\b/i,
      ],
      skip
    );
  }

  function resolveOrgRaw(record, cfg) {
    const f = cfg.fields || {};
    const hints = cfg._schemaHints;
    const tryKeys = orderedUniqueFieldKeys([hints && hints.orgField, f.org].filter(Boolean));
    for (let i = 0; i < tryKeys.length; i++) {
      const v = cellValue(record, tryKeys[i]);
      if (v) return v;
    }
    const skip = new Set();
    if (hints && hints.orgField) skip.add(norm(hints.orgField));
    if (f.org) skip.add(norm(f.org));
    return firstFieldByRegex(
      record,
      [
        /^org(s)?$/i,
        /\borg\b/i,
        /^team$/i,
        /\bteams\b/i,
        /\bpillar\b/i,
        /\bdivision\b/i,
        /business\s*unit/i,
        /^bu$/i,
        /owning/i,
        /\borgani[sz]ation\b/i,
        /\bworkstream\b/i,
        /\bportfolio\b/i,
        /\bfunction\b/i,
        /\bstakeholder\b/i,
      ],
      skip
    );
  }

  function fieldFillCount(records, fieldKey) {
    if (!fieldKey) return 0;
    let n = 0;
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (rec && rec.fields && stringFromAirtableValue(rec.fields[fieldKey]).trim()) n++;
    }
    return n;
  }

  function bestKeyByFill(records, candidateKeys) {
    let best = '';
    let bestScore = 0;
    for (let i = 0; i < candidateKeys.length; i++) {
      const k = candidateKeys[i];
      const sc = fieldFillCount(records, k);
      if (sc > bestScore) {
        bestScore = sc;
        best = k;
      }
    }
    return bestScore > 0 ? best : '';
  }

  /** Column names that usually carry workflow / delivery status (not “last modified”). */
  function isLikelyStatusColumnName(fieldName) {
    const n = String(fieldName || '');
    if (!n) return false;
    if (/\b(last\s*modified|created\s*time|updated\s*at|modified\s*on|attachment|autonumber|record\s*id)\b/i.test(n))
      return false;
    return (
      /\b(status|phase|stage|state|workflow|progress|roadmap|delivery|health|maturity|gate|milestone|tracker|timeline)\b/i.test(
        n
      ) ||
      /\b(ryg|rag|done|complete|blocked|hold|parked)\b/i.test(n) ||
      /^(curr(ent)?|pct|percent)\b/i.test(n)
    );
  }

  /** Column names that usually carry org / team / pillar (not “country” alone). */
  function isLikelyOrgColumnName(fieldName) {
    const n = String(fieldName || '');
    if (!n) return false;
    if (/\b(country|nation|postal|zip\s*code|latitude|longitude|email\s*address|phone)\b/i.test(n) && !/\b(team|org)\b/i.test(n))
      return false;
    return (
      /\b(org|orgs|organization|organisation|team|teams|pillar|division|group|squad|stream|workstream|portfolio|lob|chapter|stakeholder|business\s*unit|tiso|domain|function)\b/i.test(
        n
      ) ||
      /^bu$/i.test(n) ||
      /\b(rto|dric|owner|owners|lead|dl\b|dept|department)\b/i.test(n) ||
      /\b(oz|iai|mle|dsx|finance|research|tns)\b/i.test(n)
    );
  }

  function norm(s) {
    return String(s || '')
      .trim()
      .toLowerCase();
  }

  /** Q4 board order (slug keys after mapping). */
  const ORG_ORDER = ['oz', 'tns-us', 'iai', 'dsx', 'finance', 'mle', 'research'];
  const ORG_META = {
    oz: { cls: 'org-oz', label: 'OZ (TnS IL)' },
    'tns-us': { cls: 'org-tns-us', label: 'TnS US' },
    iai: { cls: 'org-iai', label: 'IAI' },
    dsx: { cls: 'org-dsx', label: 'DSX/TISO AI' },
    finance: { cls: 'org-finance', label: 'Finance' },
    mle: { cls: 'org-mle', label: 'MLE' },
    research: { cls: 'org-research', label: 'Research' },
    unknown: { cls: 'org-unknown', label: 'Unassigned' },
  };

  function orgToSlug(raw, orgSlugMap) {
    const key = norm(raw);
    if (!key) return '';
    if (key === 'tns il') return 'oz';
    const map = orgSlugMap || {};
    if (map[key]) return map[key];
    for (const k of Object.keys(map)) {
      if (norm(k) === key) return map[k];
    }
    return key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
  }

  /** Normalized status string from parseRow (lowercased display) — used by filters & stats. */
  function rowStatusInProgressBucket(s) {
    const t = norm(s);
    if (!t) return false;
    if (t.includes('not started') || t.includes('planned') || t === 'backlog') return false;
    return (
      t.includes('track') ||
      t.includes('progress') ||
      t.includes('complete') ||
      t === 'done' ||
      t.includes('active') ||
      t.includes('ongoing') ||
      t.includes('ship') ||
      t.includes('live')
    );
  }

  function rowStatusNotStartedBucket(s) {
    const t = norm(s);
    return t.includes('not started') || t.includes('planned') || t === 'backlog';
  }

  /** Status pill text matches Q4: raw Airtable label when present. */
  function statusTagHtml(it) {
    const disp = String(it.statusDisplay || '').trim();
    if (!disp) {
      return '<span class="tag tag-status-unknown">Unknown</span>';
    }
    const low = disp.toLowerCase();
    if (low.includes('not started') || low.includes('not-started') || low === 'planned' || low === 'backlog') {
      return '<span class="tag tag-status-not-started">' + escapeHtml(disp) + '</span>';
    }
    if (
      low.includes('track') ||
      low.includes('progress') ||
      low.includes('complete') ||
      low === 'done' ||
      low.includes('active') ||
      low.includes('ongoing') ||
      low.includes('ship') ||
      low.includes('live')
    ) {
      return '<span class="tag tag-status-in-progress">' + escapeHtml(disp) + '</span>';
    }
    return '<span class="tag tag-status-unknown">' + escapeHtml(disp) + '</span>';
  }

  function priorityTagHtml(priority) {
    const p = String(priority || '').trim().toUpperCase();
    if (!p) return '';
    const cls = { P0: 'tag-p0', P1: 'tag-p1', P2: 'tag-p2' }[p] || 'tag-source';
    return '<span class="tag ' + cls + '">' + escapeHtml(p) + '</span>';
  }

  function impactTagHtml(impact) {
    const i = norm(impact);
    if (!i) return '';
    const cls = { high: 'tag-impact-high', medium: 'tag-impact-medium', low: 'tag-impact-low' }[i] || '';
    const label = i.charAt(0).toUpperCase() + i.slice(1) + ' impact';
    return cls ? '<span class="tag ' + cls + '">' + escapeHtml(label) + '</span>' : '';
  }

  function parseRow(record, cfg) {
    const f = cfg.fields || {};
    const rk = cfg._resolvedKeys || {};
    const name = (rk.name && cellValue(record, rk.name)) || resolveName(record, cfg);
    const desc = (rk.description && cellValue(record, rk.description)) || cellValue(record, f.description);
    let statusDisplay = '';
    if (rk.status) statusDisplay = String(cellValue(record, rk.status) || '').trim();
    if (!statusDisplay) statusDisplay = String(resolveStatusDisplay(record, cfg) || '').trim();
    const status = norm(statusDisplay) || 'unknown';
    const priority = (rk.priority && cellValue(record, rk.priority)) || cellValue(record, f.priority);
    const impact = (rk.impact && cellValue(record, rk.impact)) || cellValue(record, f.impact);
    let orgRaw = '';
    if (rk.org) orgRaw = String(cellValue(record, rk.org) || '').trim();
    if (!orgRaw) orgRaw = String(resolveOrgRaw(record, cfg) || '').trim();
    const orgSlug = orgToSlug(orgRaw, cfg.orgSlugMap);
    let isNew = false;
    const isNewField = (rk.isNew && String(rk.isNew).trim()) || f.isNew;
    if (isNewField && record.fields[isNewField] != null) {
      const v = record.fields[isNewField];
      if (v === true || v === 'true' || norm(v) === 'yes' || norm(v) === 'new')
        isNew = true;
      if (typeof v === 'object' && v.name && /^(yes|new|true)$/i.test(String(v.name))) isNew = true;
    }
    const created = record.createdTime ? new Date(record.createdTime) : null;
    return {
      id: record.id,
      name,
      desc,
      status,
      statusDisplay,
      priority: String(priority || '').trim(),
      impact: norm(impact),
      orgSlug,
      orgLabel: orgRaw || orgSlug,
      source: 'Airtable',
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

  async function fetchSampleRecords(cfg, maxRecords) {
    const table = encodeURIComponent(cfg.tableName.trim());
    const base = cfg.baseId.trim();
    const n = Math.min(Math.max(1, maxRecords || 8), 30);
    let url = `https://api.airtable.com/v0/${base}/${table}?maxRecords=${n}`;
    if (cfg.viewName) url += `&view=${encodeURIComponent(cfg.viewName)}`;
    const token = normalizeToken(cfg.airtablePat);
    if (!token) throw new Error('Missing token');
    const res = await fetch(url, { method: 'GET', mode: 'cors', headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || res.statusText || String(res.status));
    }
    const data = await res.json();
    return data.records || [];
  }

  /**
   * Uses Airtable Metadata API so we always know the table primary field and likely Status / Org columns.
   * Requires PAT scope: schema.bases:read. Returns null if unavailable (missing scope, CORS, or wrong base).
   */
  async function fetchTableSchemaHints(cfg) {
    const token = normalizeToken(cfg.airtablePat);
    const baseId = String(cfg.baseId || '').trim();
    const tableKey = String(cfg.tableName || '').trim();
    if (!token || !baseId || !tableKey) return null;
    try {
      const res = await fetch('https://api.airtable.com/v0/meta/bases/' + encodeURIComponent(baseId) + '/tables', {
        method: 'GET',
        mode: 'cors',
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const tables = data.tables || [];
      const t = findTableDefinition(tables, tableKey);
      if (!t || !Array.isArray(t.fields)) return null;
      const fields = t.fields;
      const primaryField = fields.find(function (fld) {
        return fld.id === t.primaryFieldId;
      });
      const primaryFieldName = primaryField && primaryField.name ? String(primaryField.name) : '';

      const statusTypes = ['singleSelect', 'singleLineText', 'multilineText', 'formula', 'rollup'];
      const orgTypes = statusTypes.concat(['multipleSelects', 'multipleRecordLinks']);

      const statusField = pickSchemaFieldByName(fields, function (n) {
        return isLikelyStatusColumnName(n);
      }, statusTypes);

      const orgField = pickSchemaFieldByName(fields, function (n) {
        return isLikelyOrgColumnName(n);
      }, orgTypes);

      return {
        primaryFieldName: primaryFieldName,
        statusField: statusField,
        orgField: orgField,
      };
    } catch (e) {
      return null;
    }
  }

  function findTableDefinition(tables, tableNameOrId) {
    const raw = String(tableNameOrId || '').trim();
    if (!raw) return null;
    if (/^tbl/i.test(raw) && raw.length >= 14) {
      const byId = tables.find(function (t) {
        return t.id === raw;
      });
      if (byId) return byId;
    }
    const want = norm(raw);
    const exact =
      tables.find(function (t) {
        return norm(t.name) === want;
      }) || null;
    if (exact) return exact;
    return (
      tables.find(function (t) {
        const n = norm(t.name);
        return want.length >= 4 && (n.indexOf(want) !== -1 || want.indexOf(n) !== -1);
      }) || null
    );
  }

  function pickSchemaFieldByName(fields, namePredicate, preferredTypes) {
    const types = preferredTypes || [];
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < fields.length; i++) {
        const fld = fields[i];
        const n = fld.name != null ? String(fld.name) : '';
        if (!n || !namePredicate(n)) continue;
        if (pass === 0 && types.length && types.indexOf(fld.type) === -1) continue;
        return n;
      }
    }
    return '';
  }

  function collectFieldKeys(records) {
    const s = new Set();
    records.forEach((r) => {
      Object.keys(r.fields || {}).forEach((k) => s.add(k));
    });
    return [...s];
  }

  /** Pick Status / Org columns by highest fill among schema + Setup + name-like headers (per load). */
  function inferStatusOrgColumnsFromRecords(records, cfg) {
    if (!records || !records.length) return { statusField: '', orgField: '' };
    const schemaHints = cfg._schemaHints || {};
    const f = cfg.fields || {};
    const keys = collectFieldKeys(records);
    const exclude = new Set();
    [schemaHints.primaryFieldName, f.name, f.description].forEach(function (x) {
      if (x) exclude.add(norm(x));
    });

    const statusCand = keys
      .filter(function (k) {
        return !exclude.has(norm(k)) && isLikelyStatusColumnName(k);
      })
      .sort(function (a, b) {
        return a.localeCompare(b);
      });

    const orgCand = keys
      .filter(function (k) {
        return !exclude.has(norm(k)) && isLikelyOrgColumnName(k);
      })
      .sort(function (a, b) {
        return a.localeCompare(b);
      });

    const statusKeys = orderedUniqueFieldKeys([f.status, schemaHints.statusField].concat(statusCand));
    const orgKeys = orderedUniqueFieldKeys([f.org, schemaHints.orgField].concat(orgCand));

    return {
      statusField: bestKeyByFill(records, statusKeys),
      orgField: bestKeyByFill(records, orgKeys),
    };
  }

  /** Map configured / schema label to the exact `fields` key returned by Airtable (case + spacing). */
  function canonicalKeyInRecords(records, label) {
    if (!records || !records.length || label == null || String(label).trim() === '') return '';
    const keys = collectFieldKeys(records);
    const t = String(label).trim();
    if (keys.indexOf(t) !== -1) return t;
    const nt = norm(t);
    for (let i = 0; i < keys.length; i++) {
      if (norm(keys[i]) === nt) return keys[i];
    }
    return t;
  }

  function buildExcludeNormSet(cfg) {
    const ex = new Set();
    const h = cfg._schemaHints || {};
    const f = cfg.fields || {};
    [h.primaryFieldName, f.name, f.description].forEach(function (x) {
      if (x) ex.add(norm(String(x).trim()));
    });
    return ex;
  }

  function columnMostlyBareLinkedRecordIds(records, fieldKey) {
    if (!fieldKey || !records.length) return false;
    let bare = 0;
    let total = 0;
    for (let i = 0; i < records.length; i++) {
      const raw = records[i].fields[fieldKey];
      if (raw == null || raw === '') continue;
      total++;
      if (Array.isArray(raw)) {
        if (
          raw.length &&
          typeof raw[0] === 'object' &&
          raw[0] &&
          raw[0].id != null &&
          raw[0].name == null
        )
          bare++;
        else if (raw.every(function (x) {
          return typeof x === 'string' && /^rec[a-z0-9]{10,}$/i.test(x);
        }))
          bare++;
      } else if (typeof raw === 'string' && /^rec[a-z0-9]{10,}$/i.test(raw)) bare++;
    }
    return total > 0 && bare / total >= 0.55;
  }

  function isPriorityOnlyColumn(records, fieldKey) {
    const uniq = new Set();
    for (let i = 0; i < records.length; i++) {
      const s = norm(cellValue(records[i], fieldKey));
      if (s) uniq.add(s);
    }
    if (uniq.size === 0 || uniq.size > 8) return false;
    const arr = Array.from(uniq);
    return arr.every(function (s) {
      return /^(p[0-4]|tbd|n\/?a|—|-|none|na)$/i.test(s);
    });
  }

  function isJunkFieldNameForValueInfer(k) {
    return /\b(description|notes|details|summary|comment|attachment|attachments|url|link|photo|image|body|markdown|rich\s*text|json|formula\s*debug)\b/i.test(
      k
    );
  }

  /** When headers do not match heuristics, pick a “select-like” column for status. */
  function inferStatusColumnByValueShape(records, excludeNorm) {
    const keys = collectFieldKeys(records);
    let best = '';
    let bestScore = -1;
    const n = records.length;
    const minRows = n <= 8 ? 1 : Math.max(2, Math.floor(n * 0.1));
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (excludeNorm.has(norm(k)) || isJunkFieldNameForValueInfer(k)) continue;
      if (columnMostlyBareLinkedRecordIds(records, k)) continue;
      if (isPriorityOnlyColumn(records, k)) continue;
      let nonEmpty = 0;
      const uniq = new Set();
      let maxLen = 0;
      for (let j = 0; j < records.length; j++) {
        const s = cellValue(records[j], k);
        if (!s) continue;
        nonEmpty++;
        uniq.add(norm(s));
        if (s.length > maxLen) maxLen = s.length;
      }
      if (nonEmpty < minRows) continue;
      const u = uniq.size;
      if (u < 2 || u > 48) continue;
      if (maxLen > 72) continue;
      const score = nonEmpty * 2 + Math.min(u, 14) * 4 - (maxLen > 36 ? 8 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    }
    return best;
  }

  /** Pick a medium-cardinality text column for org / team when headers are nonstandard. */
  function inferOrgColumnByValueShape(records, excludeNorm, alsoExcludeKey) {
    const keys = collectFieldKeys(records);
    let best = '';
    let bestScore = -1;
    const n = records.length;
    const minRows = n <= 8 ? 1 : Math.max(2, Math.floor(n * 0.08));
    const skip2 = alsoExcludeKey ? norm(alsoExcludeKey) : '';
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const nk = norm(k);
      if (excludeNorm.has(nk) || (skip2 && nk === skip2) || isJunkFieldNameForValueInfer(k)) continue;
      if (columnMostlyBareLinkedRecordIds(records, k)) continue;
      if (isPriorityOnlyColumn(records, k)) continue;
      let nonEmpty = 0;
      const uniq = new Set();
      let maxLen = 0;
      for (let j = 0; j < records.length; j++) {
        const s = cellValue(records[j], k);
        if (!s) continue;
        nonEmpty++;
        uniq.add(norm(s));
        if (s.length > maxLen) maxLen = s.length;
      }
      if (nonEmpty < minRows) continue;
      const u = uniq.size;
      if (u < 2 || u > 85) continue;
      if (maxLen > 140) continue;
      const score = nonEmpty * 2 + Math.min(u, 40) * 2;
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    }
    return best;
  }

  /** Final per-load keys used for reads (canonical + value-fallback when fill is low). */
  function buildResolvedFieldKeys(records, cfg) {
    const f = cfg.fields || {};
    const h = cfg._schemaHints || {};
    const exclude = buildExcludeNormSet(cfg);
    const nrec = records.length;
    const minFill = nrec <= 8 ? 1 : Math.max(2, Math.floor(nrec * 0.1));

    let statusKey = canonicalKeyInRecords(records, h.statusField || f.status);
    if (!statusKey || fieldFillCount(records, statusKey) < minFill) {
      const vb = inferStatusColumnByValueShape(records, exclude);
      if (vb) statusKey = vb;
    }

    let orgKey = canonicalKeyInRecords(records, h.orgField || f.org);
    if (!orgKey || fieldFillCount(records, orgKey) < minFill) {
      const ex2 = new Set(exclude);
      if (statusKey) ex2.add(norm(statusKey));
      const vo = inferOrgColumnByValueShape(records, ex2, statusKey);
      if (vo) orgKey = vo;
    }

    return {
      name: canonicalKeyInRecords(records, h.primaryFieldName || f.name) || String(f.name || '').trim(),
      description: canonicalKeyInRecords(records, f.description) || String(f.description || '').trim(),
      status: statusKey,
      org: orgKey,
      priority: canonicalKeyInRecords(records, f.priority) || String(f.priority || '').trim(),
      impact: canonicalKeyInRecords(records, f.impact) || String(f.impact || '').trim(),
      isNew: (function () {
        const raw = f.isNew != null ? String(f.isNew).trim() : '';
        return raw ? canonicalKeyInRecords(records, raw) : '';
      })(),
    };
  }

  function pickKey(keys, patterns) {
    for (const re of patterns) {
      const hit = keys.find((k) => re.test(k));
      if (hit) return hit;
    }
    return '';
  }

  /** Best-effort map from real Airtable field names (keys in API). */
  function guessFieldMappingFromRecords(records) {
    if (!records.length) return null;
    const keys = collectFieldKeys(records);
    if (!keys.length) return null;
    const sample = records[0];

    const nameCandidates = keys.filter((k) =>
      /\b(name|title|initiative|project|program)\b/i.test(k)
    );
    const name =
      bestKeyByFill(records, nameCandidates) ||
      pickKey(keys, [/^name$/i, /^title$/i, /^initiative$/i, /initiative\s*name/i, /^program$/i, /^project$/i]) ||
      keys.find((k) => {
        const v = sample.fields[k];
        return typeof v === 'string' && v.length > 0 && v.length < 200 && String(v).indexOf('\n') === -1;
      }) ||
      keys[0];

    const description =
      pickKey(keys, [/^description$/i, /^details$/i, /^summary$/i, /^notes$/i, /overview/i, /narrative/i]) ||
      (() => {
        let best = '';
        let len = 0;
        keys.forEach((k) => {
          if (k === name) return;
          const v = sample.fields[k];
          if (typeof v === 'string' && v.length > len) {
            len = v.length;
            best = k;
          }
        });
        return len > 60 ? best : '';
      })();

    const statusCandidates = keys.filter((k) => isLikelyStatusColumnName(k));
    const status =
      bestKeyByFill(records, statusCandidates) ||
      pickKey(keys, [/^status$/i, /^phase$/i, /^state$/i, /workflow/i, /stage$/i]);

    const priority = pickKey(keys, [/^priority$/i, /^prio$/i]);
    const impact = pickKey(keys, [/^impact$/i, /^severity$/i]);

    const orgCandidates = keys.filter((k) => isLikelyOrgColumnName(k));
    const org =
      bestKeyByFill(records, orgCandidates) ||
      pickKey(keys, [/^org$/i, /^team$/i, /owning/i, /business\s*unit/i, /^pillar$/i, /division/i]);

    let isNew = pickKey(keys, [/^new$/i, /^is\s*new$/i, /new\s*initiative/i]);
    if (!isNew) {
      const boolKey = keys.find((k) => {
        const v = sample.fields[k];
        return v === true || v === false;
      });
      if (boolKey) isNew = boolKey;
    }

    return {
      name: name || DEFAULT_FIELDS.name,
      description: description || DEFAULT_FIELDS.description,
      status: status || DEFAULT_FIELDS.status,
      priority: priority || DEFAULT_FIELDS.priority,
      impact: impact || DEFAULT_FIELDS.impact,
      org: org || DEFAULT_FIELDS.org,
      isNew: isNew || DEFAULT_FIELDS.isNew,
    };
  }

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
        const dataName = escapeHtml(norm(it.name));
        const badges = [statusTagHtml(it), priorityTagHtml(it.priority), impactTagHtml(it.impact)]
          .filter(Boolean)
          .join('');
        const sourceLabel = escapeHtml(it.source || 'Airtable');
        const descBlock = it.desc
          ? `<div class="card-desc">${escapeHtml(it.desc)}</div>`
          : '';
        return `<div class="card" data-name="${dataName}" data-status="${escapeHtml(it.status)}" data-priority="${escapeHtml(
          it.priority
        )}" data-impact="${escapeHtml(it.impact)}">
        <div class="card-title">${escapeHtml(it.name)}</div>
        ${descBlock}
        <div class="card-footer">
          <div class="card-badges">${badges}</div>
          <span class="card-source">${sourceLabel}</span>
        </div>
      </div>`;
      })
      .join('');
  }

  function slugSectionLabel(slug) {
    return String(slug || '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function renderMain(rows, cfg) {
    const parsed = rows.map((r) => parseRow(r, cfg));
    const byOrg = {};
    parsed.forEach((it) => {
      const slug = it.orgSlug || 'unknown';
      if (!byOrg[slug]) byOrg[slug] = [];
      byOrg[slug].push(it);
    });
    const extraRaw = Object.keys(byOrg).filter(function (k) {
      return ORG_ORDER.indexOf(k) === -1;
    });
    const rest = extraRaw
      .filter(function (k) {
        return k !== 'unknown';
      })
      .sort();
    const orderedSlugs = ORG_ORDER.concat(rest);
    if (extraRaw.indexOf('unknown') !== -1) orderedSlugs.push('unknown');

    let html = '';
    orderedSlugs.forEach((slug) => {
      const items = byOrg[slug];
      if (!items || !items.length) return;
      const meta = ORG_META[slug] || { cls: 'org-unknown', label: slugSectionLabel(slug) };
      const countLabel = `${items.length} initiative${items.length === 1 ? '' : 's'}`;
      html += `<div class="org-section ${meta.cls}" data-org="${escapeHtml(slug)}">
        <h2>
          ${escapeHtml(meta.label)}
          <span class="count">${countLabel}</span>
        </h2>
        <div class="cards">${renderCards(items)}</div>
      </div>`;
    });

    html += `<p class="empty hidden" id="no-results" style="padding:24px 0;text-align:center">No initiatives match your filters.</p>`;

    return html;
  }

  function computeStats(parsed) {
    const total = parsed.length;
    const onTrack = parsed.filter((p) => rowStatusInProgressBucket(p.status)).length;
    const notStarted = parsed.filter((p) => rowStatusNotStartedBucket(p.status)).length;
    const p0 = parsed.filter((p) => String(p.priority).toUpperCase() === 'P0').length;
    const high = parsed.filter((p) => p.impact === 'high').length;
    const activeOrgs = ORG_ORDER.filter((slug) => parsed.some((p) => p.orgSlug === slug)).length;
    return { total, onTrack, notStarted, p0, high, activeOrgs };
  }

  function updateStats(parsed) {
    const s = computeStats(parsed);
    const setNum = (id, val, color) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = String(val);
      if (color) el.style.color = color;
      else el.style.removeProperty('color');
    };
    setNum('total-count', s.total, '#0969da');
    setNum('stat-inprog', s.onTrack, '#065f46');
    setNum('stat-notstarted', s.notStarted, '#6c757d');
    setNum('stat-p0', s.p0, '#dc2626');
    setNum('stat-high', s.high, '#15803d');
    setNum('stat-orgs', s.activeOrgs, '#0969da');
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
      <p style="margin-top:12px;font-size:13px;color:#7f1d1d;">Check Personal Access Token scopes (<strong>data.records:read</strong> required; add <strong>schema.bases:read</strong> so the dashboard can read your table’s primary field and column names automatically). Check base id and table name. Open setup below if you need to change credentials.</p>
      <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px;">
        <button type="button" class="reset-btn" onclick="window.__openDashboardSetup()">Open setup</button>
        <button type="button" class="reset-btn" onclick="window.__clearDashboardConnection()">Clear saved connection &amp; reload</button>
      </div>
    </div>`;
  }

  let refreshTimer = null;
  let lastParsed = [];

  async function refresh() {
    const cfg = Object.assign({}, loadMergedConfig());
    if (!cfg.airtablePat || !cfg.baseId || !cfg.tableName) {
      setError('Missing Airtable configuration. Use Setup to add your token and base id.');
      return;
    }
    setLoading('Loading from Airtable…');
    try {
      const schemaHints = (await fetchTableSchemaHints(cfg)) || {};
      cfg._schemaHints = schemaHints;
      const records = await fetchAllRecords(cfg);
      const inferred = inferStatusOrgColumnsFromRecords(records, cfg);
      if (inferred.statusField) cfg._schemaHints.statusField = inferred.statusField;
      if (inferred.orgField) cfg._schemaHints.orgField = inferred.orgField;
      cfg._resolvedKeys = buildResolvedFieldKeys(records, cfg);
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

  function loadTokenExampleDoc() {
    const el = document.getElementById('token-help-panel');
    if (!el) return;
    fetch('token.example.txt', { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        el.textContent = text;
      })
      .catch(() => {
        el.textContent =
          '# How to use a local token file (optional)\n#\n# (Could not load token.example.txt from this site.)\n# It should live next to index.html on GitHub Pages.';
      });
  }

  function injectSetupModal() {
    if (document.getElementById('setup-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'setup-overlay';
    overlay.className = 'hidden';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = `<div class="setup-card-doc" style="background:#fafafa;border:1px solid #d0d7de;border-radius:10px;max-width:520px;width:100%;max-height:min(92vh,900px);overflow-y:auto;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,0.2);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">
      <h2 style="font-size:14px;margin-bottom:4px;color:#24292f;font-weight:700;letter-spacing:0.02em;"># Airtable connection</h2>
      <p class="setup-note" style="margin-bottom:14px;"># Values are stored only in this browser (localStorage). For a public GitHub repo, do not commit tokens in config.js</p>
      <label style="display:block;font-size:11px;font-weight:700;color:#24292f;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Personal Access Token</label>
      <p class="setup-note" style="margin:-2px 0 6px;"># Plain text field — paste full pat… secret. Leave blank + save to keep existing token when editing base/table only.</p>
      <input id="setup-pat" type="text" spellcheck="false" autocapitalize="off" autocomplete="off" style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;" placeholder="pat… (paste full token)" />
      <label style="display:block;font-size:11px;font-weight:700;color:#24292f;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Base ID</label>
      <input id="setup-base" type="text" style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:13px;" placeholder="appXXXXXXXXXXXXXX" />
      <label style="display:block;font-size:11px;font-weight:700;color:#24292f;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">Table name</label>
      <input id="setup-table" type="text" style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:13px;" />
      <div style="margin-bottom:14px;padding:12px;background:#fff;border:1px solid #d0d7de;border-radius:8px;">
        <h3 style="font-size:12px;font-weight:700;color:#24292f;margin:0 0 6px;letter-spacing:0.03em;"># Airtable column names</h3>
        <p class="setup-note" style="margin:0 0 8px;"># If cards show Untitled / Status TBD: type each grid header from Airtable exactly. Blank row = use default in parentheses.</p>
        <button type="button" id="setup-autodetect" class="reset-btn" style="margin-bottom:10px;font-size:12px;font-weight:600;">Auto-detect from Airtable</button>
        <p class="setup-note" style="margin:-4px 0 8px;font-size:10px;"># Auto-detect: uses token + base + table (+ view) to sample rows. Review fields, then Save &amp; load.</p>
        <div style="display:grid;gap:8px;">
          <label style="font-size:11px;font-weight:600;color:#475569;">Title / name <span style="font-weight:400;color:#94a3b8">(default: Name)</span><input id="setup-f-name" type="text" class="setup-f-in" style="width:100%;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;" /></label>
          <label style="font-size:11px;font-weight:600;color:#475569;">Description <span style="font-weight:400;color:#94a3b8">(Description)</span><input id="setup-f-description" type="text" class="setup-f-in" style="width:100%;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;" /></label>
          <label style="font-size:11px;font-weight:600;color:#475569;">Status <span style="font-weight:400;color:#94a3b8">(Status)</span><input id="setup-f-status" type="text" class="setup-f-in" style="width:100%;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;" /></label>
          <label style="font-size:11px;font-weight:600;color:#475569;">Priority <span style="font-weight:400;color:#94a3b8">(Priority)</span><input id="setup-f-priority" type="text" class="setup-f-in" style="width:100%;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;" /></label>
          <label style="font-size:11px;font-weight:600;color:#475569;">Impact <span style="font-weight:400;color:#94a3b8">(Impact)</span><input id="setup-f-impact" type="text" class="setup-f-in" style="width:100%;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;" /></label>
          <label style="font-size:11px;font-weight:600;color:#475569;">Org / team <span style="font-weight:400;color:#94a3b8">(Org)</span><input id="setup-f-org" type="text" class="setup-f-in" style="width:100%;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;" /></label>
          <label style="font-size:11px;font-weight:600;color:#475569;">New flag (checkbox) <span style="font-weight:400;color:#94a3b8">(New)</span><input id="setup-f-isNew" type="text" class="setup-f-in" style="width:100%;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;" /></label>
        </div>
      </div>
      <label style="display:block;font-size:11px;font-weight:700;color:#24292f;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">View (optional)</label>
      <input id="setup-view" type="text" style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:13px;" />
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
    document.getElementById('setup-autodetect').addEventListener('click', async () => {
      const btn = document.getElementById('setup-autodetect');
      const pat =
        normalizeToken(document.getElementById('setup-pat').value) || loadMergedConfig().airtablePat;
      const baseId = document.getElementById('setup-base').value.trim();
      const tableName = document.getElementById('setup-table').value.trim() || 'Initiatives';
      const viewName = document.getElementById('setup-view').value.trim();
      if (!pat || !baseId) {
        window.alert('Fill in Personal Access Token and Base ID first (or save a token once, then open Setup again).');
        return;
      }
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = 'Detecting…';
      try {
        const tmpCfg = Object.assign({}, loadMergedConfig(), {
          airtablePat: pat,
          baseId: baseId,
          tableName: tableName,
          viewName: viewName,
        });
        const schemaHints = (await fetchTableSchemaHints(tmpCfg)) || {};
        tmpCfg._schemaHints = schemaHints;
        const records = await fetchSampleRecords(tmpCfg, 30);
        const guessed = guessFieldMappingFromRecords(records);
        if (!guessed) {
          window.alert('No fields found in sample rows. Check table name and view.');
          return;
        }
        if (schemaHints.primaryFieldName) guessed.name = schemaHints.primaryFieldName;
        tmpCfg.fields = Object.assign({}, DEFAULT_FIELDS, guessed);
        const inferred = inferStatusOrgColumnsFromRecords(records, tmpCfg);
        if (inferred.statusField) guessed.status = inferred.statusField;
        else if (schemaHints.statusField) guessed.status = schemaHints.statusField;
        if (inferred.orgField) guessed.org = inferred.orgField;
        else if (schemaHints.orgField) guessed.org = schemaHints.orgField;
        document.getElementById('setup-f-name').value = guessed.name;
        document.getElementById('setup-f-description').value = guessed.description;
        document.getElementById('setup-f-status').value = guessed.status;
        document.getElementById('setup-f-priority').value = guessed.priority;
        document.getElementById('setup-f-impact').value = guessed.impact;
        document.getElementById('setup-f-org').value = guessed.org;
        document.getElementById('setup-f-isNew').value = guessed.isNew;
        let msg =
          'Filled best guesses for column names. Review them, adjust if needed, then click Save & load.\n\nGuessed:\n' +
          Object.entries(guessed)
            .map(([k, v]) => k + ' → ' + v)
            .join('\n');
        if (!schemaHints) {
          msg +=
            '\n\nNote: Schema API was not used (add PAT scope schema.bases:read in Airtable → Developer hub → your token → scopes). With that scope, the primary field and Status/Org columns are detected automatically from the base.';
        }
        window.alert(msg);
      } catch (e) {
        window.alert('Could not auto-detect: ' + (e.message || String(e)));
      } finally {
        btn.disabled = false;
        btn.textContent = old;
      }
    });
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

  function getFilterState() {
    const g = (id) => {
      const el = document.getElementById(id);
      return el ? String(el.value) : '';
    };
    return {
      status: g('filterStatus'),
      priority: g('filterPriority'),
      impact: norm(g('filterImpact')),
      search: norm(g('searchBox')),
    };
  }

  function itemMatchesFilters(it, st) {
    if (st.status === 'In progress') {
      if (!rowStatusInProgressBucket(it.status)) return false;
    }
    if (st.status === 'Not started') {
      if (!rowStatusNotStartedBucket(it.status)) return false;
    }
    if (st.priority && String(it.priority).trim() !== st.priority) return false;
    if (st.impact && (it.impact || '') !== st.impact) return false;
    if (st.search && !norm(it.name).includes(st.search)) return false;
    return true;
  }

  function visibleParsed() {
    const st = getFilterState();
    return lastParsed.filter((it) => itemMatchesFilters(it, st));
  }

  window.resetFilters = function resetFilters() {
    const fs = document.getElementById('filterStatus');
    const fp = document.getElementById('filterPriority');
    const fi = document.getElementById('filterImpact');
    const sb = document.getElementById('searchBox');
    if (fs) fs.value = '';
    if (fp) fp.value = '';
    if (fi) fi.value = '';
    if (sb) sb.value = '';
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
    const st = getFilterState();

    document.querySelectorAll('.org-section').forEach((section) => {
      let sectionVisible = 0;
      section.querySelectorAll('.card').forEach((card) => {
        const cardName = card.getAttribute('data-name') || '';
        const cardStatus = (card.getAttribute('data-status') || '').toLowerCase();
        const cardPriority = card.getAttribute('data-priority') || '';
        const cardImpact = (card.getAttribute('data-impact') || '').toLowerCase();

        let show = true;
        if (st.status === 'In progress') {
          if (!rowStatusInProgressBucket(cardStatus)) show = false;
        }
        if (st.status === 'Not started') {
          if (!rowStatusNotStartedBucket(cardStatus)) show = false;
        }
        if (st.priority && cardPriority !== st.priority) show = false;
        if (st.impact && cardImpact !== st.impact) show = false;
        if (st.search && !cardName.includes(st.search)) show = false;

        card.classList.toggle('hidden', !show);
        if (show) sectionVisible++;
      });
      section.classList.toggle('hidden', sectionVisible === 0);
    });

    const vis = visibleParsed();
    const nr = document.getElementById('no-results');
    if (nr) nr.classList.toggle('hidden', vis.length > 0);
    updateStats(vis);
  };

  window.__refreshDashboard = function () {
    ensureRefreshTimer();
    return refresh();
  };

  function init() {
    loadTokenExampleDoc();
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
