/**
 * DX surface added in 0.4: the staffer mode's minimal prompt, task text from
 * --prompt-file / --stdin, and first-run auto-ignore of .agy-staff/.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sandbox, run, agyCalls, jobIdOf, waitForJob, waitForCalls, promptOf } from './helpers.mjs';

describe('staffer: the general-purpose mode', () => {
  test('prompt is minimal: task + environment + guardrails, no role or output framing', async () => {
    const sb = sandbox('staffer-prompt');
    const r = run(sb, ['staffer', 'do the thing']);
    assert.equal(r.code, 0, r.stderr);
    await waitForJob(sb, jobIdOf(r.stdout));
    const [argv] = await waitForCalls(sb, 1);
    const prompt = promptOf(argv);
    assert.match(prompt, /## Task\n\ndo the thing/);
    assert.match(prompt, /## Environment/);
    assert.match(prompt, /## Guardrails/);
    // the whole point of staffer: no template context beyond the guardrails
    assert.doesNotMatch(prompt, /## Rules/);
    assert.doesNotMatch(prompt, /## Output format/);
    assert.doesNotMatch(prompt, /You are/);
  });

  test('staffer can be restricted per repo like the other tool-using modes', () => {
    const sb = sandbox('staffer-policy');
    const r = run(sb, ['setup', '--restrict', 'staffer']);
    assert.equal(r.code, 0, r.stderr);
    const started = run(sb, ['staffer', 'a task']);
    assert.match(started.stdout, /profile: restricted/);
  });
});

describe('task text sources', () => {
  test('inline task text keeps flag-like tokens opaque after the first positional', () => {
    const sb = sandbox('inline-flag-like');
    const r = run(sb, ['ask', 'what does git diff --check do?']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(promptOf(agyCalls(sb)[0]), /git diff --check do\?/);
  });

  test('--prompt-file reads the task from a file', async () => {
    const sb = sandbox('prompt-file');
    const f = path.join(sb.root, 'task.md');
    fs.writeFileSync(f, 'a long task written in a file about git diff --check\n');
    const r = run(sb, ['staffer', '--prompt-file', f]);
    assert.equal(r.code, 0, r.stderr);
    await waitForJob(sb, jobIdOf(r.stdout));
    const [argv] = await waitForCalls(sb, 1);
    assert.match(promptOf(argv), /a long task written in a file about git diff --check/);
  });

  test('--stdin reads the task from stdin', async () => {
    const sb = sandbox('prompt-stdin');
    const r = run(sb, ['staffer', '--stdin'], {}, { input: 'a task piped via stdin\n' });
    assert.equal(r.code, 0, r.stderr);
    await waitForJob(sb, jobIdOf(r.stdout));
    const [argv] = await waitForCalls(sb, 1);
    assert.match(promptOf(argv), /a task piped via stdin/);
  });

  test('a missing --prompt-file dies pre-flight', () => {
    const sb = sandbox('prompt-file-missing');
    const r = run(sb, ['staffer', '--prompt-file', '/no/such/file.md']);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /cannot read --prompt-file/);
  });

  test('two task sources at once die pre-flight', () => {
    const sb = sandbox('prompt-two-sources');
    const f = path.join(sb.root, 'task.md');
    fs.writeFileSync(f, 'file task\n');
    const r = run(sb, ['staffer', '--prompt-file', f, 'inline task too']);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /more than one way/);
  });
});

describe('.agy-staff/ hygiene is automatic', () => {
  test('first run appends .agy-staff/ to .git/info/exclude', () => {
    const sb = sandbox('auto-exclude');
    // undo the sandbox's own hygiene to simulate a fresh caller
    const exclude = path.join(sb.repo, '.git', 'info', 'exclude');
    fs.writeFileSync(exclude, '');

    const r = run(sb, ['ask', 'a question']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(fs.readFileSync(exclude, 'utf8'), /^\.agy-staff\/$/m);
    const check = spawnSync('git', ['check-ignore', '-q', '.agy-staff'], { cwd: sb.repo });
    assert.equal(check.status, 0, '.agy-staff must be git-ignored after the first run');
  });

  test('an already-ignored .agy-staff/ is not appended again', () => {
    const sb = sandbox('auto-exclude-idempotent');
    const exclude = path.join(sb.repo, '.git', 'info', 'exclude');
    const before = fs.readFileSync(exclude, 'utf8');

    const r = run(sb, ['ask', 'a question']);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(fs.readFileSync(exclude, 'utf8'), before);
  });
});
