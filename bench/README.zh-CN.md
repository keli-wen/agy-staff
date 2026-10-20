# <img src="../assets/logo/bench.svg" width="48" height="48" alt=""> agy-staff Bench

[English](README.md) | [简体中文](README.zh-CN.md)

agy-staff Bench 衡量主 agent 把工作委派给 agy 要付出什么、能换来什么。每道题用三种编排方案各跑一次：主 agent 自己做；主 agent 用自家的 subagent；主 agent 通过 `lead` 用 agy。表里给出解出的题数、host 成本、总成本和耗时。

[![agy-staff Bench v1：Claude Code 和 Codex 在 SWE-bench Verified、SWE-Atlas QnA、DeepSearchQA 上，分别单独做、用自家 subagent、用 agy 的结果](results/v1/summary.png)](results/v1/summary.svg)

> [!NOTE]
> **为什么做这个评测。** 同一批题目，换不同的 host，分别用和不用 agy 来做，回答三个问题：
> - **什么时候该委派。** 哪些任务、哪个 host 交给 agy 更划算，哪些留给 host 自己做更好。结论会沉淀成 agy-staff 的最佳实践。
> - **agy-staff 该改什么。** 每次评测都会暴露委派在哪里浪费了时间或 token。这些发现会回到插件里变成修复，之后的评测版本再验证修复是否有效。
> - **不同 harness 的设计差异。** 同一份 prompt、同一个 worker，只换 host。结果上的差距能追溯到各家 harness 的设计取舍。

## v1 的结论

- **Claude Code 当 host：** 用 agy 之后，三个 benchmark 的 host 成本都下降了：SWE-bench Verified −16%，SWE-Atlas QnA −36%，DeepSearchQA −50%。host 成本就是从你的 Claude 订阅里扣的那部分。SWE-bench 上三种编排方案的结果完全相同，都是 7/8。代价是时间（耗时中位 13–19 分钟，单独做是 2–8 分钟），以及 agy 自己额度上的 worker 成本。
- **Codex 当 host：** 只有 DeepSearchQA 的 host 成本下降了（−16%）。SWE-bench（+86%）和 QnA（+22%）都更贵。Codex 等 agy 时会反复轮询，每次被唤醒都要带上完整的上下文；Claude Code 在后台等，任务完成后才被唤醒。
- **agy 输在哪：** Claude Code 这一侧，有 3 道题单独做解出了、用 agy 没解出。其中 2 道是 DeepSearchQA 跑到 30 分钟上限，还没写出答案；1 道是 QnA 的评委分歧：Gemini 3 次都判通过，DeepSeek 只判通过 1 次。另外有 1 道 DeepSearchQA，Claude Code 单独做没解出，用 agy 解出了。
- **每种编排方案每道题只跑 1 次，一共 20 道题。** 差 1 道题在噪声范围内。v1 只是第一版基线，不是定论。

## 测的是什么

三种编排方案用同一份 prompt，只有最后说明编排方式的那一行不同，所以编排方式是唯一的变量。

| 编排方案 | host 怎么做 | worker |
|---|---|---|
| solo | 自己做 | 无 |
| + subagents | 委派给自家的 subagent | Claude Code：Sonnet 5.5；Codex：GPT-6 Luna |
| + agy | prompt 要求它用 `lead`（`/agy:lead`、`$agy:lead`），由 lead 决定派哪些 agy 任务 | Gemini 3.8 Flash，agy CLI 1.3.0 |

v1 只在 SWE-bench Verified 上跑了"+ subagents"。

每个 benchmark 对应一种使用 worker 的场景：

| benchmark | 题数 | 场景 | 怎样算解出 |
|---|---|---|---|
| SWE-bench Verified | 8 | 小的单个修复，是委派可能不划算的边界 | 官方测试通过 |
| SWE-Atlas QnA | 6 | 查仓库、得出结论 | 两个 LLM 评委都判 rubric 通过 |
| DeepSearchQA | 6 | 联网调研、汇总多个来源 | 两个 LLM 评委都判答案通过 |

题目用固定的随机种子抽取，题号见 `data.json`。

| host | CLI | 模型 | effort |
|---|---|---|---|
| Claude Code | 2.1.296 | Claude Opus 5.5 | xhigh |
| Codex | 0.160.1 | GPT-6.1 Sol | xhigh |

## 方法

