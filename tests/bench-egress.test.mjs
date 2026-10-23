import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const lib = fileURLToPath(new URL('../bench/scripts/lib.sh', import.meta.url));
const scripts = fileURLToPath(new URL('../bench/scripts/', import.meta.url));

test('environment startup failure is distinct from failed or missing egress checks', (t) => {
  const job = mkdtempSync(join(tmpdir(), 'bench-egress-'));
  t.after(() => rmSync(job, { recursive: true, force: true }));
  const trial = join(job, 'trial');
  const agent = join(trial, 'agent');
  mkdirSync(agent, { recursive: true });
  const result = {
    environment_setup: { started_at: '2026-10-23T00:00:00Z' },
    agent_setup: null, agent_execution: null,
    exception_info: { exception_type: 'EnvironmentStartTimeoutError' },
  };
  const check = (record, data = result) => {
    rmSync(join(agent, 'egress.txt'), { force: true });
    if (record !== null) writeFileSync(join(agent, 'egress.txt'), record);
    writeFileSync(join(trial, 'result.json'), JSON.stringify(data));
    return spawnSync('bash', ['-c', 'source "$1"; EXPECT_EGRESS=enabled; egress_container "$2"', '_', lib, job], {
      encoding: 'utf8', env: { ...process.env, AGY_BENCH_CONFIG: '' },
    });
  };
  const startup = check(null);
  assert.equal(startup.status, 5);
  assert.match(startup.stderr, /environment failed before agent setup: EnvironmentStartTimeoutError/);
  assert.equal(check(null, { ...result, agent_setup: { started_at: 'now' } }).status, 4);
  assert.equal(check(null, {}).status, 4);
  assert.equal(check('pre: MISMATCH loc=US (chatgpt.com)\n').status, 4);
  assert.equal(check('pre: lookup failed (chatgpt.com)\n').status, 4);
  assert.equal(check('pre: match loc=US (chatgpt.com)\npost: match loc=US (chatgpt.com)\n').status, 0);
});

