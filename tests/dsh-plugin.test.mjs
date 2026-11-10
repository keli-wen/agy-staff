import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import dshPlugin, { apply as applyDsh, name as dshPluginName } from "../dsh/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

test("Item 4: root package.json, dsh/package.json, dead asset removal, and bundle cleanliness", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  assert.equal(pkg.main, "./opencode.mjs");
  assert.equal(pkg.icon, "./dsh/icon.svg");
  assert.deepEqual(pkg.exports, {
    ".": "./opencode.mjs",
    "./icon": "./dsh/icon.svg",
    "./package.json": "./package.json",
  });
  assert.deepEqual(pkg.pi, { skills: ["./pi-skills"] });
  assert.equal(pkg.dsh?.manifestVersion, 1);
  assert.equal(pkg.dsh?.bundle?.patch, "./dsh/cordis.patch.yml");

  // Root package.json files array must contain exact 5 dsh/ files and no bare "dsh/"
  const dshFiles = pkg.files.filter((f) => f.startsWith("dsh/"));
  assert.deepEqual(dshFiles, [
    "dsh/package.json",
    "dsh/index.mjs",
    "dsh/client.js",
    "dsh/cordis.patch.yml",
    "dsh/icon.svg",
  ]);
  assert.ok(!pkg.files.includes("dsh/"), "files array must NOT contain bare 'dsh/'");
  assert.ok(existsSync(join(repoRoot, "dsh", "icon.svg")), "dsh/icon.svg must exist");

  // dsh/assets must NOT exist on disk
  assert.equal(
    existsSync(join(repoRoot, "dsh", "assets")),
    false,
    "dsh/assets directory must NOT exist on disk"
  );

  // dsh/package.json exports
  const dshPkgPath = join(repoRoot, "dsh", "package.json");
  assert.ok(existsSync(dshPkgPath), "dsh/package.json must exist");
  const dshPkg = JSON.parse(readFileSync(dshPkgPath, "utf8"));
  assert.equal(dshPkg.name, "agy-staff-dsh");
  assert.equal(dshPkg.version, pkg.version);
  assert.equal(dshPkg.icon, "./icon.svg");
  assert.equal(dshPkg.exports?.["."], "./index.mjs");
  assert.equal(dshPkg.exports?.["./client"], "./client.js");
  assert.equal(dshPkg.exports?.["./icon"], "./icon.svg");
  assert.equal(
    dshPkg.exports?.["./assets/*"],
    undefined,
    "dsh/package.json exports must NOT contain './assets/*'"
  );
  assert.equal(dshPkg.dsh?.client?.platform, "web");
  assert.ok(Array.isArray(dshPkg.dsh?.client?.inject));

  // dsh/client.js clean of dead assets and mock code
  const clientJsPath = join(repoRoot, "dsh", "client.js");
  assert.ok(existsSync(clientJsPath));
  const clientJs = readFileSync(clientJsPath, "utf8");
  for (const forbidden of [
    "data:image/png;base64",
    "HandDrawnIcon",
    "mockRunning",
    "预览运行态",
  ]) {
    assert.ok(
      !clientJs.includes(forbidden),
      `client.js must NOT contain '${forbidden}'`
    );
  }

  // Key visual & interaction design requirements
  assert.ok(clientJs.includes('shapeRendering: "crispEdges"'), "client.js must use crispEdges SVGs");
  assert.ok(clientJs.includes("PixelIconCarbon"), "client.js must define PixelIconCarbon");
  assert.ok(clientJs.includes("PixelIconArgon"), "client.js must define PixelIconArgon");
  assert.ok(clientJs.includes("Carbon / Argon + 3.8 Flash"), "client.js must show Carbon / Argon + 3.8 Flash");
  assert.ok(!clientJs.includes("roleBrain:"), "client.js must remove dead roleBrain I18N keys");
  assert.ok(clientJs.includes("中 / EN"), "client.js must provide language toggle");
  assert.ok(existsSync(join(repoRoot, "assets", "icons", "carbon.svg")), "assets/icons/carbon.svg must exist");
  assert.ok(existsSync(join(repoRoot, "assets", "icons", "argon.svg")), "assets/icons/argon.svg must exist");
  assert.ok(existsSync(join(repoRoot, "assets", "badges", "model-gemini-4-carbon.svg")), "model-gemini-4-carbon.svg must exist");
  assert.ok(clientJs.includes("flex-shrink: 0"), "client.js must prevent capability card shrinkage");
  assert.ok(clientJs.includes("DisclosureChevron"), "client.js must use dedicated SVG chevron");
  assert.ok(clientJs.includes("IconQueryBubble") && clientJs.includes("IconReplySheet"));
  assert.ok(clientJs.includes("StatusGraphicIcon") && clientJs.includes("formatTimeTag"));
  assert.ok(clientJs.includes("继续追问 · 填入输入框"));
  assert.ok(!clientJs.includes("session.prompt"), "client.js must never auto-send prompts to chat");
  assert.ok(!clientJs.includes("textarea"), "client.js must not include a textarea composer");
});

