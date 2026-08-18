# agy-staff — 完整参考

返回 [README](../README.zh-CN.md)。English version: [REFERENCE.md](REFERENCE.md).

## 模式与默认值

| 模式 | 说明 | 默认模型 | 权限档 | 执行方式 |
|---|---|---|---|---|
| `ask` | 单轮问答，不用任何工具，成本低（约 3s）；兼作装后冒烟测试 | `gemini-3.7-flash-low` | restricted（仅 prompt） | 同步——同一次调用里直接拿到答案 |
| `research` | 深度调研：要求引用来源、显式标注未验证的结论 | `gemini-3.7-flash-high` | unrestricted | 后台任务——返回一个 job id |
| `review` | 第二意见式审查：输出按严重度排序的 findings，带 `file:line` 引用 | `gemini-3.7-flash-medium` | unrestricted | 后台任务——返回一个 job id |
| `implement` | 范围明确的编码任务；agy 直接修改工作区，由你审阅 diff | `gemini-3.7-flash-medium` | unrestricted | 后台任务——返回一个 job id |

执行方式按模式固定，没有任何 flag 可以覆盖。`continue` 沿用解析出的模式的执行方式（续接 `ask` 仍是同步；续接其余模式返回 job id）。

两个平台使用同一个插件名 `agy`，共用一个 companion 脚本（`companion/agy-companion.mjs`，仅依赖 Node 标准库）和共享的 prompt 模板（`templates/`）。调用写法：skill 形式在 Claude Code 下是 `/agy:agy-<mode>`，在 Codex 下是 `$agy:agy-<mode>`；Claude Code 另附短命令 `/agy:ask`、`/agy:research`、`/agy:review`、`/agy:implement`、`/agy:continue`、`/agy:status`、`/agy:result`、`/agy:cancel`、`/agy:setup` 作为快捷方式。

## 双权限档模型

每种模式只会运行在两个权限档之一。**所有会用工具的模式默认都是 `unrestricted`**，所以插件装完即用，不需要 allowlist、不需要 setup；`--restricted` 是可选的加固 flag。`--restricted`/`--unrestricted` 可以按次覆盖。`ask` 是例外：它不用工具、固定为 restricted，两个 flag 都会被忽略——给它传 `--unrestricted` 会打印一条提示，然后仍按 restricted 运行。

