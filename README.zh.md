# opencode 实时监控台

[English](README.md) | **中文**

[![CI](https://img.shields.io/github/actions/workflow/status/aifeifei798/opencode-monitor/ci.yml?style=flat-square&branch=main)](https://github.com/aifeifei798/opencode-monitor/actions/workflows/ci.yml) [![License: Apache-2.0](https://img.shields.io/github/license/aifeifei798/opencode-monitor?style=flat-square&color=5dd6a8)](LICENSE) ![Runtime](https://img.shields.io/badge/runtime-Node.js%20zero--deps-a78bfa?style=flat-square) ![UI](https://img.shields.io/badge/UI-vanilla%20JS%20%2B%20SVG-38bdf8?style=flat-square) ![Safety](https://img.shields.io/badge/READ--ONLY-safe-f5b942?style=flat-square) ![i18n](https://img.shields.io/badge/i18n-EN%20%7C%20%E4%B8%AD%E6%96%87-38bdf8?style=flat-square) ![Theme](https://img.shields.io/badge/theme-%E2%98%80%20%E2%98%BE-a78bfa?style=flat-square) ![Stars](https://img.shields.io/github/stars/aifeifei798/opencode-monitor?style=flat-square) ![Last commit](https://img.shields.io/github/last-commit/aifeifei798/opencode-monitor?style=flat-square&color=8b9cab)

一个本地网页，把 opencode 的运行过程画成实时流程图，并直接回答一个问题：**现在为什么卡住**。
**纯只读**：只读取 opencode 的 API / 事件流和 Strata 指标，绝不调用任何会改变 opencode 状态的接口。

**在线 Demo（无需服务端）**：[https://aifeifei798.github.io/opencode-monitor/?demo=1](https://aifeifei798.github.io/opencode-monitor/?demo=1) 在浏览器里播放内置脚本会话——step 推进、工具扇出、等批准、GPU 排队全流程。

![月亮（深色）主题](docs/screenshot-dark.png)
![太阳（浅色）主题](docs/screenshot-light.png)

重新生成截图（需要服务在跑）：

```sh
google-chrome --headless=new --disable-gpu --hide-scrollbars --window-size=1400,1800 \
  --screenshot=docs/screenshot-dark.png http://127.0.0.1:7788/
google-chrome --headless=new --disable-gpu --hide-scrollbars --window-size=1400,1800 \
  --screenshot=docs/screenshot-light.png "http://127.0.0.1:7788/?theme=light"
```

## 启动

推荐用管理脚本（安装 / 构建 / 启动 / 停止 / 重启 / 状态 / 测试 / 日志）：

```sh
cd /home/feifei/develop/opencode/opencode-monitor
./server.sh install           # npm install + 预编译 CSS（clone 后第一步）
./server.sh start             # 后台启动，等待 /api/health；pid 记在 /tmp/opencode/monitor.pid
./server.sh restart           # 改了 src/ 下任何东西后重启（改 public/ 不用重启，刷新浏览器即可）
./server.sh status            # 进程状态 + opencode/Strata 连通性 + 会话数
./server.sh test              # 先确保服务在跑，再 npm test
./server.sh logs [-f]         # 追看 /tmp/opencode/monitor.log
open http://127.0.0.1:7788
```

或直接跑：

```sh
node src/server.js            # 或 npm start
```

Tailwind 已预编译进 `public/tailwind.css`，运行时零依赖、断网可跑。只有改了样式才需要重新构建：

```sh
npm run build               # styles/input.css → public/tailwind.css
```

## 数据从哪来

- **opencode 服务**：密码读自 `~/.config/opencode/service.json`；端口每 3 秒通过 `opencode service status` 重新发现（服务换新端口会自动重连）。
- **事件流**：`GET /api/event`（SSE）。已映射：`session.execution.*`、`session.step.*`、`session.reasoning.*`、`session.tool.input.*` / `called` / `progress` / `success`、`session.compaction.*`、`session.usage.updated`、`session.created/deleted`（子 agent 树）。
- **兜底轮询**（3 秒）：`/api/session`、`/api/session/active`、`/api/permission/request`、`/api/form`、`/api/shell`。
- **Strata GPU**（2 秒）：`http://127.0.0.1:8080` 的 `/metrics`、`/status`、`/slots`、`/api/health`。

## 页面上有什么

- **诊断卡**：一句标题 + 支撑证据。优先级：等你批准 → 等你回答 → 工具长时间无进展 → GPU 排队（`queued`）→ 上下文压缩 → provider 重试 → 工具运行中 → 生成中 → 空闲。
- **流程图**：用户输入 → Step 节点 → 工具扇出（并行调用并排显示，转圈/对勾/叉号 + 耗时 + 参数）→ 下一个 Step。GPU 排队积压时连线变黄并流动。每个 Step 下方：Strata 的 `prefill + decode` 耗时、tok/s、KV 命中率（按时间戳近似归因）。导出按钮：流程图存 2x PNG，或整会话复制为 Markdown。
- **会话树**：主会话与子 agent 分支按 `parentID` 缩进，按状态着色；每行显示该会话当前诊断状态（等你批准 / GPU 排队 / 生成中 / 空闲…）。
- **时间轴**：每个 Step 的耗时条，拆成 prefill / decode 两段。
- **Strata 面板**：GPU 利用率、显存、温度、功耗、tok/s、排队数、KV 命中率、draft 接受率、上下文占用、利用率折线，外加监控自身采样攒出的 tok/s / 排队 / 缓存命中趋势小图。
- **时间去向**：堆叠条把总时长拆成生成 / 工具执行 / 等你（已解决的批准与提问） / 其余（排队等）——近似值，只含保留的 step 缓冲。
- **诊断历史带**：色块带记录每次诊断状态迁移（生成中 → 等你批准 → GPU 排队…），每段按持续时长定宽。
- **等待 / 事件流**：待批准的权限、未回答的问题、运行中的 shell；可过滤的事件日志。
- **语言**：界面默认英文，头部按钮切换中文（选择记在 localStorage）。

## 悬停详情

悬停任意节点看完整内容（参数、输出、思考全文、GPU 归因）。鼠标可以移进浮层里滚动、选中文字——你在浮层内时实时刷新会冻结。点击钉住；点空白处关闭。每个内容块都有复制按钮。当前 Step（连同右侧工具块）在固定高度的外框里垂直居中，放不下时贴顶对齐。

## 提醒、快捷键、回放

- **卡住提醒**：诊断处于等你批准或等你回答时，标签页标题闪烁 `⚠ …` 并发浏览器通知（首次征询权限；同一 会话+原因 只提醒一次）。
- **快捷键**：`T` 切主题、`L` 切语言、`1`–`9` 选会话、`?` 开关快捷键与图例浮层、`Esc` 关闭浮层（在输入框里打字不拦截）。
- **回放**：已完成的会话显示回放按钮——Step 按顺序逐个重现；再点一次停止。
- **主题**：头部 ☀/☾ 切换（记在 localStorage）；URL 参数 `?theme=light|dark` 可强制主题（截图用）；`?demo=1` 播放内置脚本 demo、无需服务端（Pages 用）。窄屏（<1024px）收成单栏堆叠、流程图外框收矮。

## 关键事实

Strata **只有 1 个推理槽位**（`/slots`）；`pool_workers: 7` 是内存池，不是并发槽。所以 opencode 的并行工具调用和并行子 agent 在 GPU 上串行排队——「看起来卡住」的时刻多半就是这个，页面上表现为黄色连线和 `queued N`。

## 配置

环境变量：`MONITOR_PORT`（默认 7788）、`MONITOR_HOST`（默认 127.0.0.1）、`STRATA_URL`（默认 `http://127.0.0.1:8080`）、`OPENCODE_SERVICE_FILE`（默认 `~/.config/opencode/service.json`）。

只绑定 127.0.0.1；服务密码只用在服务端请求头里，永远不会发给浏览器（`tests/state-test.mjs` 断言快照里不含密码）。

## 测试

```sh
npm test                    # state-test（内存状态机 + 诊断优先级）+ ui-test（jsdom 渲染冒烟测试，需要服务在跑）
```

GitHub Actions（`.github/workflows/ci.yml`）会在每次 push 时启动监控并跑 `npm test`。

## 协议

Apache License 2.0 — 见 [LICENSE](LICENSE)。
