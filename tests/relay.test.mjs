/**
 * Multi-account relay: quota reading, account choice, switching guards and the
 * job-level handoff. Everything is synthetic: a fake agy-switch with fake
 * accounts and a fake agy whose runs belong to the fake current account.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  remainingFor, pickAccount, agyProcessCount, familyOf, loadRelayConfig, saveRelayConfig, NEED_MIN,
} from '../companion/pool.mjs';
import { sandbox, run, agyCalls, promptOf, jobIdOf, jobResultFile, waitForJob, waitForCalls, jobLog } from './helpers.mjs';

const FAKE_SWITCH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake-agy-switch.mjs');
const HANDOFF = /^Continue the task you were working on\./;

const account = (id, label, extra = {}) => ({ id, label, q5h: 0.8, qWeek: 0.9, ...extra });

/** A sandbox wired to a fake agy-switch and a fake process list. */
function relayBox(label, { accounts, current = 'a1', refreshTo = null, switchExits = null, processes = [], noAgyTarget = false } = {}) {
  const sb = sandbox(label);
  const state = path.join(sb.root, 'switch-state.json');
  const processList = path.join(sb.root, 'processes.txt');
  const accountLog = path.join(sb.root, 'agy-accounts.log');
  fs.writeFileSync(state, JSON.stringify({
    current, ...(noAgyTarget ? { no_agy_target: true } : {}),
    accounts: accounts || [account('a1', 'Main'), account('a2', 'Backup', { q5h: 0.9 }), account('a3', 'Spare', { q5h: 0.7, qWeek: 0.7 })],
    refresh_to: refreshTo || {}, switch_exits: switchExits || [],
  }));
  fs.writeFileSync(processList, processes.join('\n'));
  const env = {
    AGY_SWITCH_BIN: FAKE_SWITCH, FAKE_SWITCH_STATE: state, FAKE_AGY_ACCOUNT_STATE: state, FAKE_AGY_ACCOUNT_LOG: accountLog,
    AGY_STAFF_PROCESS_LIST: processList, AGY_STAFF_RELAY_POLL_MS: '50', FAKE_AGY_SLEEP_MS: '50',
  };
  return {
    sb, env,
    read: () => JSON.parse(fs.readFileSync(state, 'utf8')),
    switchCalls: () => JSON.parse(fs.readFileSync(state, 'utf8')).calls.filter((c) => c[0] === 'switch'),
    accountsUsed: () => (fs.existsSync(accountLog) ? fs.readFileSync(accountLog, 'utf8').split('\n').filter(Boolean) : []),
    setProcesses: (lines) => fs.writeFileSync(processList, lines.join('\n')),
    setConfig: (relay) => {
      fs.mkdirSync(path.join(sb.home, '.agy-staff'), { recursive: true });
      fs.writeFileSync(path.join(sb.home, '.agy-staff', 'config.json'), JSON.stringify({ relay }));
    },
    job: (id) => JSON.parse(fs.readFileSync(path.join(sb.repo, '.agy-staff', 'state.json'), 'utf8')).jobs.find((j) => j.id === id),
    async dispatch(args, env2 = {}) {
      const r = run(sb, ['staffer', ...args, '--prompt', 'do the big thing'], { ...env, ...env2 });
      assert.equal(r.code, 0, r.stderr);
      const id = jobIdOf(r.stdout);
      return { id, status: await waitForJob(sb, id), out: r.stdout };
    },
  };
}

