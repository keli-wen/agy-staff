/**
 * Flag surface: removed 0.1 flags, deprecated aliases, mutual exclusion.
 * Spec sections "Removed flags", "Deprecated aliases", "Permission profiles".
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, run, agyCalls } from './helpers.mjs';

describe('removed review flags (--diff-file / --pr / --target)', () => {
  for (const [flag, args] of [
    ['--diff-file', ['review', '--diff-file', '/tmp/x.patch', '--prompt', 'subject']],
    ['--pr', ['review', '--pr', '730', '--prompt', 'subject']],
    ['--target', ['review', '--target', 'master', '--prompt', 'subject']],
  ]) {
    test(`${flag} dies with the prompt-based migration message`, () => {
      const sb = sandbox('removed-review');
      const r = run(sb, args);
      assert.notEqual(r.code, 0, `${flag} must exit nonzero`);
      assert.match(
        r.stderr,
        new RegExp(`${flag} was removed in 0\\.2: review is prompt-based now\\.`)
      );
      assert.match(r.stderr, /Describe the subject in the prompt/);
      assert.match(r.stderr, /review --prompt "Review PR #730"/);
      assert.match(r.stderr, /review --prompt "Review changes against master"/);
      // no execution-style advice leaking into the review message
      assert.doesNotMatch(r.stderr, /execution style is fixed per mode/);
      assert.equal(agyCalls(sb).length, 0, 'agy must not be invoked');
    });
  }
});

describe('removed execution flags (--background / --wait)', () => {
  for (const [flag, args] of [
    ['--background', ['research', '--background', '--prompt', 'task']],
    ['--wait', ['research', '--wait', '--prompt', 'task']],
    // also removed for ask, whose 0.1 special case is now moot
    ['--background', ['ask', '--background', '--prompt', 'question']],
  ]) {
    test(`${flag} dies with the fixed-execution-style migration message`, () => {
      const sb = sandbox('removed-exec');
      const r = run(sb, args);
      assert.notEqual(r.code, 0, `${flag} must exit nonzero`);
      assert.match(
        r.stderr,
        new RegExp(`${flag} was removed in 0\\.2: execution style is fixed per mode`)
      );
      assert.match(
        r.stderr,
        /ask runs in the foreground; research\/review\/implement run as background jobs/
      );
      assert.match(r.stderr, /Use status\/result\/cancel to manage jobs\./);
      assert.doesNotMatch(r.stderr, /review is prompt-based now/);
      assert.equal(agyCalls(sb).length, 0, 'agy must not be invoked');
    });
  }
});

describe('deprecated aliases', () => {
  test('--strict maps to restricted and warns once on stderr', () => {
    const sb = sandbox('alias-strict');
    const r = run(sb, ['implement', '--strict', '--prompt', 'do a thing']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /^agy-staff: --strict is deprecated; use --restricted$/m);
    // implement defaults to unrestricted, so the alias is what flips it
    assert.match(r.stdout, /profile: restricted/);
  });

  test('--loose maps to unrestricted and warns once on stderr', () => {
    const sb = sandbox('alias-loose');
    const r = run(sb, ['research', '--loose', '--prompt', 'a topic']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /^agy-staff: --loose is deprecated; use --unrestricted$/m);
    // research is unrestricted by default in 0.2 round 2, so --loose is now
    // redundant; what the alias must still do is resolve and warn, not die
    assert.match(r.stdout, /profile: unrestricted/);
  });

  test('--restricted with the --loose alias is mutually exclusive', () => {
    const sb = sandbox('alias-conflict');
    const r = run(sb, ['research', '--restricted', '--loose', '--prompt', 'a topic']);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /--restricted and --unrestricted are mutually exclusive/);
    assert.equal(agyCalls(sb).length, 0, 'agy must not be invoked');
  });

  test('--restricted with --unrestricted is mutually exclusive', () => {
    const sb = sandbox('conflict');
    const r = run(sb, ['research', '--restricted', '--unrestricted', '--prompt', 'a topic']);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /--restricted and --unrestricted are mutually exclusive/);
  });
});