// Exercise the real runner and batch control flow. Only external services and
// side-effecting checks are stubbed: Harbor writes a startup-failure fixture,
// host egress never contacts a service, and no model, Docker or credential is used.
function runnerFixture(t, host, { hostPost = 0, leak = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bench-runner-startup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bench = join(dir, 'bench');
  const fixtureScripts = join(bench, 'scripts');
  const bin = join(dir, 'bin');
  const data = join(dir, 'data');
  for (const path of [fixtureScripts, bin, data]) mkdirSync(path, { recursive: true });
  for (const name of ['run-codex.sh', 'run-claude.sh', 'run-batch.py']) {
    copyFileSync(join(scripts, name), join(fixtureScripts, name));
  }
  writeFileSync(join(fixtureScripts, 'lib.sh'), readFileSync(lib, 'utf8') + `
egress_host() {
  if [ "$2" = host-post ] && [ "$FIXTURE_HOST_POST" != 0 ]; then
    echo "host-post: lookup failed (fixture)" >&2
    exit "$FIXTURE_HOST_POST"
  fi
}
leak_scan() { return "$FIXTURE_LEAK"; }
harbor_filter() { cat; }
`);
  for (const h of ['codex', 'claude']) {
    const templates = join(bench, 'templates', h);
    mkdirSync(templates, { recursive: true });
    writeFileSync(join(templates, 'native.j2'), 'fixture');
  }
  for (const name of ['fixture-one', 'fixture-two']) {
    const baked = host === 'codex' ? 'datasets-baked' : 'datasets-baked-claude';
    mkdirSync(join(data, baked, 'swebench-verified', name), { recursive: true });
  }
  const auth = join(dir, 'fixture-auth.json');
  const token = join(dir, 'fixture-claude-token');
  const expected = join(dir, 'fixture-egress');
  writeFileSync(auth, '{}');
  writeFileSync(token, 'fixture-not-a-real-token', { mode: 0o600 });
  writeFileSync(expected, '192.0.2.1');
  const calls = join(dir, 'harbor-calls');
  writeFileSync(join(bin, 'harbor'), `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const value = (key) => args[args.indexOf(key) + 1];
const trial = path.join(value('-o'), value('--job-name'), 'trial');
fs.mkdirSync(trial, { recursive: true });
fs.writeFileSync(path.join(trial, 'result.json'), JSON.stringify({
  environment_setup: { started_at: '2026-10-23T00:00:00Z' },
  agent_setup: null, agent_execution: null,
  exception_info: { exception_type: 'EnvironmentStartTimeoutError' },
}));
fs.appendFileSync(process.env.FIXTURE_CALLS, value('--job-name') + '\\n');
console.error('EnvironmentStartTimeoutError: fixture environment never started');
process.exit(1);
`, { mode: 0o755 });
  const plan = join(dir, 'plan.txt');
  writeFileSync(plan, 'native fixture-one\nnative fixture-two\n');
  const env = {
    ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`,
    AGY_BENCH_CONFIG: '', AGY_BENCH_DATA: '',
    FIXTURE_HOST_POST: String(hostPost), FIXTURE_LEAK: String(leak), FIXTURE_CALLS: calls,
  };
  const options = ['--data', data, '--expect-egress', expected,
    '--agy-auth-dir', join(dir, 'missing'), '--claude-token', token];
  if (host === 'codex') options.push('--codex-auth', auth);
  return { dir, data, plan, calls, env, options, runner: join(fixtureScripts, `run-${host}.sh`),
    batch: join(fixtureScripts, 'run-batch.py') };
}

for (const host of ['codex', 'claude']) {
  test(`${host} runner preserves startup failure, host-egress priority and leak priority`, (t) => {
    for (const [settings, expected] of [[{}, 5], [{ hostPost: 4 }, 4], [{ leak: 3 }, 3]]) {
      const fixture = runnerFixture(t, host, settings);
      const result = spawnSync('bash', [fixture.runner, ...fixture.options, 'native', 'fixture-one', 'test-r1'], {
        encoding: 'utf8', env: fixture.env,
      });
      assert.equal(result.status, expected, result.stderr + result.stdout);
      assert.match(result.stderr, /environment failed before agent setup: EnvironmentStartTimeoutError/);
      assert.equal(readFileSync(fixture.calls, 'utf8').trim().split('\n').length, 1);
    }
  });

  test(`${host} batch stops with the correct cause and never retries a startup failure`, (t) => {
    for (const hostPost of [0, 4]) {
      const fixture = runnerFixture(t, host, { hostPost });
      const code = `
import importlib.util, sys
sys.path.insert(0, sys.argv[1])
spec = importlib.util.spec_from_file_location('fixture_batch', sys.argv[2])
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)
batch.docker_free_gb = lambda: 100
sys.argv = [sys.argv[2], *sys.argv[3:]]
sys.exit(batch.main())
`;
      const args = ['-c', code, scripts, fixture.batch, '--host', host, '--plan', fixture.plan,
        '--suffix', 'test-r1', '--no-prune', ...fixture.options];
      const run = () => spawnSync('python3', args, { encoding: 'utf8', env: fixture.env });
      const result = run();
      assert.equal(result.status, 2, result.stderr + result.stdout);
      const reason = readFileSync(join(fixture.data, 'batch-test-r1.STOP'), 'utf8');
      assert.match(reason, hostPost ? /egress check failed/ : /environment failed before agent setup/);
      assert.match(readFileSync(join(fixture.data, 'batch-test-r1.main.out'), 'utf8'), /EnvironmentStartTimeoutError/);
      assert.equal(run().status, 2, 'the existing STOP must keep the batch stopped');
      assert.equal(readFileSync(fixture.calls, 'utf8').trim().split('\n').length, 1, 'no second trial or retry');
    }
  });
}
