// opencode 事件流 + Strata 指标 → 状态机（纯只读，不调用任何会改变 opencode 状态的接口）

export const EVENT_BUFFER = 180;
export const STEP_BUFFER = 30;
export const TOOL_BUFFER = 20;
export const REASONING_PREVIEW = 900;

export function createStore() {
  return {
    server: {
      url: null,
      password: null,
      reachable: false,
      reconnecting: false,
      version: null,
      pid: null,
      lastError: null,
      lastProbeAt: 0,
    },
    strata: {
      url: null,
      alive: false,
      engine: null,
      live: null,
      hardware: null,
      hardwareStatic: null,
      history: null,
      totals: null,
      cache: null,
      requests: [],
      slots: null,
      status: null,
      health: null,
      lastError: null,
      lastAt: 0,
      samples: [], // 每轮轮询采样：tok/s、排队数、缓存命中，供趋势小图
    },
    sessions: new Map(),
    pending: { permissions: [], forms: [], shells: [] },
    pendingHistory: [], // 已解决的挂起请求：等了多久，供「时间去向」统计等待时长
    events: [],
    stats: null,
    updatedAt: 0,
  };
}

const now = () => Date.now();

function sessionOf(store, id, info) {
  let s = store.sessions.get(id);
  if (!s) {
    s = {
      id,
      parentID: null,
      projectID: null,
      title: "",
      agent: null,
      model: null,
      directory: null,
      status: "idle",
      outcome: null,
      startedAt: null,
      idleAt: null,
      steps: [],
      stepSeq: 1, // step 编号独立递增：steps 会被 STEP_BUFFER 裁剪，不能用 length+1 当编号
      diagHistory: [], // 诊断状态迁移记录（key + 时刻），供底部历史带
      lastDiagKey: null,
      tools: new Map(),
      compaction: null,
      retry: null,
      usage: null,
      cost: 0,
      tokens: null,
      lastEventAt: 0,
      updatedAt: 0,
      note: null,
    };
    store.sessions.set(id, s);
  }
  if (info) mergeInfo(s, info);
  return s;
}

function mergeInfo(s, info) {
  if (info.parentID !== undefined) s.parentID = info.parentID;
  if (info.projectID !== undefined) s.projectID = info.projectID;
  if (info.title !== undefined) s.title = info.title;
  if (info.agent !== undefined) s.agent = info.agent;
  if (info.model !== undefined) s.model = info.model;
  if (info.cost !== undefined) s.cost = info.cost;
  if (info.tokens !== undefined) s.tokens = info.tokens;
  if (info.outcome !== undefined) s.outcome = info.outcome;
  if (info.location?.directory) s.directory = info.location.directory;
  if (info.time?.updated) s.updatedAt = info.time.updated;
  if (info.time?.idle) s.idleAt = info.time.idle;
}

function stepOf(s, messageID, startedAt, create = true) {
  let step = s.steps.find((x) => x.messageID === messageID);
  if (!step && create) {
    step = {
      messageID,
      index: s.stepSeq++,
      startedAt: startedAt ?? now(),
      streamedAt: null,
      endedAt: null,
      finish: null,
      tokens: null,
      cost: 0,
      agent: null,
      model: null,
      reasoning: null,
      tools: [],
      gpu: null,
    };
    s.steps.push(step);
    if (s.steps.length > STEP_BUFFER) s.steps.splice(0, s.steps.length - STEP_BUFFER);
  }
  return step;
}

function toolOf(s, id, messageID, name) {
  let tool = s.tools.get(id);
  if (!tool) {
    tool = {
      id,
      name: name ?? "未知工具",
      messageID,
      status: "input",
      startedAt: now(),
      calledAt: null,
      endedAt: null,
      inputText: "",
      input: null,
      metadata: null,
      exit: null,
      error: null,
      preview: "",
      lastProgressAt: now(),
    };
    s.tools.set(id, tool);
    const step = stepOf(s, messageID, null, false);
    // step 已被 STEP_BUFFER 裁掉时不挂幽灵节点，工具只留在 Map 里更新状态
    if (step) {
      step.tools.push(tool);
      if (step.tools.length > TOOL_BUFFER) step.tools.splice(0, step.tools.length - TOOL_BUFFER);
    }
  } else if (name) {
    tool.name = name;
  }
  return tool;
}

