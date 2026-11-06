#!/usr/bin/env node
// Generate flat, branded skill entrypoints from the canonical methods.
// Both targets stay at the same depth so shared runtime paths remain valid.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export const COMPATIBILITY_CONTEXT = fs.readFileSync(new URL('../templates/harness-compatibility.md', import.meta.url), 'utf8');
export const SHARED_START = '<!-- BEGIN SHARED PERSONA RULES -->';
export const SHARED_END = '<!-- END SHARED PERSONA RULES -->';
export const DIRECT_PERSONAS = ['ask', 'implementer', 'researcher', 'reviewer', 'staffer'];
const NON_PERSONA_SKILLS = new Set(['brain', 'jobs', 'lead']);

// Canonical SKILL.md files are installed directly by Claude Code and Codex.
// Only their marked block is generated; everything outside stays hand-written.
export function generateCanonicalSkills({ root = ROOT, check = false } = {}) {
  const skills = path.join(root, 'skills');
  const sharedPath = path.join(root, 'templates/persona-skill-rules.md');
  if (!fs.existsSync(sharedPath)) throw new Error('Missing shared persona rules source: templates/persona-skill-rules.md');
  const shared = fs.readFileSync(sharedPath, 'utf8').trim();
  if (!shared || shared.includes(SHARED_START) || shared.includes(SHARED_END)) {
    throw new Error('Invalid shared persona rules source');
  }
  const allSkillFiles = filesUnder(skills); // Reject symlinks before writing sources.
  for (const file of allSkillFiles) {
    if (!file.endsWith('.md')) continue;
    const relative = path.relative(root, file);
    const skillName = path.basename(path.dirname(file));
    const isDirectPersonaEntry = path.basename(file) === 'SKILL.md'
      && path.dirname(path.dirname(file)) === skills
      && !NON_PERSONA_SKILLS.has(skillName);
    if (!isDirectPersonaEntry) {
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes(SHARED_START) || text.includes(SHARED_END)) {
        throw new Error(`Unexpected shared persona rules block in ${relative}`);
      }
    }
  }
  const entryPaths = new Set(DIRECT_PERSONAS.map(name => path.join(skills, name, 'SKILL.md')));
  for (const file of allSkillFiles) {
    if (path.basename(file) === 'SKILL.md' && path.dirname(path.dirname(file)) === skills) {
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes(SHARED_START) || text.includes(SHARED_END)) entryPaths.add(file);
    }
  }
  const entries = [...entryPaths].sort().map(output => {
    const relative = path.relative(root, output);
    if (!fs.existsSync(output)) throw new Error(`Missing expected persona skill: ${relative}`);
    return { output, relative, source: fs.readFileSync(output, 'utf8') };
  });
  const block = `${SHARED_START}\n<!-- Generated from templates/persona-skill-rules.md; run npm run generate:skills. Do not edit this block. -->\n${shared}\n${SHARED_END}`;
  const outputs = [];
  for (const { output, relative, source } of entries) {
    const start = source.indexOf(SHARED_START);
    const end = source.indexOf(SHARED_END);
    if (start < 0 || end < start || source.indexOf(SHARED_START, start + 1) !== -1 || source.indexOf(SHARED_END, end + 1) !== -1) {
      throw new Error(`Expected exactly one ordered shared rules block in ${relative}`);
    }
    const dispatchExample = source.indexOf('## Locating the companion');
    if (dispatchExample === -1 || start > dispatchExample) {
      throw new Error(`Shared rules block must appear before dispatch example in ${relative}`);
    }
    const content = source.slice(0, start) + block + source.slice(end + SHARED_END.length);
    if (content !== source) outputs.push({ relative, output, content });
  }
  if (check && outputs.length) {
    throw new Error(`Stale canonical persona rules; edit templates/persona-skill-rules.md and run npm run generate:skills:\n${outputs.map(item => item.relative).join('\n')}`);
  }
  for (const { output, content } of outputs) fs.writeFileSync(output, content);
  return { changed: outputs.map(item => item.relative) };
}

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  if (fs.lstatSync(dir).isSymbolicLink()) throw new Error(`Do not generate through symlinks: ${dir}`);
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const target = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Do not generate through symlinks: ${target}`);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

const targets = {
  pi: {
    label: 'Pi', outputDir: 'pi-skills', namePrefix: 'agy-', invocationPrefix: '/skill:',
    dropMetadata: ['allowed-tools', 'argument-hint', 'user-invocable'], appendCompatibility: true,
  },
  opencode: {
    label: 'OpenCode', outputDir: 'opencode-skills', namePrefix: 'agy-', invocationPrefix: '/',
    dropMetadata: ['allowed-tools', 'argument-hint', 'user-invocable'], appendCompatibility: true,
  },
};

export function skillFiles(root = ROOT, target) {
  if (!Object.hasOwn(targets, target)) throw new Error(`Unknown skill target: ${target}`);
  const host = targets[target];
  const { outputDir, namePrefix, invocationPrefix } = host;
  const source = path.join(root, 'skills');
  const names = fs.readdirSync(source).filter(name => fs.existsSync(path.join(source, name, 'SKILL.md'))).sort();
  const outputs = new Map();
  for (const name of names) {
    const generatedName = `${namePrefix}${name}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || generatedName.length > 64) {
      throw new Error(`Invalid ${host.label} skill name: ${generatedName}`);
    }
    for (const file of filesUnder(path.join(source, name))) {
      let content = fs.readFileSync(file);
      if (file.endsWith('.md')) {
        content = content.toString('utf8');
        // Change only skill invocation syntax and skill-directory paths, never
        // companion subcommands such as `review`, `research`, or `wait`.
        for (const peer of names) {
          content = content.replace(new RegExp(`(?:/agy:|\\$agy:)${peer}(?![a-z0-9-])`, 'g'), `${invocationPrefix}${namePrefix}${peer}`)
            .replaceAll(`../${peer}/`, `../${namePrefix}${peer}/`)
            .replaceAll(`<plugin-root>/skills/${peer}/`, `<plugin-root>/${outputDir}/${namePrefix}${peer}/`);
        }
        const canonicalRel = path.relative(root, file).split(path.sep).join('/');
        const notice = `<!-- Generated from ${canonicalRel}; run npm run generate:${target}. Do not edit here. -->`;
        const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
        if (path.basename(file) === 'SKILL.md') {
          if (!match || !match[1].split('\n').includes(`name: ${name}`)) {
            throw new Error(`Expected name: ${name} in ${file}`);
          }
          const frontmatter = match[1].split('\n')
            // These are Claude-specific UI/permission fields, not host policy.
            .filter(line => !host.dropMetadata.includes(line.split(':', 1)[0]))
            .map(line => line === `name: ${name}` ? `name: ${generatedName}` : line).join('\n');
          content = `---\n${frontmatter}\n---\n\n${notice}\n`
            + content.slice(match[0].length)
            + (host.appendCompatibility ? '\n' + COMPATIBILITY_CONTEXT : '');
        } else if (match) {
          content = `---\n${match[1]}\n---\n\n${notice}\n` + content.slice(match[0].length);
        } else {
          content = `${notice}\n\n${content}`;
        }
        content = Buffer.from(content);
      }
      outputs.set(path.join(outputDir, generatedName, path.relative(path.join(source, name), file)), content);
    }
  }
  return outputs;
}