describe('quota reading and account choice', () => {
  const quota = (buckets) => ({ is_forbidden: false, quota_groups: [{ buckets }] });
  const b = (bucket_id, f, known = true) => ({ bucket_id, remaining_fraction: f, remaining_fraction_known: known, reset_time: 'T' });

  test('the lowest known bucket of the family decides, 5h or weekly', () => {
    const q = quota([b('gemini-5h', 0.9), b('gemini-weekly', 0.2), b('3p-5h', 0.01)]);
    assert.deepEqual(remainingFor(q, 'gemini'), { fraction: 0.2, bucket: 'gemini-weekly', reset_time: 'T' });
    assert.equal(remainingFor(q, '3p').fraction, 0.01);
  });

  test('unknown buckets give no evidence; forbidden accounts count as empty', () => {
    assert.equal(remainingFor(quota([b('gemini-5h', 0, false)]), 'gemini'), null);
    assert.equal(remainingFor(null, 'gemini'), null);
    assert.equal(remainingFor({ is_forbidden: true, quota_groups: [] }, 'gemini').fraction, 0);
  });

  test('models map to their quota family', () => {
    assert.equal(familyOf('gemini-3.8-flash-high'), 'gemini');
    assert.equal(familyOf('claude-sonnet-4-6'), '3p');
    assert.equal(familyOf('gpt-oss-120b-medium'), '3p');
  });

  const snap = (rows) => ({ accounts: rows.map(([id, f, extra = {}]) => ({ id, label: id, is_current: false, disabled: false, validation_blocked: false,
    remaining: f === null ? null : { fraction: f }, ...extra })) });

  test('the current account is kept while it is good enough', () => {
    const pick = pickAccount(snap([['a', 0.5, { is_current: true }], ['b', 0.99]]), { minimum: NEED_MIN.medium });
    assert.equal(pick.account.id, 'a');
    assert.equal(pick.switchNeeded, false);
  });

  test('otherwise the fullest usable account wins; disabled, blocked, excluded and unknown are skipped', () => {
    const rows = snap([['cur', 0.1, { is_current: true }], ['x', 0.9, { disabled: true }], ['y', 0.9, { validation_blocked: true }],
      ['z', 0.9], ['u', null], ['best', 0.7], ['ok', 0.5]]);
    const pick = pickAccount(rows, { minimum: NEED_MIN.medium, exclude: new Set(['z']) });
    assert.equal(pick.account.id, 'best');
    assert.equal(pick.switchNeeded, true);
    assert.equal(pickAccount(rows, { minimum: 0.95 }), null);
  });
});

describe('switching guard reads the process list', () => {
  test('agy task runs are counted; the App Hub, agy-switch and look-alikes are not', { skip: process.platform === 'win32' }, () => {
    assert.equal(agyProcessCount([
      '/Users/me/.local/bin/agy -p hi', 'agy',
      '/Users/me/.gemini/bin/agy --hub --app_data_dir antigravity',
      '/Users/me/.local/bin/agy-switch quota --json', 'vim agy.md',
      '/Applications/AntiGravity Switch.app/Contents/MacOS/agy-switch-desktop',
      '/Applications/Antigravity.app/Contents/MacOS/Antigravity',
    ]), 2);
    assert.equal(agyProcessCount(null), null);
  });
});

describe('relay settings', () => {
  test('relay on/off/show persists in the user-level config', () => {
    const sb = sandbox('relay-config');
    assert.match(run(sb, ['relay', 'show']).stdout, /\[agy-staff relay\] off need=medium max_hops=4 exhausted_below=5%/);
    assert.match(run(sb, ['relay', 'on', '--need', 'large']).stdout, /relay\] on need=large/);
    assert.match(run(sb, ['relay', 'show']).stdout, /relay\] on need=large/);
    assert.match(run(sb, ['relay', 'off']).stdout, /relay\] off need=large/);
    assert.equal(run(sb, ['relay', 'sideways']).code, 1);
    assert.equal(run(sb, ['relay', 'on', '--need', 'huge']).code, 1);
    assert.equal(run(sb, ['relay', 'on', '--allow-app-restart']).code, 1, 'the App is never restarted, so there is nothing to allow');
    assert.equal(fs.existsSync(path.join(sb.home, '.agy-staff', 'config.json')), true);
  });

  test('invalid stored values fall back to defaults', () => {
    const sb = sandbox('relay-config-invalid');
    fs.mkdirSync(path.join(sb.home, '.agy-staff'), { recursive: true });
    fs.writeFileSync(path.join(sb.home, '.agy-staff', 'config.json'), JSON.stringify({ relay: { enabled: 'yes', exhausted_below: 0.9, need: 'huge', max_hops: 99 } }));
    const out = run(sb, ['relay', 'show', '--json']);
    const cfg = JSON.parse(out.stdout);
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.exhausted_below, 0.05);
    assert.equal(cfg.need, 'medium');
    assert.equal(cfg.max_hops, 4);
  });

  test('config helpers round-trip through AGY_STAFF_HOME', () => {
    const sb = sandbox('relay-config-home');
    process.env.AGY_STAFF_HOME = path.join(sb.root, 'cfg');
    try {
      saveRelayConfig({ enabled: true, max_hops: 2 });
      assert.deepEqual([loadRelayConfig().enabled, loadRelayConfig().max_hops], [true, 2]);
    } finally { delete process.env.AGY_STAFF_HOME; }
  });
});

