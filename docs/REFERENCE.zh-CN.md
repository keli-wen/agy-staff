# agy-staff — 完整参考

返回 [README](../README.zh-CN.md)。English version: [REFERENCE.md](REFERENCE.md).

## 模式与默认值

| 人格（skill） | companion 模式 | 说明 | 默认模型 | 权限档 | 执行方式 |
|---|---|---|---|---|---|
| `ask` | `ask` | 单轮问答，不用任何工具，成本低（约 3s）；兼作装后冒烟测试 | `gemini-3.8-flash-low` | restricted（仅 prompt） | 同步——同一次调用里直接拿到答案 |
| `staffer` | `staffer` | 通用委托，最小化 prompt：不设角色、不设规则、不设输出格式——任务文本自己决定输出形状 | `gemini-3.8-flash-medium` | unrestricted | 后台任务——返回一个 job id |
| `researcher` | `research` | 深度调研：要求引用来源、显式标注未验证的结论 | `gemini-3.8-flash-high` | unrestricted | 后台任务——返回一个 job id |
| `reviewer` | `review` | 第二意见式审查，按对象路由两个 flavor：代码审查（severity 分级 findings，带 `file:line` 引用）与通用审查（对方案/设计/决策的多角度 challenge） | `gemini-3.8-flash-medium` | unrestricted | 后台任务——返回一个 job id |
| `implementer` | `implement` | 范围明确的编码任务；agy 直接修改工作区，也可以执行用户明确要求的 Git 交付 | `gemini-3.8-flash-high` | unrestricted | 后台任务——返回一个 job id |

执行方式按模式固定，没有任何 flag 可以覆盖。`continue` 沿用解析出的模式的执行方式（续接 `ask` 仍是同步；续接其余模式返回 job id）。

Claude Code、Codex 和 Pi 使用同一组人格，共用 companion 脚本（`companion/agy-companion.mjs`，仅依赖 Node 标准库）和 prompt 模板（`templates/`）。调用写法：Claude Code 用 `/agy:<persona>`，Codex 用 `$agy:<persona>`，Pi 用 `/skill:agy-<persona>`。Pi manifest 只暴露 `pi-skills/`，通过 `npm run generate:pi` 机械派生自 canonical `skills/`，带 `agy-` 前缀、改写 sibling 路径并附加 `templates/harness-compatibility.md`（引导宿主用等价方法替代不可用的工具且不丢弃原要求，无法确定时向用户求助）。任务管理由 `jobs`（Pi 下为 `agy-jobs`）和 companion CLI 承担，用自然语言即可（「agy 的 job 好了吗」）。

## 双权限档模型

每种模式只会运行在两个权限档之一。**所有会用工具的模式默认都是 `unrestricted`**，所以插件装完即用，不需要 allowlist、不需要 setup；`--restricted` 是可选的加固 flag。`--restricted`/`--unrestricted` 可以按次覆盖。`ask` 是例外：它不用工具、固定为 restricted，两个 flag 都会被忽略——给它传 `--unrestricted` 会打印一条提示，然后仍按 restricted 运行。

