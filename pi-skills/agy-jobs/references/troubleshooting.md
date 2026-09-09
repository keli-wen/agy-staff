<!-- Generated from skills/jobs/references/troubleshooting.md; run npm run generate:pi. Do not edit here. -->

# Troubleshooting agy runs

## The harness command sandbox (`operation not permitted`)

agy cannot run inside a harness command sandbox (e.g. Codex workspace-write): it binds a localhost port for its internal language server and reads its OAuth token file, which sandbox secret-protection hides. No writable_roots/network_access knob fixes the hidden token — the run dies with `operation not permitted` on `~/.gemini/...` or on binding `127.0.0.1`, or with a bogus "authentication failed".

Fix: run the companion command **unsandboxed**. In Codex, request escalated permissions for the command or have the user grant the workspace full access. Do not retry the command as-is; the sandbox will block it the same way every time.

## False crash reports across permission or sandbox contexts

If a background job was started unsandboxed but a management command (`wait`, `status`, `result`) is later run from a sandboxed or different permission context, the collector process may not see the running worker process. Because the liveness check fails and no result file has been written yet, the command reports the job as `crashed` with no stored result.

Fix: run job management commands (`wait`, `status`, `result`, `cancel`) in the same unsandboxed permission context as the job start. Rerunning `wait`/`status`/`result` from the unsandboxed context sees the live worker PID and resumes waiting or reporting normal running status.

## Empty response with status SUCCESS

The fail-closed signature of a restricted run: headless agy auto-denies every unlisted tool call, so agy finishes "successfully" with nothing to say. The companion's error message carries the exact guidance — run `setup` once to install the evidence-gathering allowlist (see `setup.md`), or pass `--unrestricted` explicitly when authorized (continuations inherit the previous profile; new tool-using tasks default to unrestricted). Note that some agy tools ignore allow-rules in headless mode entirely, so even a complete allowlist cannot make them work; those need an unrestricted run. An empty response from an *unrestricted* run is not a permission issue — report it.

## done_with_warnings (error status, response text)

When agy reports an error but response text came back, the companion delivers the response anyway: exit 0, response on stdout, warning on stderr (retained in the job log and included as a bounded tail during background result collection). Assess the response against the task and review the diagnostics before deciding whether more work is needed. An empty response at a deadline with a known conversation instead needs attention (exit 5); other empty responses remain failures.

## Retry rules

- Do not retry with different flags unless the error message itself names the exact flag.
- For a timeout, inspect the retained result and workspace. Exit 5 means the conversation is resumable: ask the user whether to continue with the suggested timeout or stop, and recover only after explicit confirmation. Background `--timeout` defaults to 60m and accepts at most 120m; increase it only below that ceiling, otherwise narrow the task. A known conversation ID lets `continue` resume with its recorded configuration. A response already received before the hard deadline is delivered with a warning, so do not restart a completed job merely because cleanup timed out.
- Model-id errors fail pre-flight with the valid ids in the message (`agy models` lists them); expired auth means running `agy` interactively once to re-login.
