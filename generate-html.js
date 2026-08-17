const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT_DIR = path.join(__dirname, 'output');
const RAW_FILE = path.join(DATA_DIR, 'raw.json');
const VERIFIED_FILE = path.join(DATA_DIR, 'verified.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics-summary.json');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'index.html');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return null;
  }
}

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getDominantKey(distribution) {
  const entries = Object.entries(distribution || {});
  if (!entries.length) return ['Unknown', 0];
  return entries.reduce((best, current) => current[1] > best[1] ? current : best, entries[0]);
}

function renderFindings(findings) {
  if (!Array.isArray(findings) || findings.length === 0) {
    return '<li>No findings available.</li>';
  }
  return findings.map(item => `<li>${escapeHtml(item)}</li>`).join('');
}

function renderAnalyticsKpi(label, value, icon, tone = 'blue') {
  return `
    <div class="stat-card ${tone}">
      <div class="stat-card__header">
        <span class="stat-card__label">${escapeHtml(label)}</span>
        <span class="stat-card__icon">${icon}</span>
      </div>
      <div class="stat-card__value">${escapeHtml(String(value))}</div>
    </div>
  `;
}

function renderDistributionCard(title, distribution, percentages, variant = 'default') {
  const entries = Object.entries(distribution || {});
  if (!entries.length) return '';

  const iconMap = {
    'Authentication': '🔐',
    'Self Serve': '⚡',
    'API Surface': '🧩',
    'MCP': '🤝',
    'Buildability': '🏗️'
  };

  const normalizedTitle = String(title || 'Analytics');
  const icon = iconMap[normalizedTitle] || '📊';

  const rows = entries.map(([label, count]) => {
    const pct = percentages && Object.prototype.hasOwnProperty.call(percentages, label) ? percentages[label] : 0;
    const safePct = Math.max(0, Math.min(Number(pct) || 0, 100));
    const labelText = variant === 'mcp'
      ? (label === 'Yes' ? 'MCP Supported' : 'MCP Not Supported')
      : label;

    const badgeModifier = variant === 'buildability'
      ? (label === 'Easy' ? 'success' : label === 'Moderate' ? 'warning' : label === 'Hard' ? 'danger' : 'neutral')
      : (variant === 'selfServe'
        ? (label === 'Self Serve' ? 'success' : label === 'Partial' ? 'warning' : label === 'Gated' ? 'danger' : 'neutral')
        : (variant === 'mcp'
          ? (label === 'Yes' ? 'success' : 'danger')
          : 'neutral'));

    const barClass = variant === 'selfServe'
      ? (label === 'Self Serve' ? 'bar-success' : label === 'Partial' ? 'bar-warning' : label === 'Gated' ? 'bar-danger' : 'bar-neutral')
      : (variant === 'mcp'
        ? (label === 'Yes' ? 'bar-success' : 'bar-danger')
        : (variant === 'buildability'
          ? (label === 'Easy' ? 'bar-success' : label === 'Moderate' ? 'bar-warning' : label === 'Hard' ? 'bar-danger' : 'bar-neutral')
          : 'bar-blue'));

    const labelMarkup = variant === 'buildability'
      ? `<span class="metric-badge ${badgeModifier}">${escapeHtml(labelText)}</span>`
      : `<span class="metric-label">${escapeHtml(labelText)}</span>`;

    return `
      <div class="dist-row">
        <div class="dist-head">
          ${labelMarkup}
          <span class="dist-count">${count} (${safePct}%)</span>
        </div>
        <div class="dist-track">
          <span class="dist-bar ${barClass}" style="width: ${safePct}%"></span>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="analytics-card compact-card ${variant}">
      <div class="analytics-card__title">
        <span class="analytics-card__icon">${icon}</span>
        <h3>${escapeHtml(normalizedTitle)}</h3>
      </div>
      <div class="distribution-list">
        ${rows}
      </div>
    </div>
  `;
}

function normalizeMcpValue(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (value === null || value === undefined) return 'Unknown';

  const normalized = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y'].includes(normalized)) return 'Yes';
  if (['false', 'no', 'n'].includes(normalized)) return 'No';
  if (normalized === '') return 'Unknown';
  return String(value).trim();
}

function resolveMcpValue(app, analytics) {
  if (!app) return 'Unknown';
  const rawValue = normalizeMcpValue(app.mcpAvailable);
  if (rawValue === 'Yes' || rawValue === 'No') return rawValue;

  const dist = analytics && analytics.mcpDistribution ? analytics.mcpDistribution : {};
  const yesCount = Number(dist.Yes || 0);
  const noCount = Number(dist.No || 0);

  if (yesCount === 0 && noCount > 0) return 'No';
  if (noCount === 0 && yesCount > 0) return 'Yes';
  if (yesCount > noCount) return 'Yes';
  if (noCount > yesCount) return 'No';

  return 'Unknown';
}

function formatEvidence(value) {
  if (value === null || value === undefined) return '0 sources';
  if (Array.isArray(value)) return `${value.length} sources`;
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return value;
  return String(value);
}

function evidenceTooltip(value) {
  if (Array.isArray(value)) {
    return value.map(item => {
      if (!item) return '';
      if (typeof item === 'string') return item;
      const note = item.note || '';
      const url = item.url || '';
      return [note, url].filter(Boolean).join(': ');
    }).filter(Boolean).join(' | ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return value;
  return '';
}

function buildExecutiveSummary(analytics, rawLength, verifiedRecords) {
  const passedApps = Array.isArray(verifiedRecords)
    ? verifiedRecords.filter(item => item && item.passed === true).length
    : 0;
  const failedApps = Array.isArray(verifiedRecords) ? verifiedRecords.length - passedApps : 0;
  const verificationRate = Array.isArray(verifiedRecords) && verifiedRecords.length > 0
    ? Math.round((passedApps / verifiedRecords.length) * 100)
    : 0;

  const authDist = analytics.authDistribution || {};
  const apiDist = analytics.apiTypes || {};
  const buildDist = analytics.buildabilityDistribution || {};
  const mcpDist = analytics.mcpDistribution || {};

  const dominantAuth = getDominantKey(authDist);
  const dominantApi = getDominantKey(apiDist);
  const dominantBuild = getDominantKey(buildDist);
  const mcpNo = Number(mcpDist.No || 0);
  const mcpPct = rawLength > 0 ? Math.round((mcpNo / rawLength) * 100) : 0;

  return `
    <p>Across ${rawLength} researched applications, ${passedApps} passed verification and ${failedApps} failed verification, resulting in a ${verificationRate}% verification rate.</p>
    <p>Most common authentication method: ${dominantAuth[0]} (${analytics.percentages && analytics.percentages.auth ? (analytics.percentages.auth[dominantAuth[0]] || 0) : 0}%).</p>
    <p>Dominant API type: ${dominantApi[0]} (${analytics.percentages && analytics.percentages.apiTypes ? (analytics.percentages.apiTypes[dominantApi[0]] || 0) : 0}%).</p>
    <p>MCP adoption insight: ${mcpPct}% of platforms report no MCP support.</p>
    <p>Buildability overview: ${dominantBuild[0]} is the most common integration verdict.</p>
  `;
}

function buildRecommendations(raw, analytics) {
  const recommended = Array.isArray(raw)
    ? raw
        .filter(app => Number(app.confidence || 0) >= 75 && String(app.buildabilityVerdict || '').toLowerCase() === 'easy')
        .slice(0, 3)
        .map(app => app.name)
    : [];

  const authDist = analytics.authDistribution || {};
  const dominantAuth = getDominantKey(authDist);
  const apiDist = analytics.apiTypes || {};
  const dominantApi = getDominantKey(apiDist);

  return [
    `Most common auth pattern: ${dominantAuth[0]}.`,
    `Dominant API surface: ${dominantApi[0]}.`,
    `Recommended target platforms: ${recommended.length ? recommended.join(', ') : 'No strong targets available.'}`
  ];
}

function main() {
  try {
    ensureOutputDir();

    const raw = readJson(RAW_FILE) || [];
    const verified = readJson(VERIFIED_FILE) || [];
    const analytics = readJson(ANALYTICS_FILE) || {};

    const totalApps = Array.isArray(raw) ? raw.length : 0;
    const passedApps = Array.isArray(verified)
      ? verified.filter(item => item && item.passed === true).length
      : 0;
    const failedApps = Array.isArray(verified) ? verified.length - passedApps : 0;
    const verificationRate = Array.isArray(verified) && verified.length > 0
      ? Math.round((passedApps / verified.length) * 100)
      : 0;

    const findings = Array.isArray(analytics.topFindings) && analytics.topFindings.length > 0
      ? analytics.topFindings
      : [];

    const recommendations = buildRecommendations(raw, analytics);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI App Research Automation</title>
  <style>
    :root {
      --bg: #f4f7fb;
      --surface: #ffffff;
      --surface-soft: #f8fbff;
      --surface-accent: linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%);
      --primary: #0f172a;
      --primary-2: #1e293b;
      --accent: #2563eb;
      --accent-strong: #1d4ed8;
      --muted: #64748b;
      --border: #e2e8f0;
      --shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
      --success: #16a34a;
      --success-soft: rgba(22, 163, 74, 0.12);
      --warning: #d97706;
      --warning-soft: rgba(217, 119, 6, 0.12);
      --danger: #dc2626;
      --danger-soft: rgba(220, 38, 38, 0.12);
      --info: #0284c7;
      --info-soft: rgba(2, 132, 199, 0.12);
      --purple: #7c3aed;
      --purple-soft: rgba(124, 58, 237, 0.12);
      --radius: 20px;
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }

    body {
      margin: 0;
      background:
        radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 25%),
        linear-gradient(180deg, #eef4ff 0%, #f8fafc 100%);
      font-family: Inter, "Segoe UI", Arial, sans-serif;
      color: var(--primary);
      line-height: 1.5;
    }

    .container {
      max-width: 1500px;
      margin: 0 auto;
      padding: 28px 20px 40px;
    }

    .hero {
      background: var(--surface-accent);
      color: #fff;
      border-radius: 24px;
      padding: 32px 28px;
      box-shadow: var(--shadow);
      margin-bottom: 24px;
      position: relative;
      overflow: hidden;
    }

    .hero::after {
      content: "";
      position: absolute;
      inset: auto -30px -40px auto;
      width: 180px;
      height: 180px;
      background: rgba(255,255,255,0.12);
      border-radius: 50%;
    }

    .hero h1 {
      margin: 0 0 10px;
      font-size: clamp(2rem, 3vw, 2.8rem);
      line-height: 1.1;
      letter-spacing: -0.04em;
      position: relative;
      z-index: 1;
    }

    .hero p {
      margin: 0;
      color: rgba(255,255,255,0.82);
      font-size: 1rem;
      position: relative;
      z-index: 1;
    }

    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 18px;
      margin-bottom: 24px;
    }

    .card {
      background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.92));
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: var(--radius);
      padding: 20px 18px;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 150px;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 22px 48px rgba(37, 99, 235, 0.1);
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .icon {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(124, 58, 237, 0.12));
      font-size: 1.4rem;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
    }

    .card-label {
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 800;
    }

    .card-value {
      font-size: clamp(2rem, 2vw, 2.5rem);
      font-weight: 800;
      margin: 0;
      letter-spacing: -0.05em;
      color: var(--primary);
    }

    .section {
      background: rgba(255,255,255,0.82);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 22px;
      padding: 22px 20px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
      margin-bottom: 24px;
      backdrop-filter: blur(10px);
    }

    .section h2 {
      margin: 0 0 16px;
      font-size: 1.5rem;
      letter-spacing: -0.03em;
    }

    .summary-copy, .section ul {
      color: #334155;
      line-height: 1.7;
    }

    .summary-copy p {
      margin: 0 0 10px;
    }

    ul {
      padding-left: 18px;
      margin: 0;
    }

    .analytics-kpis {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin: 0 0 18px;
    }

    .analytics-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 14px;
      align-items: stretch;
    }

    .analytics-card {
      padding: 14px 14px 12px;
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96));
      box-shadow: 0 10px 22px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255,255,255,0.85);
      min-height: 0;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .analytics-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 16px 28px rgba(15, 23, 42, 0.06);
    }

    .analytics-card__title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(226, 232, 240, 0.8);
    }

    .analytics-card__icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(124, 58, 237, 0.12));
      font-size: 0.96rem;
    }

    .analytics-card h3 {
      margin: 0;
      font-size: 0.92rem;
      letter-spacing: -0.01em;
      color: var(--primary);
    }

    .distribution-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .dist-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .dist-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 0.76rem;
      color: var(--muted);
    }

    .metric-label {
      font-weight: 600;
      color: var(--primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 68%;
    }

    .metric-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 22px;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      border: 1px solid transparent;
      max-width: 68%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .metric-badge.success,
    .status-badge.success {
      background: var(--success-soft);
      color: var(--success);
      border-color: rgba(22, 163, 74, 0.15);
    }

    .metric-badge.warning,
    .status-badge.warning {
      background: var(--warning-soft);
      color: var(--warning);
      border-color: rgba(217, 119, 6, 0.15);
    }

    .metric-badge.danger,
    .status-badge.danger {
      background: var(--danger-soft);
      color: var(--danger);
      border-color: rgba(220, 38, 38, 0.15);
    }

    .metric-badge.neutral,
    .status-badge.neutral {
      background: #f1f5f9;
      color: #475569;
      border-color: rgba(148, 163, 184, 0.2);
    }

    .dist-count {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--primary);
    }

    .dist-track {
      width: 100%;
      height: 8px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.18);
      overflow: hidden;
    }

    .dist-bar {
      display: block;
      height: 100%;
      border-radius: inherit;
    }

    .bar-blue { background: linear-gradient(90deg, #2563eb, #60a5fa); }
    .bar-success { background: linear-gradient(90deg, #16a34a, #4ade80); }
    .bar-warning { background: linear-gradient(90deg, #d97706, #fbbf24); }
    .bar-danger { background: linear-gradient(90deg, #dc2626, #f87171); }
    .bar-neutral { background: linear-gradient(90deg, #64748b, #94a3b8); }

    .chart-card {
      position: relative;
      min-height: 220px;
    }

    .chart-wrap {
      position: relative;
      height: 180px;
      width: 100%;
    }

    .two-col {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 18px;
    }

    .verification-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .verification-card {
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 18px;
      padding: 14px 14px 12px;
      background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96));
      box-shadow: 0 10px 22px rgba(15, 23, 42, 0.04);
    }

    .verification-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(226, 232, 240, 0.9);
    }

    .verification-header h3 {
      margin: 0;
      font-size: 0.96rem;
      letter-spacing: -0.01em;
    }

    .verification-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 36px;
      height: 30px;
      padding: 0 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 800;
      color: #fff;
    }

    .verification-count.success {
      background: linear-gradient(135deg, #16a34a, #4ade80);
    }

    .verification-count.danger {
      background: linear-gradient(135deg, #dc2626, #f87171);
    }

    .chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 60px;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      background: #f8fafc;
      border: 1px solid rgba(148, 163, 184, 0.25);
      color: var(--primary);
      font-size: 0.7rem;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: 0.01em;
    }

    .chip.success {
      background: rgba(22, 163, 74, 0.08);
      color: var(--success);
      border-color: rgba(22, 163, 74, 0.18);
    }

    .chip.danger {
      background: rgba(220, 38, 38, 0.08);
      color: var(--danger);
      border-color: rgba(220, 38, 38, 0.18);
    }

    .chip.neutral {
      background: #f1f5f9;
      color: #475569;
      border-color: rgba(148, 163, 184, 0.2);
    }

    .stat-card {
      background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96));
      border: 1px solid rgba(148,163,184,0.18);
      border-radius: 18px;
      box-shadow: 0 12px 24px rgba(15, 23, 42, 0.04);
      padding: 12px 14px;
      min-height: 112px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 18px 24px rgba(15, 23, 42, 0.06);
    }

    .stat-card__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }

    .stat-card__label {
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 800;
      color: var(--muted);
    }

    .stat-card__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(124, 58, 237, 0.12));
      font-size: 0.95rem;
    }

    .stat-card__value {
      font-size: clamp(1.5rem, 2vw, 2.1rem);
      line-height: 1.1;
      font-weight: 800;
      letter-spacing: -0.05em;
      color: var(--primary);
    }

    .stat-card.blue .stat-card__icon { background: rgba(37, 99, 235, 0.12); }
    .stat-card.green .stat-card__icon { background: rgba(22, 163, 74, 0.12); }
    .stat-card.amber .stat-card__icon { background: rgba(217, 119, 6, 0.12); }
    .stat-card.purple .stat-card__icon { background: rgba(124, 58, 237, 0.12); }

    .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0.02em;
      border: 1px solid transparent;
      background: #eef2ff;
      color: #3730a3;
    }

    .pill.success {
      background: var(--success-soft);
      color: var(--success);
      border-color: rgba(22, 163, 74, 0.15);
    }

    .pill.warning {
      background: var(--warning-soft);
      color: var(--warning);
      border-color: rgba(217, 119, 6, 0.15);
    }

    .pill.danger {
      background: var(--danger-soft);
      color: var(--danger);
      border-color: rgba(220, 38, 38, 0.15);
    }

    .pill.info {
      background: var(--info-soft);
      color: var(--info);
      border-color: rgba(2, 132, 199, 0.15);
    }

    .pill.neutral {
      background: #f1f5f9;
      color: #475569;
      border-color: rgba(148, 163, 184, 0.2);
    }

    .score-cell {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 110px;
    }

    .score-bar {
      width: 100%;
      height: 8px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.2);
      overflow: hidden;
      position: relative;
    }

    .score-bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #22c55e 0%, #2563eb 100%);
    }

    .table-controls {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
      flex-wrap: wrap;
      padding: 12px 14px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.82);
      backdrop-filter: blur(10px);
      box-shadow: 0 12px 26px rgba(15, 23, 42, 0.05);
    }

    .search-shell {
      position: relative;
      flex: 1 1 340px;
      min-width: 220px;
    }

    .search-shell svg {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      stroke: #64748b;
    }

    .table-controls input,
    .table-controls select {
      width: 100%;
      padding: 12px 14px 12px 42px;
      border: 1px solid var(--border);
      border-radius: 12px;
      font-size: 0.95rem;
      background: #fff;
      color: var(--primary);
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.025);
      transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
    }

    .table-controls select {
      flex: 0 0 220px;
      padding-left: 14px;
      background-image: linear-gradient(45deg, transparent 50%, #64748b 50%), linear-gradient(135deg, #64748b 50%, transparent 50%);
      background-position: calc(100% - 18px) calc(50% - 2px), calc(100% - 12px) calc(50% - 2px);
      background-size: 6px 6px, 6px 6px;
      background-repeat: no-repeat;
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
    }

    .table-controls input:focus,
    .table-controls select:focus,
    .table-controls input:focus-visible,
    .table-controls select:focus-visible {
      outline: none;
      border-color: rgba(37, 99, 235, 0.4);
      box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
    }

    .table-wrap {
      overflow-x: auto;
      overflow-y: hidden;
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 18px;
      background: #fff;
      box-shadow: 0 16px 36px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255,255,255,0.8);
      position: relative;
      scrollbar-color: rgba(100, 116, 139, 0.7) rgba(241, 245, 249, 0.9);
    }

    .table-wrap::-webkit-scrollbar {
      height: 12px;
      width: 12px;
    }

    .table-wrap::-webkit-scrollbar-track {
      background: rgba(241, 245, 249, 0.9);
    }

    .table-wrap::-webkit-scrollbar-thumb {
      background: rgba(100, 116, 139, 0.7);
      border-radius: 999px;
      border: 2px solid rgba(241, 245, 249, 0.9);
    }

    table {
      width: 100%;
      min-width: 1700px;
      border-collapse: separate;
      border-spacing: 0;
      background: #fff;
    }

    thead th {
      position: sticky;
      top: 0;
      z-index: 4;
      background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
      color: #fff;
      font-size: 0.71rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 700;
      padding: 14px 12px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      box-shadow: inset 0 -1px 0 rgba(255,255,255,0.08);
    }

    thead th:first-child {
      position: sticky;
      left: 0;
      z-index: 5;
      background: linear-gradient(180deg, #111827 0%, #1F2937 100%);
    }

    th, td {
      padding: 12px 10px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: middle;
      color: var(--primary);
      background-clip: padding-box;
    }

    tbody tr {
      transition: background 0.18s ease, transform 0.18s ease;
      cursor: default;
    }

    tbody tr:nth-child(even) {
      background: rgba(248, 250, 252, 0.8);
    }

    tbody tr:nth-child(odd) {
      background: #ffffff;
    }

    tbody tr:hover {
      background: rgba(239, 246, 255, 0.9);
    }

    tbody tr:hover td {
      box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.04);
    }

    tbody td:first-child {
      position: sticky;
      left: 0;
      z-index: 1;
      background: inherit;
      box-shadow: 1px 0 0 rgba(148, 163, 184, 0.18);
    }

    tbody tr:nth-child(even) td:first-child {
      background: rgba(248, 250, 252, 0.8);
    }

    tbody tr:nth-child(odd) td:first-child {
      background: #ffffff;
    }

    tbody tr:hover td:first-child {
      background: rgba(239, 246, 255, 0.9);
    }

    tbody tr.expanded-row {
      background: #f8fbff;
    }

    .details-row td {
      background: #f8fbff;
      padding: 0;
    }

    .details-panel {
      padding: 18px 16px 20px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      border-top: 1px solid var(--border);
    }

    .detail-box {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 14px;
    }

    .detail-box strong {
      display: block;
      color: var(--muted);
      font-size: 0.72rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .detail-box .detail-value {
      color: var(--primary);
      font-weight: 600;
      word-break: break-word;
    }

    .detail-box ul {
      margin: 0;
      padding-left: 18px;
    }

    .detail-box a {
      color: var(--accent-strong);
      text-decoration: none;
    }

    .detail-box a:hover {
      text-decoration: underline;
    }

    a {
      color: var(--accent-strong);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .truncate {
      display: inline-block;
      max-width: 220px;
      vertical-align: middle;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 30px;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0.02em;
      border: 1px solid transparent;
      white-space: nowrap;
      max-width: 100%;
    }

    .status-pill.success {
      background: var(--success-soft);
      color: var(--success);
      border-color: rgba(22, 163, 74, 0.15);
    }

    .status-pill.warning {
      background: var(--warning-soft);
      color: var(--warning);
      border-color: rgba(217, 119, 6, 0.15);
    }

    .status-pill.danger {
      background: var(--danger-soft);
      color: var(--danger);
      border-color: rgba(220, 38, 38, 0.15);
    }

    .status-pill.info {
      background: var(--info-soft);
      color: var(--info);
      border-color: rgba(2, 132, 199, 0.15);
    }

    .status-pill.neutral {
      background: #f1f5f9;
      color: #475569;
      border-color: rgba(148, 163, 184, 0.2);
    }

    .methodology {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin-top: 12px;
    }

    .method-card {
      background: #f8fbff;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px 16px;
    }

    .method-card h4 {
      margin: 0 0 8px;
      font-size: 0.9rem;
      color: var(--primary);
    }

    .method-card p {
      margin: 0;
      color: var(--muted);
      font-size: 0.9rem;
    }

    .footer {
      text-align: left;
      color: var(--muted);
      font-size: 0.92rem;
      padding-top: 12px;
      line-height: 1.8;
    }

    @media (max-width: 1200px) {
      .analytics-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }

    @media (max-width: 960px) {
      .analytics-kpis,
      .analytics-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .verification-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 768px) {
      .container {
        padding: 16px 14px 28px;
      }

      .hero {
        padding: 22px 18px;
      }

      .section {
        padding: 18px 14px;
      }

      .analytics-kpis,
      .analytics-grid {
        grid-template-columns: 1fr;
      }

      .table-controls {
        position: static;
        display: block;
        padding: 10px;
      }

      .table-controls input,
      .table-controls select {
        width: 100%;
        min-width: 0;
      }

      .chart-wrap {
        height: 160px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="hero">
      <h1>AI App Research Automation</h1>
      <p>Platform readiness, verification, and API intelligence dashboard powered by project data.</p>
    </div>

    <div class="kpis">
      <div class="card">
        <div class="card-top">
          <span class="card-label">Total Apps</span>
          <span class="icon">📊</span>
        </div>
        <p class="card-value">${totalApps}</p>
      </div>
      <div class="card">
        <div class="card-top">
          <span class="card-label">Verification Rate</span>
          <span class="icon">✅</span>
        </div>
        <p class="card-value">${verificationRate}%</p>
      </div>
      <div class="card">
        <div class="card-top">
          <span class="card-label">Passed Apps</span>
          <span class="icon">✔</span>
        </div>
        <p class="card-value">${passedApps}</p>
      </div>
      <div class="card">
        <div class="card-top">
          <span class="card-label">Failed Apps</span>
          <span class="icon">⚠</span>
        </div>
        <p class="card-value">${failedApps}</p>
      </div>
    </div>

    <div class="section">
      <h2>Executive Summary</h2>
      <div class="summary-copy">
        ${buildExecutiveSummary(analytics, totalApps, verified)}
      </div>
    </div>

    <div class="section">
      <h2>Key Findings</h2>
      <ul>
        ${renderFindings(findings)}
      </ul>
    </div>

    <div class="section">
      <h2>Analytics Summary</h2>
      <div class="analytics-kpis">
        ${renderAnalyticsKpi('Total Platforms', totalApps, '◆', 'blue')}
        ${renderAnalyticsKpi('MCP Supported', Number((analytics.mcpDistribution && analytics.mcpDistribution.Yes) || 0), '✓', 'green')}
        ${renderAnalyticsKpi('REST APIs', Number((analytics.apiTypes && analytics.apiTypes.REST) || 0), '🔌', 'amber')}
        ${renderAnalyticsKpi('OAuth2 Apps', Number((analytics.authDistribution && analytics.authDistribution['OAuth2']) || 0), '🔐', 'purple')}
      </div>
      <div class="analytics-grid">
        ${renderDistributionCard('Authentication', analytics.authDistribution, analytics.percentages && analytics.percentages.auth ? analytics.percentages.auth : {}, 'auth')}
        ${renderDistributionCard('Self Serve', analytics.selfServeDistribution, analytics.percentages && analytics.percentages.selfServe ? analytics.percentages.selfServe : {}, 'selfServe')}
        ${renderDistributionCard('API Surface', analytics.apiTypes, analytics.percentages && analytics.percentages.apiTypes ? analytics.percentages.apiTypes : {}, 'api')}
        ${renderDistributionCard('MCP', analytics.mcpDistribution, analytics.percentages && analytics.percentages.mcp ? analytics.percentages.mcp : {}, 'mcp')}
        ${renderDistributionCard('Buildability', analytics.buildabilityDistribution, analytics.percentages && analytics.percentages.build ? analytics.percentages.build : {}, 'buildability')}
      </div>
    </div>

    <div class="section">
      <h2>Verification Results</h2>
      <div class="verification-grid">
        <div class="verification-card success-card">
          <div class="verification-header">
            <h3>Passed Platforms</h3>
            <span class="verification-count success">${passedApps}</span>
          </div>
          <div class="chip-list">
            ${(Array.isArray(verified) ? verified.filter(item => item && item.passed === true) : []).map(item => `<span class="chip success">${escapeHtml(item.name || 'Unknown')}</span>`).join('') || '<span class="chip neutral">No passed platforms.</span>'}
          </div>
        </div>
        <div class="verification-card danger-card">
          <div class="verification-header">
            <h3>Failed Platforms</h3>
            <span class="verification-count danger">${failedApps}</span>
          </div>
          <div class="chip-list">
            ${(Array.isArray(verified) ? verified.filter(item => item && item.passed !== true) : []).map(item => `<span class="chip danger" title="${escapeHtml((Array.isArray(item.issues) ? item.issues.join('; ') : 'No details available'))}">${escapeHtml(item.name || 'Unknown')}</span>`).join('') || '<span class="chip neutral">No failed platforms.</span>'}
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Research Insights</h2>
      <ul>
        ${recommendations.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </div>

    <div class="section">
      <h2>Research Table</h2>
      <div class="table-controls">
        <div class="search-shell">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6"></circle>
            <path d="M16 16L21 21"></path>
          </svg>
          <input id="searchInput" type="search" aria-label="Search research table" placeholder="Search platform, category, or auth method" />
        </div>
        <select id="sortSelect" aria-label="Sort research table">
          <option value="name">Sort by name</option>
          <option value="category">Sort by category</option>
          <option value="confidence">Sort by confidence</option>
          <option value="buildability">Sort by buildability</option>
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Website</th>
              <th>Category</th>
              <th>Description</th>
              <th>Auth Method</th>
              <th>Self Serve</th>
              <th>API Surface</th>
              <th>API Breadth</th>
              <th>MCP Available</th>
              <th>Buildability Verdict</th>
              <th>Main Blocker</th>
              <th>Evidence</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody id="researchTableBody"></tbody>
        </table>
      </div>
    </div>

    <div class="section">
      <h2>Methodology</h2>
      <div class="methodology">
        <div class="method-card">
          <h4>Source model</h4>
          <p>All metrics are calculated from raw.json, verified.json, and analytics-summary.json only.</p>
        </div>
        <div class="method-card">
          <h4>Verification logic</h4>
          <p>Passed apps are counted from verified records with passed === true and the verification rate is calculated dynamically.</p>
        </div>
        <div class="method-card">
          <h4>Evidence model</h4>
          <p>Evidence is counted as source entries, with array values rendered as counts and object values stringified for detail.</p>
        </div>
      </div>
    </div>

    <div class="footer">
      Generated on: ${new Date().toLocaleString()} | Evidence Sources Analyzed: ${Array.isArray(raw) ? raw.reduce((sum, app) => sum + (Array.isArray(app.evidence) ? app.evidence.length : (app.evidence ? 1 : 0)), 0) : 0} | Successful Verifications: ${passedApps} | Report Version: v1.0.0
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    const tableData = ${JSON.stringify(raw)};
    const analyticsData = ${JSON.stringify(analytics)};
    const state = { query: '', sortKey: 'name', sortDirection: 'asc' };

    function escapeHtml(value) {
      if (value === null || value === undefined) return '';
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;');
    }

    function normalizeMcpValue(value) {
      if (value === true) return 'Yes';
      if (value === false) return 'No';
      if (value === null || value === undefined) {
        const dist = analyticsData && analyticsData.mcpDistribution ? analyticsData.mcpDistribution : {};
        if (Number(dist.No || 0) > 0 && Number(dist.Yes || 0) === 0) return 'No';
        if (Number(dist.Yes || 0) > 0 && Number(dist.No || 0) === 0) return 'Yes';
        return 'Unknown';
      }
      const normalized = String(value).trim().toLowerCase();
      if (['true', 'yes', 'y'].includes(normalized)) return 'Yes';
      if (['false', 'no', 'n'].includes(normalized)) return 'No';
      if (normalized === '') return 'Unknown';
      return String(value).trim();
    }

    function formatEvidence(value) {
      if (value === null || value === undefined) return '0 sources';
      if (Array.isArray(value)) return value.length + ' sources';
      if (typeof value === 'object') return JSON.stringify(value);
      if (typeof value === 'string') return value;
      return String(value);
    }

    function evidenceTooltip(value) {
      if (Array.isArray(value)) {
        return value.map(item => {
          if (!item) return '';
          if (typeof item === 'string') return item;
          const note = item.note || '';
          const url = item.url || '';
          return [note, url].filter(Boolean).join(': ');
        }).filter(Boolean).join(' | ');
      }
      if (typeof value === 'object') return JSON.stringify(value);
      if (typeof value === 'string') return value;
      return '';
    }

    function badgeClassForValue(value, context) {
      const normalized = String(value || '').trim().toLowerCase();
      if (context === 'selfServe') {
        if (normalized === 'self serve' || normalized === 'self-serve' || normalized === 'selfserve') return 'success';
        if (normalized === 'partial') return 'warning';
        if (normalized === 'no' || normalized === 'not available' || normalized === 'none') return 'danger';
        return 'neutral';
      }
      if (context === 'mcp') {
        if (normalized === 'yes' || normalized === 'true') return 'success';
        if (normalized === 'no' || normalized === 'false') return 'danger';
        return 'neutral';
      }
      if (context === 'buildability') {
        if (normalized === 'easy') return 'success';
        if (normalized === 'moderate') return 'warning';
        if (normalized === 'hard') return 'danger';
        return 'neutral';
      }
      if (context === 'auth') {
        if (normalized.includes('oauth') || normalized.includes('api key') || normalized.includes('jwt') || normalized.includes('token')) return 'info';
        if (normalized.includes('basic') || normalized.includes('password')) return 'warning';
        if (normalized.includes('none') || normalized.includes('unknown')) return 'neutral';
        return 'info';
      }
      return 'neutral';
    }

    function renderBadge(value, context) {
      const text = value === null || value === undefined || value === '' ? 'Unknown' : String(value);
      const className = badgeClassForValue(text, context);
      return '<span class="status-pill ' + className + '" title="' + escapeHtml(text) + '">' + escapeHtml(text) + '</span>';
    }

    function buildRow(app) {
      const website = app.website ? '<a href="' + app.website + '" target="_blank" rel="noopener noreferrer" title="' + escapeHtml(app.website) + '">' + escapeHtml(app.website) + '</a>' : '';
      const mcpValue = normalizeMcpValue(app.mcpAvailable);
      const evidenceText = formatEvidence(app.evidence);
      const evidenceTip = evidenceTooltip(app.evidence);
      const buildRank = { Easy: 3, Moderate: 2, Hard: 1, Unknown: 0 };
      const confidence = Number(app.confidence || 0);
      const buildability = buildRank[app.buildabilityVerdict] || 0;

      return '<tr>' +
        '<td class="name-cell" title="' + escapeHtml(app.name || '') + '"><span class="truncate">' + escapeHtml(app.name || '') + '</span></td>' +
        '<td class="truncate-cell" title="' + escapeHtml(String(app.website || '')) + '">' + (website || '<span class="truncate">—</span>') + '</td>' +
        '<td class="truncate-cell" title="' + escapeHtml(app.category || '') + '"><span class="truncate">' + escapeHtml(app.category || '') + '</span></td>' +
        '<td class="truncate-cell" title="' + escapeHtml(app.description || '') + '"><span class="truncate">' + escapeHtml(app.description || '') + '</span></td>' +
        '<td class="truncate-cell" title="' + escapeHtml(app.authMethod || '') + '">' + renderBadge(app.authMethod || 'Unknown', 'auth') + '</td>' +
        '<td class="truncate-cell" title="' + escapeHtml(app.selfServe || '') + '">' + renderBadge(app.selfServe || 'Unknown', 'selfServe') + '</td>' +
        '<td class="truncate-cell" title="' + escapeHtml(app.apiSurface || '') + '"><span class="truncate">' + escapeHtml(app.apiSurface || '') + '</span></td>' +
        '<td class="truncate-cell" title="' + escapeHtml(app.apiBreadth || '') + '"><span class="truncate">' + escapeHtml(app.apiBreadth || '') + '</span></td>' +
        '<td class="truncate-cell" title="' + escapeHtml(mcpValue) + '">' + renderBadge(mcpValue, 'mcp') + '</td>' +
        '<td class="truncate-cell" title="' + escapeHtml(app.buildabilityVerdict || '') + '">' + renderBadge(app.buildabilityVerdict || 'Unknown', 'buildability') + '</td>' +
        '<td class="truncate-cell" title="' + escapeHtml(app.mainBlocker || '') + '"><span class="truncate">' + escapeHtml(app.mainBlocker || '') + '</span></td>' +
        '<td class="truncate-cell" title="' + escapeHtml(evidenceTip || evidenceText) + '"><span class="truncate">' + escapeHtml(evidenceText) + '</span></td>' +
        '<td data-confidence="' + confidence + '" data-buildability="' + buildability + '" title="' + escapeHtml(String(app.confidence ?? '')) + '">' + escapeHtml(String(app.confidence ?? '')) + '</td>' +
        '</tr>';
    }

    function renderTable() {
      const query = state.query.trim().toLowerCase();
      const filtered = tableData.filter(app => {
        if (!query) return true;
        const haystack = [
          app.name,
          app.category,
          app.description,
          app.authMethod,
          app.selfServe,
          app.apiSurface,
          app.apiBreadth,
          app.buildabilityVerdict,
          app.mainBlocker,
          String(app.confidence || '')
        ].join(' ').toLowerCase();
        return haystack.includes(query);
      });

      filtered.sort((a, b) => {
        let aValue = a[state.sortKey] || '';
        let bValue = b[state.sortKey] || '';

        if (state.sortKey === 'confidence') {
          aValue = Number(a.confidence || 0);
          bValue = Number(b.confidence || 0);
        }

        if (state.sortKey === 'buildability') {
          const rank = { Easy: 3, Moderate: 2, Hard: 1, Unknown: 0 };
          aValue = rank[a.buildabilityVerdict] || 0;
          bValue = rank[b.buildabilityVerdict] || 0;
        }

        if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) return state.sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return state.sortDirection === 'asc' ? 1 : -1;
        return 0;
      });

      document.getElementById('researchTableBody').innerHTML = filtered.map(buildRow).join('');
    }

    document.getElementById('searchInput').addEventListener('input', function (event) {
      state.query = event.target.value;
      renderTable();
    });

    document.getElementById('sortSelect').addEventListener('change', function (event) {
      state.sortKey = event.target.value;
      state.sortDirection = 'asc';
      renderTable();
    });

    renderTable();
  </script>
</body>
</html>`;

    fs.writeFileSync(OUTPUT_FILE, html, 'utf8');
    console.log(`Dashboard generated: ${OUTPUT_FILE}`);
  } catch (err) {
    console.error('Generate HTML Error:', err.message);
  }
}

main();
