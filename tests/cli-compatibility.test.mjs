import test from 'node:test';
import assert from 'node:assert/strict';
import { cliCompatibility, unsupportedCliHint } from '../companion/cli-compatibility.mjs';
import { sandbox, run, jobIdOf, waitForJob, agyCalls } from './helpers.mjs';

test('metadata recommendation compares version components and tolerates unknown versions', () => {
  for (const v of ['1.1.27', '1.2.6', '1.4.9', 'v1.4.10-dev', '1.4.9+build.42']) assert.match(cliCompatibility(v).warning, /Continuing with legacy diagnostics/);
  for (const v of ['1.4.11', '1.4.12-fake', '1.4.11+build.42', '1.5.0', '2.0.0']) assert.equal(cliCompatibility(v).warning, undefined);
  assert.match(cliCompatibility('unrecognized build').warning, /Could not determine/);
  assert.equal(unsupportedCliHint('401 Unauthorized', '1.4.12'), null);
  assert.equal(unsupportedCliHint('unknown flag --user-typo', '1.4.12'), null);
  assert.match(unsupportedCliHint('flag provided but not defined: -add-dir', '1.0.0'), /installed version: 1.0.0/);
  assert.match(unsupportedCliHint('unsupported output format: stream-json', '1.0.0'), /agy update/);
});

test('old CLI warns but still delivers a foreground answer; unknown version remains usable', () => {
  const sb = sandbox('cli-version-warning');
  for (const v of ['1.1.27', 'custom-build']) {
    const r = run(sb, ['ask', '--prompt', 'test'], { FAKE_AGY_VERSION: v });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, 'fake answer\n');
    assert.match(r.stderr, /agy-staff warning:/);
    assert.match(r.stderr, /agy update/);
    assert.match(r.stderr, /[Pp]lugin|agy-staff/);
  }
  assert.equal(agyCalls(sb).length, 2, 'one model invocation per launch, no retry');
});

test('background CLI warning is returned on launch and remains available with collected results', async () => {
  const sb = sandbox('cli-version-background');
  const started = run(sb, ['staffer', '--prompt', 'test'], { FAKE_AGY_VERSION: '1.2.6' });
  assert.match(started.stderr, /Installed AGY CLI 1.2.6/);
  const id = jobIdOf(started.stdout);
  assert.equal(await waitForJob(sb, id), 'done');
  const obs = JSON.parse(run(sb, ['observe', id]).stdout);
  assert.equal(obs.agy.cli_version, '1.2.6');
  assert.match(obs.agy.compatibility_warning, /legacy diagnostics/);
  const result = run(sb, ['wait', id]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /fake answer/);
  assert.match(result.stderr, /agy update/);
});

test('rejected CLI options identify the installed binary and upgrade action in foreground and background', async () => {
  for (const mode of ['ask', 'staffer']) {
    const sb = sandbox(`cli-rejected-${mode}`);
    const r = run(sb, [mode, '--prompt', 'test'], {
      FAKE_AGY_VERSION: '1.0.0', FAKE_AGY_NO_JSON: '1', FAKE_AGY_STDERR: 'unknown flag: --output-format',
    });
    const delivered = mode === 'ask' ? r : await (async () => {
      const id = jobIdOf(r.stdout);
      assert.equal(await waitForJob(sb, id), 'error');
      const obs = JSON.parse(run(sb, ['observe', id]).stdout);
      assert.match(obs.agy.compatibility_error, /installed version: 1.0.0/);
      return run(sb, ['wait', id]);
    })();
    assert.notEqual(delivered.code, 0);
    assert.match(delivered.stdout + delivered.stderr, /AGY CLI compatibility error/);
    assert.match(delivered.stdout + delivered.stderr, /unknown flag: --output-format/);
    assert.match(delivered.stdout + delivered.stderr, /agy update/);
    assert.equal(agyCalls(sb).length, 1, 'no automatic retry or update');
  }
});

test('foreground JSON failure emits one final metadata record including the compatibility error', () => {
  const sb = sandbox('cli-rejected-json');
  const r = run(sb, ['ask', '--prompt', 'test'], {
    FAKE_AGY_STATUS: 'ERROR', FAKE_AGY_RESPONSE: '', FAKE_AGY_EXIT: '1',
    FAKE_AGY_ERROR: 'unknown flag: --output-format',
  });
  assert.equal(r.code, 1);
  const records = r.stderr.split('\n').filter(line => line.startsWith('[agy-staff] native_result: '));
  assert.equal(records.length, 1);
  const native = JSON.parse(records[0].split('native_result: ')[1]);
  assert.match(native.compatibility_error, /installed version: 1.4.12-fake/);
  assert.equal(native.status, 'ERROR');
  assert.equal(agyCalls(sb).length, 1);
});

test('native API diagnostics outrank flag-like provider prose with or without final JSON', async () => {
  for (const mode of ['ask', 'staffer']) for (const noJSON of [false, true]) {
    const sb = sandbox(`cli-native-priority-${mode}-${noJSON}`);
    const error = { short_error: 'Invalid argument: unknown flag --output-format', status: 'INVALID_ARGUMENT', error_code: 400, code_kind: 'http', retryable: false, error_id: 'fixture' };
    const started = run(sb, [mode, '--prompt', 'test'], {
      FAKE_AGY_STATUS: 'ERROR', FAKE_AGY_RESPONSE: '', FAKE_AGY_EXIT: '3',
      FAKE_AGY_FINISHED_REASON: '"error"', FAKE_AGY_NO_JSON: noJSON ? '1' : '',
      FAKE_AGY_STDERR: `AGY_ERROR: ${JSON.stringify(error)}`,
    });
    let native;
    if (mode === 'ask') {
      assert.equal(started.code, 1);
      const line = started.stderr.split('\n').find(line => line.startsWith('[agy-staff] native_result: '));
      native = JSON.parse(line.split('native_result: ')[1]);
      assert.doesNotMatch(started.stderr, /AGY CLI compatibility error/);
    } else {
      const id = jobIdOf(started.stdout);
      assert.equal(await waitForJob(sb, id), 'error');
      native = JSON.parse(run(sb, ['observe', id]).stdout).agy;
      assert.doesNotMatch(run(sb, ['wait', id]).stdout, /AGY CLI compatibility error/);
    }
    assert.equal(native.errors[0].status, 'INVALID_ARGUMENT');
    assert.equal(native.compatibility_error, undefined);
    assert.equal(agyCalls(sb).length, 1);
  }
});