export function applyEvent(store, ev) {
  if (!ev || !ev.type) return;
  const t = ev.type;
  const d = ev.data ?? {};
  store.events.push({ type: t, at: ev.at ?? now(), sessionID: d.sessionID ?? null, summary: summarize(t, d) });
  if (store.events.length > EVENT_BUFFER) store.events.splice(0, store.events.length - EVENT_BUFFER);

  if (t === "server.connected") return;

  const s = d.sessionID ? sessionOf(store, d.sessionID) : null;
  if (s) s.lastEventAt = now();

  switch (t) {
    case "session.execution.started":
      if (s) { s.status = "running"; s.startedAt = d.started ?? now(); s.outcome = null; s.note = null; }
      break;
    case "session.execution.succeeded":
      if (s) { s.status = "idle"; s.outcome = "succeeded"; s.idleAt = now(); }
      break;
    case "session.execution.failed":
      if (s) { s.status = "error"; s.outcome = "failed"; s.note = d.error?.message ?? "失败"; s.idleAt = now(); }
      break;
    case "session.execution.interrupted":
      if (s) { s.status = "interrupted"; s.outcome = "interrupted"; s.idleAt = now(); }
      break;
    case "session.idle":
      if (s) { s.status = "idle"; s.outcome = d.outcome ?? s.outcome; s.idleAt = now(); }
      break;
    case "session.step.started":
      if (s) {
        const step = stepOf(s, d.assistantMessageID, d.started);
        step.agent = d.agent ?? step.agent;
        step.model = d.model ?? step.model;
      }
      break;
    case "session.step.streamed":
      if (s) {
        const step = stepOf(s, d.assistantMessageID, null, false);
        if (step) step.streamedAt = now();
      }
      break;
    case "session.step.ended":
      if (s) {
        const step = stepOf(s, d.assistantMessageID, null, false);
        if (!step) break;
        step.endedAt = now();
        step.finish = d.finish ?? null;
        step.tokens = d.tokens ?? null;
        step.cost = d.cost ?? 0;
        correlateGpu(s, step);
      }
      break;
    case "session.reasoning.started":
      if (s) {
        const step = stepOf(s, d.assistantMessageID, null, false);
        if (step) step.reasoning = { startedAt: now(), endedAt: null, chars: 0, preview: "" };
      }
      break;
    case "session.reasoning.delta":
      if (s) {
        const step = stepOf(s, d.assistantMessageID, null, false);
        if (!step) break;
        const r = step.reasoning ?? (step.reasoning = { startedAt: now(), endedAt: null, chars: 0, preview: "" });
        r.chars += (d.delta ?? "").length;
        if (r.preview.length < REASONING_PREVIEW) r.preview += d.delta ?? "";
      }
      break;
    case "session.reasoning.ended":
      if (s) {
        const step = stepOf(s, d.assistantMessageID, null, false);
        if (!step) break;
        const r = step.reasoning ?? (step.reasoning = { startedAt: now(), endedAt: null, chars: 0, preview: "" });
        r.endedAt = now();
        if (d.text) r.preview = d.text.slice(0, REASONING_PREVIEW);
      }
      break;
    case "session.tool.input.started":
      if (s && d.id) toolOf(s, d.id, d.assistantMessageID, d.name);
      break;
    case "session.tool.input.ended":
      if (s && d.id) toolOf(s, d.id, d.assistantMessageID).inputText = d.text ?? "";
      break;
    case "session.tool.called":
      if (s && d.id) {
        const tool = toolOf(s, d.id, d.assistantMessageID, d.name);
        tool.status = "running";
        tool.calledAt = now();
        tool.input = d.input ?? null;
        tool.executed = d.executed ?? false;
      }
      break;
    case "session.tool.progress":
      if (s && d.id) {
        const tool = toolOf(s, d.id, d.assistantMessageID);
        tool.metadata = d.metadata ?? tool.metadata;
        tool.lastProgressAt = now();
      }
      break;
    case "session.tool.success":
      if (s && d.id) {
        const tool = toolOf(s, d.id, d.assistantMessageID);
        tool.status = "done";
        tool.endedAt = now();
        tool.metadata = d.metadata ?? tool.metadata;
        tool.exit = d.metadata?.exit ?? null;
        tool.preview = previewContent(d.content);
      }
      break;
    case "session.tool.failed":
    case "session.tool.error":
      if (s && d.id) {
        const tool = toolOf(s, d.id, d.assistantMessageID);
        tool.status = "error";
        tool.endedAt = now();
        tool.error = d.error?.message ?? "工具失败";
        tool.preview = previewContent(d.content);
      }
      break;
    case "session.compaction.started":
      if (s) s.compaction = { startedAt: now(), endedAt: null, status: "running", chars: 0 };
      break;
    case "session.compaction.delta":
      if (s?.compaction) s.compaction.chars += (d.delta ?? "").length;
      break;
    case "session.compaction.ended":
      if (s?.compaction) { s.compaction.endedAt = now(); s.compaction.status = "done"; }
      break;
    case "session.compaction.failed":
      if (s?.compaction) { s.compaction.endedAt = now(); s.compaction.status = "failed"; s.note = d.error?.message ?? "压缩失败"; }
      break;
    case "session.retry.scheduled":
      if (s) s.retry = { attempt: d.attempt ?? 1, at: now(), error: d.error?.message ?? null };
      break;
    case "session.usage.updated":
      if (s) { s.usage = d.tokens ?? s.usage; s.cost = d.cost ?? s.cost; }
      break;
    case "session.created":
      if (d.sessionID) sessionOf(store, d.sessionID, d.info ?? d);
      break;
    case "session.deleted":
      if (d.sessionID) store.sessions.delete(d.sessionID);
      break;
    case "session.renamed":
      if (s && d.title) s.title = d.title;
      break;
    case "session.model.selected":
      if (s && d.model) s.model = d.model;
      break;
    case "session.agent.selected":
      if (s && d.agent) s.agent = d.agent;
      break;
    case "session.permission.asked":
    case "permission.asked":
      if (s) store.pending.permissions.push({ id: d.id ?? d.requestID, sessionID: d.sessionID, action: d.action, resources: d.resources ?? [], message: d.metadata?.message ?? "", firstSeenAt: now() });
      break;
    case "session.permission.replied":
    case "permission.replied": {
      const gone = store.pending.permissions.find((p) => p.id === (d.id ?? d.requestID));
      if (gone) pendingResolved(store, gone, "permission");
      store.pending.permissions = store.pending.permissions.filter((p) => p.id !== (d.id ?? d.requestID));
      break;
    }
    case "session.form.created":
    case "form.created":
      if (s) store.pending.forms.push({ id: d.id, sessionID: d.sessionID, title: d.title ?? d.info?.title ?? "", firstSeenAt: now() });
      break;
    case "session.form.replied":
    case "session.form.cancelled":
    case "form.replied":
    case "form.cancelled": {
      const gone = store.pending.forms.find((f) => f.id === d.id);
      if (gone) pendingResolved(store, gone, "form");
      store.pending.forms = store.pending.forms.filter((f) => f.id !== d.id);
      break;
    }
    default:
      break;
  }

  store.updatedAt = now();
}

