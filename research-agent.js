const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// Files and directories
const APPS_FILE = path.resolve(__dirname, 'apps.json');
const OUT_DIR = path.resolve(__dirname, 'data');
const OUT_FILE = path.join(OUT_DIR, 'raw.json');

// Helper: safe read JSON
function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

// Helper: write JSON atomically
function writeJson(filePath, obj) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// Fetch HTML with timeout and UA
async function fetchHtml(url) {
  const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'composio-research/1.0' } });
  return res.data;
}

// Heuristics to extract fields from page text and meta tags
function collectEvidence(html, baseUrl) {
  // Parse and collect candidate links, prefer official docs, avoid tracking links
  const $ = cheerio.load(html || '');
  const candidates = [];

  $('a[href]').each((i, el) => {
    if (candidates.length >= 10) return; // collect more first, we'll filter later
    let href = $(el).attr('href') || '';
    const text = ($(el).text() || '').trim();
    // normalize
    try {
      if (href.startsWith('/')) href = new URL(href, baseUrl).toString();
      // ignore javascript: links
      if (href.startsWith('javascript:')) return;
    } catch (e) {}

    candidates.push({ url: href, note: text });
  });

  // Filtering: remove tracking/cta links
  const trackingRe = /track|click|encrypt|encryptedPayload|utm_|doubleclick|ga.js|interactives/i;
  const docPrefer = /docs|developer|developers|api|reference|graphql|rest|oauth|auth|sdk|developers.notion|docs.github|stripe.com\/docs/i;

  const filtered = candidates.filter(c => c.url && !trackingRe.test(c.url) && c.url.indexOf('#') !== 0);

  // Prefer official docs: same-host or docs path
  const official = filtered.filter(c => docPrefer.test(c.url) || docPrefer.test(c.note));

  const chosen = (official.length > 0 ? official : filtered).slice(0, 6);

  // Deduplicate and limit to 3
  const seen = new Set();
  const evidence = [];
  for (const c of chosen) {
    try {
      const u = new URL(c.url);
      const host = u.hostname.replace('www.', '');
      const key = host + u.pathname;
      if (seen.has(key)) continue;
      seen.add(key);
      evidence.push({ url: c.url, note: c.note || '' });
      if (evidence.length >= 3) break;
    } catch (e) {
      // if invalid URL, skip
    }
  }

  // If no evidence found, use baseUrl as fallback (but it's low quality)
  if (evidence.length === 0 && baseUrl) evidence.push({ url: baseUrl, note: 'primary docs page' });

  return evidence;
}

// Extract fields primarily from evidence and page html but ensure explainability from evidence
function extractFieldsFromEvidence(html, baseUrl, evidence, appName) {
  // Category mapping is explicit by app name
  const categoryMap = {
    Salesforce: 'CRM',
    HubSpot: 'CRM',
    Slack: 'Communications',
    GitHub: 'Developer Platform',
    Stripe: 'Fintech',
    Notion: 'Productivity'
  };

  const category = categoryMap[appName] || '';

  // Helpers to test presence in evidence URLs/notes or html
  function evidenceHas(re) {
    const rex = new RegExp(re, 'i');
    for (const e of evidence) {
      if (rex.test(e.url) || rex.test(e.note)) return true;
    }
    return rex.test(html || '');
  }

  // Auth detection only if evidence exists
  let authMethod = 'Unknown';
  if (evidence && evidence.length > 0) {
    if (evidenceHas('oauth2|oauth 2|oauth')) authMethod = 'OAuth2';
    else if (evidenceHas('api[-_ ]?key|x-api-key')) authMethod = 'API Key';
    else if (evidenceHas('bearer token|bearer')) authMethod = 'Bearer Token';
    else if (evidenceHas('basic auth|basic authentication')) authMethod = 'Basic Auth';
    else if (evidenceHas('personal access token|pat|personal-access-token')) authMethod = 'PAT';
    else authMethod = 'Unknown';
  }

  // MCP detection: only explicit phrases
  let mcpAvailable = 'Unknown';
  if (/(\bMCP\b|Model Context Protocol)/i.test(html || '')) {
    mcpAvailable = 'Yes';
  } else {
    for (const e of evidence) {
      if (/(\bMCP\b|Model Context Protocol)/i.test(e.url) || /(\bMCP\b|Model Context Protocol)/i.test(e.note)) {
        mcpAvailable = 'Yes';
        break;
      }
    }
  }

  // API surface detection from evidence
  const hasGraphql = evidenceHas('graphql');
  const hasRest = evidenceHas('/rest|/api|\bREST\b|/v[0-9]+/|/api/');
  const hasSdk = evidenceHas('sdk|client library|npm|pip|gem|package');

  let apiSurface = 'Unknown';
  if (hasGraphql && hasRest) apiSurface = 'REST + GraphQL';
  else if (hasGraphql) apiSurface = 'GraphQL';
  else if (hasRest) apiSurface = 'REST';
  else if (hasSdk && !hasGraphql && !hasRest) apiSurface = 'SDK Only';

  // apiBreadth: from evidence (wide if multiple endpoints or SDKs referenced)
  let apiBreadth = '';
  if (evidenceHas('reference|endpoints|resources') && hasSdk) apiBreadth = 'wide';
  else if (evidenceHas('reference|endpoints|resources')) apiBreadth = 'limited';
  else apiBreadth = 'minimal';

  // Buildability verdict: explainable from evidence
  let buildabilityVerdict = 'Unknown';
  if (evidenceHas('quickstart|examples|getting started|sdk|sample')) buildabilityVerdict = 'Easy';
  else if (evidenceHas('authentication|rate limit|quota|limitations')) buildabilityVerdict = 'Moderate';
  else if (evidenceHas('contact sales|request access|partner')) buildabilityVerdict = 'Hard';

  // mainBlocker from evidence
  let mainBlocker = '';
  const blockerMatch = evidence.find(e => /request access|contact sales|apply for access|no public api|private api|partner/i.test(e.url + ' ' + e.note));
  if (blockerMatch) mainBlocker = blockerMatch.note || blockerMatch.url;

  // Description: prefer meta description from evidence URLs content if available
  // For explainability, we'll try to use the first evidence note or title in HTML
  let description = '';
  if (evidence && evidence.length > 0) {
    // use note if present
    for (const e of evidence) {
      if (e.note && e.note.trim()) { description = e.note.trim(); break; }
    }
    // fallback to base page meta description
    if (!description) {
      const $ = cheerio.load(html || '');
      description = ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '').trim();
    }
  }

  return {
    category,
    description: description || '',
    authMethod,
    selfServe: '', // filled later from evidence heuristics
    apiSurface,
    apiBreadth,
    mcpAvailable,
    buildabilityVerdict,
    mainBlocker
  };
}

