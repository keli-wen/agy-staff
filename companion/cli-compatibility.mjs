// Metadata support is a recommendation, not a new minimum runtime version.
export function cliCompatibility(output) {
  const match = /\b(v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?)\b/.exec(output || '');
  const version = match?.[1];
  if (!version) return { warning: 'Could not determine the installed AGY CLI version. Run `agy --version`; if a CLI option is rejected, update AGY with `agy update`. Plugin updates do not update the AGY binary.' };
  const parts = version.replace(/^v/, '').match(/^\d+\.\d+\.\d+/)[0].split('.').map(Number);
  const old = parts[0] < 1 || (parts[0] === 1 && (parts[1] < 4 || (parts[1] === 4 && parts[2] < 11)));
  return { version, ...(old ? { warning: `Installed AGY CLI ${version} predates the recommended 1.4.11 for native completion reasons (structured API errors require 1.2.6). Continuing with legacy diagnostics; some failure and partial-result details may be unavailable. Run \`agy update\`, then verify with \`agy --version\`. Updating agy-staff does not update AGY itself.` } : {}) };
}

export function unsupportedCliHint(text, version) {
  const flag = /(?:unknown|unrecognized|unsupported|not defined)[^\n]{0,80}[-]{1,2}(?:output-format|print-timeout|add-dir|json-schema|dangerously-skip-permissions|conversation|model)\b/i;
  const format = /(?:invalid|unsupported|unknown)[^\n]{0,60}(?:output.format|stream-json)|(?:output.format|stream-json)[^\n]{0,60}(?:not supported|unsupported|invalid)/i;
  if (!flag.test(text || '') && !format.test(text || '')) return null;
  return `AGY CLI compatibility error (installed version: ${version || 'unknown'}): the CLI rejected an option or output format used by agy-staff. Run \`agy update\`, then verify with \`agy --version\`; version 1.4.11 or newer is recommended. Updating the plugin alone does not update the AGY binary. Original CLI diagnostics are retained above.`;
}

export function withCompatibility(native, compatibility, hint = null) {
  return { ...native, ...(compatibility?.version ? { cli_version: compatibility.version } : {}),
    ...(compatibility?.warning ? { compatibility_warning: compatibility.warning } : {}),
    ...(hint ? { compatibility_error: hint } : {}) };
}