function previewContent(content) {
  if (!Array.isArray(content)) return "";
  const text = content.map((c) => (typeof c === "string" ? c : c?.text ?? "")).join("\n");
  return text.slice(0, 700);
}

function summarize(type, d) {
  if (d.name) return `${d.name}${d.metadata?.shellID ? " (shell)" : ""}`;
  if (d.title) return d.title;
  if (d.action) return d.action;
  if (d.finish) return d.finish;
  if (d.delta) return d.delta.slice(0, 60);
  if (d.text) return d.text.slice(0, 60);
  if (d.sessionID) return d.sessionID;
  return "";
}

// 把 Strata 的请求记录按时间窗挂到 step 上（近似关联：opencode 事件里没有 GPU request id）
export function correlateGpu(session, step) {
  const reqs = globalReqs ?? [];
  if (!reqs.length || !step.startedAt) return;
  const startSec = step.startedAt / 1000;
  const endSec = (step.endedAt ?? now()) / 1000 + 0.6;
  const hit = reqs.filter((r) => r.time >= startSec - 1.5 && r.time <= endSec).sort((a, b) => b.time - a.time)[0];
  if (hit) step.gpu = { id: hit.id, approx: true, promptMs: hit.prompt_ms, decodeMs: hit.decode_ms, decodeTokS: hit.decode_tok_s, promptTokens: hit.prompt_tokens, reused: hit.reused, hitRate: hit.hit_rate, drafts: hit.drafts_offered ? hit.drafts_accepted / hit.drafts_offered : null, finish: hit.finish };
}