- **运行框架：** [Harbor](https://github.com/harbor-framework/harbor) 0.24.0，每个 job 的 `lock.json` 都记录了这个版本。每次 trial 都在一个全新的容器里跑。容器用 benchmark 自己的镜像构建，再装上 host CLI、agy 和 agy-staff。
- **agy-staff 版本：** 0.7.3（`f00d149`）。对 Claude Code 和 Codex 来说，0.7.4 没有改动任何 skill、companion 代码或 prompt 模板，所以这批结果也代表 0.7.4。
- **评分：** SWE-bench 按测试评分。QnA 和 DeepSearchQA 在离线评分，沿用各数据集自己的评分 prompt、rubric 和汇总规则。和官方做法唯一的不同是评委模型：用 Gemini 3.8 Flash 和 DeepSeek V4 Pro，各评 3 次。只有两个评委各自多数判通过，才算解出。
- **成本：** 按 API 标价计，单位是美元。
  - host 成本是 host 模型自己用掉的部分，也就是从你的 Claude 或 ChatGPT 订阅里扣的那部分。
  - 总成本再加上 worker。自家 subagent 和 host 用同一份订阅；agy 按 Gemini 标价折算，但用的是 agy 自己的额度。
  - Claude Code 的成本取它自己报告的 `costUSD`，已经和标价核对过；Codex 的成本按它的 token 数计算。
- **耗时：** 每次 trial 的墙钟时间取中位数。trial 是两到三个同时跑的，耗时是在这种负载下测的。
- **时限：** 按各 benchmark 自己的规定。DeepSearchQA 到 30 分钟就停止 agent，评当时答案文件里的内容，所以没写出答案的 trial 算没解出。
- **重跑：** 基础设施故障一律重跑，不算作没解出。
  - 有 12 次 trial 里 Claude Code 卡死了，或者被卡死检测误停了。它在容器里跑的是 x86 版，经过转译运行，所以这些 trial 用同一版本的 arm64 原生版重跑。`data.json` 里每次 trial 用的是哪个版本记在 `claude_binary` 字段。
  - Claude Code"+ subagents"的第一版 prompt 让 host 去自己写 subagent 定义，而没有直接委派。prompt 改过之后，这 8 次 trial 全部重跑，表里用的是重跑的结果。
- **答案暴露：** DeepSearchQA 的答案表在网上有镜像。tool output 里出现过答案表的 trial 在 `data.json` 里标了 `answer_key_exposure`。v1 里有 2 次，都是 0118 这道题：Claude Code + agy（超时，没解出）和 Codex solo（解出）。两次都照常计入表中。

## 已知局限

- 每种编排方案每道题只跑 1 次，一共 20 道题。
- "+ subagents"只在 SWE-bench Verified 上跑了。
- 替换评委模型，偏离了 QnA 和 DeepSearchQA 的官方评分做法。
- 耗时是在多个 trial 并发时测的。
- prompt 和 `lead` 都没有告诉 host DeepSearchQA 有 30 分钟的时限。三次超时里，agy 的第一个调研 job 都用了约 21 分钟或更久，其中两次到 30 分钟时仍有 agy job 在跑，没有一个 host 先写下临时答案。下一版会在所有编排方案的 prompt 里写明时限。

## 文件

```
results/
└── v1/
    ├── summary.svg   这张表
    ├── summary.png   同一张表，渲染后放进 README（headless Chrome 3 倍渲染；rsvg-convert 会丢掉内嵌的数字字体）
    └── data.json     表背后的 96 次 trial，以及每个格子的汇总
```

`data.json` 里每次 trial 记录了 host、模型、编排方案、benchmark 和题目；是否解出、reward、`timed_out` 和 `answer_key_exposure`；host 和 worker 各自的成本和 token；以及耗时（秒）。

## 版本

每发布一张表，就在 `results/` 下新建一个目录。已发布的版本不再修改，下面列出的勘误除外。换一次运行、换 prompt、换编排方案或换题目，都算一个新版本。

| 版本 | 发布日期 | agy-staff | host | 题数 | 改动 |
|---|---|---|---|---|---|
| [v1](results/v1/) | 2026-10-19 | 0.7.3（`f00d149`） | Claude Code 2.1.296（Opus 5.5 xhigh）；Codex 0.160.1（GPT-6.1 Sol xhigh） | 20 | 第一版基线 |

**v1 勘误（2026-10-20）：** 方法和表格注释里原来写的是 Harbor commit `3e30cca`，但 trial 实际跑的是 Harbor 0.24.0，每个 job 的 `lock.json` 都这样记录；两处都已改为 0.24.0。“已知局限”里原来说超时的 run 中有一次到 30 分钟 agy 还在跑，实际是两次。数字都没有变。

## 评测框架

这个目录里是评测框架在 trial 之后的那一半：v1 用的 prompt 模板和题目列表、离线评分、分析和画表脚本。[REPRODUCE.md](REPRODUCE.md)（英文）说明怎样用 `data.json` 重画已发布的表，以及怎样评分、分析和发布一个版本。跑 trial 的那一半（Claude Code 和 Codex 搭配 agy-staff 的 Harbor agent、运行脚本和批量运行器）会在单独的 PR 里加入。
