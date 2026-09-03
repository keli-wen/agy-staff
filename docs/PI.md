# Pi support: local development and verification

Pi installs the whole package but loads only `pi-skills/`, as declared in `package.json`. The public names are `agy-ask`, `agy-staffer`, `agy-researcher`, `agy-reviewer`, `agy-implementer`, and `agy-jobs`. Pi's flat namespace does not add a package prefix automatically. Claude Code and Codex continue to use their existing `agy:<persona>` names.

## Try local changes before pushing

From the checkout containing your changes:

```bash
npm run generate:pi
npm run check:pi
pi -e /absolute/path/to/agy-staff-checkout
```

Use the absolute checkout path, not a remote Git URL: remote installs cannot see unpushed changes. `-e` loads the local package for this session without adding it to your installed-package settings. Pi may still save its normal session history. Do not also load an older agy-staff copy or register the canonical `skills/` directory, which exposes unprefixed duplicate skills.

For persistent local development, `pi install /absolute/path/to/agy-staff-checkout` registers the directory without copying it. After changing canonical skills, run `npm run generate:pi`, then `/reload` inside Pi. Remove that registration later with `pi remove /absolute/path/to/agy-staff-checkout`.

Pi needs its own model-provider authentication (`/login`); agy must independently be installed and authenticated. Keep your normal project instructions active. Prefer a disposable project for live tests, because tool-using agy modes run unrestricted by default.

## Manual model-driven acceptance

In Pi, confirm the picker lists the six `agy-*` names, not bare `ask`, `reviewer`, or `jobs` from this package. Then run:

```text
/skill:agy-ask reply with OK
/skill:agy-staffer Read the README in this project and summarize it in three bullets. Do not edit files, commit, push, or access external services.
```

The first prompt should return agy's answer. The second should start a detached job, read `agy-jobs`, and deliver the result. When an instruction names an unavailable tool, the appended compatibility note asks the host to find an equivalent method without dropping result collection or other requirements. Foreground `wait` is one possible collection method; a wait exit code of 2 is not a failed job. If the host cannot establish an equivalent method, it should explain the limitation and ask for help, not invent a tool or silently skip the step. These behaviors need live testing; the generator does not enforce them.

Also try `/skill:agy-reviewer Review the README for contradictions. Do not modify files.` to verify the review references resolve. To check confirmation handling, ask `agy-jobs` to explain optional setup and ask your preference without applying changes: an unavailable question UI must not turn into assumed consent. If you test implementer, do it in a disposable repo and inspect its diff. Record the Pi version, host model, agy version, checkout commit, and which scenarios passed; a successful offline test is not evidence that a model follows every workflow correctly.

## Automated checks (no credentials or model quota)

Run these from a source checkout; the npm artifact intentionally excludes tests.

```bash
npm test
npm run test:pi
```

The standard suite checks generated-file drift, namespace/path rewriting, release-version consistency, and the actual npm archive. It runs the archived companion against `tests/fake-agy.mjs` to exercise `ask`, dispatch, and wait.

The optional Pi suite requires an installed Pi CLI (initial target: 0.84.4). It resolves the installed package through the `pi` executable, or `AGY_PI_PACKAGE_ROOT=/absolute/path/to/pi-coding-agent`, and uses Pi's real resource loader, skill-command expansion, and Bash tool. It tests local installation, namespace coexistence, and the packed artifact with isolated settings and fake agy. It does not log into a provider or change your normal Pi config. This is a harness integration test, not a live LLM evaluation. CI pins the tested Pi version; other versions may need test-adapter updates if Pi's SDK paths change.

## One source of truth

Edit canonical persona instructions in `skills/`, never `pi-skills/`. Run `npm run generate:pi` after editing. The generator copies all skill resources, rewrites names/invocations/sibling paths, and appends `adapters/harness-compatibility.md` to each generated skill. It does not match or replace workflow paragraphs. Claude-specific frontmatter fields are omitted only from the Pi copies; canonical entrypoints, companion modes, and templates are unchanged.

The compatibility note is host-neutral and also applies to referenced instructions: use available capabilities for equivalent results, preserve authorization/confirmation/delivery/stopping requirements, and explicitly ask for help when equivalence is impossible or uncertain. Other future adapters can reuse it without adding host conditionals to canonical skills. Source-body changes propagate without maintaining prose-replacement rules. Tests verify that propagation and note inclusion, not whether a model reliably chooses an equivalent method or asks for help; live acceptance remains necessary.

Generated files are committed so Git installs work without a build step; `npm run check:pi` and `prepack` fail if they drift. If a skill is removed or renamed, inspect and explicitly remove its obsolete generated directory; the generator never silently deletes it.

There is no Pi extension or second companion implementation. All hosts use the same runtime and templates. Keep `package.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` versions aligned when preparing a release. No npm publication is needed for local/Git installation.
