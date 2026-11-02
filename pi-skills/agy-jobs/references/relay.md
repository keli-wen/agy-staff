<!-- Generated from skills/jobs/references/relay.md; run npm run generate:pi. Do not edit here. -->

# Account relay: running a job across several agy-switch accounts

agy has one login at a time, and every account has its own quota. With relay on, a background job picks its starting account by expected size and, if that account runs out of quota mid-task, continues the same conversation on the next account. You still dispatch once, `wait` once and receive one result.

Relay needs the `agy-switch` command line (the AntiGravity Switch app's CLI) with at least two saved accounts, in a version with `switch --target agy`. It reads quota with `agy-switch quota`/`refresh` and switches with `agy-switch switch --target agy`, which changes the login shared by the Antigravity App and agy **without closing or restarting the App or anything else**. Whether the App or the Switch window is open does not matter. A running App keeps the account it already loaded until it restarts.

## Turning it on

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" relay on [--need small|medium|large]
node "<skill-dir>/../../companion/agy-companion.mjs" relay off
node "<skill-dir>/../../companion/agy-companion.mjs" relay show
```

The setting lives in `~/.agy-staff/config.json` and applies to every repository on this machine. Turn it on only when the user asks for it or already has it on. Per job, `--relay` forces it on, `--no-relay` forces it off, and `--need` sets the expected size.

## What to do when dispatching

Nothing extra when relay is on. If the task is clearly smaller or larger than a normal assignment, pass `--need`:

- `small`: one question, a short review or a quick lookup. Starts on the current account if it has at least 10% left.
- `medium` (default): an ordinary assignment. Needs at least 30%.
- `large`: a long survey, a multi-file implementation, or several jobs. Needs at least 60%, so the job starts on the fullest account.

If no account has that much left, the job starts on the fullest account that is not empty and relies on the handoff. These sizes are estimates of quota, not guarantees.

## What happens

1. **Before the first run**, the companion reads each account's Gemini quota (the lower of the 5-hour and weekly buckets), refreshes it when the cache is older than 10 minutes, and switches to a better account only when the current one is below the size you asked for.
2. **When a run fails**, the companion refreshes quota and checks the account that ran the job. Only when it is at or below 5% does it treat the failure as quota exhaustion. The wording of agy's error is never used as evidence, and any other failure stays an ordinary failure for you to assess.
3. **The handoff** switches to the account with the most quota left (at least 10%), then continues the same conversation with a short instruction to check the working tree and finish. Edits made before the handoff stay in place. At most 4 handoffs per job, and the job's overall time limit still applies across them.
4. **The result** ends with a `[agy-staff relay]` note naming the accounts by label when a handoff happened. Mention it to the user briefly; do not repeat it as a finding. `status <id>` and the job record show the hops.

## When it does not switch

The companion refuses and says why in the job's error text (`Relay: ...`) instead of switching:

- **Other `agy` processes are running.** A running agy keeps its old login and may write it back, so the companion waits up to 5 minutes for them to finish, then gives up. The same holds when the process list cannot be read.
- **No other account has usable quota.** The error names the earliest reset time. Report it and let the user choose to wait.
- **The switch itself failed.** Credentials may be partly updated; tell the user to check `agy-switch current` before retrying. Never retry the switch yourself.
- **agy-switch is too old** (no `--target agy`). The job stays on the current account and the error says so; tell the user to update agy-switch.
- **Quota is unknown** for the account that failed, or it still has more than 5% left. Treat it as an ordinary failure.

## Rules

- Switching changes the login of every later `agy` run on this machine, in every repository, and the account the App will use after its next restart. Do not run `agy-switch switch` yourself while jobs are running.
- Parallel relay jobs share the live account. A job whose account ran out simply follows the account another job already switched to.
- `pool` shows each account's remaining quota by label (never by email); `pool --refresh` asks Google first. Use it to answer "which account has quota left", not before every job.
- Not covered: how agy words an exhaustion error is unobserved, so the relay depends on agy-switch's quota numbers, and a job can still fail when quota ends between two refreshes.
