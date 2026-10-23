import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scanner = fileURLToPath(new URL('../bench/scripts/leak-scan.sh', import.meta.url));

test('bench leak scan distinguishes account metadata from Codex credentials', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-leak-scan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const job = join(dir, 'jobs', 'fixture');
  mkdirSync(job, { recursive: true });
  const auth = {
    tokens: {
      account_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      access_token: 'fixture-access-token-long-enough-for-previous-scan',
      refresh_token: 'fixture-refresh-token-long-enough-for-previous-scan',
      id_token: 'fixture-id-token-long-enough-for-previous-scan',
    },
    OPENAI_API_KEY: 'fixture-key',
  };
  const authPath = join(dir, 'auth.json');
  writeFileSync(authPath, JSON.stringify(auth));
  const scan = (value) => {
    writeFileSync(join(job, 'rollout.jsonl'), JSON.stringify({
      type: 'session_meta', payload: { creator_account_id: value },
    }) + '\n');
    return spawnSync('bash', [scanner, '--data', dir, '--codex-auth', authPath,
      '--agy-auth-dir', join(dir, 'missing'), '--claude-token', join(dir, 'missing'), 'fixture'], {
      encoding: 'utf8',
      env: { ...process.env, AGY_BENCH_CONFIG: '', AGY_BENCH_DATA: '',
        GEMINI_API_KEY: '', DEEPSEEK_API_KEY: '', CLAUDE_CODE_OAUTH_TOKEN: '',
        ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '' },
    });
  };
  const metadata = scan(auth.tokens.account_id);
  assert.equal(metadata.status, 0, metadata.stderr + metadata.stdout);
  assert.match(metadata.stdout, /Codex auth.json token values=0/);
  for (const secret of [auth.tokens.access_token, auth.tokens.refresh_token,
    auth.tokens.id_token, auth.OPENAI_API_KEY]) {
    const result = scan(secret);
    assert.equal(result.status, 3, result.stderr + result.stdout);
    assert.match(result.stdout, /Codex auth.json token values=1/);
    assert.ok(!result.stdout.includes(secret), 'stdout must not disclose credentials');
    assert.ok(!result.stderr.includes(secret), 'stderr must not disclose credentials');
  }
});
