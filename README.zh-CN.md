<p align="center">
  <a href="https://antigravity.google/product/antigravity-cli"><img src="assets/badges/powered-by-antigravity.svg" alt="powered by: Antigravity"></a>
  <img src="assets/badges/model-gemini-3-7-flash.svg" alt="model: Gemini 3.7 Flash">
  <a href="https://claude.com/claude-code"><img src="assets/badges/claude-code-plugin.svg" alt="Claude Code plugin"></a>
  <a href="https://developers.openai.com/codex/"><img src="assets/badges/codex-plugin.svg" alt="Codex plugin"></a>
  <a href="LICENSE"><img src="assets/badges/license-mit.svg" alt="license: MIT"></a>
</p>

# agy-staff

把 Google 的 Antigravity CLI（`agy`）雇来当 **Claude Code** 和 **OpenAI Codex** 的「agy 员工」。

![agy-staff 设计图](assets/design.zh-CN.svg)

## What & Why

agy-staff 让主力 agent 把活儿委托给 `agy`——自带快速、免费额度的 Gemini 3.7 Flash。四种模式，两个平台同一个插件名：`/agy:ask`、`/agy:research`、`/agy:review`、`/agy:implement`（另有 `continue`/`status`/`result`/`cancel`/`setup`）。

用过 Codex 就知道那种感觉：GPT-5.6-Sol 即使开着 fast mode 也慢。Claude Code 快一些但也谈不上快，而 Fable 额度稀缺——你更希望它去编排 subagent，而不是自己磨每一次调研和审查。agy 员工给你一条快车道：几秒钟的第二意见、Flash 速度的只读调研与审查、不消耗任何高级额度的边界清晰的实现任务。而在速度不是重点的场景里，让第二个模型家族看同一份代码，能换来主力 agent 自己给不了的覆盖面和稳健性。

## How

*（截图即将补充）*
<!-- screenshot: claude-code -->
<!-- screenshot: codex -->

### 安装

#### 给人类

第一步——安装 Antigravity CLI（[官方文档](https://antigravity.google/docs/cli/install)），然后用 `agy --version` 验证（v1.1.13 测试通过；另需 Node.js）：

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

第二步——把插件装进你的 harness：

```
/plugin marketplace add keli-wen/agy-staff
/plugin install agy@agy-staff
```

```bash
codex plugin marketplace add https://github.com/keli-wen/agy-staff
codex plugin add agy@agy-staff
```

首次运行：先 `/agy:ask "reply with OK"`（冒烟测试，零 setup），再 `/agy:setup`（安装只读 allowlist，启用自主取证）。

#### 给 Agent

把下面这段话直接粘贴给任何 coding agent：

```
Read docs/INSTALL_FOR_AGENTS.md in https://github.com/keli-wen/agy-staff (or in your
local checkout of agy-staff) and follow it to install and verify the agy-staff plugin
for the harness you are running in. Respond in the user's language.
```

### 典型场景（CUJ）

调用永远是显式的——命令由你亲手输入，插件不会因自然语言自行触发。

| 使用场景 | Claude Code | Codex |
|---|---|---|
| 快速第二意见 | `/agy:ask "这个报错是什么意思"` | `$agy:agy-ask 这个报错是什么意思` |
| 审查我的工作区 diff | `/agy:review` | `$agy:agy-review` |
| 审查 PR `#123` | `/agy:review --pr 123` | `$agy:agy-review --pr 123` |
| 调研一个主题 | `/agy:research "X 是怎么工作的"` | `$agy:agy-research X 是怎么工作的` |
| 实现一个边界清晰的修复 | `/agy:implement "修复那个不稳定的测试"` | `$agy:agy-implement 修复那个不稳定的测试` |
| 续接最近的会话 | `/agy:continue "再看看错误路径"` | `$agy:agy-jobs continue 再看看错误路径` |

**完整参考 →** [docs/REFERENCE.zh-CN.md](docs/REFERENCE.zh-CN.md)（flags、权限模型、任务/状态、疑难排查、升级）。

## 许可证

MIT — 见 [LICENSE](LICENSE)。English documentation: [README.md](README.md).