let globalReqs = [];
export function setStrata(store, payload) {
  store.strata.url = payload.url ?? store.strata.url;
  store.strata.alive = payload.alive ?? false;
  store.strata.engine = payload.engine ?? null;
  store.strata.live = payload.live ?? null;
  store.strata.hardware = payload.hardware ?? null;
  store.strata.hardwareStatic = payload.hardware_static ?? null;
  store.strata.history = payload.history ?? null;
  store.strata.totals = payload.totals ?? null;
  store.strata.cache = payload.conversation_cache ?? null;
  store.strata.requests = payload.requests ?? [];
  store.strata.slots = payload.slots ?? null;
  store.strata.status = payload.status ?? null;
  store.strata.health = payload.health ?? null;
  store.strata.lastError = payload.lastError ?? null;
  store.strata.lastAt = now();
  globalReqs = store.strata.requests;
  // 轮询采样：供 GPU 面板的 tok/s / 排队 / 缓存命中趋势小图
  if (payload.live) {
    store.strata.samples.push({ at: now(), tok_s: payload.live.tok_s ?? 0, queued: payload.live.queued ?? 0, hit: store.strata.requests[0]?.hit_rate ?? null });
    if (store.strata.samples.length > 120) store.strata.samples.splice(0, store.strata.samples.length - 120);
  }
  for (const s of store.sessions.values()) for (const step of s.steps) if (!step.gpu) correlateGpu(s, step);
}

export function setSessions(store, infos) {
  for (const info of infos) sessionOf(store, info.id, info);
}

export function setActive(store, activeMap) {
  for (const [id, a] of Object.entries(activeMap ?? {})) {
    const s = sessionOf(store, id);
    if (a?.type === "running") s.status = "running";
  }
}

export function setPending(store, { permissions, forms, shells }) {
  if (permissions) store.pending.permissions = reconcilePending(store, store.pending.permissions, permissions, "permission");
  if (forms) store.pending.forms = reconcilePending(store, store.pending.forms, forms, "form");
  if (shells) store.pending.shells = shells;
}

// 轮询列表与上一轮对比：消失的条目视为已解决，记下等待时长；保留首次出现时间
function reconcilePending(store, prev, next, kind) {
  const seen = new Map(prev.map((p) => [p.id, p.firstSeenAt ?? now()]));
  for (const p of prev) if (!next.some((n) => n.id === p.id)) pendingResolved(store, p, kind);
  return next.map((e) => ({ ...e, firstSeenAt: seen.get(e.id) ?? now() }));
}

function pendingResolved(store, e, kind) {
  store.pendingHistory.push({ sessionID: e.sessionID ?? null, kind, id: e.id, startedAt: e.firstSeenAt ?? now(), endedAt: now() });
  if (store.pendingHistory.length > 120) store.pendingHistory.splice(0, store.pendingHistory.length - 120);
}

export function setStats(store, stats) {
  store.stats = stats;
}

