import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../scripts/generate-pi-skills.mjs';

export function exec(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60_000, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

// Use the real npm packlist and tarball, not a hand-maintained imitation of it.
// Lifecycle scripts are disabled; generation freshness has a separate test.
export function pack(root) {
  const output = JSON.parse(exec('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', root], {
    cwd: ROOT,
    env: { ...process.env, npm_config_cache: path.join(root, 'npm-cache'), npm_config_update_notifier: 'false' },
  }))[0];
  const extracted = path.join(root, 'extracted');
  fs.mkdirSync(extracted);
  exec('tar', ['-xzf', path.join(root, output.filename), '-C', extracted]);
  return { metadata: output, dir: path.join(extracted, 'package') };
}
