// Speed probe measurement: timestamps in, facts out. This module reports what
// one agy call did; it never judges. Whether a number is too slow belongs to
// the host and the user (see skills/jobs/references/speed.md).

// A fixed, tool-free prompt with a long-enough prose answer to time streaming.
export const SPEED_PROMPT =
  'Write about 120 words of plain prose explaining how TCP slow start works. Do not use any tools.';

// Below these a rate is noise: a short or batched answer says nothing about
// sustained speed, so report "not measurable" instead of a misleading number.
export const MIN_OUTPUT_TOKENS = 50;
export const MIN_STREAM_SECONDS = 0.5;

/** Collect timing from one `--output-format stream-json` run.
 *  start() marks the process launch; accept() takes parsed NDJSON events. */
export function createSpeedMeter(now = () => performance.now()) {
  const at = { spawn: null, init: null, first: null, last: null, result: null };
  let payload = null;
  return {
    start() { at.spawn = now(); },
    accept(event) {
      const t = now();
      if (event?.event === 'init') at.init ??= t;
      else if (event?.event === 'step_update') {
        const step = event.step_update;
        if (step?.step_type === 'agent_response' && typeof step.text_delta === 'string' && step.text_delta) {
          at.first ??= t;
          at.last = t;
        }
      } else if (event?.event === 'result' && event.result && typeof event.result === 'object') {
        at.result = t;
        payload = event.result;
      }
    },
    report() {
      const seconds = (from, to) => (from == null || to == null ? null : Math.max(0, (to - from) / 1000));
      const outputTokens = Number.isFinite(payload?.usage?.output_tokens) ? payload.usage.output_tokens : null;
      const stream = seconds(at.first, at.last);
      const measurable = outputTokens != null && outputTokens >= MIN_OUTPUT_TOKENS && stream != null && stream >= MIN_STREAM_SECONDS;
      return {
        status: payload?.status ?? null,
        error: payload?.error ?? null,
        startup: seconds(at.spawn, at.init),   // launch until agy's init event
        ttft: seconds(at.init, at.first),      // init until the first answer text
        stream,                                // first until last answer text
        total: seconds(at.spawn, at.result),   // launch until the result event
        outputTokens,
        tokensPerSecond: measurable ? outputTokens / stream : null,
      };
    },
  };
}

/** One bounded line of facts for the host. */
export function formatSpeed(report, model) {
  const secs = (v) => (v == null ? 'n/a' : `${v.toFixed(1)}s`);
  const rate = report.tokensPerSecond != null
    ? String(Math.round(report.tokensPerSecond))
    : `n/a (needs >=${MIN_OUTPUT_TOKENS} output tokens over >=${MIN_STREAM_SECONDS}s of streaming)`;
  return `[agy-staff speed] model=${model} samples=1 tokens_per_second=${rate} ttft=${secs(report.ttft)} ` +
    `startup=${secs(report.startup)} stream=${secs(report.stream)} ` +
    `output_tokens=${report.outputTokens ?? 'n/a'} total=${secs(report.total)}`;
}
