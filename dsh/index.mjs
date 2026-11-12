import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DSH_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(DSH_DIR, "..");
const COMPANION_PATH = join(REPO_ROOT, "companion", "agy-companion.mjs");
const SKILLS_ROOT = join(REPO_ROOT, "opencode-skills");
const PROVIDER_NAME = "agy-staff";
const BUNDLED_SKILL_RANK = 600;

export const name = "agy-staff";

const DSH_NOTE =
  "> **DeepSeek Harness (DSH) Note**: Prefer the native tools (`agy_brain`, `agy_worker`, `agy_job`) over running `agy-companion.mjs` in the shell tool, because the DSH shell sandbox blocks `agy` local language-server ports and OAuth keychain access.\n\n";

function parseSkillMarkdown(raw, fallbackName) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(raw);
  if (!match) {
    return {
      name: fallbackName,
      description: `AGY Staff skill (${fallbackName})`,
      body: raw,
    };
  }
  const frontmatter = match[1];
  const body = match[2];
  let parsedName = fallbackName;
  let parsedDesc = `AGY Staff skill (${fallbackName})`;

  const nameMatch = /^name:\s*(.+)$/mu.exec(frontmatter);
  if (nameMatch) {
    parsedName = nameMatch[1].trim().replace(/^["']|["']$/gu, "");
  }

  const descLines = [];
  const lines = frontmatter.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("description:")) {
      const inline = line.slice("description:".length).trim();
      if (inline && inline !== "|" && inline !== ">") {
        descLines.push(inline.replace(/^["']|["']$/gu, ""));
      }
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^\s+/u.test(lines[j])) {
          descLines.push(lines[j].trim());
        } else {
          break;
        }
      }
      break;
    }
  }
  if (descLines.length > 0) {
    parsedDesc = descLines.join(" ").trim();
  }

  return {
    name: parsedName,
    description: parsedDesc,
    body,
  };
}

function hydrateSkillBody(body, skillDir) {
  const hydrated = body
    .replaceAll("<skill-dir>", skillDir || "")
    .replaceAll("<plugin-root>", REPO_ROOT);
  return DSH_NOTE + hydrated;
}

function loadSkillCandidates() {
  if (!existsSync(SKILLS_ROOT)) return [];
  const entries = readdirSync(SKILLS_ROOT, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("agy-")) continue;
    const skillDir = join(SKILLS_ROOT, entry.name);
    const skillFile = join(skillDir, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    try {
      const raw = readFileSync(skillFile, "utf8");
      const parsed = parseSkillMarkdown(raw, entry.name);
      candidates.push({
        name: parsed.name,
        description: parsed.description,
        invocation: {
          modelInvocable: true,
          userInvocable: true,
        },
        provider: PROVIDER_NAME,
        source: "bundled",
        resourceBase: {
          kind: "directory",
          path: skillDir,
        },
        rank: BUNDLED_SKILL_RANK,
        locator: pathToFileURL(skillFile),
        _skillFile: skillFile,
      });
    } catch {
      // Ignore malformed skill files
    }
  }
  return candidates;
}

function extractJobId(text) {
  if (!text || typeof text !== "string") return "";
  const match = /^(?:job id|id):\s*(\S+)/im.exec(text);
  if (!match) return "";
  return match[1].replace(/^[^\w-]+|[^\w-]+$/gu, "").trim();
}

function statusFromExitCode(code) {
  switch (code) {
    case 0:
      return "done";
    case 2:
      return "running";
    case 3:
      return "error";
    case 4:
      return "canceled";
    case 5:
      return "attention";
    default:
      return "error";
  }
}