export function generateSkills({ root = ROOT, check = false, target } = {}) {
  if (!Object.hasOwn(targets, target)) throw new Error(`Unknown skill target: ${target}`);
  const hasSharedSource = fs.existsSync(path.join(root, 'templates/persona-skill-rules.md'))
    || filesUnder(path.join(root, 'skills')).some(file => file.endsWith('.md') && (fs.readFileSync(file, 'utf8').includes(SHARED_START) || fs.readFileSync(file, 'utf8').includes(SHARED_END)));
  const canonical = hasSharedSource ? generateCanonicalSkills({ root, check }) : { changed: [] };
  const expected = skillFiles(root, target);
  const host = targets[target];
  const actual = filesUnder(path.join(root, host.outputDir));
  const unexpected = actual.filter(file => !expected.has(path.relative(root, file)));
  // Fail instead of deleting stale files automatically: a maintainer may have
  // edited them. Renames/removals must explicitly remove the obsolete output.
  if (unexpected.length) throw new Error(`Unexpected generated files; inspect and remove explicitly:\n${unexpected.join('\n')}`);
  const changed = [];
  for (const [relative, content] of expected) {
    const output = path.join(root, relative);
    if (fs.existsSync(output) && fs.readFileSync(output).equals(content)) continue;
    changed.push(relative);
    if (!check) {
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, content);
    }
  }
  if (check && changed.length) {
    throw new Error(`Stale ${host.label} skills; edit canonical sources in skills/ (do not edit ${host.outputDir}/) and run npm run generate:${target}:\n${changed.join('\n')}`);
  }
  return { count: expected.size, changed, canonicalChanged: canonical.changed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const supported = ['all', ...Object.keys(targets)];
    const selectors = args.filter(arg => arg.startsWith('--target='));
    if (selectors.length > 1 || args.some(arg => arg !== '--check' && !supported.some(target => arg === `--target=${target}`))) {
      throw new Error(`Usage: generate-skills.mjs [--check] [--target=${supported.join('|')}]`);
    }
    const selected = selectors[0]?.slice(9) || 'all';
    const check = args.includes('--check');
    for (const target of selected === 'all' ? Object.keys(targets) : [selected]) {
      const result = generateSkills({ check, target });
      console.log(`${targets[target].label} skills ${check ? 'verified' : 'generated'}: ${result.count} files (${result.changed.length} changed).`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
