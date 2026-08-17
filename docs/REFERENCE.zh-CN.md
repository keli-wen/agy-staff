# agy-staff — 完整参考

返回 [README](../README.zh-CN.md)。English version: [REFERENCE.md](REFERENCE.md).

## 模式与默认值

| 模式 | 说明 | 默认模型 | 默认权限档 | 默认执行方式 |
|---|---|---|---|---|
| `ask` | 廉价的零工具单轮问答（约 3s）；兼作装后冒烟测试 | `gemini-3.7-flash-low` | strict（仅 prompt） | 前台等待（固定） |
| `research` | 深度调研：要求引用来源、显式标注未验证结论 | `gemini-3.7-flash-high` | strict | 前台等待 |
| `review` | 第二意见验证者：按严重度排序的 findings，带 `file:line` 引用 | `gemini-3.7-flash-medium` | strict | 前台等待 |
| `implement` | 边界清晰的编码任务；agy 直接修改工作区，由你审阅 diff | `gemini-3.7-flash-medium` | loose | 后台运行 |

两个平台使用同一个插件名 `agy`（命令均为 `/agy:*`），共用一个 companion 脚本（`companion/agy-companion.mjs`，仅依赖 Node 标准库）和共享的 prompt 模板（`templates/`）。

## 双权限档模型

每种模式只会运行在两个权限档之一。模式决定默认值；`--strict`/`--loose` 可按次覆盖（`ask` 零工具，两者都会被忽略）。

| | **strict**（默认：ask、research、review） | **loose**（默认：implement） |
|---|---|---|
| agy 调用方式 | 不跳过权限——fail-closed，未列入 allowlist 的工具调用一律自动拒绝 | `--dangerously-skip-permissions` |
| agy 能做什么 | 通过 setup 的 allowlist 做只读取证：`git gh cat head ls grep find rg wc`（命令按前缀匹配） | 任何事，包括改文件、跑命令 |
| 安全网 | agy 物理上无法写入 | git：companion 在工作区不干净时拒绝启动；结束后打印 `git diff --stat`；回滚是 `git checkout .` |
| 典型用途 | 问答、调研、代码审查 | 编码任务；需要跑测试的审查（`/agy:review --loose`） |

loose 的 git 前置条件（存在仓库、工作区干净）只作用于 `implement` 和 `review`。

### 首次设置

运行一次 `/agy:setup`。它会检查 `agy` 二进制，然后（在向你展示将写入的确切内容并备份文件之后）把一份只读 allowlist 追加到 `~/.gemini/antigravity-cli/settings.json`，让 strict 档的运行可以自主收集证据。

## 统一 flags（各模式一致）

| Flag | 含义 |
|---|---|
| `--conversation <id>` | 续接指定的 agy 会话 |
| `--continue` | 复用 state 中该模式最近一次会话 id |
| `--model <id>` | 显式指定 agy 模型（见 `agy models`）。id 必须带 effort 后缀（如 `gemini-3.7-flash-low`）；companion 会自动补全裸 family（`gemini-3.7-flash` + `--effort`）和别名 `flash`/`pro`，未知 id 在调用 agy 前直接报错 |
| `--effort low\|medium\|high` | `gemini-3.7-flash-<effort>` 的简写 |
| `--strict` / `--loose` | 覆盖权限档（`ask` 会忽略） |
| `--background` / `--wait` | 覆盖执行方式（ask 固定前台，会拒绝 `--background`） |
| `--json` | （review）按 schema 强制输出 JSON findings；默认是自由格式 markdown |
| `--timeout <dur>` | agy 的 `--print-timeout`（默认：research/implement 10m，review 5m，ask 2m） |
| `--diff-file <path>` | （review）把该文件内容内联进 prompt |
| `--pr <num>` / `--target <ref>` | （review）自主取证模式 |

## 状态与后台任务

按仓库存储的状态位于 `<repo>/.agy-staff/`（请在你的项目中 gitignore 它；本仓库的 `.gitignore` 就是示例）：

- `state.json` — 各模式最近一次会话 id + 任务注册表。
- `jobs/<id>.log`、`jobs/<id>.spec.json`、`jobs/<id>.result.md` — 每个后台任务一组。

后台任务就是普通的 detached 进程（companion 以 worker 身份重新拉起自己；没有 daemon）。`status` 通过 pid 存活探测识别崩溃的 worker；`cancel` 直接 kill pid。会话续接（`--continue`、`/agy:continue`）很省额度：agy 的历史上下文大部分由缓存承担（`cache_read_tokens`）。

## 疑难排查

- **"agy reported an error (status ERROR)"** — companion 会原样转述 agy 自己的报错。常见原因：模型 id 无效（agy 需要带 effort 后缀的 id——运行 `agy models`）、登录过期（交互式运行一次 `agy` 重新登录）、额度用尽。
- **空响应但 "status SUCCESS"** — 即使所有工具调用都被拒绝，agy 也会报 success；此时内容为空、stderr 带权限提示。companion 会检测到并给出修复方式：运行 `/agy:setup`，或加 `--loose` 重试。agy 内置的额外坑：部分工具在 headless 下完全无视 allow-rules，只在跳过权限时可用——这类操作永远需要 `--loose`。（`ask` 不可能触发此情况；若触发请报 bug。）
- **"inline content over the 200KB limit"** — 整个 prompt 作为单个 argv 传递，macOS 的 ARG_MAX 约 1MB；agy 不读 stdin。请拆分 diff，或改用自主取证审查（`--pr`/`--target`）。
- **这些模式绝不要用 agy 的 `--sandbox`** — 它会把执行重定向到 agy 自己的 scratch 工作区（`~/.gemini/antigravity-cli/scratch`），看不到你真实的工作目录。companion 从不传该参数。
- **implement 因工作区不干净被拒** — 这是有意的。先 commit 或 stash，agy 的修改才是隔离的，`git checkout .` 才是完整回滚。
- **agy 的项目级权限** — agy 有绑定其 `--project` 体系的项目级规则（「最高优先级」）；其设置文件路径未验证，所以 setup 只改全局文件。若某条规则似乎不生效，请在 agy 交互模式里检查。
- **规则上下文** — agy 会自动加载工作区里的 `AGENTS.md`/`GEMINI.md`/`.agents/rules/*.md`；在你委托任务的仓库里保持这些文件干净合理。

## 升级

Codex 按版本目录缓存插件（如 `plugins/cache/agy-staff/agy/0.1.0`），因此修复必须先提升插件版本号，**并且**运行 `codex plugin marketplace upgrade`（或移除后重新添加 marketplace 条目），再重启应用才会生效。Claude Code 则先更新 marketplace 再重装（`/plugin marketplace update agy-staff`，然后 `/plugin install agy@agy-staff`）。

## 仓库结构

```
companion/agy-companion.mjs   唯一的大脑（所有模式、任务、setup）
templates/                    共享 prompt 模板（ask/research/review/implement）
.claude-plugin/               Claude Code 插件 + 自托管 marketplace manifest
commands/                     Claude Code 斜杠命令（薄壳）
.codex-plugin/plugin.json     Codex 插件 manifest
.agents/plugins/              Codex marketplace manifest
skills/                       Codex skills（薄壳）
assets/                       设计图（en / zh-CN）
docs/                         本参考文档
```
