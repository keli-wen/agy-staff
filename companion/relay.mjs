// Account relay: choose the account before a job and move to the next one when
// the current account's quota runs out mid-task.
//
// Ground truth is agy-switch's own quota data after a fresh refresh, never the
// wording of agy's error. A failure only triggers a switch when the account
// that ran the job is verifiably below the exhaustion threshold; any other
// failure stays a normal failure for the host to assess.
import {
  NEED_MIN, HOP_MIN, familyOf, snapshot, pickAccount, agyProcessCount, switchTo,
} from './pool.mjs';

const canceled = () => Object.assign(new Error('Execution canceled.'), { reason: 'canceled' });
/** Sleep that wakes early (and throws) when the job is canceled. */
function sleep(ms, signal) {
  if (signal?.aborted) throw canceled();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(canceled()); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
// Poll and retry interval; tests shorten it.
const pollMs = () => Number(process.env.AGY_STAFF_RELAY_POLL_MS) || 5000;
const pct = (r) => (r ? `${Math.round(r.fraction * 100)}%` : 'unknown');

/** The login is shared by every agy run; refuse when a switch could hurt one that is running. */
async function guardSwitch(relay, log, signal) {
  // A running agy keeps its old token and may rewrite the shared credential file.
  const deadline = Date.now() + relay.wait_other_agy_seconds * 1000;
  for (;;) {
    const count = agyProcessCount();
    if (count === null) return 'cannot tell whether other agy processes are running (process list unreadable)';
    if (count === 0) return null;
    if (Date.now() >= deadline) return `${count} other agy process(es) are still running; not switching under them`;
    log(`relay: waiting for ${count} other agy process(es) to finish before switching`);
    await sleep(Math.min(pollMs(), Math.max(50, deadline - Date.now())), signal);
  }
}

/** Switch with a lock-contention retry. Returns null on success or a reason. */
async function performSwitch(account, relay, log, retryMs, signal) {
  const blocked = await guardSwitch(relay, log, signal);
  if (blocked) return blocked;
  for (let attempt = 0; attempt < 6; attempt++) {
    const result = switchTo(account);
    if (result.ok) return null;
    if (result.code === 2) return result.detail;
    if (result.code !== 5) {
      return `agy-switch could not switch to ${account.label} (exit ${result.code}); credentials may be partly updated, check \`agy-switch current\`${result.detail ? `: ${result.detail}` : ''}`;
    }
    log(`relay: another switch is in progress, retrying`);
    await sleep(retryMs, signal);
  }
  return 'another account switch stayed in progress; gave up';
}

/** Account id and label the next agy run will use (agy-switch's recorded selection). */
export function liveAccount(model) {
  const snap = snapshot({ family: familyOf(model) });
  if (snap.error) return { error: snap.error };
  const current = snap.accounts.find((a) => a.is_current) || null;
  return { current, snap };
}

/** Before the first run: make sure the starting account fits the expected task size. */
export async function preflight({ model, relay, log, signal, retryMs = pollMs() }) {
  const family = familyOf(model);
  let snap = snapshot({ family });
  if (snap.error) return { action: 'proceed', note: `pool unavailable (${snap.error}); running on the current account` };
  const current = snap.accounts.find((a) => a.is_current);
  const stale = !current || !current.last_updated || Date.now() / 1000 - current.last_updated > 600;
  if (stale) {
    const fresh = snapshot({ family, refresh: true });
    if (!fresh.error) snap = fresh;
  }
  const minimum = NEED_MIN[relay.need] ?? NEED_MIN.medium;
  let pick = pickAccount(snap, { minimum });
  let note = '';
  if (!pick) {
    // Nothing meets the expected size: take the fullest account that is not empty and rely on relay.
    pick = pickAccount(snap, { minimum: relay.exhausted_below + 0.0001 });
    if (!pick) return { action: 'proceed', note: 'no account has usable quota; running on the current account' };
    note = ` (no account has ${Math.round(minimum * 100)}% left; best available)`;
  }
  const liveCurrent = snap.accounts.find((a) => a.is_current);
  if (!pick.switchNeeded) {
    return { action: 'proceed', accountId: pick.account.id, note: `starting on ${pick.account.label} with ${pct(pick.account.remaining)} left${note}` };
  }
  const reason = await performSwitch(pick.account, relay, log, retryMs, signal);
  if (reason) return { action: 'proceed', accountId: liveCurrent?.id ?? null, note: `not switching: ${reason}` };
  return { action: 'switched', from: liveCurrent?.label ?? null, accountId: pick.account.id,
    note: `switched to ${pick.account.label} with ${pct(pick.account.remaining)} left${note}` };
}

/** After a failed run: continue on another account, or say why not. */
export async function afterFailure({ model, relay, attemptId, tried, log, signal, retryMs = pollMs() }) {
  const family = familyOf(model);
  const snap = snapshot({ family, refresh: true });
  if (snap.error) return { action: 'stop', reason: `pool unavailable after the failure: ${snap.error}` };
  const used = snap.accounts.find((a) => a.id === attemptId);
  if (!used) return { action: 'stop', reason: 'the account that ran the job is no longer in agy-switch' };
  tried.add(attemptId);
  if (!used.remaining) return { action: 'stop', reason: `quota of ${used.label} is unknown, so the failure is not treated as exhaustion` };
  if (used.remaining.fraction > relay.exhausted_below) {
    return { action: 'stop', reason: `${used.label} still has ${pct(used.remaining)} left, so the failure is not quota exhaustion` };
  }
  const pick = pickAccount(snap, { minimum: HOP_MIN, exclude: tried });
  if (!pick) {
    const resets = snap.accounts.map((a) => a.remaining?.reset_time).filter(Boolean).sort();
    return { action: 'stop', reason: `${used.label} is exhausted (${pct(used.remaining)}) and no other account has more than ${Math.round(HOP_MIN * 100)}% left${resets.length ? `; earliest reset ${resets[0]}` : ''}` };
  }
  const from = used.label;
  if (!pick.switchNeeded) {
    // Another job already moved the live account to a usable one.
    return { action: 'continue', from, to: pick.account.label, toId: pick.account.id, remaining: pick.account.remaining, switched: false };
  }
  const reason = await performSwitch(pick.account, relay, log, retryMs, signal);
  if (reason) return { action: 'stop', reason: `${used.label} is exhausted but ${reason}` };
  return { action: 'continue', from, to: pick.account.label, toId: pick.account.id, remaining: pick.account.remaining, switched: true };
}
