# opencode 运行监控

一个本地网页，把 opencode 的执行过程画成实时流程图，并明确回答「现在为什么卡住」。
**纯只读**：只读取 opencode 的 API/事件流和 Strata 的指标，不调用任何会改变 opencode 状态的接口。

## 启动

```sh
cd /home/feifei/develop/opencode/opencode-monitor
node src/server.js          # 或 npm start
open http://127.0.0.1:7788
```

Tailwind 已预编译成 `public/tailwind.css`，运行时无任何依赖、断网可用。改样式后才需要重新构建：

```sh
npm run build               # styles/input.css → public/tailwind.css
```

## 它从哪里取数据

- **opencode 服务**：密码读自 `~/.config/opencode/service.json`，端口每 3 秒用 `opencode service status` 重新发现（服务重启换端口会自动重连）。
- **事件流**：`GET /api/event`（SSE）。映射：`session.execution.*`、`session.step.*`、`session.reasoning.*`、`session.tool.input.*` / `called` / `progress` / `success`、`session.compaction.*`、`session.usage.updated`、`session.created/deleted`（子 agent 树）。
- **兜底轮询**（3 秒）：`/api/session`、`/api/session/active`、`/api/permission/request`、`/api/form`、`/api/shell`。
- **Strata GPU**（2 秒）：`http://127.0.0.1:8080` 的 `/metrics`、`/status`、`/slots`、`/api/health`。

## 页面上有什么

- **诊断卡**：一句中文结论 + 依据。优先级：等你批准权限 → 等你回答问题 → 工具长时间无进度 → GPU 排队（`queued`）→ 上下文压缩 → provider 重试 → 工具在跑 → 正在生成 → 空闲。
- **流程图**：用户输入 → Step 节点 → 工具扇出（并发调用并排成多支，spinner/勾/叉 + 耗时 + 参数）→ 下一个 Step。连线在 GPU 排队时变黄流动。每个 Step 下方显示 Strata 的 `prefill + decode` 时长、tok/s、KV 命中率（按时间戳近似关联）。
- **会话树**：按 `parentID` 缩进显示主会话与 subagent 分支，颜色表示状态。
- **时间轴**：每个 Step 的时长条形图，prefill/decode 双色分段。
- **Strata 面板**：GPU util、显存、温度、功率、tok/s、排队数、KV 命中率、草稿接受率、上下文占用、util 折线。
- **等待中 / 事件流**：挂起的权限、待回答的问题、正在跑的 shell；可过滤的事件日志。

## 关键事实

Strata 只有 **1 个推理 slot**（`/slots`），`pool_workers: 7` 是显存池不是并发槽。所以 opencode 的并行工具调用和并行 subagent 在 GPU 上是串行排队的——「看起来卡住」经常就是这里，页面的黄色连线与 `排队 N` 就是它。

## 配置

环境变量：`MONITOR_PORT`（默认 7788）、`MONITOR_HOST`（默认 127.0.0.1）、`STRATA_URL`（默认 `http://127.0.0.1:8080`）、`OPENCODE_SERVICE_FILE`（默认 `~/.config/opencode/service.json`）。

只监听 127.0.0.1；服务密码只用在服务端请求头里，不会下发到浏览器（`tests/state-test.mjs` 会断言快照里没有 password）。

## 测试

```sh
npm test                    # state-test（纯内存状态机与诊断优先级）+ ui-test（jsdom 渲染冒烟，需要 server 在跑）
```
