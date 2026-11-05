# Native AGY diagnostics validation

## Real CLI, local API error stub

On 2026-11-04, AGY 1.4.12 was run against a localhost HTTP server returning a fixed HTTP 400 `INVALID_ARGUMENT` error. The subprocess used a dummy API key and a session-only `modelProvider: gemini` setting, with `GOOGLE_GEMINI_BASE_URL` pointing to the local server. No paid model was called and no personal settings were changed. The selected catalog model was `gemini-3.8-flash-low`; the stub did not execute a model.

The CLI exited 3, with 1 user turn and all token counts zero. Its JSON result contained `status: ERROR`, an empty `response`, `finished_reason: error`, and a conversation ID. Stderr contained this record (error ID shortened for the fixture):

```json
{
  "short_error": "agent executor error: generating and executing: Error 400, Message: agy-staff local protocol fixture; no provider request, Status: INVALID_ARGUMENT, Details: []",
  "status": "INVALID_ARGUMENT",
  "error_code": 400,
  "code_kind": "http",
  "retryable": false,
  "error_id": "fixture-error-1"
}
```

The line prefix was `AGY_ERROR: `. In particular, the canonical status field was named `status`, not `canonical_status`. This validates the native CLI serialization for a mocked API failure, not live-provider authentication, quota or network failure behavior.

The earlier Auto + Flash Lite startup test on the same CLI returned exit 1, `status: ERROR`, `finished_reason: error`, zero turns and zero tokens. Auto was unavailable for the current API account, and `gemini-3.5-flash-lite` was not recognized in the configured catalog. That test did not reach tool execution or invoke an approval model. Auto is excluded from v0.8.1.

## Offline regression coverage

`tests/native-result.test.mjs` exercises the measured field shape using fake AGY, plus synthetic normal completion, print timeout, interruption, unknown/malformed fields, and authentication/quota/network/model error records. It covers split UTF-8 and CRLF stderr, bounded parsing, multiple records, absence of final JSON, stderr-tail truncation, partial response delivery, terminal sidecar races and the observe byte ceiling. Other error statuses and `print_timeout`/`interrupted` cases in this suite are fixtures, not claims of live-provider validation.

The standard suite remains offline. No performance or AGY 1.5.0 compatibility claim follows from these checks.

On 2026-11-05, the full offline suite passed 220/220 tests, including 33 focused native-diagnostic/lifecycle regressions. `npm run check:skills` passed for Pi and OpenCode, and `git diff --check` passed. These checks ran locally on macOS; Windows CI was not rerun in this session.

The foreground companion path was also checked on 2026-11-05 using the real CLI behind a temporary launcher that explicitly passed session-only `modelProvider: gemini`, a dummy key and the localhost HTTP stub. Companion ask exited 1 and emitted `agy.exit_code: 3`, `status: ERROR`, `finished_reason: error`, and all five native error fields. An initial probe without the explicit provider override was excluded from this error-path evidence: the personal provider setting had changed, so it completed a normal ask (8,027 input tokens, 1 output token). No personal configuration was modified.

The subsequent CLI compatibility change passed 224/224 offline tests on 2026-11-05. Four added tests cover component-wise version comparison, warning-only legacy/unknown versions, background warning persistence, and actionable foreground/background errors for rejected CLI options. The fake CLI default version is now 1.4.12; explicit version fixtures exercise older binaries. The skills consistency check and whitespace check also passed.

The final implementation review on 2026-11-05 passed 226/226 offline tests, including regressions for build-metadata version comparison, one final foreground diagnostic record, and structured API errors containing flag-like prose in foreground/background runs with and without final JSON. The first restricted run could not inspect the local process table and failed lifecycle checks; the complete suite then passed with local process access. `npm run check:skills` and `git diff --check` passed. A package dry run confirmed both new companion modules and this linked validation note are included. These checks made no provider calls and changed no personal configuration.
