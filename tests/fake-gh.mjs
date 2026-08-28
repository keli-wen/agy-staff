#!/usr/bin/env node
/**
 * Fake GitHub CLI for PR-delivery tests.
 *
 * It records argv to FAKE_GH_ARGV_FILE and implements the tiny `gh pr` surface
 * the companion uses: `view`, `create`, and `edit`.
 */
import fs from 'node:fs';

const argv = process.argv.slice(2);

if (process.env.FAKE_GH_ARGV_FILE) {
  fs.appendFileSync(process.env.FAKE_GH_ARGV_FILE, JSON.stringify(argv) + '\n');
}

if (argv[0] !== 'pr') {
  process.stderr.write(`unsupported gh command: ${argv.join(' ')}\n`);
  process.exit(2);
}

if (argv[1] === 'view') {
  if (process.env.FAKE_GH_EXISTING_PR) {
    process.stdout.write(JSON.stringify({ number: 7, url: 'https://github.test/existing/pull/7' }) + '\n');
    process.exit(0);
  }
  process.stderr.write('no pull requests found\n');
  process.exit(1);
}

if (argv[1] === 'create') {
  process.stdout.write('https://github.test/new/pull/9\n');
  process.exit(0);
}

if (argv[1] === 'edit') {
  process.stdout.write('https://github.test/existing/pull/7\n');
  process.exit(0);
}

process.stderr.write(`unsupported gh pr command: ${argv.join(' ')}\n`);
process.exit(2);