// 「为什么卡住」判定，按优先级给出结论与依据（中文）
function diagnoseZh(store, session) {
  const live = store.strata.live ?? {};
  const reasons = [];
  const perms = store.pending.permissions.filter((p) => p.sessionID === session.id);
  const forms = store.pending.forms.filter((f) => f.sessionID === session.id);
  const running = session.status === "running";
  const runningTools = running ? [...session.tools.values()].filter((t) => t.status === "running") : [];
  const openStep = running ? session.steps.find((x) => !x.endedAt) : null;
  const stalled = runningTools.filter((t) => now() - t.lastProgressAt > 20000);

  if (perms.length) {
    return {
      level: "blocked",
      key: "approval",
      attention: "approval",
      headline: "在等你批准权限",
      reasons: perms.map((p) => `${p.action ?? "permission"}：${(p.resources ?? []).slice(0, 3).join(", ") || "（无资源列表）"}${p.message ? ` — ${p.message}` : ""}`),
    };
  }
  if (forms.length) {
    return { level: "blocked", key: "question", attention: "question", headline: "在等你回答问题", reasons: forms.map((f) => f.title || f.id) };
  }
  if (stalled.length) {
    return {
      level: "blocked",
      key: "stalled",
      headline: `工具卡住：${stalled[0].name}`,
      reasons: [`${stalled[0].name} 已 ${Math.round((now() - stalled[0].startedAt) / 1000)} 秒没有任何进度事件`, stalled[0].inputText ? `参数：${stalled[0].inputText.slice(0, 140)}` : null].filter(Boolean),
    };
  }
  if (session.status === "error") {
    return { level: "error", key: "error", headline: "这一步失败了", reasons: [session.note ?? "未知错误"] };
  }
  if (session.status === "interrupted") {
    return { level: "blocked", key: "interrupted", headline: "被中断", reasons: ["你或客户端中断了这次执行"] };
  }
  if (live.queued > 0) {
    return { level: "blocked", key: "queue", headline: "在等 GPU：请求排队中", reasons: [`Strata 队列里有 ${live.queued} 个请求（只有 1 个 slot，并行调用会串行排队）`, live.phase ? `当前阶段：${live.phase}` : null].filter(Boolean) };
  }
  if (session.compaction?.status === "running") {
    return { level: "blocked", key: "compaction", headline: "正在压缩上下文", reasons: [`已生成 ${session.compaction.chars} 字符的摘要`] };
  }
  if (session.retry) {
    return { level: "blocked", key: "retry", headline: "provider 重试中", reasons: [`第 ${session.retry.attempt} 次重试${session.retry.error ? `：${session.retry.error}` : ""}`] };
  }
  if (runningTools.length) {
    const t = runningTools[0];
    const secs = Math.round((now() - (t.calledAt ?? t.startedAt)) / 1000);
    return { level: "running", key: "tool", headline: `正在跑工具：${t.name}`, reasons: [`已运行 ${secs} 秒`, t.metadata?.shellID ? "后台 shell 在跑" : null, live.state === "generating" ? `GPU 正在生成 ${live.generated ?? 0} tokens` : null].filter(Boolean) };
  }
  if (session.status === "running" || openStep) {
    return { level: "running", key: "gen", headline: "正在生成", reasons: [live.state === "prefill" ? `GPU prefill：已读 ${live.prompt_read ?? 0}/${live.prompt_total ?? 0} tokens` : `GPU ${live.state ?? "idle"}，${live.tok_s ? `${Math.round(live.tok_s)} tok/s` : "无生成"}`, openStep ? `第 ${openStep.index} 步` : null].filter(Boolean) };
  }
  return { level: "idle", key: "idle", headline: "空闲，等你输入", reasons: session.outcome ? [`上一次结果：${session.outcome}`] : [] };
}