describe('pool command', () => {
  test('lists accounts by label with their limiting bucket, never emails', () => {
    const box = relayBox('pool', { accounts: [account('a1', 'Main', { q5h: 0.97 }), account('a2', null, { qWeek: 0.1 }), account('a3', 'Off', { disabled: true })] });
    const r = run(box.sb, ['pool'], box.env);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /accounts=3/);
    assert.match(r.stdout, /- Main \(current\): remaining=90% limited_by=gemini-weekly/);
    assert.match(r.stdout, /- a2: remaining=10% limited_by=gemini-weekly/);
    assert.match(r.stdout, /- Off \(disabled\)/);
    assert.doesNotMatch(r.stdout, /example\.invalid/);
    const json = JSON.parse(run(box.sb, ['pool', '--json'], box.env).stdout);
    assert.equal(json.accounts.length, 3);
    assert.ok(!JSON.stringify(json).includes('example.invalid'));
  });

  test('--refresh asks agy-switch to refresh first', () => {
    const box = relayBox('pool-refresh', { refreshTo: { a1: { q5h: 0.01 } } });
    const r = run(box.sb, ['pool', '--refresh'], box.env);
    assert.match(r.stdout, /source=refreshed/);
    assert.match(r.stdout, /- Main \(current\): remaining=1%/);
    assert.ok(box.read().calls.some((c) => c[0] === 'refresh'));
  });

  test('a missing agy-switch is reported, exit 1', () => {
    const sb = sandbox('pool-missing');
    const r = run(sb, ['pool'], { AGY_SWITCH_BIN: path.join(sb.root, 'nope') });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /agy-switch is unavailable/);
  });
});

describe('relay off by default', () => {
  test('a job without --relay never touches agy-switch', async () => {
    const box = relayBox('relay-off');
    const job = await box.dispatch([]);
    assert.equal(job.status, 'done');
    assert.doesNotMatch(job.out, /relay:/);
    assert.equal(box.read().calls?.length ?? 0, 0);
  });

  test('--relay and --no-relay conflict, and --need is validated', () => {
    const box = relayBox('relay-flags');
    assert.equal(run(box.sb, ['staffer', '--relay', '--no-relay', '--prompt', 'x'], box.env).code, 1);
    assert.equal(run(box.sb, ['staffer', '--relay', '--need', 'enormous', '--prompt', 'x'], box.env).code, 1);
  });

  test('--no-relay overrides a user-level on switch', async () => {
    const box = relayBox('relay-no');
    box.setConfig({ enabled: true });
    const job = await box.dispatch(['--no-relay']);
    assert.equal(job.status, 'done');
    assert.equal(box.read().calls?.length ?? 0, 0);
  });
});

