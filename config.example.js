/**
 * Copy this file to config.js and fill in your values.
 * config.js is gitignored — do not commit tokens.
 *
 * For GitHub Pages: either ship config.js from a private fork,
 * or leave PAT empty and use the in-page setup (stored in localStorage).
 */
window.DASHBOARD_CONFIG = {
  airtablePat: '',
  baseId: '',
  tableName: 'Initiatives',
  viewName: '',
  /** How often to refetch (ms). */
  refreshMs: 5 * 60 * 1000,
  /** Map Airtable field names (right) to dashboard keys (left). */
  fields: {
    name: 'Name',
    description: 'Description',
    status: 'Status',
    priority: 'Priority',
    impact: 'Impact',
    org: 'Org',
    isNew: 'New',
  },
  /**
   * Map Airtable Org cell values (trimmed, case-insensitive) to section keys.
   * Add or change keys to match your base.
   */
  orgSlugMap: {
    'oz (tns il)': 'oz',
    oz: 'oz',
    'tns il': 'oz',
    'tns us': 'tns-us',
    'tns-us': 'tns-us',
    iai: 'iai',
    'dsx/tiso ai': 'dsx',
    dsx: 'dsx',
    finance: 'finance',
    mle: 'mle',
    research: 'research',
  },
};
