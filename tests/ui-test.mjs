// UI 冒烟测试：真实快照跑一遍基础渲染，再用固定 fixture 验证布局/折行/悬停详情
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const ROOT = "/home/feifei/develop/opencode/opencode-monitor";

function load() {
  const dom = new JSDOM(readFileSync(`${ROOT}/public/index.html`, "utf8"), { url: "http://127.0.0.1:7788/", runScripts: "outside-only" });
  let snapHandler = null;
  dom.window.EventSource = class {
    addEventListener(name, fn) {
      if (name === "snap") snapHandler = fn;
    }
  };
  dom.window.eval(readFileSync(`${ROOT}/public/app.js`, "utf8"));
  dom.window.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  return { dom, feed: (data) => snapHandler({ data: JSON.stringify(data) }) };
}

// ---- 真实快照：基础渲染与降级 ----
const live = await (await fetch("http://127.0.0.1:7788/api/snap")).json();
const { dom, feed } = load();
feed(live);
const doc = dom.window.document;
console.log("live sessions rows:", doc.querySelectorAll("#sessions .row").length);
console.log("live headline:", doc.getElementById("diag-headline").textContent);
console.log("live svg:", doc.querySelector("#pipeline svg").getAttribute("width"), "x", doc.querySelector("#pipeline svg").getAttribute("height"));
console.log("gpu text ok:", doc.getElementById("gpu").textContent.includes("GPU"));
const dead = { ...live, strata: { ...live.strata, alive: false, lastError: "未启动" } };
feed(dead);
console.log("gpu offline banner:", doc.getElementById("banner").textContent.slice(0, 60));

// ---- 固定 fixture：不依赖实时事件，验证竖版布局 / 折行 / 悬停详情 ----
const now = Date.now();
const FIXTURE = {
  server: { url: "http://127.0.0.1:49374", reachable: true, reconnecting: false, version: "2.1.2", pid: 52486, lastError: null, lastProbeAt: now },
  strata: {
    url: "http://127.0.0.1:8080",
    alive: true,
    engine: { kv: "q8_4", max_context: 262144, prefill_cap: 8192 },
    live: { state: "generating", queued: 2, phase: "decode", tok_s: 74 },
    hardware: { gpu_util: 62, gpu_mem_used: 8 * 2 ** 30, gpu_mem_total: 12 * 2 ** 30, gpu_temp: 58, gpu_power: 130 },
    hardwareStatic: null,
    history: { gpu_util: [10, 45, 70, 35, 60] },
    totals: { requests: 12, prompt_tokens: 120000, reused: 90000, output_tokens: 3000 },
    cache: null,
    slots: [],
    status: { prompt_tokens: 12000 },
    health: { model: "qwen-coder" },
    lastError: null,
    requests: [{ id: 1, time: now / 1000, duration_s: 3.5, finish: "tool-calls", prompt_tokens: 1200, reused: 900, hit_rate: 0.75, decode_tok_s: 74, drafts_offered: 10, drafts_accepted: 6 }],
  },
  pending: {
    permissions: [{ id: "p1", sessionID: "s1", action: "edit", resources: ["src/state.js", "public/app.js"], message: "改两个文件" }],
    forms: [],
    shells: [{ id: "sh1", status: "running", command: "npm test", exit: null }],
  },
  events: [
    { type: "session.step.started", at: now - 18000, sessionID: "s1", summary: "build" },
    { type: "session.tool.called", at: now - 12000, sessionID: "s1", summary: "shell" },
    { type: "session.tool.progress", at: now - 6000, sessionID: "s1", summary: "shell" },
  ],
  stats: null,
  updatedAt: now,
  sessions: [
    {
      id: "s1",
      parentID: null,
      title: "这是一条很长的会话标题用来测试用户输入节点的折行是否会把文字冲出框框",
      agent: "build",
      model: { id: "qwen-coder", providerID: "llamacpp", variant: "medium" },
      directory: "/home/feifei/develop/opencode/opencode-monitor",
      status: "running",
      outcome: null,
      startedAt: now - 20000,
      idleAt: null,
      lastEventAt: now,
      updatedAt: now,
      tokens: { input: 12000, output: 800, reasoning: 40, cache: { read: 90000, write: 0 } },
      cost: 0,
      compaction: { status: "running", startedAt: now - 3000, endedAt: null, chars: 1200 },
      retry: null,
      note: null,
      steps: [
        {
          index: 1,
          messageID: "m1",
          startedAt: now - 18000,
          streamedAt: now - 16000,
          endedAt: now - 14000,
          finish: "tool-calls",
          tokens: { input: 1200, output: 300, reasoning: 60, cache: { read: 9000, write: 0 } },
          cost: 0,
          agent: "build",
          model: { id: "qwen-coder", providerID: "llamacpp" },
          reasoning: {
            startedAt: now - 17000,
            endedAt: now - 15000,
            chars: 320,
            preview: "需要先看看目录结构，然后决定改哪几个文件。这里是一段刻意写长的思考文字，用来验证折行行为：它应该按节点内宽折成若干行而不是冲出节点矩形框，超出的部分用省略号收尾。",
          },
          gpu: { approx: true, promptMs: 900, decodeMs: 2600, decodeTokS: 74, promptTokens: 1200, reused: 900, hitRate: 0.75, drafts: 0.6, finish: "tool-calls" },
          tools: [
            {
              id: "c1",
              name: "read",
              status: "done",
              startedAt: now - 16000,
              calledAt: now - 15800,
              endedAt: now - 15200,
              inputText: '{"path":"src/state.js","limit":200}',
              metadata: { status: "completed" },
              exit: 0,
              error: null,
              preview: "export const EVENT_BUFFER = 180;\n// 事件 → 状态机",
              lastProgressAt: now - 15200,
            },
            {
              id: "c2",
              name: "shell",
              status: "running",
              startedAt: now - 12000,
              calledAt: now - 11800,
              endedAt: null,
              inputText: '{"command":"npm test && node tests/ui-test.mjs","timeout":90000,"workdir":"/home/feifei/develop/opencode/opencode-monitor"}',
              metadata: null,
              exit: null,
              error: null,
              preview: "",
              lastProgressAt: now - 6000,
            },
          ],
        },
        {
          index: 2,
          messageID: "m2",
          startedAt: now - 10000,
          streamedAt: now - 8000,
          endedAt: null,
          finish: null,
          tokens: null,
          cost: 0,
          agent: "build",
          model: { id: "qwen-coder", providerID: "llamacpp" },
          reasoning: null,
          gpu: null,
          tools: [],
        },
      ],
      diagnosis: { level: "blocked", headline: "在等你批准权限", reasons: ["edit：src/state.js, public/app.js — 改两个文件"] },
    },
    {
      id: "s2",
      parentID: "s1",
      title: "子 agent：explore",
      agent: "explore",
      model: { id: "qwen-coder", providerID: "llamacpp" },
      directory: "/home/feifei/develop/opencode/opencode-monitor",
      status: "idle",
      outcome: "succeeded",
      startedAt: null,
      idleAt: now - 1000,
      lastEventAt: now - 1000,
      updatedAt: now - 1000,
      tokens: null,
      cost: 0,
      compaction: null,
      retry: null,
      note: null,
      steps: [],
      diagnosis: { level: "idle", headline: "空闲，等你输入", reasons: ["上一次结果：succeeded"] },
    },
  ],
};