describe('choosing the starting account', () => {
  test('a good current account is kept and nothing is switched', async () => {
    const box = relayBox('start-keep');
    const job = await box.dispatch(['--relay']);
    assert.equal(job.status, 'done');
    assert.match(job.out, /relay: on \(need medium\)/);
    assert.deepEqual(box.switchCalls(), []);
    assert.deepEqual(box.accountsUsed(), ['a1']);
    assert.match(jobResultFile(box.sb, job.id), /fake answer from a1/);
    assert.doesNotMatch(jobResultFile(box.sb, job.id), /\[agy-staff relay\]/);
  });

  test('a large task starts on a fuller account when the current one is short', async () => {
    const box = relayBox('start-large', { accounts: [account('a1', 'Main', { q5h: 0.4 }), account('a2', 'Backup', { q5h: 0.9 }), account('a3', 'Spare', { q5h: 0.7 })] });
    const job = await box.dispatch(['--relay', '--need', 'large']);
    assert.equal(job.status, 'done');
    assert.deepEqual(box.switchCalls().map((c) => c[1]), ['a2']);
    assert.deepEqual(box.accountsUsed(), ['a2']);
    assert.match(jobLog(box.sb, job.id), /relay: switched to Backup with 90% left/);
    assert.equal(box.job(job.id).relay.hops[0].kind, 'start');
  });

  test('the same task is small enough for the current account when sized small', async () => {
    const box = relayBox('start-small', { accounts: [account('a1', 'Main', { q5h: 0.4 }), account('a2', 'Backup', { q5h: 0.9 })] });
    const job = await box.dispatch(['--relay', '--need', 'small']);
    assert.equal(job.status, 'done');
    assert.deepEqual(box.switchCalls(), []);
    assert.deepEqual(box.accountsUsed(), ['a1']);
  });

  test('an unknown current account yields to one with known quota', async () => {
    const box = relayBox('start-unknown', { accounts: [account('a1', 'Main', { unknown: true }), account('a2', 'Backup', { q5h: 0.9 })] });
    const job = await box.dispatch(['--relay']);
    assert.equal(job.status, 'done');
    assert.deepEqual(box.accountsUsed(), ['a2']);
  });

  test('stale cached quota is refreshed before the decision', async () => {
    const box = relayBox('start-stale', { accounts: [account('a1', 'Main', { stale: true }), account('a2', 'Backup', { q5h: 0.9 })], refreshTo: { a1: { q5h: 0.05 } } });
    const job = await box.dispatch(['--relay']);
    assert.equal(job.status, 'done');
    assert.ok(box.read().calls.some((c) => c[0] === 'refresh'));
    assert.deepEqual(box.accountsUsed(), ['a2']);
  });

  test('an unreadable pool never blocks the job', async () => {
    const box = relayBox('start-nopool');
    const job = await box.dispatch(['--relay'], { AGY_SWITCH_BIN: path.join(box.sb.root, 'missing-agy-switch') });
    assert.equal(job.status, 'done');
    assert.match(jobLog(box.sb, job.id), /relay: pool unavailable/);
  });

  test('an open App or Switch window does not matter: the switch never restarts anything', async () => {
    const box = relayBox('start-app', { accounts: [account('a1', 'Main', { q5h: 0.2 }), account('a2', 'Backup', { q5h: 0.9 })],
      processes: ['/Applications/Antigravity.app/Contents/MacOS/Antigravity', '/Applications/AntiGravity Switch.app/Contents/MacOS/agy-switch-desktop'] });
    const job = await box.dispatch(['--relay']);
    assert.equal(job.status, 'done');
    assert.deepEqual(box.switchCalls(), [['switch', 'a2', '--target', 'agy', '--json']]);
    assert.deepEqual(box.accountsUsed(), ['a2']);
  });
});