// 同一优先级逻辑的英文镜像；前端按当前语言选用 headlineEn/reasonsEn（默认英文）
function diagnoseEn(store, session) {
  const live = store.strata.live ?? {};
  const perms = store.pending.permissions.filter((p) => p.sessionID === session.id);
  const forms = store.pending.forms.filter((f) => f.sessionID === session.id);
  const running = session.status === "running";
  const runningTools = running ? [...session.tools.values()].filter((t) => t.status === "running") : [];
  const openStep = running ? session.steps.find((x) => !x.endedAt) : null;
  const stalled = runningTools.filter((t) => now() - t.lastProgressAt > 20000);

  if (perms.length) {
    return {
      level: "blocked",
      headline: "Waiting for your approval",
      reasons: perms.map((p) => `${p.action ?? "permission"}: ${(p.resources ?? []).slice(0, 3).join(", ") || "(no resource list)"}${p.message ? ` — ${p.message}` : ""}`),
    };
  }
  if (forms.length) {
    return { level: "blocked", headline: "Waiting for your answer", reasons: forms.map((f) => f.title || f.id) };
  }
  if (stalled.length) {
    return {
      level: "blocked",
      headline: `Tool stalled: ${stalled[0].name}`,
      reasons: [`${stalled[0].name} has produced no progress event for ${Math.round((now() - stalled[0].startedAt) / 1000)}s`, stalled[0].inputText ? `params: ${stalled[0].inputText.slice(0, 140)}` : null].filter(Boolean),
    };
  }
  if (session.status === "error") {
    return { level: "error", headline: "This step failed", reasons: [session.note ?? "unknown error"] };
  }
  if (session.status === "interrupted") {
    return { level: "blocked", headline: "Interrupted", reasons: ["you or the client interrupted this run"] };
  }
  if (live.queued > 0) {
    return { level: "blocked", headline: "Waiting for GPU: request queued", reasons: [`Strata queue has ${live.queued} request(s) (only 1 slot — parallel calls queue serially)`, live.phase ? `current phase: ${live.phase}` : null].filter(Boolean) };
  }
  if (session.compaction?.status === "running") {
    return { level: "blocked", headline: "Compacting context", reasons: [`${session.compaction.chars} characters of summary generated so far`] };
  }
  if (session.retry) {
    return { level: "blocked", headline: "Provider retrying", reasons: [`retry attempt ${session.retry.attempt}${session.retry.error ? `: ${session.retry.error}` : ""}`] };
  }
  if (runningTools.length) {
    const t = runningTools[0];
    const secs = Math.round((now() - (t.calledAt ?? t.startedAt)) / 1000);
    return { level: "running", headline: `Running tool: ${t.name}`, reasons: [`running for ${secs}s`, t.metadata?.shellID ? "background shell running" : null, live.state === "generating" ? `GPU generating ${live.generated ?? 0} tokens` : null].filter(Boolean) };
  }
  if (session.status === "running" || openStep) {
    return { level: "running", headline: "Generating", reasons: [live.state === "prefill" ? `GPU prefill: read ${live.prompt_read ?? 0}/${live.prompt_total ?? 0} tokens` : `GPU ${live.state ?? "idle"}, ${live.tok_s ? `${Math.round(live.tok_s)} tok/s` : "no generation"}`, openStep ? `step ${openStep.index}` : null].filter(Boolean) };
  }
  return { level: "idle", headline: "Idle, waiting for input", reasons: session.outcome ? [`last outcome: ${session.outcome}`] : [] };
}

export function diagnose(store, session) {
  const zh = diagnoseZh(store, session);
  const en = diagnoseEn(store, session);
  // attention（"approval"/"question"/undefined）与 key（诊断类别）随 zh 分支带出，供前端闪烁通知与历史带翻译
  return { ...zh, headlineEn: en.headline, reasonsEn: en.reasons };
}

// 会话时间去向的近似归属：生成（started→streamed）、工具（streamed→ended）、等你（已解决挂起请求）。
// steps 被 STEP_BUFFER 裁剪，只统计保留下来的 step，标注为近似值。
function sessionTime(store, s) {
  let gen = 0, tools = 0;
  for (const st of s.steps) {
    if (st.startedAt && st.streamedAt) gen += st.streamedAt - st.startedAt;
    if (st.streamedAt && st.endedAt) tools += st.endedAt - st.streamedAt;
  }
  let wait = 0;
  for (const h of store.pendingHistory) if (h.sessionID === s.id) wait += h.endedAt - h.startedAt;
  const t0 = s.startedAt ?? s.steps[0]?.startedAt ?? null;
  const wall = t0 ? (s.idleAt ?? s.lastEventAt ?? now()) - t0 : 0;
  return { gen, tools, wait, wall };
}

