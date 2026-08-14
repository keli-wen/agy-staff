# agy-staff

把 Google 的 Antigravity CLI（`agy`）雇来当 **Claude Code** 和 **OpenAI Codex** 的「agy 员工」。

agy-staff 是一个轻量的双平台插件，让你的主力编程 Agent 把工作委托给 `agy`——它自带 Gemini 3.7 Flash 的免费额度——共四种模式：

| 模式 | 说明 | 默认模型 | 默认权限档 | 默认执行方式 |
|---|---|---|---|---|
| `research` | 深度调研：要求引用来源、显式标注未验证结论 | `gemini-3.7-flash-high` | strict | 前台等待 |
| `review` | 第二意见验证者：按严重度排序的 findings，带 `file:line` 引用 | `gemini-3.7-flash-medium` | strict | 前台等待 |
| `implement` | 边界清晰的编码任务；agy 直接修改工作区，由你审阅 diff | `gemini-3.7-flash-medium` | loose | 后台运行 |
| `ask` | 廉价的零工具单轮问答（约 3s）；兼作装后冒烟测试 | `gemini-3.7-flash-low` | strict（仅 prompt） | 前台等待（固定） |

两个平台使用同一个插件名 `agy`（命令均为 `/agy:*`），共用一个 companion 脚本（`companion/agy-companion.mjs`，仅依赖 Node 标准库）和共享的 prompt 模板（`templates/`）。

## 为什么包装官方 CLI，而不是用 Antigravity 逆向代理？

社区里有若干项目把 Antigravity/Gemini 后端逆向成 OpenAI 兼容代理。agy-staff 刻意不走这条路：那些代理伪装 IDE 的私有协议，违反 Antigravity 服务条款，Google 能够（也确实会）封禁使用它们的账号——对日常主力 Google 账号来说风险不可接受。官方 `agy` 二进制的 headless 模式通过受支持的方式提供同样的免费额度模型，代价只是每个 session 约 15k input tokens 的系统开销（续接会话时大部分由缓存承担）。

## 安装

机器上的前置条件：`agy` 在 PATH 上（在 v1.1.13、`~/.local/bin/agy` 上测试通过），以及 Node.js。

### Claude Code

本仓库自带单插件 marketplace：

```
/plugin marketplace add /path/to/agy-staff        # 推送到 GitHub 后也可用仓库 slug
/plugin install agy@agy-staff
```

命令为 `/agy:research`、`/agy:review`、`/agy:implement`、`/agy:ask`、`/agy:continue`、`/agy:status`、`/agy:result`、`/agy:cancel`、`/agy:setup`。

### Codex

仓库带有 `.codex-plugin/plugin.json` manifest，暴露 `skills/` 下的五个 skill，另有 Codex marketplace manifest 位于 `.agents/plugins/marketplace.json`。安装方式：把本仓库作为插件源加入你的 Codex marketplace 配置——例如在你已有的个人 marketplace（如 `dev-skills`/`devai`）里加一条指向本仓库的条目，或用 Codex 的插件管理界面/命令直接安装。skills 会在 `/agy:*` 或「让 agy review 一下」这类自然表达时触发。

### 装后冒烟测试

装好后第一件事运行 `/agy:ask "reply with OK"`。它零工具、无需任何 setup，几秒内返回 "OK"（外加 `[agy-staff]` footer）即可证明插件、companion 脚本和 `agy` 二进制已全链路打通。

### 首次设置

运行一次 `/agy:setup`。它会检查 `agy` 二进制，然后（在向你展示将写入的确切内容并备份文件之后）把一份只读 allowlist 追加到 `~/.gemini/antigravity-cli/settings.json`，让 strict 档的运行可以自主收集证据。

## 双权限档模型

每种模式只会运行在两个权限档之一。模式决定默认值；`--strict`/`--loose` 可按次覆盖。

