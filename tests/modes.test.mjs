/**
 * Per-mode defaults: execution style, permission profile wiring, the tiered
 * git guards, and the prompt-based review contract.
 *
 * Round-2 spec: research/review/implement all default to `unrestricted`
 * (--dangerously-skip-permissions on the agy argv), `--restricted` is the
 * opt-in hardening flag, and ask stays tool-free/restricted. Guards are tiered:
 * implement receives bounded dirty-workspace prompt context, review/research
 * are never blocked and report any working-tree delta with the result instead.
 *
 * Output split: stdout (and the stored result file) carry agy's response plus
 * any guard warning; the `[agy-staff]` telemetry line goes to stderr, which for
 * a background job means the worker's `jobs/<id>.log`.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  sandbox,
  run,
  agyCalls,
  promptOf,
  jobIdOf,
  jobLog,
  jobResultFile,
  waitForJob,
  waitForCalls,
} from './helpers.mjs';

const SKIP = '--dangerously-skip-permissions';

describe('execution style is fixed per mode', () => {
  test('ask runs in the foreground and returns the answer synchronously', () => {
    const sb = sandbox('ask');
    const r = run(sb, ['ask', 'what is 2 plus 2?']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /fake answer/);
    assert.doesNotMatch(r.stdout, /Started background/);
    assert.equal(agyCalls(sb).length, 1);
  });

  test('ask keeps the answer on stdout and the telemetry on stderr', () => {
    const sb = sandbox('ask-telemetry');
    const r = run(sb, ['ask', 'what is 2 plus 2?']);
    assert.equal(r.code, 0, r.stderr);

    // stdout is the deliverable only — no plumbing for the user to read
    assert.match(r.stdout, /fake answer/);
    assert.doesNotMatch(r.stdout, /\[agy-staff\]/);
    assert.doesNotMatch(r.stdout, /conversation: conv-1/);
    assert.doesNotMatch(r.stdout, /^---$/m);

    // stderr carries the telemetry, both lines, for the calling agent
    assert.match(r.stderr, /\[agy-staff\] mode=ask profile=restricted model=\S+ /);
    assert.match(r.stderr, /duration=\S+ turns=\S+ tokens\(/);
    assert.match(r.stderr, /^conversation: conv-1 \(follow up with --continue\)$/m);
  });

  for (const [mode, task] of [
    ['staffer', 'a task'],
    ['research', 'a topic'],
    ['review', 'Review PR #1'],
    ['implement', 'a task'],
  ]) {
    test(`${mode} starts a background job immediately`, () => {
      const sb = sandbox(`bg-${mode}`);
      const r = run(sb, [mode, task]);
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, new RegExp(`Started background ${mode} job\\.`));
      const id = jobIdOf(r.stdout);
      assert.match(id, new RegExp(`^${mode}-`));
      // the collect contract is stated in the job-start output itself
      assert.match(r.stdout, new RegExp('Collect: run `wait ' + id + ' --timeout \\d+m`'));
      assert.match(r.stdout, /one background wait per job/);
      // the dispatch itself must not have blocked on agy — no telemetry on
      // either stream, the run has not happened yet
      assert.doesNotMatch(r.stdout, /\[agy-staff\] mode=/);
      assert.doesNotMatch(r.stderr, /\[agy-staff\] mode=/);
    });
  }
});

describe('permission profile wiring reaches the agy argv', () => {
  // Round 2: equal permissions — every tool-using mode is unrestricted by
  // default, so all three must carry --dangerously-skip-permissions with no
  // flags and no setup.
  for (const [mode, task] of [
    ['staffer', 'a task'],
    ['research', 'a topic'],
    ['review', 'Review PR #1'],
    ['implement', 'a task'],
  ]) {
    test(`${mode} defaults to unrestricted → passes --dangerously-skip-permissions`, async () => {
      const sb = sandbox(`prof-${mode}`);
      const r = run(sb, [mode, task]);
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, /profile: unrestricted/);
      assert.doesNotMatch(r.stdout, /profile: restricted/);
      await waitForJob(sb, jobIdOf(r.stdout));
      const [argv] = await waitForCalls(sb, 1);
      assert.ok(argv.includes(SKIP), `expected ${SKIP} in ${JSON.stringify(argv)}`);
    });

    test(`${mode} --restricted opts out → no --dangerously-skip-permissions`, async () => {
      const sb = sandbox(`prof-${mode}-restricted`);
      const r = run(sb, [mode, '--restricted', task]);
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, /profile: restricted/);
      await waitForJob(sb, jobIdOf(r.stdout));
      const [argv] = await waitForCalls(sb, 1);
      assert.ok(!argv.includes(SKIP), `unexpected ${SKIP} in ${JSON.stringify(argv)}`);
    });
  }

  test('research --unrestricted is redundant but still explicit', async () => {
    const sb = sandbox('prof-research-un');
    const r = run(sb, ['research', '--unrestricted', 'a topic']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /profile: unrestricted/);
    await waitForJob(sb, jobIdOf(r.stdout));
    const [argv] = await waitForCalls(sb, 1);
    assert.ok(argv.includes(SKIP), `expected ${SKIP} in ${JSON.stringify(argv)}`);
  });

  test('ask never gets --dangerously-skip-permissions', () => {
    const sb = sandbox('prof-ask');
    const r = run(sb, ['ask', 'what is 2 plus 2?']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /profile=restricted/);
    const [argv] = agyCalls(sb);
    assert.ok(!argv.includes(SKIP), `unexpected ${SKIP} in ${JSON.stringify(argv)}`);
  });

  test('ask --unrestricted is ignored: note on stderr, still restricted', () => {
    const sb = sandbox('prof-ask-un');
    const r = run(sb, ['ask', '--unrestricted', 'what is 2 plus 2?']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /^agy-staff: ask is tool-free; --unrestricted ignored$/m);
    assert.match(r.stderr, /profile=restricted/);
    assert.doesNotMatch(r.stdout, /profile=/);
    const [argv] = agyCalls(sb);
    assert.ok(!argv.includes(SKIP), `unexpected ${SKIP} in ${JSON.stringify(argv)}`);
  });

  test('a --restricted run coming back empty gets the reworded triage message', async () => {
    const sb = sandbox('restricted-empty');
    const started = run(sb, ['research', '--restricted', 'a topic'], {
      FAKE_AGY_RESPONSE: '',
    });
    assert.equal(started.code, 0, started.stderr);
    const id = jobIdOf(started.stdout);
    assert.equal(await waitForJob(sb, id), 'error');

    const res = run(sb, ['result', id]);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /agy returned an empty response \(status SUCCESS but no content\)/);
    // restricted is the opt-in now: the message must say the user asked for it
    assert.match(res.stdout, /This run used `--restricted`/);
    assert.match(res.stdout, /every unlisted tool call is auto-denied/);
    // two ways out, setup OR dropping the flag — the second one is new
    assert.match(res.stdout, /run `setup` once/);
    assert.match(res.stdout, /drop `--restricted`/);
    assert.match(res.stdout, /research runs unrestricted by default/);
    assert.match(res.stdout, /some agy tools ignore allow-rules in headless mode/);
  });

  test('an unrestricted empty response never suggests setup or --restricted', async () => {
    const sb = sandbox('unrestricted-empty');
    const started = run(sb, ['research', 'a topic'], { FAKE_AGY_RESPONSE: '' });
    assert.equal(started.code, 0, started.stderr);
    const id = jobIdOf(started.stdout);
    assert.equal(await waitForJob(sb, id), 'error');

    const res = run(sb, ['result', id]);
    assert.match(res.stdout, /agy returned an empty response/);
    assert.doesNotMatch(res.stdout, /run `setup` once/);
    assert.doesNotMatch(res.stdout, /--restricted/);
  });

  test('EPERM in agy stderr gets the harness-sandbox hint', async () => {
    const sb = sandbox('sandbox-eperm');
    const started = run(sb, ['research', 'a topic'], {
      FAKE_AGY_NO_JSON: '1',
      FAKE_AGY_STDERR:
        'ERROR: creating log file: opening /home/u/.gemini/antigravity-cli/log/cli.log: operation not permitted',
    });
    assert.equal(started.code, 0, started.stderr);
    const id = jobIdOf(started.stdout);
    assert.equal(await waitForJob(sb, id), 'error');

    const res = run(sb, ['result', id]);
    assert.match(res.stdout, /did not return parseable JSON/);
    assert.match(res.stdout, /harness command sandbox blocking agy/);
    assert.match(res.stdout, /grant the workspace full access|escalated permissions/);
  });

  test('a non-JSON crash without EPERM gets no sandbox hint', async () => {
    const sb = sandbox('crash-no-hint');
    const started = run(sb, ['research', 'a topic'], {
      FAKE_AGY_NO_JSON: '1',
      FAKE_AGY_STDERR: 'segfault somewhere unrelated',
    });
    assert.equal(started.code, 0, started.stderr);
    const id = jobIdOf(started.stdout);
    assert.equal(await waitForJob(sb, id), 'error');

    const res = run(sb, ['result', id]);
    assert.match(res.stdout, /did not return parseable JSON/);
    assert.doesNotMatch(res.stdout, /harness command sandbox/);
  });
});

describe('tiered git guards: implement', () => {
  test('implement defaults to high effort Flash', async () => {
    const sb = sandbox('impl-default-model');
    const started = run(sb, ['implement', 'a task']);
    assert.equal(started.code, 0, started.stderr);
    assert.match(started.stdout, /model: gemini-3\.7-flash-high/);

    const id = jobIdOf(started.stdout);
    assert.equal(await waitForJob(sb, id), 'done');
    const [argv] = await waitForCalls(sb, 1);
    assert.equal(argv[argv.indexOf('--model') + 1], 'gemini-3.7-flash-high');
  });

  test('implement on a dirty tree injects workspace context instead of refusing', async () => {
    const sb = sandbox('dirty');
    fs.writeFileSync(path.join(sb.repo, 'dirty.txt'), 'uncommitted\n');

    const r = run(sb, ['implement', 'a task']);
    assert.equal(r.code, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /unrestricted profile refused/);
    assert.match(r.stdout, /Started background implement job\./);

    const id = jobIdOf(r.stdout);
    assert.equal(await waitForJob(sb, id), 'done');
    const [argv] = await waitForCalls(sb, 1);
    const prompt = promptOf(argv);
    assert.match(prompt, /## Existing workspace changes/);
    assert.match(prompt, /dirty\.txt/);
    assert.match(prompt, /Treat these paths as user-owned context/);
  });

  test('dirty workspace context is bounded and points agy at git ground truth', async () => {
    const sb = sandbox('dirty-bounded');
    for (let i = 0; i < 105; i++) {
      fs.writeFileSync(path.join(sb.repo, `dirty-${String(i).padStart(3, '0')}.txt`), 'x\n');
    }

    const r = run(sb, ['implement', 'a task']);
    assert.equal(r.code, 0, r.stderr);
    const id = jobIdOf(r.stdout);
    assert.equal(await waitForJob(sb, id), 'done');

    const [argv] = await waitForCalls(sb, 1);
    const prompt = promptOf(argv);
    assert.match(prompt, /`git status --porcelain` before this run \(bounded summary\):/);
    assert.match(prompt, /\?\? dirty-000\.txt/);
    assert.match(prompt, /\?\? dirty-099\.txt/);
    assert.doesNotMatch(prompt, /\?\? dirty-100\.txt/);
    assert.match(prompt, /truncated to 100 of 105 entries/);
    assert.match(prompt, /Run `git status --porcelain` and inspect relevant diffs/);
  });

  test('implement outside a git repository warns and proceeds', async () => {
    const sb = sandbox('no-git', { git: false });
    const r = run(sb, ['implement', 'a task']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /not a git repository/);
    assert.match(r.stderr, /cannot be reviewed or rolled back via git/);
    assert.match(r.stderr, /Proceeding anyway/);
    // the warning must not become a refusal
    assert.doesNotMatch(r.stderr, /unrestricted profile refused/);
    assert.match(r.stdout, /Started background implement job\./);

    const id = jobIdOf(r.stdout);
    assert.equal(await waitForJob(sb, id), 'done');
    const [argv] = await waitForCalls(sb, 1);
    assert.ok(argv.includes(SKIP), `expected ${SKIP} in ${JSON.stringify(argv)}`);

    const res = run(sb, ['result', id]);
    assert.match(res.stdout, /fake answer/);
    assert.doesNotMatch(res.stdout, /\[agy-staff\]/);
    assert.match(jobLog(sb, id), /\[agy-staff\] mode=implement profile=unrestricted/);
    // no git → no tree report of either kind
    assert.doesNotMatch(res.stdout, /\[unrestricted\] Working tree clean after implement/);
    assert.doesNotMatch(res.stdout, /\[unrestricted\] agy modified the working tree/);
  });

  test('implement reports the tree with the [unrestricted] prefix', async () => {
    const sb = sandbox('guard-report');
    const started = run(sb, ['implement', 'a task']);
    assert.equal(started.code, 0, started.stderr);
    const id = jobIdOf(started.stdout);
    assert.equal(await waitForJob(sb, id), 'done');

    const res = run(sb, ['result', id]);
    assert.equal(res.code, 0, res.stderr);
    // the guard warning stays in the body …
    assert.match(res.stdout, /\[unrestricted\] Working tree clean after implement/);
    assert.doesNotMatch(res.stdout, /\[loose\]/);
    // … the telemetry does not, it is in the worker log instead
    assert.doesNotMatch(res.stdout, /\[agy-staff\]/);
    assert.doesNotMatch(jobResultFile(sb, id), /\[agy-staff\]/);
    assert.match(jobLog(sb, id), /\[agy-staff\] mode=implement profile=unrestricted/);
    assert.match(jobLog(sb, id), /^conversation: conv-1 \(follow up with --continue\)$/m);
  });

  test('implement reports edits agy made on the clean tree', async () => {
    const sb = sandbox('impl-touched');
    const started = run(sb, ['implement', 'a task'], {
      FAKE_AGY_TOUCH_FILE: path.join(sb.repo, 'agy-wrote.txt'),
    });
    assert.equal(started.code, 0, started.stderr);
    const id = jobIdOf(started.stdout);
    assert.equal(await waitForJob(sb, id), 'done');

    const res = run(sb, ['result', id]);
    assert.match(res.stdout, /\[unrestricted\] agy modified the working tree\./);
    assert.match(res.stdout, /New untracked files: agy-wrote\.txt/);
    assert.match(res.stdout, /ACTION FOR THE CALLING AGENT/);
  });

  test('implement continuation can build on its own dirty result', async () => {
    const sb = sandbox('impl-continue-dirty');
    const first = run(sb, ['implement', 'write a file'], {
      FAKE_AGY_TOUCH_FILE: path.join(sb.repo, 'agy-wrote.txt'),
    });
    assert.equal(first.code, 0, first.stderr);
    assert.equal(await waitForJob(sb, jobIdOf(first.stdout)), 'done');

    const cont = run(sb, ['continue', 'refine the same change']);
    assert.equal(cont.code, 0, cont.stderr);
    assert.match(cont.stdout, /Started background implement job\./);
    assert.equal(await waitForJob(sb, jobIdOf(cont.stdout)), 'done');

    const calls = await waitForCalls(sb, 2);
    assert.equal(calls[1][calls[1].indexOf('--conversation') + 1], 'conv-1');
    assert.match(promptOf(calls[1]), /refine the same change/);
    assert.match(promptOf(calls[1]), /## Existing workspace changes/);
    assert.match(promptOf(calls[1]), /agy-wrote\.txt/);
  });
});

describe('tiered git guards: review / research are never blocked', () => {
  for (const [mode, task] of [
    ['review', 'Review the working tree'],
    ['research', 'a topic'],
  ]) {
    test(`${mode} runs in a dirty git tree (no clean-tree gate)`, async () => {
      const sb = sandbox(`dirty-${mode}`);
      fs.writeFileSync(path.join(sb.repo, 'dirty.txt'), 'uncommitted\n');

      const r = run(sb, [mode, task]);
      assert.equal(r.code, 0, r.stderr);
      assert.doesNotMatch(r.stderr, /working tree is not clean/);
      assert.match(r.stdout, new RegExp(`Started background ${mode} job\\.`));

      const id = jobIdOf(r.stdout);
      assert.equal(await waitForJob(sb, id), 'done');
      const res = run(sb, ['result', id]);
      assert.match(res.stdout, /fake answer/);
      // pre-existing dirt is not agy's doing → no delta warning
      assert.doesNotMatch(res.stdout, /\[unrestricted\] agy modified the working tree/);
    });
  }

  test('review outside a git repository runs with no tree report', async () => {
    const sb = sandbox('review-no-git', { git: false });
    const r = run(sb, ['review', 'Review the working tree']);
    assert.equal(r.code, 0, r.stderr);
    const id = jobIdOf(r.stdout);
    assert.equal(await waitForJob(sb, id), 'done');
    const res = run(sb, ['result', id]);
    assert.match(res.stdout, /fake answer/);
    assert.doesNotMatch(res.stdout, /\[agy-staff\]/);
    assert.match(jobLog(sb, id), /\[agy-staff\] mode=review profile=unrestricted/);
    assert.doesNotMatch(res.stdout, /agy modified the working tree/);
  });
});

describe('working-tree delta report (review / research)', () => {
  test('review reports the file agy touched during the run', async () => {
    const sb = sandbox('delta-review');
    const r = run(sb, ['review', 'Review PR #730'], {
      FAKE_AGY_TOUCH_FILE: path.join(sb.repo, 'sneaky.txt'),
    });
    assert.equal(r.code, 0, r.stderr);
    const id = jobIdOf(r.stdout);
    assert.equal(await waitForJob(sb, id), 'done');

    const res = run(sb, ['result', id]);
    assert.equal(res.code, 0, res.stderr);
    assert.match(
      res.stdout,
      /\[unrestricted\] agy modified the working tree during this review — it should not have\./
    );
    assert.match(res.stdout, /git status --porcelain/);
    assert.match(res.stdout, /\?\? sneaky\.txt/);
    assert.match(res.stdout, /ACTION FOR THE CALLING AGENT: inspect these changes/);
    assert.match(res.stdout, /Rollback: `git checkout -- <path>`/);
    // reporting, not blocking
    assert.match(res.stdout, /fake answer/);
    assert.ok(
      fs.existsSync(path.join(sb.repo, 'sneaky.txt')),
      'the fake agy should really have written the file'
    );
  });

  test('the delta report is silent when agy touched nothing', async () => {
    const sb = sandbox('delta-review-clean');
    const r = run(sb, ['review', 'Review PR #730']);
    assert.equal(r.code, 0, r.stderr);
    const id = jobIdOf(r.stdout);
    assert.equal(await waitForJob(sb, id), 'done');

    const res = run(sb, ['result', id]);
    assert.match(res.stdout, /fake answer/);
    assert.doesNotMatch(res.stdout, /\[agy-staff\]/);
    assert.match(jobLog(sb, id), /\[agy-staff\] mode=review profile=unrestricted/);
    assert.doesNotMatch(res.stdout, /agy modified the working tree/);
    assert.doesNotMatch(res.stdout, /Working tree unchanged/);
  });

  test('the delta is only what appeared during the run, not pre-existing dirt', async () => {
    const sb = sandbox('delta-review-dirty');
    fs.writeFileSync(path.join(sb.repo, 'pre-existing.txt'), 'was here first\n');

    const r = run(sb, ['review', 'Review the working tree'], {
      FAKE_AGY_TOUCH_FILE: path.join(sb.repo, 'sneaky.txt'),
    });
    assert.equal(r.code, 0, r.stderr);
    const id = jobIdOf(r.stdout);
    assert.equal(await waitForJob(sb, id), 'done');

    const res = run(sb, ['result', id]);
    const delta = res.stdout.slice(res.stdout.indexOf('agy modified the working tree'));
    assert.match(delta, /\?\? sneaky\.txt/);
    assert.doesNotMatch(delta, /pre-existing\.txt/);
  });

  test('research reports the delta too', async () => {
    const sb = sandbox('delta-research');
    const r = run(sb, ['research', 'a topic'], {
      FAKE_AGY_TOUCH_FILE: path.join(sb.repo, 'notes.txt'),
    });
    assert.equal(r.code, 0, r.stderr);
    const id = jobIdOf(r.stdout);
    assert.equal(await waitForJob(sb, id), 'done');

    const res = run(sb, ['result', id]);
    assert.match(
      res.stdout,
      /\[unrestricted\] agy modified the working tree during this research — it should not have\./
    );
    assert.match(res.stdout, /\?\? notes\.txt/);
  });

  test('a --restricted review reports no delta (guards are unrestricted-only)', async () => {
    const sb = sandbox('delta-restricted');
    const r = run(sb, ['review', '--restricted', 'Review PR #730'], {
      FAKE_AGY_TOUCH_FILE: path.join(sb.repo, 'sneaky.txt'),
    });
    assert.equal(r.code, 0, r.stderr);
    const id = jobIdOf(r.stdout);
    assert.equal(await waitForJob(sb, id), 'done');

    const res = run(sb, ['result', id]);
    assert.match(res.stdout, /fake answer/);
    assert.doesNotMatch(res.stdout, /\[agy-staff\]/);
    assert.match(jobLog(sb, id), /\[agy-staff\] mode=review profile=restricted/);
    assert.doesNotMatch(res.stdout, /agy modified the working tree/);
  });
});

describe('kept and rejected flags', () => {
  test('review --json passes a schema to agy', async () => {
    const sb = sandbox('review-json');
    const r = run(sb, ['review', '--json', 'Review PR #730']);
    assert.equal(r.code, 0, r.stderr);
    await waitForJob(sb, jobIdOf(r.stdout));
    const [argv] = await waitForCalls(sb, 1);
    assert.ok(argv.includes('--json-schema'), JSON.stringify(argv));
    const schema = JSON.parse(argv[argv.indexOf('--json-schema') + 1]);
    assert.deepEqual(schema.required, ['verdict', 'summary', 'findings', 'could_not_verify']);
  });

  test('an undocumented flag is rejected as unknown', () => {
    const sb = sandbox('unknown-flag');
    const r = run(sb, ['research', '--nope', 'a topic']);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /unknown flag --nope/);
  });
});

describe('review is prompt-based', () => {
  test('review with no subject dies with the needs-a-subject message', () => {
    const sb = sandbox('review-empty');
    const r = run(sb, ['review']);
    assert.notEqual(r.code, 0);
    assert.match(
      r.stderr,
      /review needs a subject description, e\.g\. review "Review PR #730" or review "Review the current working tree"/
    );
    assert.equal(agyCalls(sb).length, 0);
  });

  test('review "Review PR #730" works with no flags and puts the task in the prompt', async () => {
    const sb = sandbox('review-pr');
    const r = run(sb, ['review', 'Review PR #730']);
    assert.equal(r.code, 0, r.stderr);
    await waitForJob(sb, jobIdOf(r.stdout));
    const [argv] = await waitForCalls(sb, 1);
    const prompt = promptOf(argv);
    assert.match(prompt, /Review PR #730/);
    // prompt-based: no inlined diff section
    assert.doesNotMatch(prompt, /\{\{DIFF\}\}/);
  });
});