// Confidence scoring based on evidence quality
function computeConfidence(evidence, fields, html) {
  // Rules:
  // 95: explicit docs evidence (official docs URL with explicit tokens for api/auth)
  // 80: strong docs evidence (official docs URL present)
  // 60: partial evidence (some relevant links)
  // 40: weak inference (fallback)

  const docRe = /docs|developer|developers|reference|api|graphql|rest|oauth|auth|stripe.com\/docs|docs.github.com/i;
  const explicitTokens = /oauth|oauth2|graphql|rest|api key|x-api-key|personal access token|pat|sdk|client library|bearer token/i;

  const hasEvidence = Array.isArray(evidence) && evidence.length > 0;
  if (!hasEvidence) return 40;

  let hasOfficial = false;
  let hasExplicit = false;
  for (const e of evidence) {
    if (docRe.test(e.url) || docRe.test(e.note)) hasOfficial = true;
    if (explicitTokens.test(e.url) || explicitTokens.test(e.note)) hasExplicit = true;
  }

  if (hasOfficial && hasExplicit) return 95;
  if (hasOfficial) return 80;
  if (hasEvidence) return 60;
  return 40;
}

// Main research logic per app -> produces object matching new schema
async function researchApp(app) {
  const base = {
    name: app.name || '',
    website: app.url || '',
    category: '',
    description: '',
    authMethod: '',
    selfServe: '',
    apiSurface: '',
    apiBreadth: '',
    mcpAvailable: '',
    buildabilityVerdict: '',
    mainBlocker: '',
    evidence: [],
    confidence: 0
  };

  if (!app.url) {
    console.error(`Skipping ${app.name}: no URL`);
    return base;
  }

  try {
    console.log(`Visiting ${app.url} for ${app.name}...`);
    const html = await fetchHtml(app.url);

    // Collect evidence and extract fields from evidence
    const evidence = collectEvidence(html, app.url);
    const fields = extractFieldsFromEvidence(html, app.url, evidence, app.name || '');

    // Self-serve determination (explainable from evidence only)
    let selfServe = '';
    if (evidence.length > 0) {
      if (evidence.some(e => /sign up|create an account|get started|free account/i.test(e.url + ' ' + e.note))) selfServe = 'Yes';
      else if (evidence.some(e => /contact sales|partner|apply for|request access/i.test(e.url + ' ' + e.note))) selfServe = 'No';
      else selfServe = 'Partial';
    } else {
      selfServe = 'Unknown';
    }

    const confidence = computeConfidence(evidence, fields, html);

    base.category = fields.category || '';
    base.description = fields.description || '';
    base.authMethod = fields.authMethod || 'Unknown';
    base.selfServe = selfServe;
    base.apiSurface = fields.apiSurface || 'Unknown';
    base.apiBreadth = fields.apiBreadth || '';
    base.mcpAvailable = fields.mcpAvailable || 'Unknown';
    base.buildabilityVerdict = fields.buildabilityVerdict || 'Unknown';
    base.mainBlocker = fields.mainBlocker || '';
    base.evidence = evidence;
    base.confidence = confidence;

    console.log(`Completed research for ${app.name} (confidence ${base.confidence})`);
    return base;
  } catch (err) {
    console.error(`Error researching ${app.name}:`, err.message);
    // return partial base with evidence pointing to website
    base.evidence = [{ url: app.url, note: 'failed to fetch full content' }];
    base.confidence = 20;
    return base;
  }
}

// Process list sequentially and save
async function main() {
  try {
    const apps = readJson(APPS_FILE);
    if (!Array.isArray(apps)) throw new Error('apps.json must contain an array');

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    const results = [];
    for (const app of apps) {
      try {
        console.log(`Researching ${app.name}...`);
        const res = await researchApp(app);
        results.push(res);
      } catch (err) {
        console.error(`Unhandled error on ${app.name}:`, err.message);
        results.push({ name: app.name || '', website: app.url || '', evidence: [{ url: app.url || '', note: 'error' }], confidence: 0 });
      }
      // Persist after each app
      try { writeJson(OUT_FILE, results); } catch (werr) { console.error('Write error:', werr.message); }
    }

    console.log('Research finished. Saved to', OUT_FILE);
  } catch (err) {
    console.error('Fatal:', err.message);
  }
}

if (require.main === module) main();

module.exports = { researchApp, main };