| | **strict**（默认：research、review） | **loose**（默认：implement） |
|---|---|---|
| agy 调用方式 | 不跳过权限——fail-closed，未列入 allowlist 的工具调用一律自动拒绝 | `--dangerously-skip-permissions` |
| agy 能做什么 | 通过 setup 的 allowlist 做只读取证：`git gh cat head ls grep find rg wc`（命令按前缀匹配） | 任何事，包括改文件、跑命令 |
| 安全网 | agy 物理上无法写入 | git：companion 在工作区不干净时拒绝启动；结束后打印 `git diff --stat`；回滚是 `git checkout .` |
| 典型用途 | 调研、代码审查 | 编码任务；需要跑测试的审查（`/agy:review --loose`） |

## 用法与典型场景（CUJ）

```
/agy:review                          # 写完一个 feature 后：外层 Agent 组装
                                     # 你的 diff，拿一份第二意见
/agy:review --pr 123                 # 自主取证：agy 自己用 gh 拉取 PR
/agy:review --target main --loose    # 可能需要跑测试套件的审查
/agy:research "调研 X 在本仓库和上游是如何工作的"
/agy:implement "修复 foo_test.py 里失败的测试"
/agy:ask "reply with OK"             # 装后冒烟测试；也可问任何快问题
/agy:ask "APFS 上 rename 之后还需要 fsync 保证崩溃安全吗？"
/agy:continue "再检查一下错误处理路径"
/agy:status                          # 后台任务列表
/agy:result <job-id>                 # 已结束任务的存档输出
/agy:cancel <job-id>
/agy:setup                           # 安装 strict 档 allowlist（需确认、先备份）
```

### 统一 flags（各模式一致）

| Flag | 含义 |
|---|---|
| `--conversation <id>` | 续接指定的 agy 会话 |
| `--continue` | 复用 state 中该模式最近一次会话 id |
| `--model <id>` | 显式指定 agy 模型（见 `agy models`）；优先于 `--effort` |
| `--effort low\|medium\|high` | `gemini-3.7-flash-<effort>` 的简写 |
| `--strict` / `--loose` | 覆盖权限档 |
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

- **空响应但 "status SUCCESS"** — 即使所有工具调用都被拒绝，agy 也会报 success；此时内容为空、stderr 带权限提示。companion 会检测到并给出修复方式：运行 `/agy:setup`，或加 `--loose` 重试。agy 内置的额外坑：部分工具在 headless 下完全无视 allow-rules，只在跳过权限时可用——这类操作永远需要 `--loose`。
- **"inline content over the 200KB limit"** — 整个 prompt 作为单个 argv 传递，macOS 的 ARG_MAX 约 1MB；agy 不读 stdin。请拆分 diff，或改用自主取证审查（`--pr`/`--target`）。
- **这些模式绝不要用 agy 的 `--sandbox`** — 它会把执行重定向到 agy 自己的 scratch 工作区（`~/.gemini/antigravity-cli/scratch`），看不到你真实的工作目录。companion 从不传该参数。
- **implement 因工作区不干净被拒** — 这是有意的。先 commit 或 stash，agy 的修改才是隔离的，`git checkout .` 才是完整回滚。
- **agy 的项目级权限** — agy 有绑定其 `--project` 体系的项目级规则（「最高优先级」）；其设置文件路径未验证，所以 setup 只改全局文件。若某条规则似乎不生效，请在 agy 交互模式里检查。
- **规则上下文** — agy 会自动加载工作区里的 `AGENTS.md`/`GEMINI.md`/`.agents/rules/*.md`；在你委托任务的仓库里保持这些文件干净合理。

## 仓库结构

```
companion/agy-companion.mjs   唯一的大脑（所有模式、任务、setup）
templates/                    共享 prompt 模板（research/review/implement/ask）
.claude-plugin/               Claude Code 插件 + 自托管 marketplace manifest
commands/                     Claude Code 斜杠命令（薄壳）
.codex-plugin/plugin.json     Codex 插件 manifest
skills/                       Codex skills（薄壳）
```

## 许可证

MIT — 见 [LICENSE](LICENSE)。

*English documentation: [README.md](README.md).*