export function snapshot(store) {
  const sessions = [...store.sessions.values()]
    .sort((a, b) => (b.status === "running" ? 1 : 0) - (a.status === "running" ? 1 : 0) || b.updatedAt - a.updatedAt)
    .slice(0, 24)
    .map((s) => {
      const diag = diagnose(store, s);
      // 诊断迁移记录：状态 key 变化时追加，供底部历史带
      if (s.lastDiagKey !== diag.key) {
        s.lastDiagKey = diag.key;
        s.diagHistory.push({ key: diag.key, at: now() });
        if (s.diagHistory.length > 40) s.diagHistory.splice(0, s.diagHistory.length - 40);
      }
      return {
      id: s.id,
      parentID: s.parentID,
      projectID: s.projectID,
      title: s.title,
      agent: s.agent,
      model: s.model,
      directory: s.directory,
      status: s.status,
      outcome: s.outcome,
      startedAt: s.startedAt,
      idleAt: s.idleAt,
      lastEventAt: s.lastEventAt,
      updatedAt: s.updatedAt,
      tokens: s.tokens,
      cost: s.cost,
      compaction: s.compaction,
      retry: s.retry,
      note: s.note,
      steps: s.steps.slice(-STEP_BUFFER).map((step) => ({
        index: step.index,
        messageID: step.messageID,
        startedAt: step.startedAt,
        streamedAt: step.streamedAt,
        endedAt: step.endedAt,
        finish: step.finish,
        tokens: step.tokens,
        cost: step.cost,
        agent: step.agent,
        model: step.model,
        reasoning: step.reasoning,
        gpu: step.gpu,
        tools: step.tools.map((t) => ({
          id: t.id,
          name: t.name,
          status: t.status,
          startedAt: t.startedAt,
          calledAt: t.calledAt,
          endedAt: t.endedAt,
          inputText: t.inputText.slice(0, 400),
          metadata: t.metadata,
          exit: t.exit,
          error: t.error,
          preview: t.preview.slice(0, 500),
          lastProgressAt: t.lastProgressAt,
        })),
      })),
      diagnosis: diag,
      diagHistory: s.diagHistory,
      time: sessionTime(store, s),
      };
    });

  return {
    server: {
      url: store.server.url,
      reachable: store.server.reachable,
      reconnecting: store.server.reconnecting,
      version: store.server.version,
      pid: store.server.pid,
      lastError: store.server.lastError,
      lastProbeAt: store.server.lastProbeAt,
    },
    strata: {
      url: store.strata.url,
      alive: store.strata.alive,
      engine: store.strata.engine,
      live: store.strata.live,
      hardware: store.strata.hardware,
      hardwareStatic: store.strata.hardwareStatic,
      history: store.strata.history ? { gpu_util: store.strata.history.gpu_util?.slice(-70) ?? [], gpu_mem_used: store.strata.history.gpu_mem_used?.slice(-70) ?? [] } : null,
      totals: store.strata.totals,
      cache: store.strata.cache,
      slots: store.strata.slots,
      status: store.strata.status,
      health: store.strata.health,
      lastError: store.strata.lastError,
      samples: store.strata.samples.slice(-120),
      requests: store.strata.requests.slice(0, 12).map((r) => ({ id: r.id, time: r.time, duration_s: r.duration_s, finish: r.finish, prompt_tokens: r.prompt_tokens, reused: r.reused, hit_rate: r.hit_rate, decode_tok_s: r.decode_tok_s, drafts_offered: r.drafts_offered, drafts_accepted: r.drafts_accepted })),
    },
    pending: store.pending,
    sessions,
    events: store.events.slice(-120),
    stats: store.stats,
    updatedAt: store.updatedAt,
  };
}
