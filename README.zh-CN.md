<p align="center"><img src="assets/logo/gemini-agy.svg" width="440" alt="AGY-STAFF"></p>

<p align="center"><a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a></p>

<p align="center"><a href="https://antigravity.google/product/antigravity-cli"><img src="assets/badges/powered-by-antigravity.svg" height="20" alt="powered by: Antigravity"></a> <img src="assets/badges/model-gemini-3-8-flash.svg" height="20" alt="model: Gemini 3.8 Flash"></p>

<p align="center"><a href="https://claude.com/claude-code"><img src="assets/badges/claude-code-plugin.svg" height="20" alt="Claude Code plugin"></a> <a href="https://developers.openai.com/codex/"><img src="assets/badges/codex-plugin.svg" height="20" alt="Codex plugin"></a> <a href="LICENSE"><img src="assets/badges/license-mit.svg" height="20" alt="license: MIT"></a></p>

把 Google 的 Antigravity CLI（`agy`）雇来当 **Claude Code**、**OpenAI Codex** 和 **Pi** 的「agy 员工」。

![agy-staff 设计图](assets/design.png)

## 它适合做什么

agy-staff 提供五种角色（persona）。`staffer` 适合通用任务；`researcher` 负责调研；`reviewer` 审查代码、方案和决策；`implementer` 处理编码任务；`ask` 用于不需要工具的简短问答。前四种角色都使用相同的后台任务机制，由 `jobs` 技能负责等待、查看进度和收取结果。

为什么需要它：GPT-5.6-Sol 开着 fast mode 也慢；Claude Code 快一些，但 Fable 额度有限，更适合用来编排 subagent，而不是亲自做每一次调研和审查。这些任务可以交给 agy：它几秒钟就能给出第二意见，调研和审查以 Flash 的速度完成，范围明确的实现任务放到后台执行，你继续做手头的事。另外，即使不追求速度，让另一个模型家族审同一份代码，也能发现主力 agent 自己发现不了的问题。

![主 agent 将部分工作交给后台运行的 agy](assets/why.png)

## 安装

### 手动安装

