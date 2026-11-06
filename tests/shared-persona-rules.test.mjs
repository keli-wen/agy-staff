import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  generateSkills,
  generateCanonicalSkills,
  DIRECT_PERSONAS,
  ROOT,
  SHARED_START,
  SHARED_END,
} from '../scripts/generate-skills.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-shared-skills-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of ['skills', 'templates']) {
    fs.cpSync(path.join(ROOT, directory), path.join(root, directory), { recursive: true });
  }
  return root;
}

test('one shared edit reaches all five canonical personas and both adapters; check never writes', t => {
  const root = fixture(t);
  for (const target of ['pi', 'opencode']) generateSkills({ root, target });
  const shared = path.join(root, 'templates/persona-skill-rules.md');
  const canonical = path.join(root, 'skills/staffer/SKILL.md');
  const before = fs.readFileSync(canonical, 'utf8');
  const addition = '\nA new rule maintained only in the shared source.\n';
  fs.appendFileSync(shared, addition);
  assert.throws(() => generateSkills({ root, target: 'pi', check: true }), /Stale canonical persona rules/);
  assert.equal(fs.readFileSync(canonical, 'utf8'), before);
  generateSkills({ root, target: 'pi' });
  assert.throws(() => generateSkills({ root, target: 'opencode', check: true }), /Stale OpenCode skills/);
  generateSkills({ root, target: 'opencode' });
  for (const persona of DIRECT_PERSONAS) {
    for (const location of [`skills/${persona}`, `pi-skills/agy-${persona}`, `opencode-skills/agy-${persona}`]) {
      const content = fs.readFileSync(path.join(root, location, 'SKILL.md'), 'utf8');
      assert.equal(content.split(addition.trim()).length, 2, location);
      assert.match(content, /continue --job <id>/);
      assert.ok(content.indexOf(SHARED_START) < content.indexOf('## Locating the companion'));
    }
  }
  assert.equal(fs.readFileSync(canonical, 'utf8').split(SHARED_START)[0], before.split(SHARED_START)[0]);
  for (const target of ['pi', 'opencode']) assert.deepEqual(generateSkills({ root, target, check: true }).changed, []);
  assert.deepEqual(generateCanonicalSkills({ root }).changed, []);
});

test('manual edits to generated rules fail check, while persona edits outside the block survive regeneration', t => {
  const root = fixture(t);
  const canonical = path.join(root, 'skills/staffer/SKILL.md');
  const modified = fs.readFileSync(canonical, 'utf8')
    .replace(new RegExp(`${SHARED_START}[\\s\\S]*?${SHARED_END}`), `${SHARED_START}\nHand-edited shared rules.\n${SHARED_END}`)
    + '\nPersona-specific guidance maintained here.\n';
  fs.writeFileSync(canonical, modified);
  assert.throws(() => generateCanonicalSkills({ root, check: true }), /Stale canonical persona rules/);
  assert.equal(fs.readFileSync(canonical, 'utf8'), modified);
  generateCanonicalSkills({ root });
  const content = fs.readFileSync(canonical, 'utf8');
  assert.doesNotMatch(content, /Hand-edited shared rules/);
  assert.match(content, /continue --job <id>/);
  assert.match(content, /Persona-specific guidance maintained here/);
});

test('broken block boundaries fail before any canonical files are overwritten', t => {
  const root = fixture(t);
  const ask = path.join(root, 'skills/ask/SKILL.md');
  const before = fs.readFileSync(ask, 'utf8');
  fs.appendFileSync(path.join(root, 'templates/persona-skill-rules.md'), '\nChanged rule.\n');
  const last = path.join(root, 'skills/implementer/SKILL.md');
  fs.writeFileSync(last, fs.readFileSync(last, 'utf8').replace(SHARED_END, ''));
  assert.throws(() => generateCanonicalSkills({ root }), /exactly one ordered shared rules block/);
  assert.equal(fs.readFileSync(ask, 'utf8'), before);
});

test('deleting both markers from an expected direct persona or placing markers after dispatch example fails loudly', t => {
  const root = fixture(t);
  const researcher = path.join(root, 'skills/researcher/SKILL.md');
  const original = fs.readFileSync(researcher, 'utf8');
  const stripped = original.replace(new RegExp(`${SHARED_START}[\\s\\S]*?${SHARED_END}\\n*`), '');
  fs.writeFileSync(researcher, stripped);
  assert.throws(() => generateCanonicalSkills({ root }), /Expected exactly one ordered shared rules block in skills[\\/]researcher[\\/]SKILL\.md/);
  assert.throws(() => generateCanonicalSkills({ root, check: true }), /Expected exactly one ordered shared rules block in skills[\\/]researcher[\\/]SKILL\.md/);

  // Reversed markers fail.
  fs.writeFileSync(researcher, stripped.replace('## Locating the companion', `${SHARED_END}\n${SHARED_START}\n\n## Locating the companion`));
  assert.throws(() => generateCanonicalSkills({ root }), /Expected exactly one ordered shared rules block in skills[\\/]researcher[\\/]SKILL\.md/);

  // Markers placed after "## Locating the companion" fail.
  fs.writeFileSync(researcher, `${stripped}\n${SHARED_START}\n${SHARED_END}\n`);
  assert.throws(() => generateCanonicalSkills({ root }), /Shared rules block must appear before dispatch example in skills[\\/]researcher[\\/]SKILL\.md/);

  // Restore researcher, then verify unexpected markers in non-persona skills (lead/jobs) fail.
  fs.writeFileSync(researcher, original);
  const lead = path.join(root, 'skills/lead/SKILL.md');
  fs.appendFileSync(lead, `\n${SHARED_START}\n${SHARED_END}\n`);
  assert.throws(() => generateCanonicalSkills({ root }), /Unexpected shared persona rules block in skills[\\/]lead[\\/]SKILL\.md/);
});

test('host shared rules stay separate from worker prompt templates', () => {
  const hostShared = fs.readFileSync(path.join(ROOT, 'templates/persona-skill-rules.md'), 'utf8');
  for (const template of ['staffer.md', 'research.md', 'review.md', 'implement.md', 'ask.md']) {
    const worker = fs.readFileSync(path.join(ROOT, 'templates', template), 'utf8');
    assert.ok(!worker.includes(SHARED_START), `${template} must not include shared host markers`);
    assert.ok(!worker.includes(SHARED_END), `${template} must not include shared host markers`);
    assert.ok(!worker.includes('Locating the companion'), `${template} must not embed host companion invocation instructions`);
  }
  assert.ok(!hostShared.includes('Status: DONE | DONE_WITH_CONCERNS'), 'host shared rules must not inject worker status-header format into the host');
});
