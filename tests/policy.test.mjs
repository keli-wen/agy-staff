/**
 * Project policy (`setup --restrict`): per-repo default profiles in
 * .agy-staff/config.json.
 *
 * Precedence under test: CLI flag > project policy > built-in default.
 * The policy is declarative (listed modes restricted, everything else falls
 * back to the default), repo-local, and written without --apply.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sandbox, run, waitForCalls } from './helpers.mjs';

function configFile(sb) {
  return path.join(sb.repo, '.agy-staff', 'config.json');
}

describe('setup --restrict writes the project policy', () => {
  test('writes config.json, prints the policy, and never touches HOME', () => {
    const sb = sandbox('policy-write');
    const r = run(sb, ['setup', '--restrict', 'review,research']);
    assert.equal(r.code, 0, r.stderr);

    assert.match(r.stdout, /Project policy written/);
    assert.match(r.stdout, /review: restricted/);
    assert.match(r.stdout, /research: restricted/);
    // honest framing: preference, not enforcement
    assert.match(r.stdout, /run policy for\s+consistency, not a security\s+boundary|not a security\s*boundary/);
    // the allowlist part of setup stays a dry run
    assert.match(r.stdout, /ALLOWLIST DRY RUN/);
    assert.deepEqual(fs.readdirSync(sb.home), [], 'policy write must not touch HOME');

    const cfg = JSON.parse(fs.readFileSync(configFile(sb), 'utf8'));
    assert.deepEqual(cfg.profiles, { review: 'restricted', research: 'restricted' });
  });

  test('is declarative: a second --restrict replaces the previous set', () => {
    const sb = sandbox('policy-replace');
    run(sb, ['setup', '--restrict', 'review,research']);
    run(sb, ['setup', '--restrict', 'implement']);
    const cfg = JSON.parse(fs.readFileSync(configFile(sb), 'utf8'));
    assert.deepEqual(cfg.profiles, { implement: 'restricted' });
  });

  test('--restrict none clears the policy', () => {
    const sb = sandbox('policy-clear');
    run(sb, ['setup', '--restrict', 'review']);
    const r = run(sb, ['setup', '--restrict', 'none']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Project policy cleared/);
    assert.equal(fs.existsSync(configFile(sb)), false, 'an empty config file should be removed');
  });

  test('rejects unknown modes and ask', () => {
    const sb = sandbox('policy-invalid');
    const bogus = run(sb, ['setup', '--restrict', 'reviewz']);
    assert.notEqual(bogus.code, 0);
    assert.match(bogus.stderr, /unknown mode "reviewz"/);

    const ask = run(sb, ['setup', '--restrict', 'ask']);
    assert.notEqual(ask.code, 0);
    assert.match(ask.stderr, /ask is tool-free and always restricted/);
  });

  test('plain setup reports the current policy', () => {
    const sb = sandbox('policy-status');
    run(sb, ['setup', '--restrict', 'review']);
    const r = run(sb, ['setup']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Project policy .*review=restricted/);
  });
});

describe('profile precedence: flag > project policy > default', () => {
  test('a policy-restricted mode runs without --dangerously-skip-permissions', async () => {
    const sb = sandbox('policy-applies');
    run(sb, ['setup', '--restrict', 'review']);
    const r = run(sb, ['review', 'Review the current working tree']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /profile: restricted/);
    assert.match(r.stderr, /profile=restricted set by project policy/);
    const calls = await waitForCalls(sb, 1);
    assert.ok(
      !calls[0].includes('--dangerously-skip-permissions'),
      'policy-restricted run must keep agy permission enforcement on'
    );
  });

  test('unlisted modes keep the built-in default', async () => {
    const sb = sandbox('policy-unlisted');
    run(sb, ['setup', '--restrict', 'review']);
    const r = run(sb, ['research', 'a topic']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /profile: unrestricted/);
    const calls = await waitForCalls(sb, 1);
    assert.ok(calls[0].includes('--dangerously-skip-permissions'));
  });

  test('an explicit flag overrides the policy', async () => {
    const sb = sandbox('policy-flag-wins');
    run(sb, ['setup', '--restrict', 'review']);
    const r = run(sb, ['review', '--unrestricted', 'Review the current working tree']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /profile: unrestricted/);
    assert.doesNotMatch(r.stderr, /set by project policy/);
    const calls = await waitForCalls(sb, 1);
    assert.ok(calls[0].includes('--dangerously-skip-permissions'));
  });

  test('--restrict on a mode run dies with a pointer to --restricted', () => {
    const sb = sandbox('policy-typo');
    const r = run(sb, ['review', '--restrict', 'Review the tree']);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /--restrict is a setup flag/);
    assert.match(r.stderr, /use --restricted/);
  });

  test('a corrupt config dies instead of being silently ignored', () => {
    const sb = sandbox('policy-corrupt');
    fs.mkdirSync(path.join(sb.repo, '.agy-staff'), { recursive: true });
    fs.writeFileSync(configFile(sb), '{nope');
    const r = run(sb, ['review', 'Review the tree']);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /project config is corrupt/);
  });
});