const fx = load();
const fbox = fx.dom.window.document.getElementById("pipeline");
Object.defineProperty(fbox, "clientHeight", { value: 400, configurable: true });
fx.feed(FIXTURE);
const fdoc = fx.dom.window.document;
const svg = fdoc.querySelector("#pipeline svg");
const rects = [...svg.querySelectorAll("g.node rect")].map((r) => ({ x: +r.getAttribute("x"), y: +r.getAttribute("y"), w: +r.getAttribute("width"), h: +r.getAttribute("height") }));
const stepRects = rects.filter((r) => r.x === 0).sort((a, b) => a.y - b.y);
const chipRects = rects.filter((r) => r.x > 0);
console.log("fixture svg:", svg.getAttribute("width"), "x", svg.getAttribute("height"), "| nodes:", svg.querySelectorAll("g.node").length, "| edges:", svg.querySelectorAll("path.edge").length);
console.log("steps stacked top-down:", stepRects.every((r, i) => i === 0 || r.y > stepRects[i - 1].y));
console.log("chips on right column:", chipRects.every((r) => r.x === 334), "| chips:", chipRects.length);
const lastStep = stepRects.at(-1);
const svgH = +svg.getAttribute("height");
const expectTop = Math.max(0, Math.min(lastStep.y + lastStep.h / 2 - 200, Math.max(0, svgH - 400)));
console.log("当前 step 垂直居中:", fbox.scrollTop === expectTop, "| scrollTop:", fbox.scrollTop, "期望:", expectTop);

// 溢出守卫：每行 tspan 的估算宽度必须落在节点矩形内
const isWide = (ch) => /[\u2E80-\u9FFF\uFF01-\uFF60\u3000-\u303F\u{1F300}-\u{1F6FF}]/u.test(ch);
const tw = (s, fs) => Array.from(s).reduce((w, ch) => w + (isWide(ch) ? fs : fs * 0.58), 0);
const FS = { "t-title": 13, "t-sub": 11.5, "t-gpu": 11.5 };
let overflow = 0;
for (const g of svg.querySelectorAll("g.node")) {
  const rect = g.querySelector("rect");
  const rx = +rect.getAttribute("x");
  const rw = +rect.getAttribute("width");
  for (const t of g.querySelectorAll("text")) {
    const fs = FS[t.getAttribute("class")] ?? 11.5;
    for (const ts of t.querySelectorAll("tspan")) {
      const x = +ts.getAttribute("x");
      if (tw(ts.textContent, fs) > rw - (x - rx) - 8) overflow++;
    }
  }
}
console.log("text overflow lines:", overflow);
console.log("长文本被折行成多行:", svg.querySelectorAll("g.node text tspan").length > svg.querySelectorAll("g.node text").length);