test("Items 1, 4, 6, 7: dsh/index.mjs skills hydration, lifecycle tools, and /agy-ctl command", async () => {
  assert.equal(dshPluginName, "agy-staff");
  assert.equal(typeof applyDsh, "function");
  assert.equal(dshPlugin.name, "agy-staff");

  let registeredSkillProvider = null;
  const registeredTools = [];
  const registeredCommands = [];

  const mockCtx = {
    effect(fn) {
      return fn();
    },
    inject(deps, cb) {
      cb(mockCtx);
    },
    skills: {
      registerProvider(factory) {
        registeredSkillProvider = factory();
        return () => {};
      },
    },
    tools: {
      register(def) {
        registeredTools.push(def);
        return () => {};
      },
    },
    commands: {
      register(def) {
        registeredCommands.push(def);
        return () => {};
      },
    },
  };

  const executedRunnerCalls = [];
  let runnerMockResponse = {
    ok: true,
    code: 0,
    stdout: "job id: staffer-test-123\nStarted background job",
    stderr: "",
  };

  const fakeRunner = async (args, opts) => {
    executedRunnerCalls.push({ args, opts });
    return runnerMockResponse;
  };

  applyDsh(mockCtx, { runCompanion: fakeRunner });

  // 1. Verify skills provider hydration
  assert.ok(registeredSkillProvider, "skill provider should be registered");
  const candidates = await registeredSkillProvider.list();
  assert.ok(candidates.length >= 8, `expected >= 8 agy-* skills, got ${candidates.length}`);
  for (const c of candidates) {
    assert.match(c.name, /^agy-[a-z0-9-]+$/u);
  }
  const brainCandidate = candidates.find((c) => c.name === "agy-brain");
  assert.ok(brainCandidate, "agy-brain skill candidate must exist");
  const loadedSkill = await registeredSkillProvider.get(brainCandidate);

  assert.ok(
    loadedSkill.content.startsWith("> **DeepSeek Harness (DSH) Note**:"),
    "hydrated skill must start with DSH Note"
  );
  assert.ok(
    !loadedSkill.content.includes("<skill-dir>"),
    "hydrated skill must not contain literal <skill-dir>"
  );
  assert.ok(
    !loadedSkill.content.includes("<plugin-root>"),
    "hydrated skill must not contain literal <plugin-root>"
  );
  assert.ok(
    !loadedSkill.content.includes("<agy-staff-env>"),
    "hydrated skill must not contain <agy-staff-env>"
  );
  assert.ok(
    loadedSkill.content.includes(brainCandidate.resourceBase.path),
    "hydrated skill must contain real skill directory path"
  );

  // 2. Verify registered tool names
  const toolNames = registeredTools.map((t) => t.name);
  assert.deepEqual(toolNames, ["agy_brain", "agy_worker", "agy_job"]);

  const brainTool = registeredTools.find((t) => t.name === "agy_brain");
  const workerTool = registeredTools.find((t) => t.name === "agy_worker");
  const jobTool = registeredTools.find((t) => t.name === "agy_job");
  assert.ok(brainTool && workerTool && jobTool);

  const testCwd = "/tmp/mock-workspace";
  const fakeAgentWithCwd = { session: { header: { cwd: testCwd } } };

  // 3. Verify agy_brain
  executedRunnerCalls.length = 0;
  runnerMockResponse = {
    ok: true,
    code: 0,
    stdout: "job id: staffer-test-123\nStarted background job",
    stderr: "",
  };
  const brainRes1 = await brainTool.execute(
    { prompt: "Evaluate architecture" },
    { agent: fakeAgentWithCwd }
  );
  assert.equal(executedRunnerCalls.length, 1);
  assert.deepEqual(executedRunnerCalls[0].args, [
    "staffer",
    "--brain",
    "--prompt",
    "Evaluate architecture",
  ]);
  assert.equal(brainRes1.ok, true);
  assert.equal(brainRes1.job_id, "staffer-test-123");
  assert.equal(brainRes1.status, "running");
  assert.ok(brainRes1.output.includes("Next: call agy_job with"));

  // Continuation with job_id
  executedRunnerCalls.length = 0;
  await brainTool.execute(
    { prompt: "Next revision", job_id: "staffer-test-123" },
    { agent: fakeAgentWithCwd }
  );
  assert.equal(executedRunnerCalls.length, 1);
  assert.deepEqual(executedRunnerCalls[0].args, [
    "continue",
    "--job",
    "staffer-test-123",
    "--prompt",
    "Next revision",
  ]);

  // Restricted overrides
  executedRunnerCalls.length = 0;
  await brainTool.execute(
    { prompt: "Check sandboxed", restricted: true },
    { agent: fakeAgentWithCwd }
  );
  assert.deepEqual(executedRunnerCalls[0].args, [
    "staffer",
    "--brain",
    "--prompt",
    "Check sandboxed",
    "--restricted",
  ]);

  executedRunnerCalls.length = 0;
  await brainTool.execute(
    { prompt: "Check false defers to config", restricted: false },
    { agent: fakeAgentWithCwd }
  );
  assert.deepEqual(executedRunnerCalls[0].args, [
    "staffer",
    "--brain",
    "--prompt",
    "Check false defers to config",
  ]);

  // Explicit model & effort forwarding on agy_brain (fresh and continue)
  assert.ok(brainTool.parameters?.properties?.model, "agy_brain must expose model parameter");
  assert.ok(brainTool.parameters?.properties?.effort, "agy_brain must expose effort parameter");
  executedRunnerCalls.length = 0;
  await brainTool.execute(
    { prompt: "Explicit Argon brain", model: "argon", effort: "high" },
    { agent: fakeAgentWithCwd }
  );
  assert.deepEqual(executedRunnerCalls[0].args, [
    "staffer",
    "--brain",
    "--prompt",
    "Explicit Argon brain",
    "--model",
    "argon",
    "--effort",
    "high",
  ]);

  executedRunnerCalls.length = 0;
  await brainTool.execute(
    { prompt: "Continue with Carbon", job_id: "staffer-test-123", model: "carbon", effort: "medium" },
    { agent: fakeAgentWithCwd }
  );
  assert.deepEqual(executedRunnerCalls[0].args, [
    "continue",
    "--job",
    "staffer-test-123",
    "--prompt",
    "Continue with Carbon",
    "--model",
    "carbon",
    "--effort",
    "medium",
  ]);

  // 4. Verify agy_worker
  executedRunnerCalls.length = 0;
  runnerMockResponse = {
    ok: true,
    code: 0,
    stdout: "job id: worker-research-999\nWorking...",
    stderr: "",
  };
  const workerRes1 = await workerTool.execute(
    { role: "research", prompt: "Investigate API" },
    { agent: fakeAgentWithCwd }
  );
  assert.equal(executedRunnerCalls.length, 1);
  assert.deepEqual(executedRunnerCalls[0].args, [
    "research",
    "--prompt",
    "Investigate API",
  ]);
  assert.equal(workerRes1.ok, true);
  assert.equal(workerRes1.role, "research");
  assert.equal(workerRes1.job_id, "worker-research-999");
  assert.equal(workerRes1.status, "running");

  // Worker continuation with job_id
  executedRunnerCalls.length = 0;
  await workerTool.execute(
    { role: "research", prompt: "Continue deep-dive", job_id: "worker-research-999" },
    { agent: fakeAgentWithCwd }
  );
  assert.equal(executedRunnerCalls.length, 1);
  assert.deepEqual(executedRunnerCalls[0].args, [
    "continue",
    "--job",
    "worker-research-999",
    "--prompt",
    "Continue deep-dive",
  ]);

  // Explicit model & effort forwarding on agy_worker
  assert.ok(workerTool.parameters?.properties?.model, "agy_worker must expose model parameter");
  assert.ok(workerTool.parameters?.properties?.effort, "agy_worker must expose effort parameter");
  executedRunnerCalls.length = 0;
  await workerTool.execute(
    { role: "research", prompt: "Carbon research", model: "carbon", effort: "high" },
    { agent: fakeAgentWithCwd }
  );
  assert.deepEqual(executedRunnerCalls[0].args, [
    "research",
    "--prompt",
    "Carbon research",
    "--model",
    "carbon",
    "--effort",
    "high",
  ]);

  // Worker role: "ask" returns status: "done"
  executedRunnerCalls.length = 0;
  runnerMockResponse = {
    ok: true,
    code: 0,
    stdout: "job id: ask-123\nDirect answer here",
    stderr: "",
  };
  const workerAskRes = await workerTool.execute(
    { role: "ask", prompt: "Quick question" },
    { agent: fakeAgentWithCwd }
  );
  assert.equal(workerAskRes.ok, true);
  assert.equal(workerAskRes.status, "done");

  // 5. Verify agy_job lifecycle
  // action: "wait"
  executedRunnerCalls.length = 0;
  runnerMockResponse = {
    ok: true,
    code: 2,
    stdout: "Still executing task...",
    stderr: "",
  };
  const waitResExit2 = await jobTool.execute(
    { action: "wait", job_id: "staffer-test-123" },
    { agent: fakeAgentWithCwd }
  );
  assert.equal(executedRunnerCalls.length, 1);
  assert.deepEqual(executedRunnerCalls[0].args, [
    "wait",
    "staffer-test-123",
    "--timeout",
    "60s",
  ]);
  assert.equal(executedRunnerCalls[0].opts.timeoutMs, 75000);
  assert.equal(waitResExit2.ok, true);
  assert.equal(waitResExit2.code, 2);
  assert.equal(waitResExit2.status, "running");
  assert.ok(waitResExit2.output.includes("Still running (exit 2)"));

  // Exit code 0 -> done
  runnerMockResponse = { ok: true, code: 0, stdout: "Completed", stderr: "" };
  const waitResExit0 = await jobTool.execute(
    { action: "wait", job_id: "staffer-test-123" },
    { agent: fakeAgentWithCwd }
  );
  assert.equal(waitResExit0.ok, true);
  assert.equal(waitResExit0.status, "done");
  assert.equal(waitResExit0.code, 0);

  // Exit code 3 -> error
  runnerMockResponse = { ok: false, code: 3, stdout: "", stderr: "Fatal failure" };
  const waitResExit3 = await jobTool.execute(
    { action: "wait", job_id: "staffer-test-123" },
    { agent: fakeAgentWithCwd }
  );
  assert.equal(waitResExit3.ok, false);
  assert.equal(waitResExit3.status, "error");
  assert.equal(waitResExit3.code, 3);

  // Exit code 4 -> canceled
  runnerMockResponse = { ok: false, code: 4, stdout: "", stderr: "Job was canceled" };
  const waitResExit4 = await jobTool.execute(
    { action: "wait", job_id: "staffer-test-123" },
    { agent: fakeAgentWithCwd }
  );
  assert.equal(waitResExit4.ok, false);
  assert.equal(waitResExit4.status, "canceled");
  assert.equal(waitResExit4.code, 4);

  // Exit code 5 -> attention
  runnerMockResponse = { ok: false, code: 5, stdout: "", stderr: "Needs user confirmation" };
  const waitResExit5 = await jobTool.execute(
    { action: "wait", job_id: "staffer-test-123" },
    { agent: fakeAgentWithCwd }
  );
  assert.equal(waitResExit5.ok, false);
  assert.equal(waitResExit5.status, "attention");
  assert.equal(waitResExit5.code, 5);

  // action: "cancel" without job_id fails cleanly
  const cancelMissingIdRes = await jobTool.execute(
    { action: "cancel" },
    { agent: fakeAgentWithCwd }
  );
  assert.equal(cancelMissingIdRes.ok, false);
  assert.equal(cancelMissingIdRes.status, "error");
  assert.ok(cancelMissingIdRes.output.includes("Cancel requires a job_id"));

  // 6. Verify missing cwd handling
  const fakeAgentWithoutCwd = { session: { header: {} } };
  executedRunnerCalls.length = 0;

  const brainNoCwd = await brainTool.execute(
    { prompt: "No cwd" },
    { agent: fakeAgentWithoutCwd }
  );
  assert.equal(brainNoCwd.ok, false);
  assert.equal(brainNoCwd.status, "error");
  assert.ok(brainNoCwd.output.includes("Could not resolve workspace cwd"));

  const workerNoCwd = await workerTool.execute(
    { role: "research", prompt: "No cwd" },
    { agent: fakeAgentWithoutCwd }
  );
  assert.equal(workerNoCwd.ok, false);
  assert.equal(workerNoCwd.status, "error");

  const jobNoCwd = await jobTool.execute(
    { action: "status" },
    { agent: fakeAgentWithoutCwd }
  );
  assert.equal(jobNoCwd.ok, false);
  assert.equal(jobNoCwd.status, "error");

  assert.equal(
    executedRunnerCalls.length,
    0,
    "runner must NEVER be invoked when workspace cwd is unresolved"
  );

  // 7. Verify /agy-ctl command handler
  assert.equal(registeredCommands.length, 1);
  assert.equal(registeredCommands[0].name, "agy-ctl");
  const ctlHandler = registeredCommands[0].handler;

  // ctl without cwd
  const ctlNoCwd = await ctlHandler({
    agent: fakeAgentWithoutCwd,
    rawInput: JSON.stringify({ action: "cancel", jobId: "test-job" }),
  });
  assert.equal(ctlNoCwd.kind, "error");
  assert.ok(ctlNoCwd.text.includes("Could not resolve workspace cwd"));

  // ctl cancel success
  executedRunnerCalls.length = 0;
  runnerMockResponse = { ok: true, code: 0, stdout: "Canceled staffer-123", stderr: "" };
  const ctlCancelRes = await ctlHandler({
    agent: fakeAgentWithCwd,
    rawInput: JSON.stringify({ action: "cancel", jobId: "staffer-123" }),
  });
  assert.equal(executedRunnerCalls.length, 1);
  assert.deepEqual(executedRunnerCalls[0].args, ["cancel", "staffer-123"]);
  assert.equal(executedRunnerCalls[0].opts.timeoutMs, 15000);
  assert.equal(ctlCancelRes.kind, "success");
  assert.equal(ctlCancelRes.text, "Canceled staffer-123");

  // ctl rejects removed actions (e.g. seed-demo, clear-demo)
  const ctlSeedDemo = await ctlHandler({
    agent: fakeAgentWithCwd,
    rawInput: JSON.stringify({ action: "seed-demo" }),
  });
  assert.equal(ctlSeedDemo.kind, "error");
  assert.ok(ctlSeedDemo.text.includes('Unknown /agy-ctl action "seed-demo"'));

  const ctlClearDemo = await ctlHandler({
    agent: fakeAgentWithCwd,
    rawInput: JSON.stringify({ action: "clear-demo" }),
  });
  assert.equal(ctlClearDemo.kind, "error");
  assert.ok(ctlClearDemo.text.includes('Unknown /agy-ctl action "clear-demo"'));
});