一次运行实际用哪个档，按这个顺序决定：命令行 flag > 仓库级 policy（[`setup --restrict`](#仓库级-policysetup---restrict)）> 内置默认。

| | **unrestricted**（默认：staffer、research、review、implement） | **restricted**（可选加固；ask 强制如此） |
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
| `implement` | 允许 dirty workspace。若仓库里已经有改动，companion 会把一份简短的运行前状态摘要加进 agy 的 prompt，让它知道哪些路径是用户已有改动，必须当作用户的工作来处理。摘要有长度上限；路径归属不清楚时，agy 应自己运行 `git status --porcelain` 并查看 diff。结束后 companion 会报告工作区是干净、已变化，还是仍然 dirty | 打印警告：agy 的修改无法通过 git 审阅或回滚，然后继续执行 |
| `research`、`review` | 永不阻塞，也不检查工作区是否干净。worker 在运行前对 `git status --porcelain` 拍快照，运行后比对；若 agy 引入了改动，结果会带一条警告，列出 delta 并给出回滚提示 | 无可比对——静默 |
| `staffer` | 与 research/review 相同的快照/比对，但措辞中性：通用任务可能本来就该改文件，delta 是给调用方的信息（「确认任务确实要求了这些改动」），不是指控 | 无可比对——静默 |

对 `research`/`review` 来说，静默才是常态：只有在 agy 真的动了工作区（模板明确要求它不要动）时才会出现 delta 警告。

### prompt 层护栏：默认拒绝，按需开放

`staffer`、`research`、`review`、`implement` 四个模板**默认拒绝**不可逆或有代价的副作用：

- 不 commit、不 push、不写 PR、不改写历史，除非任务明确要求这项 Git 交付；
- 不删除工作区之外的文件；
- 不发起有副作用的网络调用；
- 不执行会消耗付费 API 额度或 token 的命令（例如会真实计费的 e2e 测试）。

临时脚本写到临时目录；运行在工作区里做的一切都保持可被 git 回滚。

**默认是关着的，但不是锁死的。** 如果你的请求里明确授权了上述某项操作（「commit this」「打开 draft PR」「跑一下 e2e 测试」「调 staging API」），agy 就照授权执行，并汇报它实际跑了什么——所以委托时请把这类明确授权原样传下去。特别地，`review` 可以运行只读命令、临时脚本和测试来验证某个 finding；它不能做的是修改被跟踪的文件、commit 或 push。

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
| `--model <id>` | 显式指定 agy 模型（见 `agy models`）。id 必须带 effort 后缀（如 `gemini-3.8-flash-low`）；companion 会自动补全裸 family（`gemini-3.8-flash` + `--effort`）和别名 `flash`/`pro`，未知 id 在调用 agy 前直接报错 |
| `--effort low\|medium\|high` | `gemini-3.8-flash-<effort>` 的简写 |
| `--restricted` / `--unrestricted` | 覆盖权限档（`ask` 会忽略）。`staffer`/`research`/`review`/`implement` 默认就是 unrestricted，所以实际会用到的是 `--restricted` |
| `--restrict <modes\|none>` | （setup）仓库级 policy：列出的模式在本仓库默认 restricted；`none` 清除。见[仓库级 policy](#仓库级-policysetup---restrict) |
| `--json` | （review）按 schema 强制输出 JSON findings；默认是自由格式 markdown。面向代码审查 flavor |
| `--timeout <dur>` | agy 的 `--print-timeout`（默认：staffer/research/implement 10m，review 5m，ask 2m） |
| `--prompt <text>` | 任务正文，作为**一个**参数传入。请加引号；引号里的内容一律不透明 |
| `--prompt-file <path>` | 从文件读任务文本——长 prompt 用它，不用跟 shell 引号搏斗 |
| `--stdin` | 从 stdin 读任务文本。每次调用只允许一个任务来源：`--prompt`、`--prompt-file` 或 `--stdin` |

这张表就是全部对外接口。执行方式没有对应 flag——见上面的模式表。

## 任务正文

这一节讲的是 **companion CLI**，不是人格的调用方式。你在斜杠命令后面直接写自然语言任务（`/agy:reviewer Review PR #730`）；skill 会读它，再组装成下面的 `--prompt` 调用。`--prompt` 不需要你自己写。

所有运行类命令（`staffer`、`research`、`review`、`implement`、`ask`、`continue`）的任务正文来自三个来源中的**恰好一个**：

```
ask       --prompt "what does git diff --check verify?"
research  --prompt-file /tmp/task.md
review    --stdin < /tmp/task.md
```

同时给两个是错误（`task text given more than one way (…) — use exactly one`），一个都不给也是错误。

**不透明性保证。** companion 只解析一次 shell 交给它的 argv，且完全按照 shell 交付的样子：不切分任何一个参数，不解释引号，也不检查任务正文里的任何一个字节。你的任务正文会逐字节送到 agy——空白、引号、换行全部保留——其中形似 flag 的文本（`--check`、`--json`、`--timeout`，乃至未知的 `--whatever`）就是 prompt 内容，而不是 companion 选项。`--prompt-file` 和 `--stdin` 的内容同理。

当 `--prompt` 的值是一个真正的句子（即含有空白）时，它可以以 `--` 开头：`ask --prompt "--check means what?"` 是有效的。不含任何空白、形似 flag 的值会被读作「忘了写值」并拒绝。`--` 本身没有特殊含义，它会被当作未知 flag 解析。

带值的 flag（`--conversation`、`--model`、`--effort`、`--timeout`、`--restrict`、`--prompt`、`--prompt-file`）都需要一个值。缺失的值、空字符串值，以及形似 flag 的值（`--prompt` 的整句情况除外，见上）都是错误，所以 `--model ""` 是错误。

每个 flag 都是独立的一个参数。多个 flag 被打包进同一个引号字符串（`review "--restricted Review PR #730"`）是错误，companion 会直接给出修法，而不是去猜 flag 在哪里结束、任务从哪里开始。

## review 完全基于 prompt

`review` 接受一段「审查对象」的描述，然后自己去收集证据（PR 用 `gh pr view`/`gh pr diff`，ref 和工作区用 `git diff`/`git log`，补丁则直接读文件）。没有任何 flag 可以直接传入 diff；请在 prompt 里描述对象：

```
review --prompt "Review PR #730"
review --prompt "Review the current working tree"
review --prompt "Review changes against master"
review --prompt "Review the patch at /tmp/change.patch"
```

任务描述为空是错误——`review` 必须有审查对象。若对象有歧义，模板要求 agy 报告这个歧义，而不是猜你想审什么。

review 模板本身是中性骨架（审查者立场、证据纪律、护栏）。所有 flavor 特有的内容——代码审查的证据收集菜单、审查维度、severity 分级和输出格式；方案/决策审查的多角度 challenge 框架——都由 `reviewer` skill 依据 `skills/reviewer/references/{code-review,general-review}.md` 组装进任务文本。

## 状态与后台任务

**输出分流。** stdout 承载结果本身，以及关于工作区的 guard 警告；`[agy-staff]` telemetry 行（mode、profile、model、duration、tokens、conversation id）走 stderr，后台任务则写进 `jobs/<id>.log`。telemetry 是给调用方 agent 看的元信息，不属于交付内容，也不会写进 `jobs/<id>.result.md`。

`staffer`、`research`、`review`、`implement` 不阻塞，会立刻返回一个 job id，并且任务启动输出里就印着确切的收取命令——`wait <id> --timeout <n>m`，时长足以覆盖任务本身。结果通过任务生命周期取回：

- `wait [id] [--timeout <dur>]` — 阻塞到任务（默认最近一个）进入终态，然后直接打印结果。这是首选的取结果方式：一条命令，替代手写轮询循环。等待期间每约 15s 在 stderr 打一条心跳，长等待可观测。
- `status` — 列出任务／查看某个任务的状态（`running`、`done`、`error`、`crashed`、`canceled`）。
- `result <id>` — （再次）打印已完成任务的输出。
- `cancel <id>` — 终止运行中的任务。

`status <id>` 和 `wait` 用机器可读的退出码表达结果，调用方不需要解析任何输出：**0** done、**2** running、**3** error/crashed、**4** canceled（1 仍是通用错误，比如 job id 不存在）。`wait` 自己的 `--timeout` 默认 100s——刻意低于常见 harness 的单命令超时——但**没有上限**：标准姿势是把启动输出里印的那条长时长 `wait` 作为后台命令运行，**一个 job 一个后台 wait**（绝不要在一个 shell 里串行等多个 id——每个完成都会被最慢的前序挡住）。到时不算失败：退出码 2 表示任务还在跑，再执行一次同样的 `wait` 即可。发起任务的 agent 有责任在启动时告诉你 job id，并用 `wait` 把任务跟到结束，而不是丢着不管。

按仓库存储的状态位于 `<repo>/.agy-staff/`：

- `state.json` — 各模式最近一次会话 id + 任务注册表。
- `config.json` — 仓库级权限档 policy（用 `setup --restrict` 设置过才存在）。
- `jobs/<id>.log`、`jobs/<id>.spec.json`、`jobs/<id>.result.md` — 每个后台任务一组。

后台任务就是普通的 detached 进程（companion 以 worker 身份重新拉起自己；没有 daemon）。`status` 通过 pid 存活探测识别崩溃的 worker；`cancel` 直接 kill pid。会话续接（`--continue`、`continue`）很省额度：agy 的历史上下文大部分由缓存承担（`cache_read_tokens`）。

### 让 `.agy-staff/` 不进 git

0.4 起自动完成：companion 在某个仓库里第一次创建 `.agy-staff/` 时，若该路径尚未被忽略，会把 `.agy-staff/` 追加进 `.git/info/exclude`（仓库本地、不被跟踪）。它绝不会碰被 git 跟踪的 `.gitignore`——状态目录是本地临时产物，写进共享且被提交的文件会改变所有协作者的仓库。

## 疑难排查

- **"agy reported an error (status ERROR)"** — companion 会原样转述 agy 自己的报错，且只在错误文本确实匹配时才追加原因提示（模型 id 无效 → 运行 `agy models`；登录过期 → 交互式运行一次 `agy` 重新登录；额度用尽）。如果 agy 报了错但完整的 response 已经产出（例如收尾时一次工具调用超时），companion 会照常交付：退出码 0，response 走 stdout，警告走 stderr（`done_with_warnings`）——只有没有 response 的运行才算失败。
- **`~/.gemini/...` 上的 `operation not permitted` / `bind: operation not permitted` / 终端里 `agy` 明明正常却突然"authentication failed"** — agy 被放进了 harness 的命令沙箱里执行（典型是 Codex 的 workspace-write）。agy 无法在沙箱内运行：它要为内部 language server 绑定 localhost 端口、还要读自己的 OAuth token 文件，而沙箱的凭据保护会直接把 token 藏起来——无论开多少 `writable_roots`/`network_access` 都救不回来。companion 命令必须在沙箱外执行——Codex 里给该 workspace 授予 full access，或以 escalated 权限批准命令。
- **`wait`/`status` 误报崩溃（"finished with status crashed and no stored result"）** — 后台任务在一个权限或沙箱上下文中启动（例如 unsandboxed），但收集命令在另一个上下文（例如命令沙箱内）执行。收集器无法跨越沙箱边界看到 worker 的 PID，因而误将仍在运行的任务判定为 crashed。请确保管理命令（`wait`、`status`、`result`）使用与任务启动相同的 unsandboxed 权限上下文；在 unsandboxed 上下文中重新执行即可恢复等待或查看正常状态。
- **空响应但 "status SUCCESS"** — 只会出现在 restricted 档的运行里（传了 `--restricted`，或项目 policy 把该模式设成了 restricted）：即使所有工具调用都被拒绝，agy 也会报 success；此时内容为空、stderr 带权限提示。companion 会检测到并给出修复方式：跑一次 `setup` 把 allowlist 装上，或者放宽权限档（去掉 `--restricted`；来自 policy 的话用 `setup --restrict none`）。另有一个 agy 自身的限制：部分工具在 headless 下完全无视 allow-rules，只在跳过权限时可用——这类操作永远需要 unrestricted 的运行。（`ask` 不可能触发此情况；若触发请报 bug。）
- **"unknown flag --X: the whole string … arrived as a single argument"** — 多个 flag（通常还带着任务正文）被引号打包成了一个参数。每个 flag 都要作为独立参数传，任务正文放进 `--prompt`。见[任务正文](#任务正文)。
- **"task text exceeds the 200KB inline limit"** — 整个 prompt 作为单个 argv 传给 agy，macOS 的 ARG_MAX 约 1MB（agy 自己不读 stdin，所以 `--prompt-file`/`--stdin` 只解决 shell 引号问题，解决不了这个上限）。请缩短任务描述：把材料的位置（PR 号、ref、文件路径）指给 agy，让它自己去取内容，而不是整段粘进来。
- **这些模式绝不要用 agy 的 `--sandbox`** — 它会把执行重定向到 agy 自己的 scratch 工作区（`~/.gemini/antigravity-cli/scratch`），看不到你真实的工作目录。companion 从不传该参数。
- **implement 遇到 dirty workspace** — 即使仓库里已经有改动，`implement` 也可以启动。companion 会把一份有长度上限的状态摘要加进 agy 的 prompt，让它知道这些路径是用户已有改动。若任务没有明确包含这些改动，agy 应先询问，再决定是否覆盖、清理、stash、reset、删除、commit、push，或把它们放进 PR。
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
| `--diff-file <path>` | *（已移除）* | review 改为基于 prompt：`review --prompt "Review the patch at /tmp/change.patch"`。 |
| `--pr <num>` | *（已移除）* | `review --prompt "Review PR #730"`。 |
| `--target <ref>` | *（已移除）* | `review --prompt "Review changes against master"`。 |
| `--background` / `--wait` | *（已移除）* | 执行方式按模式固定：`ask` 同步，`research`/`review`/`implement` 返回 job id，用 `status`/`result`/`cancel` 管理。 |

已移除的 flag 会立即报错并在错误信息里给出替代写法；弃用的权限档别名在本版本内继续可用，下个版本删除。

## 从 0.3 迁移

0.4 把两层调用入口（commands + skills）合并成单一 skills 层并改用人格命名，新增了 `staffer` 模式，并让 `.agy-staff/` 的 git 忽略变为自动。

| 0.3 | 0.4 | 说明 |
|---|---|---|
| `/agy:research`（command）+ `/agy:agy-research`（skill） | `/agy:researcher` | 每个人格一个 skill；command 层删除 |
| `/agy:review` + `/agy:agy-review` | `/agy:reviewer` | 按对象路由两个 flavor：代码审查与通用（方案/决策）审查 |
| `/agy:implement` + `/agy:agy-implement` | `/agy:implementer` | |
| `/agy:ask` + `/agy:agy-ask` | `/agy:ask` | 名字不变，只剩单一入口 |
| *（无）* | `/agy:staffer` | 新增的通用模式，最小化 prompt |
| `/agy:status`、`/agy:wait`、`/agy:result`、`/agy:cancel`、`/agy:continue`、`/agy:setup` | `jobs` skill（面向模型） | 用自然语言（「agy 的 job 好了吗」）；companion 子命令本身不变 |
| 手动写 `.git/info/exclude` | 首次运行自动完成 | |

## 从 0.4.4 迁移（破坏性变更）

0.4.5 移除了 positional 任务正文。companion 只解析一次 shell 交给它的 argv，且绝不重新切分参数——正是这一点让任务正文里形似 flag 的文本变得安全（见[任务正文](#任务正文)）。代价是任务必须通过一个显式来源传入。

| 0.4.4 | 0.4.5 | 说明 |
|---|---|---|
| `ask "question"`、`review "Review PR #730"`（positional 任务正文） | `ask --prompt "question"`、`review --prompt "Review PR #730"` | positional 正文是移除而不是弃用：运行类命令上出现 positional 参数会直接报错，并指出三个来源。`--prompt-file` 与 `--stdin` 不变。 |
| 打包成一个大字符串，如 `review "--restricted Review PR #730"` | `review --restricted --prompt "Review PR #730"` | companion 不再把一个参数切分成多个 flag。若某个 flag 名里仍含空白，会得到一条指向此修法的错误。 |

管理类命令（`status`、`wait`、`result`、`cancel`、`setup`）不受影响：它们的 positional 参数是 id 和取值，`wait <id> --timeout 30s` 与之前完全一致。

## 从 0.4.5 迁移

0.5.0 将所有人格默认模型以及 `flash` 别名/`--effort` 简写从 Gemini 3.7 Flash 升级为 Gemini 3.8 Flash，并保持各人格的 effort 档位不变（`ask`：low；`staffer` 与 `reviewer`：medium；`researcher` 与 `implementer`：high）。

若安装的 `agy` CLI 尚不支持 Gemini 3.8 Flash，companion 会明确报错并拒绝静默回退：它会查询 `agy models`，列出可用模型并给出相同 effort 档位的最佳兼容推荐（例如 `--model gemini-3.7-flash-high`），同时提示建议更新 `agy` 以使用最新的默认模型。

## 升级

Claude Code 和 Codex 按**版本号**目录缓存插件（如 `cache/agy-staff/agy/0.4.0`），只用版本号判断是否最新，不看 commit。准备发布时，两个 plugin manifest 和 `package.json` 应一起提升版本号。Pi 的 Git 安装跟随配置的 ref；本地路径安装则直接读取 checkout。

- **Claude Code**——`claude plugin marketplace update agy-staff` 更新 marketplace clone，再用 `claude plugin update agy@agy-staff` 重新拷贝进缓存。`install` **不是**升级命令：对已安装的插件它一律回答「已安装」然后什么都不做，跟版本号无关。而 `update` 只在版本号变了才动——版本号没变时它回答「已是最新版本」，旧 commit 原地不动。这时用 `claude plugin uninstall agy@agy-staff && claude plugin install agy@agy-staff` 强制装入当前 commit。两种情况之后都要重启 Claude Code——技能在会话启动时注册。
- **Codex**——先提升版本号，运行 `codex plugin marketplace upgrade`（或移除后重新添加 marketplace 条目），再重启应用。

想确认实际装的是哪个 commit：看 `~/.claude/plugins/installed_plugins.json` 里的 `gitCommitSha`，和 `git -C ~/.claude/plugins/marketplaces/agy-staff log -1` 拉到的 commit 对比。

Pi 的未固定 Git 安装用 `pi update --extension git:github.com/keli-wen/agy-staff` 更新，再 `/reload`。本地开发则在 checkout 重新生成 Pi skills（`npm run generate:pi`）并运行 `/reload`，不需要 push。

## 仓库结构

```
companion/agy-companion.mjs   所有逻辑都在这里（各模式、任务、setup）
templates/                    共享 prompt 模板（staffer/ask/research/review/implement）及 harness-compatibility.md
.claude-plugin/               Claude Code 插件 + 自托管 marketplace manifest
.codex-plugin/plugin.json     Codex 插件 manifest
.agents/plugins/              Codex marketplace manifest
pi-skills/                    自动生成的 Pi agy-* 入口及资源，不要手工编辑
scripts/generate-pi-skills.mjs 生成 Pi 技能并检查漂移
package.json                  Pi manifest、npm 文件白名单、验证命令
skills/                       canonical 人格 + jobs（Claude/Codex 入口；
                              reviewer/ 与 jobs/ 附带按需加载的 references/）
assets/                       设计图 + logo + 徽章
docs/                         本参考文档 + INSTALL_FOR_AGENTS.md
```