// 悬停详情 + 钉住
const stepG = [...svg.querySelectorAll("g.node")].find((g) => (g.getAttribute("data-key") ?? "").startsWith("step:"));
const chipG = [...svg.querySelectorAll("g.node")].find((g) => g.getAttribute("data-key") === "chip:c2");
const tip = fdoc.getElementById("tip");
const mm = (x, y) => new fx.dom.window.MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y });
stepG.dispatchEvent(mm(50, 50));
console.log("step tip 可见:", !tip.classList.contains("hidden"));
console.log("step tip 含 Step#/tokens/工具/GPU:", tip.innerHTML.includes("Step #1") && tip.innerHTML.includes("tokens") && tip.innerHTML.includes("工具") && tip.innerHTML.includes("GPU"));
console.log("step tip 含思考全文:", tip.innerHTML.includes("刻意写长的思考文字"));
chipG.dispatchEvent(mm(120, 80));
console.log("chip tip 含状态/参数/错误行:", tip.innerHTML.includes("状态") && tip.innerHTML.includes("参数全文") && tip.innerHTML.includes("npm test"));
const card0 = tip.querySelector(".tip-card");
const pre0 = tip.querySelector(".tip-pre");
card0.scrollTop = 120;
pre0.scrollTop = 45;
fx.feed(FIXTURE); // 数据刷新重写内容，外圈和内圈 pre 的滚动位置都必须保留
console.log("刷新后外圈滚动保留:", tip.querySelector(".tip-card").scrollTop === 120);
console.log("刷新后内圈 pre 滚动保留:", tip.querySelector(".tip-pre")?.scrollTop === 45);

// 鼠标进入浮层后内容冻结：实时刷新不再重写内容，拖选不会被打断
let mutations = 0;
const mo = new fx.dom.window.MutationObserver(() => mutations++);
mo.observe(tip, { childList: true, subtree: true });
tip.dispatchEvent(new fx.dom.window.MouseEvent("mouseenter", { bubbles: false }));
fx.feed(FIXTURE);
await new Promise((r) => setTimeout(r, 0));
console.log("浮层内冻结不重写:", mutations === 0);
tip.dispatchEvent(new fx.dom.window.MouseEvent("mouseleave", { bubbles: false }));
fx.feed(FIXTURE);
await new Promise((r) => setTimeout(r, 0));
console.log("离开后恢复刷新:", mutations > 0);
mo.disconnect();

// 每个内容块带复制按钮，一键复制该块全文
let copied = "";
Object.defineProperty(fx.dom.window.navigator, "clipboard", { value: { writeText: async (s) => { copied = s; } }, configurable: true });
const copyBtn = tip.querySelector("button.tip-copy");
console.log("块有复制按钮:", !!copyBtn);
copyBtn?.dispatchEvent(new fx.dom.window.MouseEvent("click", { bubbles: true }));
await new Promise((r) => setTimeout(r, 50));
console.log("复制按钮写入剪贴板:", copied.includes("npm test"));
// 鼠标移进浮层：浮层应留在原地不消失
fdoc.getElementById("pipeline").dispatchEvent(new fx.dom.window.MouseEvent("mouseleave", { bubbles: true }));
tip.dispatchEvent(new fx.dom.window.MouseEvent("mouseenter", { bubbles: false }));
await new Promise((r) => setTimeout(r, 400));
console.log("鼠标移入浮层后不消失:", !tip.classList.contains("hidden"));
tip.dispatchEvent(new fx.dom.window.MouseEvent("mouseleave", { bubbles: false }));
await new Promise((r) => setTimeout(r, 400));
console.log("离开浮层后关闭:", tip.classList.contains("hidden"));
chipG.dispatchEvent(new fx.dom.window.MouseEvent("click", { bubbles: true, clientX: 120, clientY: 80 }));
console.log("tip pinned:", tip.classList.contains("pinned"));
stepG.dispatchEvent(mm(50, 50));
console.log("钉住后不被其它节点顶掉:", tip.classList.contains("pinned") && tip.innerHTML.includes("参数全文"));
fdoc.getElementById("pipeline").dispatchEvent(new fx.dom.window.MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }));
console.log("空白处点击后关闭:", tip.classList.contains("hidden"));

// 节点复用不翻倍 + 切换会话不抛错
const before = svg.querySelectorAll("g.node").length;
fx.feed(FIXTURE);
console.log("re-render stable:", fdoc.querySelectorAll("#pipeline g.node").length === before);
fdoc.querySelector('#sessions .row[data-id="s2"]')?.dispatchEvent(new fx.dom.window.Event("click"));
console.log("empty session svg:", fdoc.querySelector("#pipeline svg").getAttribute("width"), "| 诊断:", fdoc.getElementById("diag-headline").textContent);
