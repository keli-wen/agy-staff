# agy-staff 使用参考

这份手册介绍 agy-staff 的参数、权限设置和后台任务机制。第一次使用时，可以先阅读 [README](../README.zh-CN.md)，完成安装并运行一个简单任务。英文版见 [REFERENCE.md](REFERENCE.md)。

## 模式与默认值

插件提供五种角色（persona），每种角色对应一个技能。你选择角色并描述任务，主 agent 就会按照技能中的说明调用 companion CLI。companion 是插件自带的 Node.js 程序，负责启动 agy、保存任务状态和收取结果。

| 角色技能 | companion 命令 | 用途 | 默认模型 | 执行方式 |
| --- | --- | --- | --- | --- |
| `ask` | `ask` | 不使用工具的单轮问答，也可用于安装后的简单验证 | `gemini-3.8-flash-low` | 同步返回答案 |
| `staffer` | `staffer` | 通用任务，由任务描述决定具体工作 | `gemini-3.8-flash-medium` | 返回后台任务 ID |
| `researcher` | `research` | 调研并引用来源，注明尚未验证的结论 | `gemini-3.8-flash-high` | 返回后台任务 ID |
| `reviewer` | `review` | 审查代码、方案或决策 | `gemini-3.8-flash-medium` | 返回后台任务 ID |
| `implementer` | `implement` | 完成范围明确的编码任务 | `gemini-3.8-flash-high` | 返回后台任务 ID |

`staffer` 不预设专业分工或固定的报告格式，但仍遵守共享的操作约定。`reviewer` 会根据对象选择审查方式：代码问题按严重程度列出，并附上 `file:line` 位置；方案和决策审查则检查假设、风险和取舍。`implementer` 可以直接修改工作区，也可以完成任务明确要求的提交、推送或 PR 操作。

执行方式由模式决定，不能通过参数切换。继续一个 `ask` 会话时，答案仍在同一次调用中返回；继续其他模式时，会创建新的后台任务。

Claude Code 使用 `/agy:<persona>`，Codex 使用 `$agy:<persona>`，Pi 使用 `/skill:agy-<persona>`。三者共用 `companion/` 中的运行逻辑和 `templates/` 中的提示词模板。companion 只依赖 Node.js 标准库。

Pi 加载的入口位于 `pi-skills/`，由 `npm run generate:pi` 根据 `skills/` 自动生成。生成过程会添加 `agy-` 前缀、调整技能之间的相对路径，并附上 `templates/harness-compatibility.md`。这份兼容说明要求主 agent 在工具不可用时寻找等价方法，保留原有要求；无法做到时再向用户求助。

任务管理由 `jobs` 技能和 companion CLI 共同完成，在 Pi 中对应 `agy-jobs`。通常直接对主 agent 说“agy 的任务进展如何”或“继续刚才的任务”即可，不需要手动记住管理命令。

<a id="双权限档模型"></a>

## 权限设置

`staffer`、`research`、`review` 和 `implement` 默认使用 `unrestricted`，因此安装后就能调用工具，无需先配置命令允许列表或运行 `setup`。如果希望保留 agy 自身的权限检查，可以在单次调用时传入 `--restricted`。

`ask` 不使用工具，始终按 `restricted` 运行。它会忽略这两个权限参数；传入 `--unrestricted` 时，companion 会说明这一点，然后继续执行问答。

| 配置 | agy 如何执行 | 使用时需要了解的限制 |
| --- | --- | --- |
| `unrestricted` | 传入 `--dangerously-skip-permissions`，允许读取文件、运行命令和修改工作区 | 任务边界依靠提示词约定和工作区检查，不能替代权限隔离 |
| `restricted` | 保留 agy 的权限检查，未获准的工具调用会被拒绝 | 需要配置允许执行的命令；部分工具在非交互模式下仍可能无法使用 |

