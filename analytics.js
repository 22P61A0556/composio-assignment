const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const RAW_FILE = path.join(DATA_DIR, 'raw.json');
const SUMMARY_FILE = path.join(DATA_DIR, 'analytics-summary.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function bucketAuth(method) {
  if (!method) return 'Other';
  const m = method.toLowerCase();
  if (m.includes('oauth')) return 'OAuth2';
  if (m.includes('api key') || m.includes('api-key')) return 'API Key';
  if (m.includes('basic')) return 'Basic Auth';
  if (m.includes('token') || m.includes('bearer')) return 'Token';
  return 'Other';
}

function bucketSelfServe(value) {
  if (!value) return 'Partial';
  const v = value.toLowerCase();
  if (v === 'yes') return 'Self Serve';
  if (v === 'no') return 'Gated';
  if (v === 'partial') return 'Partial';
  return 'Partial';
}

function bucketApiSurface(value) {
  if (!value) return 'Unknown';
  const v = value.toLowerCase();
  if (v.includes('graphql')) return 'GraphQL';
  if (v.includes('rest')) return 'REST';
  if (v.includes('mixed')) return 'Mixed';
  return 'Unknown';
}

function bucketBuildability(value) {
  if (!value) return 'Moderate';
  const v = value.toLowerCase();
  if (v.includes('easy')) return 'Easy';
  if (v.includes('hard')) return 'Hard';
  return 'Moderate';
}

function getDominantBucket(distribution) {
  const entries = Object.entries(distribution).filter(([, value]) => Number.isFinite(value));
  if (entries.length === 0) {
    return { key: 'Unknown', value: 0, percentage: 0 };
  }

  const [key, value] = entries.reduce((best, current) => (current[1] > best[1] ? current : best), entries[0]);
  return { key, value, percentage: value };
}

function pct(n, totalApps) {
  return totalApps === 0 ? 0 : (n / totalApps) * 100;
}

function normalizeDistributionPercentages(distribution, totalApps) {
  const entries = Object.entries(distribution || {});
  if (!entries.length || totalApps === 0) {
    return Object.fromEntries(entries.map(([key]) => [key, 0]));
  }

  const raw = entries.map(([key, value]) => ({
    key,
    value: pct(value, totalApps),
    floor: Math.floor(pct(value, totalApps)),
    fraction: pct(value, totalApps) - Math.floor(pct(value, totalApps))
  }));

  const remainder = 100 - raw.reduce((sum, item) => sum + item.floor, 0);
  const sorted = [...raw].sort((a, b) => b.fraction - a.fraction || a.key.localeCompare(b.key));

  for (let i = 0; i < remainder; i += 1) {
    if (sorted[i]) {
      sorted[i].floor += 1;
    }
  }

  const normalized = {};
  raw.forEach((item) => {
    const match = sorted.find(entry => entry.key === item.key);
    normalized[item.key] = match ? match.floor : item.floor;
  });

  return normalized;
}

function buildAuthFinding(authDistribution, totalApps) {
  const { key, value } = getDominantBucket(authDistribution);
  const percentage = Math.round(pct(value, totalApps));

  if (key === 'Other') {
    return `Other authentication methods account for ${percentage}% of researched apps.`;
  }

  const labelMap = {
    OAuth2: 'OAuth2 authentication',
    'API Key': 'API key authentication',
    'Basic Auth': 'Basic authentication',
    Token: 'Token-based authentication'
  };

  const label = labelMap[key] || `${key} authentication`;
  return `${label} accounts for ${percentage}% of researched apps.`;
}

function buildSelfServeFinding(selfServeDistribution, totalApps) {
  const { key, value } = getDominantBucket(selfServeDistribution);
  const percentage = Math.round(pct(value, totalApps));

  if (key === 'Partial') {
    return `${percentage}% of platforms provide only partial self-service onboarding.`;
  }

  if (key === 'Self Serve') {
    return `${percentage}% of platforms offer full self-service onboarding.`;
  }

  if (key === 'Gated') {
    return `${percentage}% of platforms require gated onboarding.`;
  }

  return `${percentage}% of platforms fall into the ${key.toLowerCase()} self-serve category.`;
}

