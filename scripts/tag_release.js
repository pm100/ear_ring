#!/usr/bin/env node
/**
 * tag_release.js — tag the released commit on GitHub, e.g. "build-ios-15" for a
 * test upload (TestFlight / Play closed testing) or "release-1.0" for production.
 *
 *   node tag_release.js <tagName> [message] [commit]   (commit defaults to HEAD)
 *
 * Also used by release_ios.js / release_android.js / publish_android.js, where a
 * failure only warns: the upload has already happened by then.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const REPO = path.join(__dirname, '..');

function git(...args) {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
  return { ok: r.status === 0, out: ((r.stdout || '') + (r.stderr || '')).trim() };
}

function tagRelease(tag, message, commit = 'HEAD') {
  if (git('rev-parse', '-q', '--verify', `refs/tags/${tag}`).ok) {
    console.log(`Tag ${tag} already exists; leaving it.`);
    return true;
  }
  const t = git('tag', '-a', tag, '-m', message || tag, commit);
  if (!t.ok) { console.warn(`⚠️  Could not create tag ${tag}: ${t.out}`); return false; }
  const p = git('push', 'origin', `refs/tags/${tag}`);
  if (!p.ok) { console.warn(`⚠️  Tag ${tag} created locally but not pushed: ${p.out}`); return false; }
  console.log(`Tagged ${tag} on GitHub.`);
  return true;
}

/** Aborts (exit 1) unless HEAD is committed, pushed, and matches the working tree, so the
 *  tag tagRelease() puts on HEAD points at what was actually built. Bypass: ALLOW_DIRTY_RELEASE=1.
 *  A changed CFBundleVersion in Info.plist is ignored (release_ios.js rewrites it). */
function requireReleasableHead() {
  if (process.env.ALLOW_DIRTY_RELEASE === '1') return;
  const problems = [];
  const norm = t => t.trim().replace(/\r\n/g, '\n').replace(/(<key>CFBundleVersion<\/key>\s*<string>)[^<]*/, '$1');
  const dirty = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.split('\n').filter(Boolean).filter(f => {
    if (!f.endsWith('Info.plist')) return true;
    const work = require('fs').readFileSync(path.join(REPO, f), 'utf8');
    return norm(git('show', `HEAD:${f}`).out) !== norm(work);
  });
  if (dirty.length) problems.push(`uncommitted changes in tracked files: ${dirty.join(', ')}`);
  if (!git('branch', '-r', '--contains', 'HEAD').out.trim()) problems.push('HEAD is not pushed to origin');
  if (problems.length) {
    console.error(`Refusing to release: ${problems.join('; ')}.\n` +
      'Commit and push first (on the Mac: git pull), so the release tag matches what is built.\n' +
      'Override with ALLOW_DIRTY_RELEASE=1.');
    process.exit(1);
  }
}

module.exports = { tagRelease, requireReleasableHead };

if (require.main === module) {
  const [tag, message, commit] = process.argv.slice(2);
  if (!tag) { console.error('Usage: tag_release.js <tagName> [message] [commit]'); process.exit(1); }
  process.exit(tagRelease(tag, message, commit) ? 0 : 1);
}
