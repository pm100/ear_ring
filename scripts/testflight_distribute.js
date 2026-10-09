#!/usr/bin/env node
/**
 * testflight_distribute.js — after an upload, wait for the build to finish
 * processing, then add it to every EXTERNAL TestFlight beta group so external
 * testers get it without a manual trip to App Store Connect.
 *
 *   node testflight_distribute.js <buildNumber>   distribute that build
 *   node testflight_distribute.js --list          list the app's beta groups
 *
 * Same env as release_ios.js: APP_STORE_KEY_ID, APP_STORE_ISSUER_ID
 * (optional APP_STORE_APP_ID, APP_STORE_KEY_PATH).
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { makeToken } = require('./get_next_ios_build_number');

const KEY_ID = process.env.APP_STORE_KEY_ID;
const ISSUER_ID = process.env.APP_STORE_ISSUER_ID;
const APP_ID = process.env.APP_STORE_APP_ID || '6802447554';
const KEY_PATH = process.env.APP_STORE_KEY_PATH || path.join(os.homedir(), '.private_keys', `AuthKey_${KEY_ID}.p8`);
const POLL_MS = 20000;
const MAX_WAIT_MS = 30 * 60 * 1000;

function api(method, urlPath, body) {
  const token = makeToken(KEY_ID, ISSUER_ID, fs.readFileSync(KEY_PATH, 'utf8'));
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.appstoreconnect.apple.com${urlPath}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(payload && { 'Content-Type': 'application/json' }) },
    }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        const json = data ? JSON.parse(data) : {};
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
        else reject(Object.assign(new Error(`${method} ${urlPath} -> ${res.statusCode}: ${data.slice(0, 600)}`), { status: res.statusCode }));
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function betaGroups() {
  const json = await api('GET', `/v1/apps/${APP_ID}/betaGroups?limit=200`);
  return json.data.map(g => ({ id: g.id, name: g.attributes.name, internal: g.attributes.isInternalGroup }));
}

async function waitForBuild(buildNumber) {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    const json = await api('GET', `/v1/builds?filter[app]=${APP_ID}&filter[version]=${buildNumber}&limit=1`);
    const b = json.data[0];
    if (b) {
      const state = b.attributes.processingState;
      if (state === 'VALID') return b.id;
      if (state !== 'PROCESSING') throw new Error(`Build ${buildNumber} processing ended as ${state}.`);
    }
    console.log(`Waiting for build ${buildNumber} to finish processing...`);
    await sleep(POLL_MS);
  }
  throw new Error(`Timed out waiting for build ${buildNumber} to process.`);
}

async function main() {
  if (!KEY_ID || !ISSUER_ID) throw new Error('APP_STORE_KEY_ID and APP_STORE_ISSUER_ID must be set.');
  const arg = process.argv[2];
  if (arg === '--list') {
    for (const g of await betaGroups()) console.log(`${g.internal ? 'internal' : 'EXTERNAL'}  ${g.id}  ${g.name}`);
    return;
  }
  const buildNumber = parseInt(arg, 10);
  if (!Number.isFinite(buildNumber)) throw new Error('Usage: testflight_distribute.js <buildNumber> | --list');

  const buildId = await waitForBuild(buildNumber);
  // Without this answer the build sits at "Missing Compliance" and cannot be tested.
  try {
    await api('PATCH', `/v1/builds/${buildId}`, { data: { type: 'builds', id: buildId, attributes: { usesNonExemptEncryption: false } } });
  } catch (e) {
    console.log(`(export compliance not set: ${e.message.slice(0, 120)})`);
  }

  const external = (await betaGroups()).filter(g => !g.internal);
  if (external.length === 0) { console.log('No external beta groups found; nothing to add.'); return; }
  for (const g of external) {
    await api('POST', `/v1/betaGroups/${g.id}/relationships/builds`, { data: [{ type: 'builds', id: buildId }] });
    console.log(`Added build ${buildNumber} to external group "${g.name}".`);
  }
  // The first build of a version needs beta app review before external testers can install it.
  try {
    await api('POST', '/v1/betaAppReviewSubmissions', { data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: buildId } } } } });
    console.log('Submitted for beta app review.');
  } catch (e) {
    console.log(`(beta review submission skipped: ${e.message.slice(0, 160)})`);
  }
}

main().catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