function buildApiFinding(apiTypes, totalApps) {
  const { key, value } = getDominantBucket(apiTypes);
  const percentage = Math.round(pct(value, totalApps));

  if (key === 'REST') {
    return `REST APIs are the dominant integration surface (${percentage}%).`;
  }

  if (key === 'GraphQL') {
    return `GraphQL APIs are the dominant integration surface (${percentage}%).`;
  }

  if (key === 'Mixed') {
    return `Mixed API surfaces are the dominant integration surface (${percentage}%).`;
  }

  if (key === 'Unknown') {
    return `Unknown API surfaces account for ${percentage}% of researched apps.`;
  }

  return `${key} APIs account for ${percentage}% of researched apps.`;
}

function buildMcpFinding(mcpDistribution, totalApps) {
  const { key, value } = getDominantBucket(mcpDistribution);
  const percentage = Math.round(pct(value, totalApps));

  if (key === 'No' && percentage === 100) {
    return 'No researched platform exposed MCP support.';
  }

  if (key === 'Yes') {
    return `${percentage}% of researched platforms exposed MCP support.`;
  }

  return `${percentage}% of researched platforms did not expose MCP support.`;
}

function buildBuildabilityFinding(buildabilityDistribution, totalApps) {
  const { key, value } = getDominantBucket(buildabilityDistribution);
  const percentage = Math.round(pct(value, totalApps));

  if (key === 'Easy' && percentage === 100) {
    return 'All researched platforms were classified as Easy to integrate.';
  }

  if (key === 'Moderate') {
    return `${percentage}% of platforms were classified as Moderate to integrate.`;
  }

  if (key === 'Hard') {
    return `${percentage}% of platforms were classified as Hard to integrate.`;
  }

  return `${percentage}% of platforms were classified as ${key} to integrate.`;
}

function analyze(raw) {
  const totalApps = raw.length;

  const authDistribution = { 'OAuth2':0, 'API Key':0, 'Basic Auth':0, 'Token':0, 'Other':0 };
  const selfServeDistribution = { 'Self Serve':0, 'Partial':0, 'Gated':0 };
  const apiTypes = { 'REST':0, 'GraphQL':0, 'Mixed':0, 'Unknown':0 };
  const mcpDistribution = { 'Yes':0, 'No':0 };
  const buildabilityDistribution = { 'Easy':0, 'Moderate':0, 'Hard':0 };

  raw.forEach(r => {
    const a = bucketAuth(r.authMethod);
    authDistribution[a] = (authDistribution[a] || 0) + 1;

    const s = bucketSelfServe(r.selfServe);
    selfServeDistribution[s] = (selfServeDistribution[s] || 0) + 1;

    const api = bucketApiSurface(r.apiSurface);
    apiTypes[api] = (apiTypes[api] || 0) + 1;

    const m = (r.mcpAvailable && r.mcpAvailable.toLowerCase && r.mcpAvailable.toLowerCase() === 'yes') ? 'Yes' : 'No';
    mcpDistribution[m] = (mcpDistribution[m] || 0) + 1;

    const b = bucketBuildability(r.buildabilityVerdict);
    buildabilityDistribution[b] = (buildabilityDistribution[b] || 0) + 1;
  });

  const findings = [
    buildAuthFinding(authDistribution, totalApps),
    buildSelfServeFinding(selfServeDistribution, totalApps),
    buildApiFinding(apiTypes, totalApps),
    buildMcpFinding(mcpDistribution, totalApps),
    buildBuildabilityFinding(buildabilityDistribution, totalApps)
  ];

  return {
    totalApps,
    authDistribution,
    selfServeDistribution,
    apiTypes,
    mcpDistribution,
    buildabilityDistribution,
    percentages: {
      auth: normalizeDistributionPercentages(authDistribution, totalApps),
      selfServe: normalizeDistributionPercentages(selfServeDistribution, totalApps),
      apiTypes: normalizeDistributionPercentages(apiTypes, totalApps),
      mcp: normalizeDistributionPercentages(mcpDistribution, totalApps),
      build: normalizeDistributionPercentages(buildabilityDistribution, totalApps)
    },
    topFindings: findings
  };
}

function main() {
  try {
    if (!fs.existsSync(DATA_DIR)) throw new Error('data directory missing');
    const raw = readJson(RAW_FILE);
    if (!Array.isArray(raw)) throw new Error('raw.json must be an array');

    const summary = analyze(raw);
    writeJson(SUMMARY_FILE, summary);

    console.log('Analytics summary written to', SUMMARY_FILE);
  } catch (err) {
    console.error('Analytics Error:', err.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { analyze, main };