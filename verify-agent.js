const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const RAW_FILE = path.join(DATA_DIR, 'raw.json');
const VERIFIED_FILE = path.join(DATA_DIR, 'verified.json');

// Valid auth methods and selfServe options
const VALID_SELF_SERVE = new Set(['Yes', 'No', 'Partial']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

// Validate a single record according to the verification rules
function verifyRecord(rec) {
  const issues = [];
  // Required fields: name, website, description, authMethod
  if (!rec.name || !rec.name.trim()) issues.push('missing name');
  if (!rec.website || !rec.website.trim()) issues.push('missing website');
  if (!rec.description || !rec.description.trim()) issues.push('missing description');

  // Evidence URL exists
  if (!Array.isArray(rec.evidence) || rec.evidence.length === 0 || !rec.evidence[0].url) {
    issues.push('missing evidence url');
  }

  // Auth method validity
  const auth = (rec.authMethod || '').toString().trim();
  const knownAuth = ['OAuth2', 'API Key', 'Basic Auth', 'Token', 'Other'];
  if (!knownAuth.includes(auth)) issues.push(`unknown auth method: ${auth || 'empty'}`);

  // Self-serve check
  const self = (rec.selfServe || '').toString().trim();
  if (!VALID_SELF_SERVE.has(self)) issues.push(`invalid selfServe value: ${self || 'empty'}`);

  // Passed when no issues
  const passed = issues.length === 0;

  return {
    name: rec.name || rec.website || '',
    passed,
    issues,
    confidence: typeof rec.confidence === 'number' ? rec.confidence : 0
  };
}

function summarize(results) {
  const totalApps = results.length;
  const passedApps = results.filter(r => r.passed).length;
  const failedApps = totalApps - passedApps;
  const verificationRate = totalApps === 0 ? 0 : Math.round((passedApps / totalApps) * 100);
  return { totalApps, passedApps, failedApps, verificationRate };
}

function main() {
  try {
    if (!fs.existsSync(DATA_DIR)) throw new Error('data directory missing');

    const raw = readJson(RAW_FILE);
    if (!Array.isArray(raw)) throw new Error('raw.json must be an array');

    const verified = raw.map(verifyRecord);
    writeJson(VERIFIED_FILE, verified);

    const summary = summarize(verified);
    console.log('Verification Summary');
    console.log('--------------------');
    console.log('Total Apps:', summary.totalApps);
    console.log('Passed Apps:', summary.passedApps);
    console.log('Failed Apps:', summary.failedApps);
    console.log('Verification Rate:', summary.verificationRate + '%');

    console.log('\nSaved:', VERIFIED_FILE);
  } catch (err) {
    console.error('Verification Error:', err.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { verifyRecord, main };