先安装 Antigravity CLI。下面的命令来自[官方安装文档](https://antigravity.google/docs/cli/install)，安装后用 `agy --version` 确认命令可用。运行插件还需要 Node.js。

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

接着，在你使用的 agent 环境中安装插件。如果使用 Claude Code，运行：

```bash
claude plugin marketplace add keli-wen/agy-staff
claude plugin install agy@agy-staff
```

如果使用 Codex，运行：

```bash
codex plugin marketplace add https://github.com/keli-wen/agy-staff
codex plugin add agy@agy-staff
```

<details>
<summary>在 Pi 中安装</summary>

运行 `pi install git:github.com/keli-wen/agy-staff` 安装插件。Pi 中的技能使用 `agy-` 前缀，例如 `/skill:agy-ask reply with OK`；任务管理技能是 `/skill:agy-jobs`。

更新时运行 `pi update --extension git:github.com/keli-wen/agy-staff`，然后在 Pi 中执行 `/reload`。

</details>

安装完成后，重启 Claude Code 或 Codex，再做一次简单的验证：在 Claude Code 中输入 `/agy:ask reply with OK`，在 Codex 中输入 `$agy:ask reply with OK`。`ask` 不调用工具，也不需要额外的权限配置。

> [!IMPORTANT]
> `staffer`、`researcher`、`reviewer` 和 `implementer` 默认使用 `unrestricted` 权限配置，可以读取仓库、运行命令和修改文件。插件会通过提示词说明任务边界和已有改动的归属；任务明确要求提交、推送或创建 PR 时，agy 才应执行相应操作，否则留下工作区改动供你审查。这些提示约定不能替代权限隔离。
>
> 日常使用不需要先运行 `setup`。如果希望保留 agy 自身的权限检查，可以选择 `--restricted`，并通过 `setup` 配置允许执行的命令。`setup` 默认只展示计划，经你确认后才写入配置。使用前请阅读[权限说明](docs/REFERENCE.zh-CN.md#可选加固-setup)，了解全局命令允许列表的作用范围，以及审查不可信内容时的限制。

### 让 agent 帮你安装

也可以把下面这段话交给你的 coding agent，让它按照仓库里的说明完成安装和验证：

```
Read the raw text of https://raw.githubusercontent.com/keli-wen/agy-staff/master/docs/INSTALL_FOR_AGENTS.md
(curl it — do not work from a summary), or the same file in your local checkout of agy-staff, and follow it to
install and verify the agy-staff plugin for the harness you are running in. Respond in the user's language.
```

## 使用

在 Claude Code 中输入 `/agy:`，就能选择要使用的角色：

![Claude Code 中的 /agy: 命令菜单](assets/claude-code-screenshot.png)

在 Codex 中输入 `$agy`，可以找到对应的技能：

![Codex 中的 $agy 技能选择器](assets/codex-desktop-screenshot.png)

下面的示例使用 Claude Code 的 `/agy:…` 写法。在 Codex 中把它换成 `$agy:…` 即可；Pi 使用 `/skill:agy-…`。

| 想做的事 | 示例 |
| --- | --- |
| 问一个简短的问题 | `/agy:ask 你的后端模型是什么` |
| 交办一个通用任务 | `/agy:staffer 汇总这个仓库里所有未完成的 TODO` |
| 生成图片 | `/agy:staffer 生成一个像素风机器人吉祥物，存为 assets/mascot.png` |
| 审查当前改动 | `/agy:reviewer 检查当前工作区的改动` |
| 审查某个 PR | `/agy:reviewer 审查 PR #730` |
| 审查方案 | `/agy:reviewer 检查 docs/plan.md 中的迁移方案，指出可能遗漏的问题` |
| 调研代码 | `/agy:researcher 这个仓库的鉴权是怎么做的` |
| 实现修复 | `/agy:implementer 修复那个不稳定的重试测试` |
| 查看或继续任务 | 直接说“agy 的任务进展如何”或“继续刚才的任务，再检查一下错误路径” |

使用 `reviewer` 时，直接说明审查对象即可。agy 会自行调用 `gh pr view`、`git diff` 等命令收集材料，也可以读取指定文件。代码审查会按严重程度列出问题；方案和决策审查则会检查假设、取舍和可能遗漏的情况。

`staffer` 没有预设的专业分工，因此也适合调用其他角色没有专门介绍的 agy 原生工具，例如 `generate_image`。项目曾在 agy v1.1.15 上验证图像生成：一次调用约 30 秒生成了 1024×1024 的 PNG。这个记录可以作为使用示例，实际耗时取决于任务和运行环境。

## 核心设计

`ask` 会在同一次调用中返回答案。其他角色启动后会先返回任务 ID，并给出收取结果的命令，例如 `wait <id> --timeout 10m`。主 agent 根据所在环境的能力等待任务；如果支持后台命令，就为每个任务保留一个独立的等待命令。

想了解中间进展时，可以直接问主 agent。它会用 `observe` 查看当前快照，其中包含最近的工具活动和回答片段。任务完成后，`wait` 或 `result` 负责返回完整结果。

下图按时间顺序展示一次后台任务：主 agent 发起委派后可以继续其他工作，在需要时查看进度，最后收取报告。

[![后台任务从委派到完成的过程：主 agent 等待或查看进度时，worker 持续保存 AGY 的输出，最终交付完整报告](assets/integration.png)](assets/integration.svg)

等待到期不会停止后台任务。任务本身有独立的执行时限，默认 60 分钟，可以在启动时用 `--timeout` 调整，最长 120 分钟。需要停止时使用 `cancel`；需要继续或重新开始时，由主 agent 根据你的要求调用 `continue` 或 `restart`。模型何时收到后台结果，仍由你使用的 agent 环境决定。

关于参数、权限、进度快照和恢复方式，可以查阅[完整参考手册](docs/REFERENCE.zh-CN.md)。各版本的改动记录在[发布说明](docs/releases/)中。

## 升级

Claude Code 和 Codex 使用的是安装时复制到缓存中的插件。仓库发布新版本后，需要主动更新，并重启应用才能加载新的技能。

Claude Code 的更新命令是：

```bash
claude plugin marketplace update agy-staff && claude plugin update agy@agy-staff
```

Codex 的更新命令是：

```bash
codex plugin marketplace upgrade && codex plugin add agy@agy-staff
```

这两个环境都按版本号管理插件缓存。如果更新后仍然看到旧行为，请先确认是否已重启应用，再参考[升级说明](docs/REFERENCE.zh-CN.md#升级)检查版本和实际安装的提交。Pi 的更新方式见上方安装说明。

## 社区

欢迎在 [LINUX DO](https://linux.do/) 交流使用经验。

## 参与贡献

欢迎通过 issue 或 PR 提出问题、分享使用经验或改进代码。新增模式或参数会影响对外接口，建议先开 issue 讨论预期行为。

提交代码前请运行 `npm test`。标准测试使用临时仓库、临时 HOME 和假的 agy，不会调用真实模型或改动你的个人配置。新增回归测试也应保持这一点。需要验证真实 AGY 时，请使用[测试说明](tests/README.md)中单独启用的集成测试。

运行逻辑位于 `companion/`：入口负责模式和任务命令，独立模块负责流式执行、进度快照和状态锁。角色技能位于 `skills/`，共享的提示词模板位于 `templates/`。修改技能时请以 `skills/` 为准，再运行 `npm run generate:pi` 生成 `pi-skills/`，用 `npm run check:pi` 检查两者是否一致。

README 和参考手册都有中英文版本。修改使用方法或行为说明时，请同步更新对应版本，让两种语言的读者得到一致的信息。

## 许可证

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE)。