一次运行实际用哪个档，按这个顺序决定：命令行 flag > 仓库级 policy（[`setup --restrict`](#仓库级-policysetup---restrict)）> 内置默认。

| | **unrestricted**（默认：research、review、implement） | **restricted**（可选加固；ask 强制如此） |
|---|---|---|
| agy 调用方式 | `--dangerously-skip-permissions` | 不跳过权限——fail-closed，未列入 allowlist 的工具调用一律自动拒绝 |
| agy 能做什么 | 任何事，包括改文件、跑命令 | 只能用 setup 写入的 allowlist 收集证据：`git gh cat head ls grep find rg wc`（命令按前缀匹配） |
| 安全网 | prompt 层护栏（对不可逆或花钱的操作默认拒绝）+ 下面的分级 git 保护 | agy 始终受 agy 自身的权限校验约束 |
| 典型用途 | 常规路径：问答、调研、审查、编码任务 | 加固运行：输入不可信，或这台机器上不接受跳过 agy 的权限确认 |

`--restricted` 和 `--unrestricted` 互斥，同时传是错误。加固前要知道两件事。第一，`--restricted` 只有在 setup 的 allowlist 就位后才有意义，否则 agy 收集证据的命令会被自己拒掉，结果直接为空。第二，部分原生工具在 headless 下完全无视 allow-rules，所以 restricted 运行返回的内容可能比 unrestricted 少。

### 分级 git 保护

这些保护**只作用于 unrestricted 的运行**，且按模式分级：

| 模式 | 在 git 仓库内 | 不在 git 仓库内 |
|---|---|---|
| `implement` | **要求工作区干净**——工作区不干净时 companion 拒绝启动；结束后打印 `git diff --stat`，`git checkout .` 就是完整回滚 | 打印警告：agy 的修改无法通过 git 审阅或回滚，然后继续执行 |
| `research`、`review` | 永不阻塞，也不检查工作区是否干净。worker 在运行前对 `git status --porcelain` 拍快照，运行后比对；若 agy 引入了改动，结果会带一条警告，列出 delta 并给出回滚提示 | 无可比对——静默 |

对 `research`/`review` 来说，静默才是常态：只有在 agy 真的动了工作区（模板明确要求它不要动）时才会出现 delta 警告。

### prompt 层护栏：默认拒绝，按需开放

`research`、`review`、`implement` 三个模板**默认拒绝**不可逆或有代价的副作用：

- 不 commit、不 push、不改写历史；
- 不删除工作区之外的文件；
- 不发起有副作用的网络调用；
- 不执行会消耗付费 API 额度或 token 的命令（例如会真实计费的 e2e 测试）。

临时脚本写到临时目录；运行在工作区里做的一切都保持可被 git 回滚。

**默认是关着的，但不是锁死的。** 如果你的请求里明确授权了上述某项操作（「跑一下 e2e 测试」、「调 staging API」），agy 就照授权执行，并汇报它实际跑了什么——所以委托时请把这类明确授权原样传下去。特别地，`review` 可以运行只读命令、临时脚本和测试来验证某个 finding；它不能做的是修改被跟踪的文件、commit 或 push。

### 审查不可信内容

在 `unrestricted` 下，prompt 注入等同于代码执行。如果你让 `review` 或 `research` 去看不可信作者写的内容——陌生人的 PR、第三方依赖、塞满指令的 issue 正文——这些内容里的文本可以指使 agy 执行任意命令，而 unrestricted 的 agy 真的会执行。

两种缓解手段，都不是默认行为：

- **`--restricted`** —— 让 agy 自身的权限校验生效，未列入 allowlist 的工具一律自动拒绝。注意上面提过的代价：它需要先跑 setup 装好 allowlist；allowlist 按前缀匹配，并不等于只读；无视 allow-rules 的原生工具会被直接拒绝，审查内容因此变少。它能缩小出问题时的影响范围，但不是 sandbox。
- **隔离的检出环境** —— 在一次性 clone、容器或虚拟机里审查，环境里不放任何值得被偷的凭据。

默认值是为常见场景优化的：你自己的代码、你自己的机器。输入不可信时，才是该动用上面两种手段的时候。

### 可选加固 setup

`/agy:setup` 是**可选的**——没有任何东西依赖它，因为所有会用工具的模式默认都跑 unrestricted。只有想让 `--restricted` 真正可用时才需要运行它。它做的事：检查 `agy` 二进制，向你展示将写入的确切内容，备份原文件，然后把一份**用于收集证据的命令 allowlist**追加到 `~/.gemini/antigravity-cli/settings.json`。有了这份 allowlist，restricted 档的运行才能不经逐条确认就收集证据。默认流程是 dry run；未经你明确确认不会写入任何内容。

应用之前，你需要知道这份 allowlist 的两个性质：

- **它不是「只读 allowlist」。** 规则按命令名前缀匹配：`command(git)` 既匹配 `git log` 也匹配 `git push`；`command(gh)` 既匹配 `gh pr view` 也匹配 `gh pr merge`。这些命令是按「收集证据」的用途挑的，但技术上并不能阻止写操作。
- **它是全局的。** 写入的文件是 `~/.gemini/antigravity-cli/settings.json`，因此规则对这台机器上所有 `agy` 运行生效，不只是 agy-staff 的任务。这是有意为之的产品路径（「一次 setup，到处使用」）。

allowlist 里没有联网搜索规则，也不需要：在测试过的 agy（v1.1.13）上，`search_web` 在 headless 下无需 allow 规则即可运行。

### 仓库级 policy（`setup --restrict`）

如果你希望某些模式在*特定仓库*里每次都跑 restricted——比如一个经常审陌生人 PR 的仓库——可以声明一次，不用每次记着传 flag：

```bash
setup --restrict review,research   # 这两个模式在本仓库默认 restricted
setup --restrict none              # 恢复内置默认
```

policy 写入 `<repo>/.agy-staff/config.json`，之后自动生效（运行时会打印一条提示，说明权限档来自项目 policy）。三个性质：

- **优先级。** 调用时的 `--restricted`/`--unrestricted` flag 永远覆盖 policy；没列出的模式保持内置默认。`ask` 不可配置（不用工具，固定 restricted）。
- **作用域。** `.agy-staff/` 通常被排除在 git 之外，所以 policy 是你个人在这台机器上的偏好，不会随仓库分享给团队。
- **它不是什么。** 这是保持一致、防止误操作的运行策略，不是安全边界：它走的还是 `--restricted` 那套机制，代价也一样（依赖全局 allowlist、前缀匹配、部分工具在 headless 下无视 allow-rules）。真正不可信的输入，请用隔离的检出环境。

注意这里是两个不同的文件：**allowlist**（restricted 下 agy 允许执行什么）受 agy 的设计约束，只能全局；**policy**（哪些模式默认 restricted）由我们实现，按仓库生效。

### 进阶：项目级权限

如果机器级 allowlist 对你来说范围太大，agy 还支持绑定其 `--project` 体系的项目级权限规则（它把这类规则视为最高优先级）。这能让 allowlist 只在你实际委托任务的仓库里生效。

需要坦白说明的前提：**项目级设置文件的确切路径没有文档、也未在当前 agy 版本上验证过**，所以 agy-staff 不会去写它，本文档也不会猜路径。若你想做项目级隔离，请在交互式 `agy` 里确认它究竟从哪里读取项目级规则，然后自行配置。在那之前有两个选择：接受全局作用域，或者干脆跳过 setup。跳过的代价只有一个——`--restricted` 用不了；默认的 unrestricted 档本来就不依赖 agy 的权限系统，`ask` 也完全不需要 allowlist。

## 统一 flags（各模式一致）

| Flag | 含义 |
|---|---|
| `--conversation <id>` | 续接指定的 agy 会话 |
| `--continue` | 复用 state 中该模式最近一次会话 id |
| `--model <id>` | 显式指定 agy 模型（见 `agy models`）。id 必须带 effort 后缀（如 `gemini-3.7-flash-low`）；companion 会自动补全裸 family（`gemini-3.7-flash` + `--effort`）和别名 `flash`/`pro`，未知 id 在调用 agy 前直接报错 |
| `--effort low\|medium\|high` | `gemini-3.7-flash-<effort>` 的简写 |
| `--restricted` / `--unrestricted` | 覆盖权限档（`ask` 会忽略）。`research`/`review`/`implement` 默认就是 unrestricted，所以实际会用到的是 `--restricted` |
| `--restrict <modes\|none>` | （setup）仓库级 policy：列出的模式在本仓库默认 restricted；`none` 清除。见[仓库级 policy](#仓库级-policysetup---restrict) |
| `--json` | （review）按 schema 强制输出 JSON findings；默认是自由格式 markdown |
| `--timeout <dur>` | agy 的 `--print-timeout`（默认：research/implement 10m，review 5m，ask 2m） |

这张表就是全部对外接口。执行方式没有对应 flag——见上面的模式表。

## review 完全基于 prompt

`review` 接受一段「审查对象」的描述，然后自己去收集证据（PR 用 `gh pr view`/`gh pr diff`，ref 和工作区用 `git diff`/`git log`，补丁则直接读文件）。没有任何 flag 可以直接传入 diff；请在 prompt 里描述对象：

```
review "Review PR #730"
review "Review the current working tree"
review "Review changes against master"
review "Review the patch at /tmp/change.patch"
```

任务描述为空是错误——`review` 必须有审查对象。若对象有歧义，模板要求 agy 报告这个歧义，而不是猜你想审什么。

## 状态与后台任务

**输出分流。** stdout 承载结果本身，以及关于工作区的 guard 警告；`[agy-staff]` telemetry 行（mode、profile、model、duration、tokens、conversation id）走 stderr，后台任务则写进 `jobs/<id>.log`。telemetry 是给调用方 agent 看的元信息，不属于交付内容，也不会写进 `jobs/<id>.result.md`。

`research`、`review`、`implement` 不阻塞，会立刻返回一个 job id。结果通过任务生命周期取回：

- `wait [id] [--timeout <dur>]` — 阻塞到任务（默认最近一个）进入终态，然后直接打印结果。这是首选的取结果方式：一条命令，替代手写轮询循环。
- `status` — 列出任务／查看某个任务的状态（`running`、`done`、`error`、`crashed`、`canceled`）。
- `result <id>` — （再次）打印已完成任务的输出。
- `cancel <id>` — 终止运行中的任务。

`status <id>` 和 `wait` 用机器可读的退出码表达结果，调用方不需要解析任何输出：**0** done、**2** running、**3** error/crashed、**4** canceled（1 仍是通用错误，比如 job id 不存在）。`wait` 自己的 `--timeout` 默认 100s——刻意低于常见 harness 的单命令超时——到时**不算失败**：它以退出码 2 返回、任务继续跑，再执行一次同样的 `wait` 即可。发起任务的 agent 有责任在启动时告诉你 job id，并用 `wait` 把任务跟到结束，而不是丢着不管。

按仓库存储的状态位于 `<repo>/.agy-staff/`：

- `state.json` — 各模式最近一次会话 id + 任务注册表。
- `config.json` — 仓库级权限档 policy（用 `setup --restrict` 设置过才存在）。
- `jobs/<id>.log`、`jobs/<id>.spec.json`、`jobs/<id>.result.md` — 每个后台任务一组。

后台任务就是普通的 detached 进程（companion 以 worker 身份重新拉起自己；没有 daemon）。`status` 通过 pid 存活探测识别崩溃的 worker；`cancel` 直接 kill pid。会话续接（`--continue`、`/agy:continue`）很省额度：agy 的历史上下文大部分由缓存承担（`cache_read_tokens`）。

### 让 `.agy-staff/` 不进 git

companion 不会碰你的 ignore 文件。保持调用方仓库 `git status` 干净是**调用方 agent 的责任**：在某个仓库里第一次发起会创建任务的调用**之前**，执行一次——

```bash
git check-ignore -q .agy-staff || echo '.agy-staff/' >> .git/info/exclude
```

要写 `.git/info/exclude`，绝不要写被 git 跟踪的 `.gitignore`——状态目录是本地临时产物，写进共享且被提交的文件会改变所有协作者的仓库。

## 疑难排查

- **"agy reported an error (status ERROR)"** — companion 会原样转述 agy 自己的报错。常见原因：模型 id 无效（agy 需要带 effort 后缀的 id——运行 `agy models`）、登录过期（交互式运行一次 `agy` 重新登录）、额度用尽。
- **`~/.gemini/...` 上的 `operation not permitted` / `bind: operation not permitted` / 终端里 `agy` 明明正常却突然"authentication failed"** — agy 被放进了 harness 的命令沙箱里执行（典型是 Codex 的 workspace-write）。agy 无法在沙箱内运行：它要为内部 language server 绑定 localhost 端口、还要读自己的 OAuth token 文件，而沙箱的凭据保护会直接把 token 藏起来——无论开多少 `writable_roots`/`network_access` 都救不回来。companion 命令必须在沙箱外执行——Codex 里给该 workspace 授予 full access，或以 escalated 权限批准命令。
- **空响应但 "status SUCCESS"** — 只会出现在 restricted 档的运行里（传了 `--restricted`，或项目 policy 把该模式设成了 restricted）：即使所有工具调用都被拒绝，agy 也会报 success；此时内容为空、stderr 带权限提示。companion 会检测到并给出修复方式：跑一次 `/agy:setup` 把 allowlist 装上，或者放宽权限档（去掉 `--restricted`；来自 policy 的话用 `setup --restrict none`）。另有一个 agy 自身的限制：部分工具在 headless 下完全无视 allow-rules，只在跳过权限时可用——这类操作永远需要 unrestricted 的运行。（`ask` 不可能触发此情况；若触发请报 bug。）
- **"inline content over the 200KB limit"** — 整个 prompt 作为单个 argv 传递，macOS 的 ARG_MAX 约 1MB；agy 不读 stdin。请缩短任务描述：把材料的位置（PR 号、ref、文件路径）指给 agy，让它自己去取内容，而不是整段粘进来。
- **这些模式绝不要用 agy 的 `--sandbox`** — 它会把执行重定向到 agy 自己的 scratch 工作区（`~/.gemini/antigravity-cli/scratch`），看不到你真实的工作目录。companion 从不传该参数。
- **implement 因工作区不干净被拒** — 这是有意的，而且只针对 `implement`（`research`/`review` 永不被拦）。先 commit 或 stash，agy 的修改才是隔离的，`git checkout .` 才是完整回滚。不在 git 仓库里时，`implement` 只警告不拒绝——因为根本没有回滚路径。
- **"agy modified the working tree during this review"** — 这是 unrestricted 的 `research`/`review` 的 delta 警告（随结果一起打印）：agy 动了本不该动的文件。按列出的路径检查并还原，警告里附带回滚提示。
- **agy 的项目级权限** — agy 有绑定其 `--project` 体系的项目级规则（「最高优先级」）；其设置文件路径无文档、未验证，所以 setup 只改全局文件。若某条规则似乎不生效，请在 agy 交互模式里检查。参见[进阶：项目级权限](#进阶项目级权限)。
- **规则上下文** — agy 会自动加载工作区里的 `AGENTS.md`/`GEMINI.md`/`.agents/rules/*.md`；在你委托任务的仓库里保持这些文件干净合理。

## 从 0.1 迁移

0.2 重命名了权限档、改变了各模式的默认权限档，并移除了 0.1 里用来指定审查对象和执行方式的那些 flag。

| 0.1 | 0.2 | 说明 |
|---|---|---|
| `research`/`review` 默认 strict（restricted）档 | `research`/`review`/`implement` 默认 `unrestricted` | 0.1 里不先跑 setup，research 和 review 就会 fail-closed。0.2 装完即用，`--restricted` 变成可选的加固 flag；`ask` 仍然是 restricted（零工具）。 |
| `--strict` | `--restricted` | 旧名保留一个版本仍可用，会在 stderr 打印一次弃用提示。语义不变。 |
| `--loose` | `--unrestricted` | 旧名保留一个版本仍可用，会在 stderr 打印一次弃用提示。语义不变。 |
| 输出中的权限档名 "strict"/"loose" | "restricted"/"unrestricted" | 纯改名；telemetry 行（stderr）现在打印 `profile=restricted` / `profile=unrestricted`。 |
| `--diff-file <path>` | *（已移除）* | review 改为基于 prompt：`review "Review the patch at /tmp/change.patch"`。 |
| `--pr <num>` | *（已移除）* | `review "Review PR #730"`。 |
| `--target <ref>` | *（已移除）* | `review "Review changes against master"`。 |
| `--background` / `--wait` | *（已移除）* | 执行方式按模式固定：`ask` 同步，`research`/`review`/`implement` 返回 job id，用 `status`/`result`/`cancel` 管理。 |

已移除的 flag 会立即报错并在错误信息里给出替代写法；弃用的权限档别名在本版本内继续可用，下个版本删除。

## 升级

Codex 按版本目录缓存插件（如 `plugins/cache/agy-staff/agy/0.1.0`），因此修复必须先提升插件版本号，**并且**运行 `codex plugin marketplace upgrade`（或移除后重新添加 marketplace 条目），再重启应用才会生效。Claude Code 则先更新 marketplace 再重装（`/plugin marketplace update agy-staff`，然后 `/plugin install agy@agy-staff`）。

## 仓库结构

```
companion/agy-companion.mjs   所有逻辑都在这里（各模式、任务、setup）
templates/                    共享 prompt 模板（ask/research/review/implement）
.claude-plugin/               Claude Code 插件 + 自托管 marketplace manifest
commands/                     Claude Code 斜杠命令（只做转发）
.codex-plugin/plugin.json     Codex 插件 manifest
.agents/plugins/              Codex marketplace manifest
skills/                       Codex skills（只做转发）
assets/                       设计图 + logo + 徽章
docs/                         本参考文档 + INSTALL_FOR_AGENTS.md
```
