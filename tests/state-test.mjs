// 状态机与诊断逻辑测试（纯内存，不碰 opencode）
import { createStore, applyEvent, setPending, setStrata, diagnose, snapshot } from "../src/state.js";

const store = createStore();
const sid = "ses_test";
const msg = "msg_1";

const ev = (type, data) => applyEvent(store, { type, data: { sessionID: sid, assistantMessageID: msg, ...data } });

ev("session.execution.started", { started: Date.now() });
ev("session.step.started", { agent: "build", model: { id: "qwen-coder", providerID: "llamacpp" }, started: Date.now() });
ev("session.reasoning.started", {});
ev("session.reasoning.delta", { delta: "先看看目录结构" });
ev("session.reasoning.ended", { text: "先看看目录结构" });
ev("session.tool.input.started", { id: "c1", name: "read" });
ev("session.tool.input.ended", { id: "c1", text: '{"path":"a"}' });
ev("session.tool.called", { id: "c1", input: { path: "a" }, executed: true });
ev("session.tool.success", { id: "c1", content: [{ type: "text", text: "ok" }], metadata: { status: "completed" } });
ev("session.tool.input.started", { id: "c2", name: "shell" });
ev("session.tool.called", { id: "c2", input: { command: "sleep 30" }, executed: true });
ev("session.step.ended", { finish: "tool-calls", tokens: { input: 100, output: 20, cache: { read: 50 } }, cost: 0 });
ev("session.usage.updated", { cost: 0, tokens: { input: 900, output: 120, cache: { read: 4000 } } });

let s = store.sessions.get(sid);
store.sessions.get(sid).tools.get("c2").lastProgressAt = Date.now() - 30000;
console.log("steps:", s.steps.length, "| tools:", [...s.tools.values()].map((t) => `${t.name}:${t.status}`).join(","));
console.log("stalled tool detected:", diagnose(store, s).headline.includes("工具卡住"));

// 权限挂起优先于一切
setPending(store, { permissions: [{ id: "p1", sessionID: sid, action: "edit", resources: ["src/a.ts"] }], forms: [], shells: [] });
console.log("permission wins:", diagnose(store, s).headline === "在等你批准权限" && diagnose(store, s).attention === "approval");
console.log("reason:", diagnose(store, s).reasons[0]);

setPending(store, { permissions: [], forms: [{ id: "f1", sessionID: sid, title: "选样式" }], shells: [] });
console.log("form wins:", diagnose(store, s).headline === "在等你回答问题" && diagnose(store, s).attention === "question");

// GPU 排队
setPending(store, { permissions: [], forms: [], shells: [] });
store.sessions.get(sid).tools.get("c2").lastProgressAt = Date.now();
setStrata(store, { alive: true, live: { state: "idle", queued: 2, phase: "tool call complete" }, requests: [] });
console.log("gpu queue wins:", diagnose(store, s).headline === "在等 GPU：请求排队中");

// 空闲
setStrata(store, { alive: true, live: { state: "idle", queued: 0 }, requests: [] });
applyEvent(store, { type: "session.execution.succeeded", data: { sessionID: sid } });
console.log("idle:", diagnose(store, s).headline === "空闲，等你输入" && diagnose(store, s).attention === undefined);

// 子 agent 树
applyEvent(store, { type: "session.created", data: { sessionID: "ses_child", info: { id: "ses_child", parentID: sid, title: "explore", agent: "explore" } } });
const snap = snapshot(store);
const child = snap.sessions.find((x) => x.id === "ses_child");
console.log("child linked:", child?.parentID === sid);
console.log("password leaked in snapshot:", JSON.stringify(snap).includes("password"));

// STEP_BUFFER 裁剪后：编号仍然单调递增（不会出现一串重复的 #31）
const store2 = createStore();
applyEvent(store2, { type: "session.created", data: { sessionID: "ses_buf", info: { id: "ses_buf", title: "buffer test" } } });
for (let i = 1; i <= 35; i++) {
  applyEvent(store2, { type: "session.step.started", data: { sessionID: "ses_buf", assistantMessageID: `m${i}`, started: Date.now() - (35 - i) * 1000 } });
  applyEvent(store2, { type: "session.step.ended", data: { sessionID: "ses_buf", assistantMessageID: `m${i}`, finish: "tool-calls", tokens: null, cost: 0 } });
}
// 已被裁掉的 step 的迟到事件不得创建幽灵 step
applyEvent(store2, { type: "session.tool.input.started", data: { sessionID: "ses_buf", id: "t-old", assistantMessageID: "m1", name: "read" } });
applyEvent(store2, { type: "session.step.ended", data: { sessionID: "ses_buf", assistantMessageID: "m2", finish: "stop", tokens: null, cost: 0 } });
const buf = snapshot(store2).sessions.find((x) => x.id === "ses_buf");
console.log("buffer keeps last 30:", buf.steps.length === 30);
console.log("step numbering monotonic after trimming:", buf.steps[0].index === 6 && buf.steps.at(-1).index === 35 && new Set(buf.steps.map((x) => x.index)).size === 30);
console.log("late events for trimmed steps create no ghosts:", buf.steps.every((x) => x.messageID.startsWith("m") && Number(x.messageID.slice(1)) >= 6));

// 诊断类别 key、迁移历史、等待时长归属、Strata 采样
const store3 = createStore();
applyEvent(store3, { type: "session.created", data: { sessionID: "ses_diag", info: { id: "ses_diag", title: "diag" } } });
applyEvent(store3, { type: "session.execution.started", data: { sessionID: "ses_diag", started: Date.now() - 5000 } });
applyEvent(store3, { type: "session.step.started", data: { sessionID: "ses_diag", assistantMessageID: "mx" } });
console.log("gen key:", diagnose(store3, store3.sessions.get("ses_diag")).key === "gen");
applyEvent(store3, { type: "permission.asked", data: { sessionID: "ses_diag", id: "p1", action: "edit" } });
snapshot(store3); // 审批在场时快照 → 历史带记一次迁移
applyEvent(store3, { type: "permission.replied", data: { sessionID: "ses_diag", id: "p1" } });
// setPending 轮询对账：列表里消失的条目也记为已解决
setPending(store3, { permissions: [{ id: "p2", sessionID: "ses_diag", action: "bash" }], forms: [], shells: [] });
snapshot(store3);
setPending(store3, { permissions: [], forms: [], shells: [] });
const diagS = snapshot(store3).sessions.find((x) => x.id === "ses_diag");
console.log("approval resolved via event + poll both recorded:", store3.pendingHistory.length === 2 && store3.pendingHistory.every((h) => h.kind === "permission"));
console.log("diagHistory captures transitions:", diagS.diagHistory.map((h) => h.key).join(",") === "approval,gen");
console.log("time bucket has wait/wall:", diagS.time.wait >= 0 && diagS.time.wall > 0);
setStrata(store3, { alive: true, live: { tok_s: 42, queued: 2 }, requests: [{ hit_rate: 0.8 }] });
setStrata(store3, { alive: true, live: { tok_s: 30, queued: 0 }, requests: [] });
const strataSnap = snapshot(store3).strata;
console.log("strata samples for trends:", strataSnap.samples.length === 2 && strataSnap.samples[0].tok_s === 42 && strataSnap.samples[1].queued === 0);