describe('moving to the next account when quota runs out', () => {
  const exhausted = { FAKE_AGY_EXHAUSTED_IDS: 'a1' };
  const staleExhaustion = { refreshTo: { a1: { q5h: 0 } } }; // cache still says 80% until the refresh

  test('the job continues the same conversation on another account and delivers one result', async () => {
    const box = relayBox('hop', staleExhaustion);
    const job = await box.dispatch(['--relay'], exhausted);
    assert.equal(job.status, 'done');
    assert.deepEqual(box.accountsUsed(), ['a1', 'a2']);
    assert.deepEqual(box.switchCalls(), [['switch', 'a2', '--target', 'agy', '--json']]);
    const calls = agyCalls(box.sb);
    assert.equal(calls.length, 2);
    assert.ok(!calls[0].includes('--conversation'));
    assert.equal(calls[1][calls[1].indexOf('--conversation') + 1], 'conv-1');
    assert.match(promptOf(calls[1]), HANDOFF);
    const result = jobResultFile(box.sb, job.id);
    assert.match(result, /fake answer from a2/);
    assert.match(result, /\[agy-staff relay\] This job ran across 2 accounts \(Main -> Backup\)/);
    assert.deepEqual(box.job(job.id).relay.hops.map((h) => [h.kind, h.from, h.to]), [['quota', 'Main', 'Backup']]);
    assert.match(jobLog(box.sb, job.id), /relay: Main ran out of quota; continuing on Backup/);
  });

  test('the handoff prompt never mentions accounts to the worker', async () => {
    const box = relayBox('hop-prompt', staleExhaustion);
    await box.dispatch(['--relay'], exhausted);
    const handoff = promptOf(agyCalls(box.sb)[1]);
    assert.doesNotMatch(handoff, /Main|Backup|\ba1\b|\ba2\b/);
    assert.match(handoff, /git status/);
  });

  test('a failure that is not quota exhaustion is left alone', async () => {
    const box = relayBox('hop-not-quota'); // refresh leaves a1 at 80%
    const job = await box.dispatch(['--relay'], exhausted);
    assert.equal(job.status, 'error');
    assert.deepEqual(box.switchCalls(), []);
    assert.equal(agyCalls(box.sb).length, 1);
    assert.match(jobResultFile(box.sb, job.id), /Relay: Main still has 80% left, so the failure is not quota exhaustion/);
  });

  test('unknown quota is not treated as exhaustion', async () => {
    const box = relayBox('hop-unknown', { accounts: [account('a1', 'Main', { unknown: true }), account('a2', 'Backup', { unknown: true })] });
    const job = await box.dispatch(['--relay'], exhausted);
    assert.equal(job.status, 'error');
    assert.deepEqual(box.switchCalls(), []);
    assert.match(jobResultFile(box.sb, job.id), /quota of Main is unknown/);
  });

  test('when every account is empty the job fails and says when quota returns', async () => {
    const box = relayBox('hop-all', { accounts: [account('a1', 'Main', { reset: '2026-12-01T00:00:00Z' }), account('a2', 'Backup', { reset: '2026-11-20T00:00:00Z' })],
      refreshTo: { a1: { q5h: 0 }, a2: { q5h: 0 } } });
    const job = await box.dispatch(['--relay'], { FAKE_AGY_EXHAUSTED_IDS: 'a1,a2' });
    assert.equal(job.status, 'error');
    assert.match(jobResultFile(box.sb, job.id), /no other account has more than 10% left; earliest reset 2026-11-20T00:00:00Z/);
    assert.equal(agyCalls(box.sb).length, 1);
  });

  test('a second exhaustion moves on again, and max_hops bounds the chain', async () => {
    const accounts = () => [account('a1', 'Main'), account('a2', 'Backup', { q5h: 0.9 }), account('a3', 'Spare', { q5h: 0.7 })];
    const chain = relayBox('hop-chain', { accounts: accounts(), refreshTo: [{ a1: { q5h: 0 } }, { a2: { q5h: 0 } }] });
    const done = await chain.dispatch(['--relay'], { FAKE_AGY_EXHAUSTED_IDS: 'a1,a2' });
    assert.equal(done.status, 'done');
    assert.deepEqual(chain.accountsUsed(), ['a1', 'a2', 'a3']);
    assert.match(jobResultFile(chain.sb, done.id), /ran across 3 accounts \(Main -> Backup -> Spare\)/);

    const capped = relayBox('hop-capped', { accounts: accounts(), refreshTo: [{ a1: { q5h: 0 } }, { a2: { q5h: 0 } }] });
    capped.setConfig({ enabled: true, max_hops: 1 });
    const stopped = await capped.dispatch([], { FAKE_AGY_EXHAUSTED_IDS: 'a1,a2,a3' });
    assert.equal(stopped.status, 'error');
    assert.deepEqual(capped.accountsUsed(), ['a1', 'a2']);
  });

  test('a partial response with an error status still counts as running out of quota', async () => {
    const box = relayBox('hop-partial', staleExhaustion);
    const job = await box.dispatch(['--relay'], { ...exhausted, FAKE_AGY_PARTIAL: 'half an answer' });
    assert.equal(job.status, 'done');
    const result = jobResultFile(box.sb, job.id);
    assert.match(result, /fake answer from a2/);
    assert.doesNotMatch(result, /half an answer/);
  });

  test('the user-level switch applies without a flag', async () => {
    const box = relayBox('hop-config', staleExhaustion);
    box.setConfig({ enabled: true });
    const job = await box.dispatch([], exhausted);
    assert.equal(job.status, 'done');
    assert.deepEqual(box.accountsUsed(), ['a1', 'a2']);
  });

  test('another job that already moved the live account is simply followed', async () => {
    const box = relayBox('hop-follow', staleExhaustion);
    // FAKE_AGY_SLEEP_MS keeps a1 busy long enough for a rival switch; simulate it by moving the live account mid-run.
    const dispatched = run(box.sb, ['staffer', '--relay', '--prompt', 'x'], { ...box.env, ...exhausted, FAKE_AGY_SLEEP_MS: '1200' });
    const id = jobIdOf(dispatched.stdout);
    await waitForCalls(box.sb, 1); // the first run has started on a1
    const s = box.read(); s.current = 'a2'; fs.writeFileSync(box.env.FAKE_SWITCH_STATE, JSON.stringify(s));
    assert.equal(await waitForJob(box.sb, id), 'done');
    assert.deepEqual(box.switchCalls(), []);
    assert.deepEqual(box.accountsUsed(), ['a1', 'a2']);
  });
});