`--restricted` 和 `--unrestricted` 不能同时传入。选择权限配置时，companion 先看显式参数；继续已有会话且没有显式覆盖时，继承该会话的权限配置。新任务则采用[仓库默认策略](#仓库级-policysetup---restrict)，没有策略时使用内置默认值。

`setup` 提供的命令允许列表包含 `git gh cat head ls grep find rg wc`，主要用于读取和核对材料。如果没有相应规则，受限任务的工具调用可能全部被拒绝，最终只返回空回答。此外，部分 agy 原生工具在非交互模式下不遵循允许规则，因此即使配置了列表，受限任务也可能无法取得完整材料。

<a id="分级-git-保护"></a>

### 如何处理工作区改动

下面的工作区检查用于 `unrestricted` 任务，不同模式的处理方式有所区别。

`implement` 可以在已有未提交改动的仓库中启动。companion 会把一份简短的运行前状态摘要加入提示词，让 agy 知道哪些路径已经有改动，并要求它将这些内容视为用户已有的工作。摘要有长度上限；如果无法判断某处改动的归属，agy 应自行运行 `git status --porcelain` 并查看差异。任务结束后，companion 会报告工作区状态。在 Git 仓库之外执行时，它会先提醒你无法通过 Git 审查或回滚修改，然后继续运行。

`research` 和 `review` 不要求工作区没有改动。worker 会比较运行前后的 `git status --porcelain`；如果发现新变化，结果中会列出差异并提醒检查。模板要求这两种模式保留被跟踪文件的内容，因此出现工作区变化时，应确认原因。在 Git 仓库之外没有可供比较的状态，也就不会输出这项报告。

`staffer` 使用相同的前后比较方式。不过，通用任务本来就可能需要改文件，因此它会中性地报告变化，提醒调用方确认这些修改属于任务范围。

<a id="prompt-层护栏默认拒绝按需开放"></a>

### 提示词中的操作约定

四种工具模式都通过模板限制未经授权的操作。默认情况下，agy 不应提交或推送代码、修改 Git 历史、写入 PR、删除工作区之外的文件、发起会改变外部状态的网络请求，或运行消耗付费 API 额度的命令。临时脚本、日志和下载文件应放在临时目录中，工作区中的修改应保留通过 Git 撤销的可能。

如果任务明确要求其中某项操作，例如“创建一个草稿 PR”或“运行会调用真实 API 的集成测试”，相应授权应原样传给 agy。它只能执行授权范围内的操作，并在结果中说明实际做了什么。

`review` 还要求保留被跟踪文件，不提交或推送代码。为了验证问题，它可以读取材料、在临时目录中编写脚本，或运行已有测试。提示词约定描述了 agy 应遵守的行为，并不构成操作系统层面的安全限制。

### 审查不可信内容

在 `unrestricted` 下，agy 可以执行命令。不可信的 PR、依赖代码或 issue 正文可能包含提示词注入，诱导它执行任务之外的操作。审查这些内容时，需要考虑它能接触到的文件、凭据和外部服务。

可以选择 `--restricted`，让 agy 拒绝未获准的工具调用。不过，命令允许列表按前缀匹配，无法保证只读访问，部分工具也可能因此无法运行。更明确的隔离方式是在临时检出目录、容器或虚拟机中审查，并避免向该环境提供无关凭据。

插件默认面向你自己的机器和代码。处理不可信输入时，应根据任务选择权限配置和隔离环境。

### 可选加固 setup

如果需要配置 `restricted` 模式，可以让主 agent 执行 `setup`，例如直接说“帮我配置 agy 的受限运行权限”。这是 companion 的管理命令，由 `jobs` 技能处理。

`setup` 会检查 agy 是否可用，并展示计划写入 `~/.gemini/antigravity-cli/settings.json` 的命令 allow/deny 规则。默认只预览，不修改文件。经你明确确认后，它才会备份原文件并追加配置。

setup 保留宽泛的 `command(git)` / `command(gh)`，只为五个命令前缀添加 deny：`git push`、`git reset --hard`、`git clean`、`gh pr merge` 和 `gh release delete`。[AGY 按 deny > ask > allow 的顺序处理规则](https://www.antigravity.google/docs/cli/permissions/)，companion 只安装配置，不自己解析命令，也不预测每个任务会用哪些子命令。已有 allow/deny/ask 规则会保留；对先前收窄过的配置执行 setup，会添加预览中展示的宽泛允许项。这组前缀用于防常见误操作，不能覆盖所有参数排列、别名、脚本或 API，因此不保证只读或拦住所有不可逆影响。任务正文授权不会覆盖 deny；确需执行时，应明确调整设置。

其次，配置文件是全局的，规则会影响这台机器上的其他 agy 任务。允许列表中没有单独的联网搜索规则；在项目测试过的 agy v1.1.13 中，`search_web` 无需这类规则就能在非交互模式下运行。

<a id="仓库级-policysetup---restrict"></a>

### 按仓库设置默认权限

如果某个仓库经常需要受限审查，可以为它设置默认策略，省去每次指定参数的步骤：

```bash
setup --restrict review,research   # 这两种模式在本仓库默认使用 restricted
setup --restrict none              # 清除仓库策略，恢复内置默认值
```

策略保存在 `<repo>/.agy-staff/config.json`。新任务采用该策略时，companion 会打印提示。显式的 `--restricted` 或 `--unrestricted` 始终优先；继续已有会话时，没有显式覆盖就继承会话原来的配置。`ask` 不受仓库策略影响。

`.agy-staff/` 通常被 Git 忽略，因此这项设置只保存在本地，不会随提交分享给团队。它决定哪些模式默认受限，具体允许执行哪些命令仍由 agy 的权限规则决定。仓库策略本身不会增加安全隔离。

### 进阶：项目级权限

agy 还有与 `--project` 体系关联的项目级权限规则，可以将权限设置限定到项目。现有资料将这类规则列为较高优先级，但本项目尚未确认设置文件的确切路径，也未验证相应配置流程，因此 `setup` 只操作上面介绍的全局文件。

如果全局配置的作用范围不符合你的需要，请先在 agy 交互模式中确认项目级规则的读取位置，再自行配置。默认的 `unrestricted` 任务和不调用工具的 `ask` 都不依赖 `setup`。

<a id="统一-flags各模式一致"></a>

## 命令行参数

这些参数属于 companion CLI。通过角色技能发起任务时，主 agent 会按需组装命令；只有直接调用 companion 时，才需要自己填写。

| 参数 | 含义 |
| --- | --- |
| `--conversation <id>` | 继续指定的 agy 会话 |
| `--continue` | 继续状态记录中该模式最近一次会话 |
| `--model <id>` | 指定模型，可用 `agy models` 查看可用 ID。模型 ID 带有推理强度后缀，如 `gemini-3.8-flash-low`；companion 也能补全模型系列名与 `flash`、`pro` 别名，未知 ID 会在启动前报错 |
| `--effort low\|medium\|high` | 指定推理强度，是 `gemini-3.8-flash-<effort>` 的简写 |
| `--restricted` / `--unrestricted` | 覆盖本次运行的权限配置；`ask` 会忽略这两个参数 |
| `--restrict <modes\|none>` | 用于 `setup`，设置或清除[仓库默认权限](#仓库级-policysetup---restrict) |
| `--json` | 用于代码审查，按指定结构返回 JSON 格式的问题列表；默认使用 Markdown |
| `--timeout <dur>` | 后台任务的执行时限，默认 60m，最长 120m；AGY 会收到相同的响应超时参数。同步 `ask` 的默认响应超时为 2m |
| `--prompt <text>` | 将任务正文作为一个参数传入，通常需要用引号包住 |
| `--prompt-file <path>` | 从文件读取任务正文，适合较长的描述 |
| `--stdin` | 从标准输入读取任务正文 |

每次任务只能选择 `--prompt`、`--prompt-file` 和 `--stdin` 中的一个来源。同步或后台执行由模式决定，没有单独的切换参数。

## 任务正文

使用角色技能时，在调用名后直接描述任务即可，例如 `/agy:reviewer Review PR #730`。主 agent 会读取技能说明，把任务转换成 companion 命令。直接调用 companion 时，所有运行类命令都必须显式提供任务来源：

```sh
ask       --prompt "what does git diff --check verify?"
research  --prompt-file /tmp/task.md
review    --stdin < /tmp/task.md
```

同时提供多个来源，或没有提供任务正文，都会报错。这项规则适用于 `staffer`、`research`、`review`、`implement`、`ask` 和 `continue`。

companion 按照 shell 交给它的参数边界解析命令，不会再次拆分已经传入的参数。任务中的空白、引号和换行会原样保留；`--check`、`--json`、`--timeout` 等文本即使出现在正文中，也不会变成 companion 的选项。正文中的 `--whatever` 这样的未知选项同样只是文本。从文件或标准输入读取的正文遵循相同规则。

以 `--` 开头的任务文本需要包含空白。例如 `ask --prompt "--check means what?"` 可以正常执行；单独一个形似选项的值则会被视为缺少参数值。`--` 本身不表示后续参数的分界，会被当作未知选项。

需要取值的参数不能省略值，也不能传入空字符串。除上述 `--prompt` 情况外，值不能写成另一个选项的样子。例如，`--model ""` 会直接报错。

每个选项及其取值都应分别传给 shell。`review "--restricted Review PR #730"` 把选项和任务混在一个参数里，companion 会拒绝它，并提示改用 `review --restricted --prompt "Review PR #730"`。

<a id="review-完全基于-prompt"></a>

## 指定审查对象

`review` 根据任务描述收集材料。审查 PR 时会使用 `gh pr view` 和 `gh pr diff`；审查分支或工作区时会读取 Git 差异；审查补丁文件时则直接读取文件。请在任务中说明对象，例如：

```sh
review --prompt "Review PR #730"
review --prompt "Review the current working tree"
review --prompt "Review changes against master"
review --prompt "Review the patch at /tmp/change.patch"
```

没有单独的参数用于传入 diff。审查对象不能为空；如果描述存在歧义，模板要求 agy 说明还缺少什么信息，等待明确后再继续。

共享模板规定了审查者的基本要求，包括以实际证据支持结论、保留被跟踪文件，以及遵守操作授权。代码审查和方案审查的具体要求分别来自 `skills/reviewer/references/code-review.md` 与 `general-review.md`，由 `reviewer` 技能按对象组装进任务描述。

## 状态与后台任务

`staffer`、`research`、`review` 和 `implement` 启动后会先返回任务 ID。随后，独立的后台工作进程（worker）运行 AGY，持续读取并保存它的 `stream-json` 输出。即使主 agent 暂时没有查看进度，任务也会继续执行。插件不需要额外的常驻服务或调度器。

### 等待结果与查看进度

默认流程是：写好 prompt → 派发 → 等待最终结果 → 按需验收。任务运行中不主动 `observe`、查 `status`、读日志或检查中间产物，也不为例行汇报查询进度。只有用户明确询问进度时才观测；收到失败或需要介入的结果后再诊断。

`wait [id] [--timeout <dur>]` 会等到任务完成，或本次等待到期。完成时返回完整结果；等待到期但任务仍在运行时，返回当前的 JSON 快照，并让 worker 继续执行。普通的工具活动不会提前结束等待。直接运行 `wait` 时默认等待 100 秒，技能建议显式使用 `--timeout 10m`。退出码 2 只表示本次等待到期，应继续等待同一任务；附带快照不要求检查进度或介入。

`observe [id]` 用于立即查看任务。运行中返回进展，完成后返回最终状态、结果路径和收取提示；失败、取消或崩溃时，还会附上有长度限制的诊断和恢复信息。它始终返回 JSON，最多 8 KiB，不包含完整报告。

任务完成后，可以收取已经运行的 `wait` 命令，或在没有待收取的等待命令时使用 `result [id]` 读取已保存的结果。`observe` 返回成功只说明本次调用已经结束，完整报告仍需要通过 `wait` 或 `result` 获取。`status [id]` 则用于列出任务，或查看单个任务的状态和日志尾部。

进度快照包含时间戳、已运行时长、最近五次工具活动的参数与输出节选，以及按步骤合并的最新回答片段。未知状态、尚未完成的文本和被截断的内容都会标明。每次活动的 JSON 最多占 1 KiB，回答片段最多占 2 KiB，整个快照最多占 8 KiB，均按 UTF-8 编码后的字节数计算。仅在回答用户明确提出的进度问题，或收到失败、需要介入的结果后诊断时，才按需读取 `details` 中的有限片段。

`done` 表示调用和答复交付已结束，不代表任务已验收。有警告的成功调用会在 `wait/result` 的标准错误中附带最多 8 KiB 的日志尾部及完整日志路径；日志记录 agy-cli 的原始状态和退出码。主 agent 根据答复和产物判断是否完成，需要诊断时才读取更多信息或使用 `observe`，不据回答措辞猜测超时。

快照记录的是已经观察到的活动。一次工具调用完成，并不能单凭这一点判断任务取得了有用进展。中间的工具错误会保留供诊断，但不会自动变成最终成功结果中的警告。

### 等待由主 agent 如何安排

等待命令在完成或到期之前不会持续输出进度。只有用户明确询问进展时，主 agent 才在保留原有等待的同时调用 `observe`，根据快照回答；一次询问不代表开启定期观测。查看进度不会重置任务时限，也不会取走其他观察者的记录。

支持后台命令的环境，可以为每个任务保留一个独立的 `wait`，避免把多个任务放进同一个 shell 中依次等待。其他环境应在工具时限内使用尽可能长的阻塞等待。宿主工具（例如 Codex 的 `write_stdin`）收集待完成的等待命令输出，属于必要的结果收集；输出可能包含等待到期时的快照，但它不会独立读取 AGY 进度。

任务完成会结束正在执行的 `wait`，但主 agent 何时收到结果、何时开始下一轮处理，由外层运行环境决定。单靠 Bash 命令和技能中的定时说明，插件无法主动唤醒一个已经空闲的模型。主 agent 应使用环境提供的后台完成通知或较长等待，避免反复发起没有新内容的短轮询，也不安排 sleep/observe 循环或为例行汇报查询进度。

### 执行时限

任务的执行时限与 `wait` 的等待时长是两回事。worker 从初始化开始计算总运行时间，默认上限为 60 分钟；启动任务时可以用 `--timeout` 调整，最长 120 分钟。companion 也会把所选时长作为响应超时参数传给 AGY。`wait` 和 `observe` 都不会延长这项时限。

到达执行上限时，worker 会停止运行并清理相关进程。如果清理前已经收到回答文本，就交付文本并附上警告，由主 agent 判断任务是否完成；如果没有回答或回答为空，任务以 `reason=hard_timeout` 结束。AGY 的显式 TIMEOUT 状态或精确的 `ERROR` / `timeout waiting for response` 错误对应 `reason=response_timeout`；其他工具、网络、认证或配额错误保留原错误分类。已知会话 ID 时状态为 `attention`、退出码为 `5`，否则为 `error`。报告保留最后的快照、日志、原配置以及运行前和当前的工作区状态；状态列表不能识别已修改文件上的进一步内容改动，仍需查看 diff。

### 取消与恢复

`cancel <id>` 会先记录取消请求，等 worker 保存取消报告并将任务状态设为 `canceled` 后才返回成功。它会保留已经崩溃的任务的诊断信息，也不会仅凭保存的 PID 就向一个未经身份核实的进程发送信号。缺少取消通道的旧任务会明确报错。取消命令报错时，应检查任务和日志，不能据此认定执行已经停止。中断 `wait` 只会结束等待，不会取消后台任务。

需要继续已有会话时，使用 `continue --job <id> --prompt "..."`。它会沿用所选任务的模式、模型和权限配置，创建一个关联的新任务。也可以用 `--conversation <id>` 选择已记录的会话。显式指定模型或权限参数时，会覆盖继承的值。

`restart <id>` 会用原任务和配置重新开始，但不复用原会话。新任务会重新生成当前工作区的上下文。对于旧版本保存的任务规格，companion 会将其中的旧快照标记为历史信息，再追加当前上下文。

继续或重启前，应先用 `git status` 和 `git diff` 检查上一次执行留下的修改。你可以从同一 Git 工作树（worktree）的根目录或任意子目录发起恢复，任务实际执行时会回到原工作目录。通用 `continue` 命令遇到未登记的会话 ID 会报错，不会搜索其他工作树或启动 AGY。

恢复会创建新任务，保留原任务的最终记录，并重新获得默认 60 分钟的执行时限；也可以用 `--timeout` 指定其他时长。恢复信息提供 `requires_user_confirmation`、建议的 `suggested_timeout` 和具体续跑命令。建议超时为原时长的两倍，后台最多 120 分钟；已到上限时应缩小任务。主 agent 必须询问你是否继续或停下查看工作区，得到明确确认后才执行。companion 不会自动重试或续跑。前台 `ask` 的历史会话配置也按会话 ID 保存，不会因后续任务覆盖而丢失。

### 退出码

`wait`、`observe` 和带任务 ID 的 `status` 使用以下退出码：

| 退出码 | 含义 |
| --- | --- |
| `0` | 本次调用结束、答复已交付，状态为 `done`；不代表任务已验收 |
| `2` | 任务仍在运行，状态为 `running` |
| `3` | 任务失败或进程崩溃，状态为 `error` 或 `crashed` |
| `5` | 可续跑超时，状态为 `attention`；询问用户是否继续，确认后才恢复。`result` 对此状态也返回 5，其他状态保留原有退出行为 |
| `4` | 任务已取消，状态为 `canceled` |
| `1` | 命令本身出错，例如参数无效或任务不存在 |

### 输出与本地记录

标准输出保存任务结果，以及需要随结果展示的工作区警告。`[agy-staff]` 开头的运行信息记录模式、权限、模型、耗时、用量和会话 ID；前台运行时写入标准错误，后台运行时写入 `jobs/<id>.log`。这些信息供调用方排查问题，不属于回答正文，也不会写入 `jobs/<id>.result.md`。

仓库内的状态保存在 `<repo>/.agy-staff/`。`state.json` 记录会话和任务状态，更新时使用短事务锁；进度查询只读取状态。`config.json` 保存可选的仓库权限策略。

每个任务还有自己的执行规格、诊断日志、结果文件和最终状态文件，以及原始输出 `.events.jsonl` 和进度快照 `.progress.json`。快照通过原子替换发布，原始输出则可能保留尚未识别或格式无效的事件。旧任务即使没有活动文件，仍可读取已有状态和结果。

任务成功且没有警告时，worker 会先保存结果和元数据，再删除原始输出与进度快照。失败、取消、执行超时或带警告完成时，会保留这些中间记录。结果、诊断日志、会话元数据和 AGY 自己的会话记录都会保留。

如果查询恰好遇到文件清理，companion 会重新检查任务的最终状态：`observe` 返回状态和结果位置，`wait` 返回完整结果。`observe` 不会为了生成最终快照而读取结果正文。进程崩溃且没有结果时，诊断报告会提供任务启动记录、进程 ID、日志是否存在及其大小，以及后续检查或恢复命令，不会复制完整提示词或环境变量。

<a id="让-agy-staff-不进-git"></a>

### 避免将本地状态提交到 Git

从 0.4 起，companion 首次在仓库中创建 `.agy-staff/` 时，会检查该目录是否已被忽略。如果没有，就将它加入本地的 `.git/info/exclude`。这样既能避免误提交任务记录，也不会改动团队共享的 `.gitignore`。

## 疑难排查

### agy 报错，但可能已经返回了回答

遇到 `agy reported an error (status ERROR)` 时，companion 会保留 agy 的原始错误，仅在错误文本与已知情况匹配时补充提示。例如，模型 ID 无效时提示运行 `agy models`，登录过期时提示交互式运行 `agy` 重新登录。

如果 AGY 报错时已经返回回答文本，companion 会尝试交付回答，并给出 `done_with_warnings` 警告。这种情况下退出码为 `0`，回答写入标准输出，警告写入标准错误；如果没有回答且命中超时分类，已知会话时改为 `attention`（退出码 5），其他情况按失败处理。

### 终端里可以运行，agent 环境里却提示权限或认证错误

如果出现 `operation not permitted`、`bind: operation not permitted`，或突然提示 `authentication failed`，请先检查 companion 是否运行在限制命令执行的沙箱中。AGY 需要读取自己的 OAuth 凭据，并为内部语言服务绑定本机端口；这些操作可能受到宿主环境限制。只放宽工作目录的写权限，不一定能解决凭据或端口访问问题。

在遇到这类限制的环境中，应使用宿主提供的授权方式，让 companion 在能够正常运行 AGY 的权限环境中执行。启动和管理后台任务时，也要使用相同的权限环境。

### `wait` 或 `status` 提示任务崩溃

如果任务在沙箱外启动，却在另一个权限环境里收取结果，管理命令可能看不到 worker 进程，并提示 `finished with status crashed and no stored result`。请先回到任务启动时的权限环境，重新运行 `wait`、`status` 或 `result`。

如果仍然报错，再按诊断报告中的路径检查日志和进程信息。仅凭一次跨环境的查询失败，不应认定任务已经停止。

### 状态为 `SUCCESS`，但回答为空

受限任务可能遇到工具调用全部被拒绝，而 AGY 仍报告成功的情况。先检查错误提示中记录的权限来源：它可能来自本次参数、仓库策略，也可能继承自上一次会话。

需要保留受限权限时，可以通过 `setup` 配置命令允许列表。如果你允许本次任务放宽权限，应显式传入 `--unrestricted`。仅删除 `--restricted` 不一定有效，因为继续会话时仍会继承原来的配置。部分工具在非交互模式下不接受允许规则，即使运行过 `setup` 也可能不可用。

`ask` 不调用工具，因此不能用工具被拒绝解释它的空回答。`unrestricted` 任务的空回答也不能简单归因于权限；请保留诊断信息并报告问题。

### 参数和任务被放进了同一个字符串

`unknown flag --X: the whole string … arrived as a single argument` 表示多个选项，可能连同任务正文，被引号包成了一个参数。请把选项分别传入，并用 `--prompt` 提供任务正文。具体示例见[任务正文](#任务正文)。

### 任务正文超过长度上限

`task text exceeds the 200KB inline limit` 表示传入 AGY 的任务正文太长。companion 最终仍会将完整提示词放在一个命令行参数中；`--prompt-file` 和 `--stdin` 能简化输入，却不会消除这个长度限制。

可以在任务中提供 PR 编号、分支或文件路径，让 agy 自行读取材料，避免把大段内容直接粘进任务描述。

### 工作目录与已有改动

companion 的前台和后台调用都传入 `--add-dir <repoRoot>`；非 Git 目录使用启动目录，续跑和重启也会附加原工作区。测试过的 AGY 在未显式附加目录时，即使没有 `--sandbox`，print 模式也可能进入 `~/.gemini/antigravity-cli/scratch`。仅继承 shell 的 cwd 或配置 trusted workspace 不足以附加仓库。companion 不传入 `--sandbox`。附加目录提供工作区内文件读取权限，restricted 下执行命令仍需相应允许规则。

`implement` 允许在已有修改的工作区执行。提示词会列出运行前的状态；如果任务没有明确涉及这些修改，agy 应在覆盖、清理、暂存、重置、删除或提交它们之前询问用户，也不应擅自将它们加入推送或 PR。

如果 `research` 或 `review` 返回 `agy modified the working tree during this review`，请查看报告列出的路径，确认哪些变化由本次任务引入，再决定是否撤销。处理时应保留原有的用户改动。

### 项目权限和工作区规则

如果某条 agy 项目权限规则似乎没有生效，请在交互模式中确认设置。项目级设置文件的路径和配置流程仍未由本项目验证，详见[项目级权限](#进阶项目级权限)。

AGY 会读取工作区中的 `AGENTS.md`、`GEMINI.md` 和 `.agents/rules/*.md`。这些文件也会影响委派任务，出现与预期不一致的行为时，应一并检查。

## 从 0.1 迁移

0.2 调整了权限配置的名称和默认值，并移除了旧版用于指定审查对象及执行方式的参数。

| 0.1 写法或行为 | 迁移后的写法或行为 | 说明 |
| --- | --- | --- |
| `research`、`review` 默认使用 strict | `research`、`review`、`implement` 默认使用 `unrestricted` | 新任务不再依赖预先运行 `setup`；`ask` 仍不使用工具 |
| `--strict` | `--restricted` | 旧名作为兼容别名保留，并在标准错误中给出弃用提示 |
| `--loose` | `--unrestricted` | 与原参数含义一致，旧名会提示弃用 |
| 输出中的 `strict`、`loose` | `restricted`、`unrestricted` | 运行信息中的 `profile` 字段使用新名称 |
| `--diff-file <path>` | `review --prompt "Review the patch at /tmp/change.patch"` | 在任务正文中指定补丁 |
| `--pr <num>` | `review --prompt "Review PR #730"` | 在任务正文中指定 PR |
| `--target <ref>` | `review --prompt "Review changes against master"` | 在任务正文中指定比较对象 |
| `--background`、`--wait` | 按模式采用固定执行方式 | `ask` 同步返回答案，其余工具模式返回任务 ID |

已移除的参数会报错并给出替代写法。权限别名虽然仍可兼容，新的命令和脚本应使用 `--restricted` 与 `--unrestricted`。

## 从 0.3 迁移

0.4 将原先的命令和技能两层入口合并为角色技能，并新增 `staffer`。后台管理仍由 companion 执行，用户通过自然语言请求 `jobs` 技能处理即可。

| 0.3 入口 | 0.4 入口 | 说明 |
| --- | --- | --- |
| `/agy:research` + `/agy:agy-research` | `/agy:researcher` | 每种角色保留一个技能入口 |
| `/agy:review` + `/agy:agy-review` | `/agy:reviewer` | 支持代码审查和方案、决策审查 |
| `/agy:implement` + `/agy:agy-implement` | `/agy:implementer` | 使用角色名称作为入口 |
| `/agy:ask` + `/agy:agy-ask` | `/agy:ask` | 名称不变，入口合并 |
| 无对应角色 | `/agy:staffer` | 新增通用任务角色 |
| `/agy:status`、`/agy:wait`、`/agy:result`、`/agy:cancel`、`/agy:continue`、`/agy:setup` | `jobs` 技能 | 直接说明要查看、等待、取消或继续哪个任务；companion 子命令保持不变 |
| 手动设置 `.git/info/exclude` | 首次运行时自动设置 | 本地状态目录会自动加入忽略规则 |

## 从 0.4.4 迁移（破坏性变更）

0.4.5 要求任务正文通过明确的来源传入，不再接受直接放在命令后的位置参数。这样，companion 就可以保留 shell 的参数边界，避免把任务里形似选项的文本重新解释为命令参数。

| 旧写法 | 新写法 |
| --- | --- |
| `ask "question"` | `ask --prompt "question"` |
| `review "Review PR #730"` | `review --prompt "Review PR #730"` |
| `review "--restricted Review PR #730"` | `review --restricted --prompt "Review PR #730"` |

旧的位置参数正文会直接报错，`--prompt-file` 和 `--stdin` 仍然可用。管理命令中的位置参数是任务 ID 或其他取值，不受这项变化影响，例如 `wait <id> --timeout 30s` 仍按原方式执行。

## 从 0.4.5 迁移

0.5.0 将各角色的默认模型，以及 `flash` 别名和 `--effort` 简写，从 Gemini 3.7 Flash 调整为 Gemini 3.8 Flash。推理强度保持不变：`ask` 为 low，`staffer` 和 `reviewer` 为 medium，`researcher` 和 `implementer` 为 high。

如果已安装的 AGY 不支持默认模型，companion 会报错，不会自动换成别的模型。它会查询 `agy models`，列出可用 ID，并推荐相同推理强度的兼容选项，例如 `--model gemini-3.7-flash-high`。你可以显式指定兼容模型，也可以更新 AGY 后再使用默认值。

## 升级

Claude Code 和 Codex 按版本号缓存插件，例如 `cache/agy-staff/agy/0.4.0`。缓存是否需要更新取决于版本号，而不是仓库的最新提交。因此，准备发布时需要同步更新两个插件 manifest 和 `package.json` 中的版本。

### Claude Code

先运行 `claude plugin marketplace update agy-staff` 更新插件市场的本地仓库，再运行 `claude plugin update agy@agy-staff` 更新已安装的副本，最后重启 Claude Code。

如果版本号没有变化，`update` 可能仍判断为最新版本，保留旧提交。此时可以运行 `claude plugin uninstall agy@agy-staff && claude plugin install agy@agy-staff` 重新安装，再重启。单独执行 `install` 不会覆盖已经安装的插件。

确认实际安装的提交时，可以查看 `~/.claude/plugins/installed_plugins.json` 中的 `gitCommitSha`，并与 `git -C ~/.claude/plugins/marketplaces/agy-staff log -1` 的结果比较。

### Codex

发布新版本后，运行 `codex plugin marketplace upgrade` 更新插件市场，再按安装流程更新插件并重启应用。必要时也可以移除并重新添加插件市场条目。若仍然出现旧行为，应先确认插件版本和当前会话加载的副本。

### Pi

Pi 的 Git 安装跟随所配置的分支或引用，本地路径安装则直接读取检出目录。没有固定版本的 Git 安装可以运行 `pi update --extension git:github.com/keli-wen/agy-staff`，然后在 Pi 中执行 `/reload`。

本地开发时，在检出目录运行 `npm run generate:pi`，再执行 `/reload` 即可加载技能修改，无需先推送到远端。

## 仓库结构

`skills/` 是角色技能的源文件，`pi-skills/` 是为 Pi 生成的入口。两者共用 `templates/` 中的提示词和 `companion/` 中的运行逻辑。

```text
companion/agy-companion.mjs    命令入口、模式选择、任务管理与 setup
companion/stream-worker.mjs    AGY 流式执行、进程清理与执行时限
companion/observation.mjs      事件解析、进度快照与输出长度限制
companion/state-lock.mjs       状态更新与锁回收
skills/                       角色技能与 jobs 管理技能，以及按需加载的参考文件
pi-skills/                    自动生成的 Pi 入口与参考文件，不应手动编辑
templates/                    共享提示词模板与宿主兼容说明
scripts/generate-pi-skills.mjs  生成 Pi 技能并检查一致性
.claude-plugin/               Claude Code 插件与插件市场配置
.codex-plugin/plugin.json     Codex 插件配置
.agents/plugins/              Codex 插件市场配置
package.json                  Pi 包配置、npm 打包范围与验证命令
tests/                        离线回归测试，以及单独启用的集成测试
assets/                       图片、徽标与徽章
docs/                         参考手册、安装说明和发布记录
```
