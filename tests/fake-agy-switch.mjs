#!/usr/bin/env node
/**
 * Fake `agy-switch` CLI for the relay tests. Synthetic accounts only; never
 * touches the network, credentials or a real data directory.
 *
 * State lives in the JSON file named by FAKE_SWITCH_STATE:
 *   { current, accounts: [{ id, label, disabled, blocked, q5h, qWeek, q3p5h, reset }],
 *     refresh_to: { <id>: { q5h, qWeek } } | [ {...}, {...} ],   // applied by `refresh`; a list is consumed one step per refresh
 *     accounts[].unknown: true                 // quota buckets report remaining_fraction_known=false
 *     switch_exits: [5, 5],                    // consumed one per `switch` call, then 0
 *     no_agy_target: true                      // an agy-switch without `--target agy` (exit 2)
 *     calls: [] }                              // every invocation, appended
 */
import fs from 'node:fs';

const file = process.env.FAKE_SWITCH_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const argv = process.argv.slice(2);
state.calls ||= [];
state.calls.push(argv);
const save = () => fs.writeFileSync(file, JSON.stringify(state));
const out = (value) => { save(); process.stdout.write(JSON.stringify({ schema_version: 1, ...value }) + '\n'); };

const [cmd, ...rest] = argv;
const sub = cmd === 'accounts' ? rest[0] : null;
const positional = rest.filter((arg) => !arg.startsWith('--'));
const view = (a) => ({ id: a.id, email: `${a.id}@example.invalid`, name: null, custom_label: a.label ?? null,
  disabled: !!a.disabled, validation_blocked: !!a.blocked, last_used: 1, is_current: a.id === state.current });

if (cmd === 'accounts' && sub === 'list') {
  out({ accounts: state.accounts.map(view), current_target: 'app' });
} else if (cmd === 'current') {
  const account = state.accounts.find((a) => a.id === state.current);
  out({ account: account ? view(account) : null, current_target: 'app', source: 'local_index' });
} else if (cmd === 'quota') {
  const account = state.accounts.find((a) => a.id === positional[0]);
  if (!account) { save(); process.stderr.write('no such account\n'); process.exit(3); }
  const reset = account.reset || '2027-01-01T00:00:00Z';
  const bucket = (id, fraction) => ({ bucket_id: id, window: id.endsWith('5h') ? '5h' : 'weekly',
    remaining_fraction: account.unknown ? 0 : fraction, remaining_fraction_known: !account.unknown, reset_time: reset });
  out({ account_id: account.id, email: `${account.id}@example.invalid`, cached: true, quota: {
    last_updated: account.stale ? 1 : Math.floor(Date.now() / 1000), subscription_tier: 'Fake', is_forbidden: !!account.forbidden, models: [],
    quota_groups: [
      { display_name: 'Gemini Models', buckets: [bucket('gemini-5h', account.q5h ?? 1), bucket('gemini-weekly', account.qWeek ?? 1)] },
      { display_name: 'Claude and GPT models', buckets: [bucket('3p-5h', account.q3p5h ?? 1), bucket('3p-weekly', 1)] },
    ] } });
} else if (cmd === 'refresh') {
  // refresh_to is either one object applied on every refresh, or a list of steps, one consumed per refresh.
  const step = Array.isArray(state.refresh_to) ? (state.refresh_to.shift() || {}) : (state.refresh_to || {});
  for (const [id, values] of Object.entries(step)) {
    const account = state.accounts.find((a) => a.id === id);
    if (account) Object.assign(account, values, { stale: false });
  }
  for (const account of state.accounts) account.stale = false;
  out({ refreshed: state.accounts.length });
} else if (cmd === 'switch') {
  const target = rest.includes('--target') ? rest[rest.indexOf('--target') + 1] : 'app';
  if (target === 'agy' && state.no_agy_target) { save(); process.stderr.write('usage\n'); process.exit(2); }
  const code = (state.switch_exits || []).shift() ?? 0;
  if (code !== 0) { save(); process.stderr.write(`switch failed (synthetic ${code})\n`); process.exit(code); }
  const found = state.accounts.find((a) => a.id === positional[0]);
  if (!found) { save(); process.exit(3); }
  state.current = found.id;
  out({ switched: true, account_id: found.id, target });
} else {
  save();
  process.stderr.write(`unsupported fake command: ${cmd}\n`);
  process.exit(2);
}
