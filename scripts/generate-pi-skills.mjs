#!/usr/bin/env node
// Pi has a flat skill namespace. Keep the canonical skills for Claude/Codex,
// and generate namespaced entrypoints at the same depth for Pi. No runtime deps.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export const COMPATIBILITY_CONTEXT = fs.readFileSync(new URL('../templates/harness-compatibility.md', import.meta.url), 'utf8');

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  if (fs.lstatSync(dir).isSymbolicLink()) throw new Error(`Do not generate through symlinks: ${dir}`);
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const target = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Do not generate through symlinks: ${target}`);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

export function piFiles(root = ROOT) {
  const source = path.join(root, 'skills');
  const names = fs.readdirSync(source).filter(name => fs.existsSync(path.join(source, name, 'SKILL.md'))).sort();
  const outputs = new Map();
  for (const name of names) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || `agy-${name}`.length > 64) {
      throw new Error(`Invalid Pi skill name: agy-${name}`);
    }
    for (const file of filesUnder(path.join(source, name))) {
      let content = fs.readFileSync(file);
      if (file.endsWith('.md')) {
        content = content.toString('utf8');
        // Change only skill invocation syntax and skill-directory paths, never
        // companion subcommands such as `review`, `research`, or `wait`.
        for (const peer of names) {
          content = content.replace(new RegExp(`(?:/agy:|\\$agy:)${peer}(?![a-z0-9-])`, 'g'), `/skill:agy-${peer}`)
            .replaceAll(`../${peer}/`, `../agy-${peer}/`)
            .replaceAll(`<plugin-root>/skills/${peer}/`, `<plugin-root>/pi-skills/agy-${peer}/`);
        }
        const canonicalRel = path.relative(root, file).split(path.sep).join('/');
        const notice = `<!-- Generated from ${canonicalRel}; run npm run generate:pi. Do not edit here. -->`;
        const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
        if (path.basename(file) === 'SKILL.md') {
          if (!match || !match[1].split('\n').includes(`name: ${name}`)) {
            throw new Error(`Expected name: ${name} in ${file}`);
          }
          const frontmatter = match[1].split('\n')
            // These are Claude-specific UI/permission fields, not Pi policy.
            .filter(line => !/^(allowed-tools|argument-hint|user-invocable):/.test(line))
            .map(line => line === `name: ${name}` ? `name: agy-${name}` : line).join('\n');
          content = `---\n${frontmatter}\n---\n\n${notice}\n`
            + content.slice(match[0].length) + '\n' + COMPATIBILITY_CONTEXT;
        } else if (match) {
          content = `---\n${match[1]}\n---\n\n${notice}\n` + content.slice(match[0].length);
        } else {
          content = `${notice}\n\n${content}`;
        }
        content = Buffer.from(content);
      }
      outputs.set(path.join('pi-skills', `agy-${name}`, path.relative(path.join(source, name), file)), content);
    }
  }
  return outputs;
}

export function generatePiSkills({ root = ROOT, check = false } = {}) {
  const expected = piFiles(root);
  const actual = filesUnder(path.join(root, 'pi-skills'));
  const unexpected = actual.filter(file => !expected.has(path.relative(root, file)));
  // Fail instead of deleting stale files automatically: a maintainer may have
  // edited them. Renames/removals must explicitly remove the obsolete output.
  if (unexpected.length) throw new Error(`Unexpected generated files; inspect and remove explicitly:\n${unexpected.join('\n')}`);
  const changed = [];
  for (const [relative, content] of expected) {
    const target = path.join(root, relative);
    if (fs.existsSync(target) && fs.readFileSync(target).equals(content)) continue;
    changed.push(relative);
    if (!check) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  }
  if (check && changed.length) {
    throw new Error(`Stale Pi skills; edit canonical sources in skills/ (do not edit pi-skills/) and run npm run generate:pi:\n${changed.join('\n')}`);
  }
  return { count: expected.size, changed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: generate-pi-skills.mjs [--check]');
    const check = process.argv.includes('--check');
    const result = generatePiSkills({ check });
    console.log(`Pi skills ${check ? 'verified' : 'generated'}: ${result.count} files (${result.changed.length} changed).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