describe('switching is refused when it could do harm', () => {
  const exhausted = { FAKE_AGY_EXHAUSTED_IDS: 'a1' };
  const refreshTo = { a1: { q5h: 0 } };
  const APP = '/Applications/Antigravity.app/Contents/MacOS/Antigravity';

  test('a running App and Switch window do not block a handoff', async () => {
    const box = relayBox('guard-app', { refreshTo, processes: [APP, '/Applications/AntiGravity Switch.app/Contents/MacOS/agy-switch-desktop'] });
    const job = await box.dispatch(['--relay'], exhausted);
    assert.equal(job.status, 'done');
    assert.deepEqual(box.accountsUsed(), ['a1', 'a2']);
    assert.ok(box.switchCalls().every((c) => c[c.indexOf('--target') + 1] === 'agy'));
  });

  test('the App Hub is not mistaken for another agy run', async () => {
    const box = relayBox('guard-hub', { refreshTo, processes: ['/Users/me/.gemini/bin/agy --hub --app_data_dir antigravity'] });
    box.setConfig({ enabled: true, wait_other_agy_seconds: 0 });
    const job = await box.dispatch([], exhausted);
    assert.equal(job.status, 'done');
  });

  test('an agy-switch without --target agy is reported, never replaced by a restarting switch', async () => {
    const box = relayBox('guard-old', { refreshTo, noAgyTarget: true });
    const job = await box.dispatch(['--relay'], exhausted);
    assert.equal(job.status, 'error');
    assert.match(jobResultFile(box.sb, job.id), /this agy-switch has no `--target agy`/);
    assert.equal(box.read().current, 'a1');
  });

  test('an unreadable process list blocks switching (fail closed)', async () => {
    const box = relayBox('guard-unreadable', { refreshTo });
    const job = await box.dispatch(['--relay'], { ...exhausted, AGY_STAFF_PROCESS_LIST: path.join(box.sb.root, 'no-such-file') });
    assert.equal(job.status, 'error');
    assert.deepEqual(box.switchCalls(), []);
    assert.match(jobResultFile(box.sb, job.id), /process list unreadable/);
  });

  test('other agy processes are waited for, then switching goes ahead', async () => {
    const box = relayBox('guard-agy-wait', { refreshTo, processes: ['/Users/me/.local/bin/agy -p other task'] });
    const dispatched = run(box.sb, ['staffer', '--relay', '--prompt', 'x'], { ...box.env, ...exhausted });
    const id = jobIdOf(dispatched.stdout);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.deepEqual(box.switchCalls(), [], 'must not switch while another agy runs');
    box.setProcesses([]);
    assert.equal(await waitForJob(box.sb, id), 'done');
    assert.deepEqual(box.switchCalls().map((c) => c[1]), ['a2']);
  });

  test('other agy processes that never finish stop the handoff', async () => {
    const box = relayBox('guard-agy-stuck', { refreshTo, processes: ['/Users/me/.local/bin/agy -p other task'] });
    box.setConfig({ enabled: true, wait_other_agy_seconds: 0 });
    const job = await box.dispatch([], exhausted);
    assert.equal(job.status, 'error');
    assert.deepEqual(box.switchCalls(), []);
    assert.match(jobResultFile(box.sb, job.id), /1 other agy process\(es\) are still running; not switching under them/);
  });

  test('a failed switch is reported with a credentials warning and no continuation', async () => {
    const box = relayBox('guard-switch-fails', { refreshTo, switchExits: [1] });
    const job = await box.dispatch(['--relay'], exhausted);
    assert.equal(job.status, 'error');
    assert.equal(agyCalls(box.sb).length, 1);
    assert.match(jobResultFile(box.sb, job.id), /could not switch to Backup \(exit 1\); credentials may be partly updated/);
  });

  test('a switch that finds another switch in progress is retried', async () => {
    const box = relayBox('guard-switch-busy', { refreshTo, switchExits: [5, 5] });
    const job = await box.dispatch(['--relay'], exhausted);
    assert.equal(job.status, 'done');
    assert.equal(box.switchCalls().length, 3);
    assert.deepEqual(box.accountsUsed(), ['a1', 'a2']);
  });

  test('canceling a relaying job still cancels', async () => {
    const box = relayBox('guard-cancel', { refreshTo, processes: ['/Users/me/.local/bin/agy -p other task'] });
    const dispatched = run(box.sb, ['staffer', '--relay', '--prompt', 'x'], { ...box.env, ...exhausted });
    const id = jobIdOf(dispatched.stdout);
    await new Promise((resolve) => setTimeout(resolve, 800));
    run(box.sb, ['cancel', id]);
    assert.equal(await waitForJob(box.sb, id), 'canceled');
    assert.deepEqual(box.switchCalls(), []);
  });
});