test("Items 2, 3, 5: client UI loadTurnData running->done transition, recent_activities, polling efficiency, and status icons", async () => {
  const clientCode = readFileSync(join(repoRoot, "dsh", "client.js"), "utf8");
  let loadedModule = null;

  let currentStates = [];
  let stateCursor = 0;
  let effects = [];
  const cleanups = [];

  const mockReact = {
    Component: class Component {
      constructor(props) {
        this.props = props;
      }
    },
    useState(init) {
      const idx = stateCursor++;
      if (!(idx in currentStates)) {
        currentStates[idx] = typeof init === "function" ? init() : init;
      }
      const setter = (val) => {
        currentStates[idx] =
          typeof val === "function" ? val(currentStates[idx]) : val;
      };
      return [currentStates[idx], setter];
    },
    useCallback(fn) {
      return fn;
    },
    useMemo(fn) {
      return fn();
    },
    useEffect(fn) {
      effects.push(fn);
    },
    useRef(init) {
      const idx = stateCursor++;
      if (!(idx in currentStates)) {
        currentStates[idx] = { current: init };
      }
      return currentStates[idx];
    },
  };

  const mockJsxRuntime = {
    Fragment: Symbol.for("react.fragment"),
    jsx(type, props, key) {
      return { $$typeof: Symbol.for("react.element"), type, props: props || {}, key };
    },
    jsxs(type, props, key) {
      return { $$typeof: Symbol.for("react.element"), type, props: props || {}, key };
    },
  };

  function renderFrame(innerComp, props) {
    stateCursor = 0;
    effects = [];
    return innerComp(props);
  }

  async function flushEffects() {
    const pending = [...effects];
    effects = [];
    for (const eff of pending) {
      const cleanup = eff();
      if (typeof cleanup === "function") cleanups.push(cleanup);
    }
  }

  function findAll(node, predicate, results = []) {
    if (!node) return results;
    if (Array.isArray(node)) {
      for (const child of node) findAll(child, predicate, results);
      return results;
    }
    if (typeof node === "object" && node.$$typeof === Symbol.for("react.element")) {
      if (predicate(node)) results.push(node);
      if (typeof node.type === "function" && !(node.type.prototype instanceof mockReact.Component)) {
        findAll(node.type(node.props || {}), predicate, results);
      } else {
        findAll(node.props?.children, predicate, results);
      }
    }
    return results;
  }

  function findOne(node, predicate) {
    const matches = findAll(node, predicate);
    return matches[0] || null;
  }

  function textContent(node) {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textContent).join("");
    if (typeof node === "object" && node.$$typeof === Symbol.for("react.element")) {
      if (typeof node.type === "function" && !(node.type.prototype instanceof mockReact.Component)) {
        return textContent(node.type(node.props || {}));
      }
      return textContent(node.props?.children);
    }
    return "";
  }

  function assertValidReactNode(node, path = "root") {
    if (node === null || node === undefined || typeof node === "boolean") return;
    if (typeof node === "string" || typeof node === "number") return;
    if (Array.isArray(node)) {
      node.forEach((child, i) => assertValidReactNode(child, `${path}[${i}]`));
      return;
    }
    if (typeof node === "object" && node.$$typeof === Symbol.for("react.element")) {
      if (typeof node.type === "function" && !(node.type.prototype instanceof mockReact.Component)) {
        const sub = node.type(node.props || {});
        assertValidReactNode(sub, `${path}->${node.type.name || "fn"}`);
        return;
      }
      assertValidReactNode(node.props?.children, `${path}.${String(node.type)}`);
      return;
    }
    assert.fail(`Invalid React child object at ${path}: ${JSON.stringify(node)}`);
  }

  globalThis.window = {
    __ModuleLoader__: {
      load(spec) {
        loadedModule = spec.factory((id) => {
          if (id === "react") return mockReact;
          if (id === "react/jsx-runtime") return mockJsxRuntime;
          throw new Error(`Unexpected require: ${id}`);
        });
      },
    },
  };

  try {
    new Function(clientCode)();
    assert.ok(loadedModule, "client.js should register module via __ModuleLoader__");

    let registeredTab = null;
    const registeredSlots = new Map();

    const jobId = "staffer-mw52cast-f2b5ea96";
    let mockJobStatus = "running";
    let hasResultMd = false;
    let resultMdContent = "";
    let progressJsonAvailable = true;
    let mockExtraJobs = [];

    const fileReadCounts = {
      state: 0,
      spec: 0,
      progress: 0,
      result: 0,
    };

    const mockClientCtx = {
      effect(fn) {
        return fn();
      },
      sidebarRightTabs: {
        register(def) {
          registeredTab = def;
          return () => {};
        },
      },
      slots: {
        inject(_name, fn) {
          return fn();
        },
        register(spec, comp) {
          registeredSlots.set(`${spec.name}:${spec.key || spec.id}`, comp);
          return () => {};
        },
      },
      remote: {
        workspaceFiles: {
          async read(_sessionId, filePath) {
            if (filePath === ".agy-staff/state.json") {
              fileReadCounts.state++;
              return {
                ok: true,
                value: {
                  text: JSON.stringify({
                    jobs: [
                      {
                        id: jobId,
                        mode: "staffer",
                        model: "gemini-4-argon-high",
                        status: mockJobStatus,
                        started_at: "2026-11-06T14:21:48.845Z",
                      },
                      ...mockExtraJobs,
                    ],
                  }),
                },
              };
            }
            if (filePath.endsWith(".spec.json")) {
              fileReadCounts.spec++;
              return {
                ok: true,
                value: {
                  text: JSON.stringify({
                    prompt_source: {
                      kind: "followup",
                      task: "Polish host-to-brain connector and card surface in design.svg",
                    },
                  }),
                },
              };
            }
            if (filePath.endsWith(".progress.json")) {
              fileReadCounts.progress++;
              if (!progressJsonAvailable) return { ok: false };
              return {
                ok: true,
                value: {
                  text: JSON.stringify({
                    job_id: jobId,
                    status: "running",
                    recent_activities: [
                      // 3 chunked reads of the same file (oldest) must collapse to one "×3" pill
                      ...[98, 99, 100].map((step_index) => ({
                        step_index,
                        tool: "read_file",
                        status: "done",
                        input_preview: JSON.stringify({
                          Path: "/Users/wenkeli/OpenSource/agy-staff/dsh/client.js",
                        }),
                      })),
                      {
                        step_index: 101,
                        tool: "edit_file",
                        status: "done",
                        input_preview: JSON.stringify({
                          Path: "/Users/wenkeli/OpenSource/agy-staff/assets/design.svg",
                        }),
                      },
                    ],
                    latest_text: {
                      step_index: 112,
                      text: "Status: RUNNING\nPolishing connector and card surface live.",
                      truncated: false,
                      status: "running",
                    },
                  }),
                },
              };
            }
            if (filePath.endsWith(".result.md")) {
              fileReadCounts.result++;
              if (!hasResultMd) return { ok: false };
              return {
                ok: true,
                value: {
                  text: resultMdContent,
                },
              };
            }
            return { ok: false };
          },
        },
      },
    };

    loadedModule.apply(mockClientCtx);
    assert.ok(registeredTab, "sidebarRightTabs.register should be called");

    const GuideIcon = registeredTab.guide[0].icon;
    const iconNode = GuideIcon({ size: 26 });
    assert.equal(iconNode.type, "svg", "GuideArtworkAgyStaff must render a transparent <svg> directly");
    assert.equal(
      registeredTab.guide[0].description(),
      "子代理协作 · Gemini 4 Carbon / Argon & 3.8 Flash",
      "Guide description must reflect Gemini 4 Carbon / Argon & 3.8 Flash"
    );

    const SidebarBody = registeredSlots.get("sidebar.right.pane.tab:agy-staff-dsh");
    assert.equal(typeof SidebarBody, "function");

    const insertedDrafts = [];
    const wrapperNode = SidebarBody({
      sessionId: "test-session",
      useSessions: () => "/Users/wenkeli/OpenSource/agy-staff",
      inputActions: {
        setDraft(draft) {
          insertedDrafts.push(draft);
        },
      },
    });
    const innerComp = wrapperNode.props.children.type;
    const innerProps = wrapperNode.props.children.props;

    // Phase 1: Mount & Initial State Load
    let tree = renderFrame(innerComp, innerProps);
    assertValidReactNode(tree, "initial-mount");

    await flushEffects();
    // Wait for initial setTimeout(loadWorkspaceState, 30)
    await new Promise((r) => setTimeout(r, 60));

    // Verify .progress.json was read while status === "running"
    assert.ok(fileReadCounts.progress >= 1, ".progress.json must be read while status === 'running'");
    assert.ok(fileReadCounts.spec >= 1, ".spec.json must be read on initial load");

    // Phase 2: Expand Card while Running
    tree = renderFrame(innerComp, innerProps);
    assertValidReactNode(tree, "loaded-running");

    const summaryBtn = findOne(tree, (n) => n.props?.className === "agy-subagent-summary");
    assert.ok(summaryBtn, "card summary button must exist");
    assert.ok(
      textContent(summaryBtn).includes("staffer · Argon"),
      `worker job with explicit Argon model should render 'staffer · Argon', got: ${textContent(summaryBtn)}`
    );

    // Click to expand card
    summaryBtn.props.onClick();
    await new Promise((r) => setTimeout(r, 60));

    // Verify turnDetails[jobId].loaded is NOT locked to true while running
    const turnDetailsState = currentStates.find(
      (s) => s && typeof s === "object" && s[jobId] && typeof s[jobId] === "object" && "loaded" in s[jobId]
    );
    assert.ok(turnDetailsState, "turnDetails state for jobId must exist");
    assert.equal(
      turnDetailsState[jobId].loaded,
      false,
      "while running (with no .result.md), turnDetails[id].loaded must NOT be true"
    );

    // Render expanded card
    tree = renderFrame(innerComp, innerProps);
    assertValidReactNode(tree, "expanded-running");

    // Verify .agy-live-strip renders formatted activity string and NEVER [object Object]
    const liveStrip = findOne(tree, (n) => n.props?.className === "agy-live-strip");
    assert.ok(liveStrip, ".agy-live-strip must be rendered when expanded and running");
    const liveText = textContent(liveStrip);
    assert.ok(
      liveText.includes("edit_file: design.svg"),
      `live strip should format activity item, got: ${liveText}`
    );
    assert.ok(
      !liveText.includes("[object Object]"),
      "live strip must NEVER contain [object Object]"
    );

    // Consecutive duplicates collapse; newest step is first and marked current
    const pills = findAll(
      liveStrip,
      (n) => typeof n.props?.className === "string" && n.props.className.split(" ").includes("agy-step-pill")
    );
    assert.equal(pills.length, 2, `duplicate activities must collapse into 2 pills, got ${pills.length}`);
    assert.ok(pills[0].props.className.includes("is-current"), "newest pill must be marked is-current");
    assert.ok(textContent(pills[0]).includes("edit_file: design.svg"), "newest activity must be first");
    const olderText = textContent(pills[1]);
    assert.ok(
      olderText.includes("read_file: client.js") && olderText.includes("×3"),
      `repeated reads must collapse into one ×3 pill, got: ${olderText}`
    );

    // Strip is locked to a single non-wrapping row so it never changes height
    const stripCss = clientCode.match(/\.agy-live-strip \{[^}]*\}/)?.[0] || "";
    assert.ok(stripCss.includes("flex-wrap: nowrap"), ".agy-live-strip must not wrap");
    assert.ok(/\bheight: 20px/.test(stripCss), ".agy-live-strip must have a fixed height");

    // Verify renderTurnQA shows live latest_text summary
    const replyViewport = findOne(
      tree,
      (n) => n.props?.className === "agy-qa-viewport" && n.props?.["data-kind"] === "reply"
    );
    assert.ok(replyViewport, "reply viewport must exist");
    const liveSummaryText = textContent(replyViewport);
    assert.ok(
      liveSummaryText.includes("Polishing connector and card surface live."),
      `renderTurnQA should show live latest_text summary, got: ${liveSummaryText}`
    );

    // Phase 3: Transition to status: "done", delete/disable progress.json, provide result.md
    mockJobStatus = "done";
    progressJsonAvailable = false;
    hasResultMd = true;
    resultMdContent = "Final Argon Review Report";

    const refreshBtn = findOne(
      tree,
      (n) => typeof n.props?.onClick === "function" && n.props?.className?.includes("agy-icon-btn")
    );
    assert.ok(refreshBtn, "refresh button must exist");
    await refreshBtn.props.onClick();

    // Re-render and flush effects (which triggers loadTurnData for newly terminal turn)
    tree = renderFrame(innerComp, innerProps);
    await flushEffects();
    await new Promise((r) => setTimeout(r, 60));

    // Final render with loaded result.md
    tree = renderFrame(innerComp, innerProps);
    assertValidReactNode(tree, "expanded-done");

    const updatedTurnDetails = currentStates.find(
      (s) => s && typeof s === "object" && s[jobId] && typeof s[jobId] === "object" && "loaded" in s[jobId]
    );
    assert.ok(updatedTurnDetails, "updated turnDetails state must exist");
    assert.equal(
      updatedTurnDetails[jobId].loaded,
      true,
      "after transitioning to done and loading .result.md, turnDetails[id].loaded must be true"
    );

    const postReplyViewport = findOne(
      tree,
      (n) => n.props?.className === "agy-qa-viewport" && n.props?.["data-kind"] === "reply"
    );
    assert.ok(postReplyViewport, "reply viewport must exist after transition");
    const postReplyText = textContent(postReplyViewport);
    assert.ok(
      postReplyText.includes("Final Argon Review Report"),
      `DOM must render Final Argon Review Report, got: ${postReplyText}`
    );
    assert.ok(
      !postReplyText.includes("正在等待子代理输出…"),
      "DOM must NOT render '正在等待子代理输出…' after .result.md loads"
    );

    // Phase 4: Verify Polling Efficiency when all jobs are done
    fileReadCounts.state = 0;
    fileReadCounts.progress = 0;
    fileReadCounts.spec = 0;

    // Trigger subsequent poll
    await refreshBtn.props.onClick();

    assert.equal(fileReadCounts.state, 1, "state.json should be read once for poll");
    assert.equal(
      fileReadCounts.progress,
      0,
      "on subsequent poll when all jobs done, .progress.json must NOT be read (0 reads)"
    );
    assert.equal(
      fileReadCounts.spec,
      0,
      "on subsequent poll when all jobs done, cached .spec.json must NOT be re-read (0 reads)"
    );

    // Phase 5: Verify StatusGraphicIcon titles
    const StatusGraphicIcon = findOne(
      tree,
      (n) => typeof n.type === "function" && n.type.name === "StatusGraphicIcon"
    )?.type;
    assert.ok(StatusGraphicIcon, "StatusGraphicIcon component must exist in tree");

    assert.equal(
      StatusGraphicIcon({ status: "error" }).props.title,
      "Failed / 执行失败"
    );
    assert.equal(
      StatusGraphicIcon({ status: "crashed" }).props.title,
      "Failed / 执行失败"
    );
    assert.equal(
      StatusGraphicIcon({ status: "canceled" }).props.title,
      "Canceled / 已取消"
    );
    assert.equal(
      StatusGraphicIcon({ status: "cancelled" }).props.title,
      "Canceled / 已取消"
    );
    assert.equal(
      StatusGraphicIcon({ status: "attention" }).props.title,
      "Needs attention / 需处理"
    );
    assert.equal(
      StatusGraphicIcon({ status: "done" }).props.title,
      "Completed / 已完成"
    );
    assert.equal(
      StatusGraphicIcon({ status: "running" }).props.title,
      "Running / 运行中"
    );

    // Phase 6: Verify PixelIconCarbon, PixelIconArgon, and dynamic brain/worker role tags
    mockExtraJobs = [
      {
        id: "staffer-brain-carbon-1",
        mode: "staffer",
        brain: true,
        model: "gemini-4-carbon-medium",
        status: "done",
        task: "Carbon proposal",
        started_at: "2026-11-07T10:00:00.000Z",
      },
      {
        id: "staffer-brain-argon-2",
        mode: "staffer",
        brain: true,
        model: "gemini-4-argon-medium",
        status: "done",
        task: "Argon fallback proposal",
        started_at: "2026-11-07T10:01:00.000Z",
      },
      {
        id: "staffer-brain-flash-3",
        mode: "staffer",
        brain: true,
        model: "gemini-3.8-flash-medium",
        status: "done",
        task: "Flash fallback proposal",
        started_at: "2026-11-07T10:02:00.000Z",
      },
      {
        id: "research-carbon-4",
        mode: "research",
        model: "gemini-4-carbon-high",
        status: "done",
        task: "Explicit Carbon worker",
        started_at: "2026-11-07T10:03:00.000Z",
      },
    ];
    await refreshBtn.props.onClick();
    tree = renderFrame(innerComp, innerProps);
    assertValidReactNode(tree, "multi-model-cards");

    const fullTreeText = textContent(tree);
    for (const expectedRole of [
      "brain · Carbon",
      "brain · Argon",
      "brain · Flash",
      "researcher · Carbon",
      "staffer · Argon",
    ]) {
      assert.ok(
        fullTreeText.includes(expectedRole),
        `sidebar should render '${expectedRole}', got: ${fullTreeText}`
      );
    }
    assert.ok(
      findOne(tree, (n) => typeof n.type === "function" && n.type.name === "PixelIconCarbon"),
      "PixelIconCarbon must render for Carbon brain card"
    );
    assert.ok(
      findOne(tree, (n) => typeof n.type === "function" && n.type.name === "PixelIconArgon"),
      "PixelIconArgon must render for Argon brain card"
    );

    // Phase 7: Verify /agy-brain [Carbon] & [Argon] quick-chips, no nested <button>, and multi-turn model tags
    function assertNoNestedButtons(node, insideButton = false) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const child of node) assertNoNestedButtons(child, insideButton);
        return;
      }
      if (typeof node.type === "function") {
        assertNoNestedButtons(node.type(node.props || {}), insideButton);
        return;
      }
      const isBtn = node.type === "button";
      if (isBtn && insideButton) {
        assert.fail("Invalid DOM nesting: <button> nested inside <button>");
      }
      if (node.props && "children" in node.props) {
        assertNoNestedButtons(node.props.children, insideButton || isBtn);
      }
    }
    assertNoNestedButtons(tree);

    const brainCapCard = findOne(
      tree,
      (n) =>
        n.props?.className === "agy-cap-item" &&
        n.props?.["data-has-chips"] === "true" &&
        textContent(n).includes("/agy-brain")
    );
    assert.ok(brainCapCard, "/agy-brain capability card with quick-chips must exist");
    assert.equal(brainCapCard.type, "div", "/agy-brain card with sub-chips must be a div[role=button]");
    assert.equal(brainCapCard.props.role, "button");

    const carbonChip = findOne(
      brainCapCard,
      (n) =>
        n.type === "button" &&
        n.props?.className?.includes("agy-cap-model-chip") &&
        n.props?.["data-model"] === "carbon"
    );
    const argonChip = findOne(
      brainCapCard,
      (n) =>
        n.type === "button" &&
        n.props?.className?.includes("agy-cap-model-chip") &&
        n.props?.["data-model"] === "argon"
    );
    assert.ok(carbonChip, "Carbon quick-chip must exist inside /agy-brain card");
    assert.ok(argonChip, "Argon quick-chip must exist inside /agy-brain card");
    assert.ok(
      findOne(carbonChip, (n) => typeof n.type === "function" && n.type.name === "PixelIconCarbon"),
      "Carbon quick-chip must render PixelIconCarbon"
    );
    assert.ok(
      findOne(argonChip, (n) => typeof n.type === "function" && n.type.name === "PixelIconArgon"),
      "Argon quick-chip must render PixelIconArgon"
    );

    insertedDrafts.length = 0;
    await brainCapCard.props.onClick({ stopPropagation() {} });
    assert.deepEqual(insertedDrafts, ["/agy-brain "], "clicking /agy-brain card inserts '/agy-brain '");

    insertedDrafts.length = 0;
    let carbonStopped = false;
    await carbonChip.props.onClick({
      stopPropagation() {
        carbonStopped = true;
      },
    });
    assert.equal(carbonStopped, true, "Carbon chip onClick must call stopPropagation()");
    assert.deepEqual(
      insertedDrafts,
      ["/agy-brain --model carbon "],
      "clicking Carbon chip inserts '/agy-brain --model carbon '"
    );

    insertedDrafts.length = 0;
    let argonStopped = false;
    await argonChip.props.onClick({
      stopPropagation() {
        argonStopped = true;
      },
    });
    assert.equal(argonStopped, true, "Argon chip onClick must call stopPropagation()");
    assert.deepEqual(
      insertedDrafts,
      ["/agy-brain --model argon "],
      "clicking Argon chip inserts '/agy-brain --model argon '"
    );

    // Multi-turn thread where turn 1 used Carbon and turn 2 switched to Argon
    mockExtraJobs = [
      {
        id: "staffer-brain-t1",
        mode: "staffer",
        brain: true,
        conversation_id: "conv-multi-model",
        model: "gemini-4-carbon-medium",
        status: "done",
        task: "Initial Carbon design",
        started_at: "2026-11-07T10:10:00.000Z",
      },
      {
        id: "staffer-brain-t2",
        mode: "staffer",
        brain: true,
        conversation_id: "conv-multi-model",
        continued_from_job_id: "staffer-brain-t1",
        model: "gemini-4-argon-high",
        status: "done",
        task: "Follow-up Argon stress test",
        started_at: "2026-11-07T10:12:00.000Z",
      },
    ];
    await refreshBtn.props.onClick();
    tree = renderFrame(innerComp, innerProps);
    const multiSummary = findOne(
      tree,
      (n) =>
        n.props?.className === "agy-subagent-summary" &&
        textContent(n).includes("Follow-up Argon stress test")
    );
    assert.ok(multiSummary, "multi-turn thread summary must exist");
    await multiSummary.props.onClick();
    tree = renderFrame(innerComp, innerProps);
    assertValidReactNode(tree, "multi-turn-mixed-models");
    const turnModelPill = findOne(
      tree,
      (n) => n.props?.className?.includes("agy-turn-model-pill")
    );
    assert.ok(turnModelPill, "turn with differing model must display .agy-turn-model-pill");
    assert.equal(textContent(turnModelPill), "Carbon");
  } finally {
    for (const c of cleanups) {
      if (typeof c === "function") {
        try {
          c();
        } catch {}
      }
    }
    delete globalThis.window;
  }
});
