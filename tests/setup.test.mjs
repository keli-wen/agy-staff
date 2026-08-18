/**
 * setup: dry run by default, evidence-gathering allowlist wording, and no
 * writes anywhere until --apply.
 *
 * Round 2 reframes setup as OPTIONAL hardening — research/review/implement work
 * out of the box unrestricted, and the allowlist only matters for `--restricted`
 * runs. The disclosure content (global scope, prefix-match, not read-only) is
 * unchanged. HOME is a throwaway directory, so the real ~/.gemini is untouched.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sandbox, run } from './helpers.mjs';

const EVIDENCE_ALLOWLIST = [
  'command(git)',
  'command(gh)',
  'command(cat)',
  'command(head)',
  'command(ls)',
  'command(grep)',
  'command(find)',
  'command(rg)',
  'command(wc)',
];

describe('setup dry run', () => {
  test('exits 0, prints the allowlist, and writes nothing under HOME', () => {
    const sb = sandbox('setup');
    const r = run(sb, ['setup']);
    assert.equal(r.code, 0, r.stderr);

    // probed the (fake) agy binary
    assert.match(r.stdout, /agy CLI: OK \(version 1\.1\.13-fake\)/);
    assert.match(r.stdout, new RegExp(`${sb.home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(r.stdout, /\.gemini\/antigravity-cli\/settings\.json \(will be created\)/);

    for (const rule of EVIDENCE_ALLOWLIST) {
      assert.ok(r.stdout.includes(rule), `missing allow-rule ${rule} in setup output`);
    }

    // round-2 framing: optional hardening, tied to --restricted, not a
    // prerequisite for the tool-using modes
    assert.match(r.stdout, /Setup is optional hardening/);
    assert.match(r.stdout, /research\/review\/implement already run unrestricted by default/);
    assert.match(r.stdout, /only matters if you use `--restricted`/);
    // (the notes paragraph wraps this one across lines)
    assert.match(r.stdout, /unrestricted by\s+default \(--dangerously-skip-permissions\)/);
    assert.doesNotMatch(r.stdout, /must (run|complete) setup/i);

    // disclosure wording (unchanged): evidence gathering, global scope,
    // prefix-match risk stated; never "read-only"
    assert.match(r.stdout, /evidence[- ]gathering/i);
    assert.match(r.stdout, /GLOBAL/);
    assert.match(r.stdout, /prefix-match/i);
    assert.match(r.stdout, /not a read-only one/);
    assert.match(r.stdout, /DRY RUN — nothing written/);
    assert.match(r.stdout, /To apply: rerun with --apply/);
    // the native-tool caveat: even a complete allowlist may not be enough
    assert.match(r.stdout, /ignore allow-rules in headless mode/);
    assert.match(r.stdout, /drop --restricted/);
    assert.doesNotMatch(r.stdout, /--loose/);
    assert.doesNotMatch(r.stdout, /--strict/);

    // nothing at all created under the temp HOME
    assert.equal(
      fs.existsSync(path.join(sb.home, '.gemini')),
      false,
      'dry run must not create ~/.gemini'
    );
    assert.deepEqual(fs.readdirSync(sb.home), [], 'dry run must not write under HOME');
  });

  test('--dry-run is accepted explicitly and still writes nothing', () => {
    const sb = sandbox('setup-dryrun');
    const r = run(sb, ['setup', '--dry-run']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /DRY RUN — nothing written/);
    assert.deepEqual(fs.readdirSync(sb.home), []);
  });
});