function runCompanion(args, { cwd, timeoutMs = 180000, signal } = {}) {
  return new Promise((resolvePromise) => {
    if (!cwd) {
      resolvePromise({
        ok: false,
        code: 1,
        stdout: "",
        stderr: "Error: Missing workspace cwd.",
      });
      return;
    }

    const child = spawn(process.execPath, [COMPANION_PATH, ...args], {
      cwd,
      env: {
        ...process.env,
        AGY_STAFF_ROOT: REPO_ROOT,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {}
      finish({
        ok: false,
        code: 124,
        stdout,
        stderr: `${stderr}\nTimed out after ${timeoutMs}ms`.trim(),
      });
    }, timeoutMs);

    if (signal) {
      if (signal.aborted) {
        try {
          child.kill("SIGTERM");
        } catch {}
      } else {
        signal.addEventListener(
          "abort",
          () => {
            try {
              child.kill("SIGTERM");
            } catch {}
          },
          { once: true }
        );
      }
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      finish({
        ok: false,
        code: 1,
        stdout,
        stderr: err.message || String(err),
      });
    });
    child.on("close", (code) => {
      finish({
        ok: code === 0,
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function resolveSessionCwd(ctx, agent) {
  const fromHeader = agent?.session?.header?.cwd;
  if (typeof fromHeader === "string" && fromHeader.trim().length > 0) {
    return fromHeader;
  }
  const fromPolicy = ctx.get?.("sandboxPolicy")?.workspaceRoot;
  if (typeof fromPolicy === "string" && fromPolicy.trim().length > 0) {
    return fromPolicy;
  }
  return null;
}

export function apply(ctx, options = {}) {
  const execCompanion = options?.runCompanion || runCompanion;

  // 1. Register AGY Staff skills (/agy-brain, /agy-lead, /agy-staffer, etc.)
  ctx.inject(["skills"], (skillCtx) => {
    const provider = {
      name: PROVIDER_NAME,
      list: async () => loadSkillCandidates(),
      async get(candidate) {
        const skillFile =
          candidate._skillFile ||
          join(SKILLS_ROOT, candidate.name, "SKILL.md");
        const raw = readFileSync(skillFile, "utf8");
        const parsed = parseSkillMarkdown(raw, candidate.name);
        const skillDir = candidate.resourceBase?.path || dirname(skillFile);
        return {
          name: parsed.name,
          description: parsed.description,
          invocation: candidate.invocation,
          provider: PROVIDER_NAME,
          source: "bundled",
          resourceBase: candidate.resourceBase,
          content: hydrateSkillBody(parsed.body, skillDir),
        };
      },
    };
    skillCtx.effect(
      () => skillCtx.skills.registerProvider(() => provider),
      "agy-staff: skills provider"
    );
  });

  // 2. Register native sub-agency tools (agy_brain, agy_worker, agy_job)
  ctx.inject(["tools"], (toolCtx) => {
    toolCtx.tools.register({
      name: "agy_brain",
      description:
        "Consult the AGY Second Brain (Gemini 4 Carbon / Argon via `staffer --brain`) to propose an implementation route, challenge assumptions, or stress-test a design while the host retains final authority. Executes agy-companion outside the DSH command sandbox.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          prompt: {
            type: "string",
            description:
              "Decision question, architecture trade-off, or plan for the Second Brain to evaluate.",
          },
          job_id: {
            type: "string",
            description:
              "Optional existing brain job_id to continue in the same thread (`continue --job <id>`).",
          },
          model: {
            type: "string",
            description:
              "Optional model id or family alias (\"carbon\", \"argon\", \"hydrogen\", \"flash\", \"pro\", or effort-suffixed id such as \"gemini-4-argon-high\"). Defaults to Gemini 4 Carbon.",
          },
          effort: {
            type: "string",
            enum: ["low", "medium", "high", "xhigh"],
            description:
              "Optional reasoning effort level when model is a bare family or alias (requires model on brain runs; an effort-suffixed model id already fixes its effort).",
          },
          restricted: {
            type: "boolean",
            description:
              "Optional hardening override: set true to pass --restricted. Omit (or false) to defer to .agy-staff/config.json.",
          },
        },
        required: ["prompt"],
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            ok: { type: "boolean" },
            job_id: { type: "string" },
            status: { type: "string" },
            output: { type: "string" },
          },
          required: ["ok", "job_id", "status", "output"],
        },
        render: (_args, value) => [{ type: "text", text: value.output }],
      },
      async execute(args, exec) {
        const cwd = resolveSessionCwd(toolCtx, exec?.agent);
        if (!cwd) {
          return {
            ok: false,
            job_id: "",
            status: "error",
            output: "Error: Could not resolve workspace cwd from active DSH session.",
          };
        }
        const cliArgs = args.job_id
          ? ["continue", "--job", args.job_id, "--prompt", args.prompt]
          : ["staffer", "--brain", "--prompt", args.prompt];
        if (args.model && String(args.model).trim()) {
          cliArgs.push("--model", String(args.model).trim());
        }
        if (args.effort && String(args.effort).trim()) {
          cliArgs.push("--effort", String(args.effort).trim());
        }
        if (args.restricted === true) {
          cliArgs.push("--restricted");
        }

        const res = await execCompanion(cliArgs, {
          cwd,
          signal: exec?.signal,
        });
        const job_id = extractJobId(res.stdout) || String(args.job_id || "");
        const status = res.ok ? "running" : "error";
        let output = (res.stdout || res.stderr || "No output").trim();
        if (res.ok && job_id) {
          output += `\n\nNext: call agy_job with {"action":"wait","job_id":"${job_id}"} to collect the result.`;
        }
        return { ok: res.ok, job_id, status, output };
      },
    });

    toolCtx.tools.register({
      name: "agy_worker",
      description:
        "Dispatch an AGY Worker sub-agency (Gemini 4 Hydrogen default, or explicit model/effort) for research, review, implement, staffer, or ask, executing outside the DSH command sandbox (implement and unrestricted roles can write directly to the workspace).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          role: {
            type: "string",
            enum: ["research", "review", "implement", "staffer", "ask"],
            description: "Worker persona to invoke.",
          },
          prompt: {
            type: "string",
            description: "Bounded task instructions and acceptance criteria.",
          },
          job_id: {
            type: "string",
            description:
              "Optional existing worker job_id to continue in the same thread (`continue --job <id>`).",
          },
          model: {
            type: "string",
            description:
              "Optional model id or family alias (\"hydrogen\", \"carbon\", \"argon\", \"flash\", \"pro\", or effort-suffixed id).",
          },
          effort: {
            type: "string",
            enum: ["low", "medium", "high", "xhigh"],
            description:
              "Optional reasoning effort level when model is omitted or is a bare family/alias (an effort-suffixed model id already fixes its effort).",
          },
          restricted: {
            type: "boolean",
            description:
              "Optional hardening override: set true to pass --restricted. Omit (or false) to defer to .agy-staff/config.json.",
          },
        },
        required: ["role", "prompt"],
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            ok: { type: "boolean" },
            role: { type: "string" },
            job_id: { type: "string" },
            status: { type: "string" },
            output: { type: "string" },
          },
          required: ["ok", "role", "job_id", "status", "output"],
        },
        render: (_args, value) => [{ type: "text", text: value.output }],
      },
      async execute(args, exec) {
        const cwd = resolveSessionCwd(toolCtx, exec?.agent);
        const role = args.role || "research";
        if (!cwd) {
          return {
            ok: false,
            role,
            job_id: "",
            status: "error",
            output: "Error: Could not resolve workspace cwd from active DSH session.",
          };
        }
        const cliArgs = args.job_id
          ? ["continue", "--job", args.job_id, "--prompt", args.prompt]
          : [role, "--prompt", args.prompt];
        if (args.model && String(args.model).trim()) {
          cliArgs.push("--model", String(args.model).trim());
        }
        if (args.effort && String(args.effort).trim()) {
          cliArgs.push("--effort", String(args.effort).trim());
        }
        if (args.restricted === true) {
          cliArgs.push("--restricted");
        }

        const res = await execCompanion(cliArgs, {
          cwd,
          signal: exec?.signal,
        });
        const job_id = extractJobId(res.stdout) || String(args.job_id || "");
        const status = !res.ok ? "error" : role === "ask" ? "done" : "running";
        let output = (res.stdout || res.stderr || "No output").trim();
        if (res.ok && role !== "ask" && job_id) {
          output += `\n\nNext: call agy_job with {"action":"wait","job_id":"${job_id}"} to collect the result.`;
        }
        return { ok: res.ok, role, job_id, status, output };
      },
    });

    toolCtx.tools.register({
      name: "agy_job",
      description:
        "Manage AGY Staff background jobs: `wait` (60s soft-timeout block until done or exit 2 still-running), `observe` (non-blocking progress snapshot when user asks), `result` (fetch finished report), `cancel` (stop running job), or `status` (list/inspect jobs).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: {
            type: "string",
            enum: ["wait", "observe", "result", "cancel", "status"],
            description: "Lifecycle action to run.",
          },
          job_id: {
            type: "string",
            description:
              "Target job_id (required for cancel; defaults to latest job for wait/observe/result/status).",
          },
        },
        required: ["action"],
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            ok: { type: "boolean" },
            action: { type: "string" },
            job_id: { type: "string" },
            status: { type: "string" },
            code: { type: "number" },
            output: { type: "string" },
          },
          required: ["ok", "action", "job_id", "status", "code", "output"],
        },
        render: (_args, value) => [{ type: "text", text: value.output }],
      },
      async execute(args, exec) {
        const cwd = resolveSessionCwd(toolCtx, exec?.agent);
        const action = args.action || "status";
        const jobId = String(args.job_id || "").trim();
        if (!cwd) {
          return {
            ok: false,
            action,
            job_id: jobId,
            status: "error",
            code: 1,
            output: "Error: Could not resolve workspace cwd from active DSH session.",
          };
        }
        if (action === "cancel" && !jobId) {
          return {
            ok: false,
            action,
            job_id: "",
            status: "error",
            code: 1,
            output: "Cancel requires a job_id.",
          };
        }

        const cliArgs =
          action === "wait"
            ? ["wait", ...(jobId ? [jobId] : []), "--timeout", "60s"]
            : [action, ...(jobId ? [jobId] : [])];
        const timeoutMs = action === "wait" ? 75000 : 30000;

        const res = await execCompanion(cliArgs, {
          cwd,
          timeoutMs,
          signal: exec?.signal,
        });

        const code = typeof res.code === "number" ? res.code : res.ok ? 0 : 1;
        const ok = code === 0 || code === 2;
        const status = statusFromExitCode(code);
        const resolvedJobId = jobId || extractJobId(res.stdout) || "";
        let output = (res.stdout || res.stderr || "No output").trim();
        if (action === "wait" && code === 2) {
          output += `\n\n[Still running (exit 2): call agy_job with {"action":"wait"${resolvedJobId ? `,"job_id":"${resolvedJobId}"` : ""}} again to continue waiting.]`;
        }
        return {
          ok,
          action,
          job_id: resolvedJobId,
          status,
          code,
          output,
        };
      },
    });
  });

  // 3. Register /agy-ctl command for Sidebar UI control & direct CLI control
  ctx.inject(["commands"], (cmdCtx) => {
    cmdCtx.commands.register({
      name: "agy-ctl",
      description:
        "Control AGY Staff sub-agencies (Second Brain & Flash Workers) or cancel background jobs",
      input: {
        hint: '{"action":"cancel","jobId":"<id>"}',
      },
      recordInput: false,
      handler: async ({ agent, rawInput, signal }) => {
        const cwd = resolveSessionCwd(cmdCtx, agent);
        if (!cwd) {
          return {
            kind: "error",
            text: "Error: Could not resolve workspace cwd from active DSH session.",
          };
        }
        const trimmed = (rawInput || "").trim();

        let payload;
        if (trimmed.startsWith("{")) {
          try {
            payload = JSON.parse(trimmed);
          } catch (err) {
            return {
              kind: "error",
              text: `Invalid JSON payload for /agy-ctl: ${err.message}`,
            };
          }
        } else {
          const [sub = "", ...rest] = trimmed.split(/\s+/u);
          payload = { action: sub, jobId: rest.join(" ") };
        }

        const action = payload.action;

        if (action === "cancel") {
          const jobId = String(payload.jobId || "").trim();
          if (!jobId) {
            return {
              kind: "error",
              text: "Cancel requires a jobId.",
            };
          }
          const res = await execCompanion(["cancel", jobId], {
            cwd,
            timeoutMs: 15000,
            signal,
          });
          return {
            kind: res.ok ? "success" : "error",
            text: (res.stdout || res.stderr || "").trim() || "Canceled",
          };
        }

        return {
          kind: "error",
          text: `Unknown /agy-ctl action "${action}"`,
        };
      },
    });
  });
}

export default { name, apply };
