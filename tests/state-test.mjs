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
