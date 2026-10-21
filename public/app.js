// 前端：只渲染快照，所有数据来自本地 server（只读）

const $ = (id) => document.getElementById(id);
const SVGNS = "http://www.w3.org/2000/svg";

// 竖版流程图：step 自上而下排，工具在 step 右侧横向扇出
const STEP_W = 280;
const CHIP_W = 270;
const CHIP_X = STEP_W + 54;
const CHIP_GAP = 12;
const ROW_GAP = 26;
const CHIPS_TOP = 14;

const PAD = 14;
const TITLE_FS = 13;
const SUB_FS = 11.5;
const LH = 17; // step 行高
const LH_CH = 15; // 工具节点行高

// 双语 UI：默认英文（localStorage 记住选择，头部按钮切换）。
// 中文是唯一事实来源；en 模式下渲染时按整句精确匹配翻译成英文。
const TE = {
  // 静态标签（index.html data-i18n 的英文规范值经 TD 反向映射回中文）
  "opencode 运行监控": "opencode live monitor",
  "会话树": "Sessions",
  "执行流程图（自上而下）": "Execution flow (top-down)",
  "时间轴": "Timeline",
  "等待中": "Waiting",
  "事件流": "Event stream",
  "Strata GPU": "Strata GPU",
  "过滤事件类型…": "filter event types…",
  "等待数据…": "Waiting for data…",
  // 流程图节点文本
  "用户输入": "User input",
  "进行中": "running",
  "生成中": "generating",
  "缓存读": "cache read",
  "缓存写": "cache write",
  "思考": "thinking",
  "字": "chars",
  "等参数": "waiting for params",
  "后台 shell 在跑": "background shell running",
  "（无参数）": "(no params)",
  "上下文压缩": "Context compaction",
  "压缩中": "Compacting",
  "失败": "failed",
  "完成": "done",
  "已完成": "done",
  "KV 命中": "KV hit",
  "KV 复用": "KV reuse",
  "命中": "cache hit",
  "草稿接受": "draft accept",
  "运行中": "running",
  "会话": "sessions",
  "生成": "output",
  // 浮层字段
  "状态": "Status",
  "时间": "Time",
  "tokens": "tokens",
  "输入": "in",
  "输出": "out",
  "推理": "think",
  "结束原因": "Finish reason",
  "还没结束": "still running",
  "工具": "tools",
  "没有工具调用": "no tool calls",
  "agent / model": "agent / model",
  "GPU": "GPU",
  "思考全文": "Full thinking",
  "参数全文": "Full parameters",
  "参数": "Parameters",
  "没捕获到参数文本（错过 input.started）": "no parameter text captured (missed input.started)",
  "输出预览": "Output preview",
  "错误": "Error",
  "进度 metadata": "Progress metadata",
  "调用": "Call",
  "已执行": "executed",
  "未执行（被拦/取消）": "not executed (blocked or cancelled)",
  "会话标题": "Session title",
  "会话 id": "Session id",
  "父会话": "Parent session",
  "目录": "Directory",
  "诊断": "Diagnosis",
  "步数": "Steps",
  "摘要长度": "Summary length",
  "GPU（按时间戳近似挂到这一步）": "GPU (matched to this step by timestamp, approximate)",
  "没按时间戳关联到 Strata 请求": "no Strata request matched by timestamp",
  "鼠标可直接移进浮层滚动、选文字；单击可钉住，再点空白处关闭": "Move the mouse into the card to scroll or select text; click to pin, click empty space to close",
  "复制": "Copy",
  "复制全部": "Copy all",
  "已复制 ✓": "Copied ✓",
  // 头部/横幅/诊断
  "模型": "Model",
  "上下文": "context",
  "排队": "queued",
  "未发现服务": "no service discovered",
  "opencode 服务未连通": "opencode server not reachable",
  "正在重新发现端口": "rediscovering the port",
  "Strata 指标不可用": "Strata metrics unavailable",
  "未启动": "not started",
  "Strata 未连通": "Strata not connected",
  "没有会话": "No sessions",
  "空闲": "Idle",
  "离线": "offline",
  // GPU 面板
  "显存": "VRAM",
  "温度": "temperature",
  "功率": "power",
  "缓存命中": "cache hit",
  "prefill 上限": "prefill cap",
  "总请求": "total requests",
  "复用": "reuse",
  "只有 1 个推理 slot：并行工具调用与 subagent 会在 GPU 上串行排队": "Only 1 inference slot: parallel tool calls and subagents queue serially on the GPU",
  // 等待面板
  "权限待批": "Permission pending",
  "等你回答": "Waiting for your answer",
  "没有挂起的请求": "Nothing pending.",
  // 回放
  "回放": "Replay",
  "回放中…": "Replaying…",
};
const TD = Object.fromEntries(Object.entries(TE).map(([k, v]) => [v, k]));

let lang = "en";
try {
  lang = localStorage.getItem("oc-monitor-lang") || "en";
} catch {}
const tr = (s) => (lang === "en" ? (TE[s] ?? s) : (TD[s] ?? s));
const sep = () => (lang === "zh" ? "：" : ": ");

// 主题：月亮（深色，默认）/ 太阳（浅色）；头部按钮切换，选择记在 localStorage；URL ?theme=light|dark 可强制（截图用）
let theme = "dark";
try {
  const tp = new URLSearchParams(location.search).get("theme");
  theme = tp === "light" || tp === "dark" ? tp : localStorage.getItem("oc-monitor-theme") || "dark";
} catch {}
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  $("theme-toggle").textContent = theme === "dark" ? "☀" : "☾";
}
function toggleTheme() {
  theme = theme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem("oc-monitor-theme", theme);
  } catch {}
  applyTheme();
}

function applyI18n() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const en = el.getAttribute("data-i18n");
    el.textContent = lang === "zh" ? (TD[en] ?? en) : en;
  });
  $("log-filter").placeholder = lang === "zh" ? (TD["filter event types…"] ?? "filter event types…") : "filter event types…";
  $("lang-toggle").textContent = lang === "en" ? "文" : "A";
}

function toggleLang() {
  lang = lang === "en" ? "zh" : "en";
  try {
    localStorage.setItem("oc-monitor-lang", lang);
  } catch {}
  applyI18n();
  render();
}

// 会话回放：已完成的会话按顺序逐节点重现，每 300ms 放出下一步
let replay = null;
let replayTimer = null;
function toggleReplay() {
  if (replay) {
    stopReplay();
    return;
  }
  replay = { revealed: 0 };
  replayTimer = setInterval(() => {
    replay.revealed += 1;
    if (replay.revealed >= (cur()?.steps?.length ?? 0)) stopReplay();
    else render();
  }, 300);
  render();
}
function stopReplay() {
  if (replayTimer) clearInterval(replayTimer);
  replayTimer = null;
  replay = null;
  render();
}

// 卡住提醒：等你批准/回答时标签页标题闪烁，并尝试浏览器通知（只提醒一次每个 会话+原因 组合）
let alertTimer = null;
let alertKey = null;
function updateAlert(s, d) {
  const att = d?.attention ?? null;
  const headline = lang === "zh" ? d?.headline : d?.headlineEn ?? (d ? tr(d.headline) : "");
  if (!att) {
    if (alertTimer) {
      clearInterval(alertTimer);
      alertTimer = null;
    }
    alertKey = null;
    document.title = tr("opencode 运行监控");
    return;
  }
  if (!alertTimer) {
    let flash = false;
    alertTimer = setInterval(() => {
      flash = !flash;
      document.title = flash ? `⚠ ${headline}` : tr("opencode 运行监控");
    }, 900);
  }
  const key = `${s.id}:${att}`;
  if (key !== alertKey) {
    alertKey = key;
    if (typeof Notification !== "undefined") {
      if (Notification.permission === "granted") new Notification(headline, { body: (d.reasons ?? [])[0] ?? "" });
      else if (Notification.permission === "default") Notification.requestPermission();
    }
  }
}

let snap = null;
let selected = null;
let logFilter = "";
const nodeEls = new Map();
const edgeEls = new Map();
let lastAutoTop = null; // 上次自动居中的滚动位置
let manualScrollUntil = 0; // 用户手动滚动后 8s 内不再自动跟随

let inited = false;
addEventListener("DOMContentLoaded", () => {
  if (inited) return; // jsdom/重复事件下防止监听器重复注册
  inited = true;
  const es = new EventSource("/api/stream");
  es.addEventListener("snap", (e) => {
    snap = JSON.parse(e.data);
    pickSession();
    render();
  });
  $("log-filter").addEventListener("input", (ev) => {
    logFilter = ev.target.value.toLowerCase();
    renderLog();
  });
  initHover();
  applyI18n();
  applyTheme();
  $("theme-toggle").addEventListener("click", toggleTheme);
  $("lang-toggle").addEventListener("click", toggleLang);
  $("replay-btn").addEventListener("click", toggleReplay);
  // 快捷键：T 切主题、L 切语言、1-9 选会话、Esc 关浮层（输入框里不拦截）
  addEventListener("keydown", (ev) => {
    if (ev.target?.tagName === "INPUT" || ev.target?.tagName === "TEXTAREA") return;
    if (ev.key === "t") toggleTheme();
    else if (ev.key === "l") toggleLang();
    else if (ev.key === "Escape") {
      tipPinned = null;
      $("tip").classList.add("hidden");
    } else if (/^[1-9]$/.test(ev.key)) {
      const s = snap?.sessions[Number(ev.key) - 1];
      if (s) {
        stopReplay();
        selected = s.id;
        render();
      }
    }
  });
});

function pickSession() {
  if (!snap) return;
  if (selected && snap.sessions.some((s) => s.id === selected)) return;
  const running = snap.sessions.find((s) => s.status === "running");
  selected = running?.id ?? snap.sessions[0]?.id ?? null;
}

const cur = () => snap?.sessions.find((s) => s.id === selected) ?? null;

function fmtDur(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}
function fmtTok(n) {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}
function ago(t) {
  if (!t) return "—";
  const s = Math.round((Date.now() - t) / 1000);
  const suffix = lang === "zh" ? "前" : "ago";
  if (s < 60) return `${s}s ${suffix}`;
  if (s < 3600) return `${Math.round(s / 60)}m ${suffix}`;
  return `${Math.round(s / 3600)}h ${suffix}`;
}
function clock(t) {
  return new Date(t).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", { hour12: false });
}
function trunc(s, n) {
  const one = (s ?? "").replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
}

// ---- 悬停详情浮层 ----

const details = new Map(); // 节点 key → 完整详情 HTML
let tipPinned = null;
let tipKey = null;
let hideTimer = null;
let tipHover = false; // 鼠标在浮层里：暂停内容重写，保护选区不被实时刷新打断
let selecting = false; // 按住拖动（正在选择文字）

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function pretty(s) {
  if (!s) return "";
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
function kv(k, v) {
  return `<div><span class="tip-k">${tr(k)}</span> ${esc(tr(v ?? "—"))}</div>`;
}
function block(label, text) {
  if (!text) return "";
  return `<div class="tip-k2">${tr(label)}<button class="tip-copy" type="button">${tr("复制")}</button></div><pre class="tip-pre">${esc(text)}</pre>`;
}
function fmtState(t) {
  const secs = Math.round((Date.now() - (t.calledAt ?? t.startedAt)) / 1000);
  if (t.status === "running") return lang === "zh" ? `运行中（已 ${secs}s）` : `running (${secs}s)`;
  if (t.status === "done") return lang === "zh" ? `完成${t.exit != null ? ` · exit ${t.exit}` : ""}` : `done${t.exit != null ? ` · exit ${t.exit}` : ""}`;
  if (t.status === "error") return lang === "zh" ? `失败${t.error ? ` · ${t.error}` : ""}` : `failed${t.error ? ` · ${t.error}` : ""}`;
  return lang === "zh" ? "等参数" : "waiting for params";
}
function fmtSpan(from, to) {
  if (!from) return "—";
  return `${clock(from)} → ${to ? clock(to) : "…"}`;
}

function stepDetail(step) {
  const running = !step.endedAt;
  const dur = step.endedAt ? step.endedAt - step.startedAt : Date.now() - step.startedAt;
  const rows = [`<div class="tip-h">Step #${step.index}</div>`];
  rows.push(kv("agent / model", `${step.agent ?? "?"}${step.model ? ` · ${step.model.id} (${step.model.providerID ?? "?"})` : ""}`));
  rows.push(kv("状态", running ? "进行中" : step.finish === "error" ? "失败" : "已完成"));
  rows.push(kv("时间", `${fmtSpan(step.startedAt, step.endedAt)} · ${fmtDur(dur)}`));
  if (step.tokens) {
    rows.push(
      kv(
        "tokens",
        `${tr("输入")} ${fmtTok(step.tokens.input)} · ${tr("输出")} ${fmtTok(step.tokens.output)} · ${tr("推理")} ${fmtTok(step.tokens.reasoning ?? 0)} · ${tr("缓存读")} ${fmtTok(step.tokens.cache?.read ?? 0)} · ${tr("缓存写")} ${fmtTok(step.tokens.cache?.write ?? 0)}`
      )
    );
  }
  rows.push(kv("结束原因", step.finish ?? "还没结束"));
  rows.push(kv("工具", step.tools.map((t) => `${t.name}${t.status === "done" ? " ✓" : t.status === "error" ? " ✗" : t.status === "running" ? " …" : " ·"}`).join("   ") || "没有工具调用"));
  if (step.reasoning?.preview) {
    rows.push(block(`${tr("思考全文")} (${fmtTok(step.reasoning.chars)} ${tr("字")}${lang === "zh" ? "，可能截断" : ", may be truncated"})`, step.reasoning.preview));
  }
  if (step.gpu) {
    rows.push(
      kv(
        "GPU（按时间戳近似挂到这一步）",
        `prefill ${fmtDur(step.gpu.promptMs)} + decode ${fmtDur(step.gpu.decodeMs)} · ${step.gpu.decodeTokS ? Math.round(step.gpu.decodeTokS) : "?"} tok/s · prompt ${fmtTok(step.gpu.promptTokens)} · ${tr("KV 复用")} ${fmtTok(step.gpu.reused)} · ${tr("命中")} ${step.gpu.hitRate != null ? Math.round(step.gpu.hitRate * 100) : "?"}% · ${tr("草稿接受")} ${step.gpu.drafts != null ? Math.round(step.gpu.drafts * 100) : "?"}% · finish ${step.gpu.finish ?? "?"}`
      )
    );
  } else {
    rows.push(kv("GPU", "没按时间戳关联到 Strata 请求"));
  }
  rows.push(`<div class="tip-hint">${tr("鼠标可直接移进浮层滚动、选文字；单击可钉住，再点空白处关闭")}</div>`);
  return rows.join("");
}

function chipDetail(tool) {
  const secs = tool.endedAt ? Math.round((tool.endedAt - (tool.calledAt ?? tool.startedAt)) / 1000) : Math.round((Date.now() - (tool.calledAt ?? tool.startedAt)) / 1000);
  const rows = [`<div class="tip-h">${esc(tool.name)}</div>`];
  rows.push(kv("状态", fmtState(tool)));
  rows.push(kv("时间", `${fmtSpan(tool.startedAt, tool.endedAt)} · ${fmtDur(secs * 1000)}`));
  rows.push(kv("调用", tool.executed ? "已执行" : tool.executed === false ? "未执行（被拦/取消）" : "—"));
  const params = pretty(tool.inputText) || (tool.input ? pretty(JSON.stringify(tool.input)) : "");
  rows.push(params ? block("参数全文", params) : kv("参数", "没捕获到参数文本（错过 input.started）"));
  rows.push(block(tool.status === "error" ? "错误" : "输出预览", tool.error ?? tool.preview));
  if (tool.metadata) rows.push(block("进度 metadata", pretty(JSON.stringify(tool.metadata)).slice(0, 600)));
  rows.push(`<div class="tip-hint">${tr("鼠标可直接移进浮层滚动、选文字；单击可钉住，再点空白处关闭")}</div>`);
  return rows.join("");
}

function userDetail(s) {
  const rows = [`<div class="tip-h">${tr("用户输入")}</div>`];
  rows.push(kv("会话标题", s.title || s.id));
  rows.push(kv("会话 id", s.id));
  if (s.parentID) rows.push(kv("父会话", s.parentID));
  rows.push(kv("agent / model", `${s.agent ?? "?"} · ${s.model?.id ?? "?"} (${s.model?.providerID ?? "?"})`));
  rows.push(kv("目录", s.directory ?? "?"));
  rows.push(kv("状态", `${s.status}${s.outcome ? ` · ${s.outcome}` : ""}`));
  const dg = s.diagnosis;
  const dh = dg ? (lang === "zh" ? dg.headline : dg.headlineEn ?? dg.headline) : "?";
  const dr = dg ? (lang === "zh" ? dg.reasons : dg.reasonsEn ?? dg.reasons) : [];
  rows.push(kv("诊断", `${dh}${dr?.length ? `${sep()}${dr.join(lang === "zh" ? "；" : "; ")}` : ""}`));
  if (s.tokens) rows.push(kv("tokens", `${tr("输入")} ${fmtTok(s.tokens.input)} · ${tr("输出")} ${fmtTok(s.tokens.output)} · ${tr("缓存读")} ${fmtTok(s.tokens.cache?.read ?? 0)}`));
  rows.push(kv("步数", lang === "zh" ? `${s.steps.length} 个 step` : `${s.steps.length} steps`));
  rows.push(`<div class="tip-hint">${tr("鼠标可直接移进浮层滚动、选文字；单击可钉住，再点空白处关闭")}</div>`);
  return rows.join("");
}

function compactionDetail(c) {
  const rows = [`<div class="tip-h">${tr("上下文压缩")}</div>`];
  rows.push(kv("状态", c.status === "running" ? "压缩中" : c.status === "failed" ? "失败" : "完成"));
  rows.push(kv("时间", `${fmtSpan(c.startedAt, c.endedAt)} · ${fmtDur(c.endedAt ? c.endedAt - c.startedAt : Date.now() - c.startedAt)}`));
  rows.push(kv("摘要长度", lang === "zh" ? `${fmtTok(c.chars)} 字符` : `${fmtTok(c.chars)} chars`));
  return rows.join("");
}

function placeTipAt(anchor) {
  const t = $("tip");
  const iw = window.innerWidth || 1400;
  const ih = window.innerHeight || 900;
  const r = anchor?.getBoundingClientRect?.() ?? { left: iw / 2, right: iw / 2, top: ih / 2 };
  const w = t.offsetWidth || 420;
  const h = t.offsetHeight || 200;
  let left = r.right + 12;
  if (left + w > iw - 8) left = r.left - w - 12;
  t.style.left = Math.max(8, Math.min(left, iw - w - 8)) + "px";
  t.style.top = Math.max(8, Math.min(r.top, ih - h - 8)) + "px";
}

function setTipContent(html) {
  const t = $("tip");
  const card = t.querySelector(".tip-card");
  // 外圈卡片和每个内圈 pre 都可能有滚动条，逐个记录位置再写回
  const offsets = card
    ? [card, ...card.querySelectorAll(".tip-pre")].map((el) => ({ top: el.scrollTop, left: el.scrollLeft }))
    : [];
  t.innerHTML = `<div class="tip-card"><div class="tip-topbar"><button class="tip-copy-all" type="button">${tr("复制全部")}</button></div>${html}</div>`;
  const nc = t.querySelector(".tip-card");
  if (!nc) return;
  const els = [nc, ...nc.querySelectorAll(".tip-pre")];
  els.forEach((el, i) => {
    if (offsets[i]) {
      el.scrollTop = offsets[i].top;
      el.scrollLeft = offsets[i].left;
    }
  });
}

// 整卡纯文本：去掉按钮与顶栏，每行内容一行
function cardFullText(card) {
  if (!card) return "";
  return [...card.children]
    .filter((c) => !c.classList.contains("tip-topbar"))
    .map((c) => {
      const clone = c.cloneNode(true);
      clone.querySelectorAll("button").forEach((b) => b.remove());
      return clone.textContent.trim();
    })
    .filter(Boolean)
    .join("\n");
}

function copyText(text, btn, restore) {
  const label = restore ?? tr("复制");
  const done = () => {
    if (!btn.isConnected) return;
    btn.textContent = tr("已复制 ✓");
    setTimeout(() => {
      if (btn.isConnected) btn.textContent = label;
    }, 1200);
  };
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch {}
    ta.remove();
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}

function showTip(html, anchor, pinned) {
  const t = $("tip");
  if (!html) {
    hideTip();
    return;
  }
  setTipContent(html);
  t.classList.remove("hidden");
  t.classList.toggle("pinned", !!pinned);
  if (anchor) t._anchor = anchor;
  placeTipAt(t._anchor);
}

function cancelHide() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}
function scheduleHide() {
  if (tipPinned) return;
  cancelHide();
  hideTimer = setTimeout(hideTip, 350);
}

function hideTip() {
  cancelHide();
  tipKey = null;
  const t = $("tip");
  t.classList.add("hidden");
  t.classList.remove("pinned");
  t._anchor = null;
}

function initHover() {
  const box = $("pipeline");
  const t = $("tip");
  box.addEventListener("mousemove", (ev) => {
    const g = ev.target.closest?.("g.node");
    if (!g) {
      if (!tipPinned) scheduleHide();
      return;
    }
    if (tipPinned) return;
    const key = g.getAttribute("data-key");
    if (!key || !details.has(key)) return;
    cancelHide();
    // 浮层已经显示就不再跟着鼠标移动，鼠标可以直接移进浮层里滚动、选文字
    if (tipKey === key && !t.classList.contains("hidden")) return;
    tipKey = key;
    showTip(details.get(key), g, false);
  });
  box.addEventListener("mouseleave", () => {
    if (!tipPinned) scheduleHide();
  });
  t.addEventListener("mouseenter", () => {
    tipHover = true;
    cancelHide();
  });
  t.addEventListener("mouseleave", () => {
    tipHover = false;
    if (!tipPinned) scheduleHide();
  });
  // 拖动选择文字期间冻结内容重写，选区不会被刷新打断
  t.addEventListener("mousedown", () => {
    selecting = true;
  });
  document.addEventListener("mouseup", () => {
    selecting = false;
  });
  t.addEventListener("click", (ev) => {
    const b = ev.target.closest?.("button.tip-copy, button.tip-copy-all");
    if (!b) return;
    if (b.classList.contains("tip-copy-all")) {
      copyText(cardFullText(t.querySelector(".tip-card")), b, tr("复制全部"));
      return;
    }
    const pre = b.parentElement?.nextElementSibling;
    copyText(pre?.textContent ?? "", b);
  });
  box.addEventListener("click", (ev) => {
    const g = ev.target.closest?.("g.node");
    const key = g?.getAttribute("data-key");
    if (!key) {
      tipPinned = null;
      hideTip();
      return;
    }
    tipPinned = tipPinned === key ? null : key;
    tipKey = tipPinned;
    if (tipPinned) showTip(details.get(key), g, true);
    else hideTip();
    renderPipeline();
  });
  box.addEventListener("scroll", () => {
    if (!tipPinned) hideTip();
    // 程序自动居中的位置记在 lastAutoTop，只有真正的用户滚动才暂停跟随
    if (box.scrollTop !== lastAutoTop) manualScrollUntil = Date.now() + 8000;
  });
}

// ---- 文本折行：SVG <text> 不会自动换行，按节点内宽手动折行 ----

function isWide(ch) {
  return /[\u2E80-\u9FFF\uFF01-\uFF60\u3000-\u303F\u{1F300}-\u{1F6FF}]/u.test(ch);
}
function textWidth(s, fs) {
  let w = 0;
  for (const ch of Array.from(s)) w += isWide(ch) ? fs : fs * 0.58;
  return w;
}

// 折行：优先在空格处断开；超出 maxLines 的部分用省略号收尾
function wrapText(s, maxW, fs, maxLines) {
  const src = (s ?? "").replace(/\s+/g, " ").trim();
  if (!src) return [];
  const chars = Array.from(src);
  const lines = [];
  let cur = "";
  let lastSpace = -1;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (cur && textWidth(cur + ch, fs) > maxW) {
      if (lastSpace > 0) {
        lines.push(cur.slice(0, lastSpace));
        cur = chars.slice(lastSpace + 1, i + 1).join("");
      } else {
        lines.push(cur);
        cur = ch;
      }
      lastSpace = -1;
      if (lines.length >= maxLines) {
        cur += chars.slice(i).join("");
        break;
      }
    } else {
      cur += ch;
      if (ch === " ") lastSpace = cur.length - 1;
    }
  }
  if (lines.length < maxLines) lines.push(cur);
  if (lines.join("").length < chars.length) {
    let t = lines[lines.length - 1] ?? "";
    while (t && textWidth(t + "…", fs) > maxW) t = t.slice(0, -1);
    lines[lines.length - 1] = t + "…";
  }
  return lines;
}

function nodeH(groups, lh, top = 12, bottom = 12) {
  const lines = groups.reduce((a, g) => a + g.lines.length, 0);
  return top + Math.max(1, lines) * lh + bottom;
}

function chip(label, value, tone = "text-ink") {
  return `<span class="rounded border border-line bg-panel-2 px-2 py-1 text-xs font-mono ${tone}">${tr(label)} <b class="font-semibold">${value}</b></span>`;
}

function render() {
  renderHeader();
  renderBanner();
  renderDiagnosis();
  renderSessions();
  renderPipeline();
  renderTimeline();
  renderGpu();
  renderPending();
  renderLog();
  // 回放按钮：只对已完成的会话显示
  const rb = $("replay-btn");
  const s = cur();
  rb.classList.toggle("hidden", !(s && s.status !== "running" && (s.steps?.length ?? 0) > 1));
  rb.textContent = replay ? tr("回放中…") : tr("回放");
}

function renderHeader() {
  const s = snap.server;
  const dot = $("svc-dot");
  dot.className = `dot ${s.reachable ? "dot-running" : "dot-error"}`;
  $("svc-meta").textContent = `${s.url ?? tr("未发现服务")} · v${s.version ?? "?"} · pid ${s.pid ?? "?"} · ${tr("会话")} ${snap.sessions.length}`;

  const t = cur()?.tokens ?? {};
  const live = snap.strata.live ?? {};
  $("chips").innerHTML = [
    chip("模型", `${cur()?.model?.id ?? snap.strata.health?.model ?? "?"}/${cur()?.model?.providerID ?? "?"}`),
    chip("上下文", fmtTok((t.input ?? 0) + (t.cache?.read ?? 0))),
    chip("生成", fmtTok(t.output ?? 0)),
    chip("缓存读", fmtTok(t.cache?.read ?? 0)),
    chip("GPU", live.state ?? tr("离线"), live.state ? "text-gpu" : "text-error"),
    chip("tok/s", live.tok_s ? Math.round(live.tok_s) : "—", "text-gpu"),
    chip("排队", live.queued ?? 0, live.queued > 0 ? "text-blocked" : "text-ink-dim"),
  ].join("");
}

function renderBanner() {
  const b = $("banner");
  const msgs = [];
  if (snap.server.reconnecting || !snap.server.reachable) msgs.push(`${tr("opencode 服务未连通")}${sep()}${snap.server.lastError ?? tr("正在重新发现端口")}`);
  if (!snap.strata.alive) msgs.push(`${tr("Strata 指标不可用")}${sep()}${snap.strata.lastError ?? tr("未启动")}`);
  b.classList.toggle("hidden", msgs.length === 0);
  b.textContent = msgs.join(" · ");
}

function renderDiagnosis() {
  const s = cur();
  if (!s) {
    $("diag-headline").textContent = tr("没有会话");
    $("diag-reasons").innerHTML = "";
    updateAlert(null, null);
    return;
  }
  const d = s.diagnosis ?? { level: "idle", headline: "空闲", reasons: [] };
  $("diag-dot").className = `dot dot-${d.level === "running" ? "running" : d.level === "blocked" ? "blocked" : d.level === "error" ? "error" : "idle"}`;
  $("diag-headline").textContent = lang === "zh" ? d.headline : d.headlineEn ?? tr(d.headline);
  $("diag-session").textContent = `${s.title || s.id} · ${s.agent ?? "?"} · ${ago(s.lastEventAt || s.updatedAt)}`;
  const reasons = d.reasons ?? [];
  const shown = lang === "zh" ? reasons : d.reasonsEn ?? reasons.map(tr);
  $("diag-reasons").innerHTML = shown.map((r) => `<li class="font-mono">${r}</li>`).join("");
  updateAlert(s, d);
}

function depthOf(id) {
  let d = 0;
  let x = snap.sessions.find((s) => s.id === id)?.parentID;
  while (x) {
    const p = snap.sessions.find((s) => s.id === x);
    if (!p) break;
    d += 1;
    x = p.parentID;
  }
  return d;
}

function renderSessions() {
  $("sessions").innerHTML = snap.sessions
    .map((s) => {
      const lvl = s.diagnosis?.level ?? "idle";
      const tone = lvl === "running" ? "dot-running" : lvl === "blocked" ? "dot-blocked" : lvl === "error" ? "dot-error" : "dot-idle";
      const indent = depthOf(s.id) * 12;
      return `<div class="row ${s.id === selected ? "row-sel" : ""}" data-id="${s.id}" style="padding-left:${indent + 4}px">
        <span class="dot ${tone}"></span>
        <span class="text-xs truncate flex-1">${trunc(s.title || s.id, 26)}</span>
        <span class="text-[10px] font-mono text-ink-dim">${s.agent ?? "?"}</span>
      </div>`;
    })
    .join("");
  $("sessions").querySelectorAll(".row").forEach((row) =>
    row.addEventListener("click", () => {
      if (replayTimer) clearInterval(replayTimer);
      replayTimer = null;
      replay = null;
      selected = row.dataset.id;
      render();
    })
  );
}

function el(tag, attrs, cls) {
  const e = document.createElementNS(SVGNS, tag);
  if (cls) e.setAttribute("class", cls);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// 连线末端箭头：颜色跟连线同色，箭头指向流向的终点（谁 → 谁）
function edgeCls(e, cls) {
  e.setAttribute("class", cls);
  e.setAttribute("marker-end", cls.includes("edge-active") ? "url(#arr-active)" : cls.includes("edge-blocked") ? "url(#arr-blocked)" : cls.includes("edge-done") ? "url(#arr-done)" : "url(#arr)");
}

function ensure(map, key, parent, create) {
  let e = map.get(key);
  if (!e) {
    e = create();
    parent.appendChild(e);
    map.set(key, e);
  }
  return e;
}

// 把折行结果写进 g 里的 <text>/<tspan>；分组数变化时增删 text 元素
function applyTexts(g, groups, x, baseY, lh) {
  const texts = [...g.querySelectorAll("text")];
  while (texts.length < groups.length) {
    const t = el("text", {}, groups[texts.length].cls);
    g.appendChild(t);
    texts.push(t);
  }
  while (texts.length > groups.length) texts.pop().remove();

  let k = 0;
  groups.forEach((grp, gi) => {
    const t = texts[gi];
    t.setAttribute("class", grp.cls);
    while (t.firstChild) t.removeChild(t.firstChild);
    grp.lines.forEach((line, i) => {
      const ts = el("tspan", { x, dy: i === 0 ? 0 : lh });
      if (i === 0) ts.setAttribute("y", baseY + (k + i) * lh);
      ts.textContent = line;
      t.appendChild(ts);
    });
    k += grp.lines.length;
  });
}

const STEP_INNER = STEP_W - PAD * 2;
const CHIP_INNER = CHIP_W - 38 - PAD;

// 固定行数预留：进行中节点先占满行数，流式内容增长不再改变框高，画面不跳
function padLines(lines, n) {
  const out = lines.slice(0, n);
  while (out.length < n) out.push("");
  return out;
}

function stepGroups(step) {
  const running = !step.endedAt;
  const dur = step.endedAt ? step.endedAt - step.startedAt : Date.now() - step.startedAt;
  const tok = step.tokens
    ? `↑${fmtTok(step.tokens.input)} ↓${fmtTok(step.tokens.output)} ${tr("缓存读")} ${fmtTok(step.tokens.cache?.read ?? 0)}`
    : tr("生成中");
  const groups = [
    { cls: "t-title", lines: wrapText(`Step #${step.index} · ${step.agent ?? "?"}${step.model ? ` · ${step.model.id}` : ""}`, STEP_INNER, TITLE_FS, 1) },
    { cls: "t-sub", lines: running ? padLines(wrapText(`${fmtDur(dur)} · ${tok} · ${step.finish ?? tr("进行中")}`, STEP_INNER, SUB_FS, 2), 2) : wrapText(`${fmtDur(dur)} · ${tok} · ${step.finish ?? "…"}`, STEP_INNER, SUB_FS, 2) },
  ];
  if (step.reasoning?.chars) {
    groups.push({
      cls: "t-sub",
      lines: running
        ? padLines(wrapText(`${tr("思考")} ${fmtTok(step.reasoning.chars)} ${tr("字")}${step.reasoning.preview ? `${sep()}${step.reasoning.preview}` : ""}`, STEP_INNER, SUB_FS, 2), 2)
        : wrapText(`${tr("思考")} ${fmtTok(step.reasoning.chars)} ${tr("字")}${step.reasoning.preview ? `${sep()}${step.reasoning.preview}` : ""}`, STEP_INNER, SUB_FS, 2),
    });
  }
  if (step.gpu) {
    const pre = step.gpu.promptMs ? Math.round(step.gpu.promptMs) : 0;
    const dec = step.gpu.decodeMs ? Math.round(step.gpu.decodeMs) : 0;
    groups.push({
      cls: "t-gpu",
      lines: wrapText(
        `GPU prefill ${fmtDur(pre)} + decode ${fmtDur(dec)} · ${step.gpu.decodeTokS ? Math.round(step.gpu.decodeTokS) : "?"} tok/s · ${tr("KV 命中")} ${step.gpu.hitRate != null ? Math.round(step.gpu.hitRate * 100) : "?"}%`,
        STEP_INNER,
        SUB_FS,
        2
      ),
    });
  }
  // 最多 6 行，超出就砍掉后面的组
  let budget = 6;
  const out = [];
  for (const g of groups) {
    if (budget <= 0) break;
    out.push({ cls: g.cls, lines: g.lines.slice(0, budget) });
    budget -= Math.min(g.lines.length, budget);
  }
  return out;
}

function chipGroups(tool) {
  const secs = tool.status === "running" ? Math.round((Date.now() - (tool.calledAt ?? tool.startedAt)) / 1000) : null;
  const groups = [
    { cls: "t-title", lines: wrapText(tool.name + (tool.exit != null ? ` · exit ${tool.exit}` : ""), CHIP_INNER, TITLE_FS, 1) },
  ];
  const head =
    tool.status === "running"
      ? `${lang === "zh" ? `已运行 ${secs}s` : `running ${secs}s`} · ${tool.inputText || tr("（无参数）")}`
      : tool.status === "input"
        ? `${tr("等参数")} · ${tool.inputText || "…"}`
        : tool.inputText || "";
  if (head) {
    const lines = wrapText(head, CHIP_INNER, SUB_FS, 2);
    groups.push({ cls: "t-sub", lines: tool.status === "running" || tool.status === "input" ? padLines(lines, 2) : lines });
  }
  const tail = tool.status === "error" ? tool.error ?? "" : tool.metadata?.shellID ? tr("后台 shell 在跑") : tool.preview;
  if (tail || tool.status === "running") {
    const lines = wrapText(tail ?? "", CHIP_INNER, SUB_FS, 2);
    groups.push({ cls: "t-sub", lines: tool.status === "running" ? padLines(lines, 2) : lines });
  }
  let budget = 5;
  const out = [];
  for (const g of groups) {
    if (budget <= 0) break;
    out.push({ cls: g.cls, lines: g.lines.slice(0, budget) });
    budget -= Math.min(g.lines.length, budget);
  }
  return out;
}

function renderPipeline() {
  const box = $("pipeline");
  let svg = box.querySelector("svg");
  if (!svg || svg.dataset.session !== selected) {
    box.innerHTML = "";
    svg = el("svg", { xmlns: SVGNS }, "block");
    svg.dataset.session = selected ?? "";
    const defs = el("defs", {}, "");
    for (const [id, cls] of [["arr", "mk-base"], ["arr-active", "mk-active"], ["arr-blocked", "mk-blocked"], ["arr-done", "mk-done"]]) {
      const m = el("marker", { id, viewBox: "0 0 8 8", refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: "auto" });
      m.appendChild(el("path", { d: "M0 1.2 L7 4 L0 6.8 Z" }, cls));
      defs.appendChild(m);
    }
    svg.appendChild(defs);
    box.appendChild(svg);
    nodeEls.clear();
    edgeEls.clear();
  }
  const usedNode = new Set();
  const usedEdge = new Set();
  const s = cur();
  if (!s) {
    svg.setAttribute("width", 0);
    svg.setAttribute("height", 0);
    return;
  }

  // 用户节点
  const userGroups = [
    { cls: "t-title", lines: wrapText(tr("用户输入"), STEP_INNER, TITLE_FS, 1) },
    { cls: "t-sub", lines: wrapText(s.title || s.id, STEP_INNER, SUB_FS, 2) },
  ];
  const userH = nodeH(userGroups, LH);

  // 回放中只放出已揭示的 step，其余随定时器逐步出现
  const steps = replay ? (s.steps ?? []).slice(0, replay.revealed) : s.steps ?? [];
  const rows = steps.map((step) => {
    const groups = stepGroups(step);
    const h = nodeH(groups, LH);
    const chips = step.tools.map((tool) => {
      const g = chipGroups(tool);
      return { tool, groups: g, h: nodeH(g, LH_CH, 10, 10) };
    });
    const chipsH = chips.reduce((a, c) => a + c.h, 0) + Math.max(0, chips.length - 1) * CHIP_GAP;
    return { step, groups, h, chips, chipsH };
  });

  let y = userH + ROW_GAP;
  for (const r of rows) {
    r.y = y;
    r.chipY0 = r.y + r.h + CHIPS_TOP;
    y += Math.max(r.h, CHIPS_TOP + r.chipsH) + ROW_GAP;
  }

  // 压缩节点只在压缩进行中/失败时显示；完成后隐藏，不占用右侧展示
  const compActive = s.compaction && s.compaction.status !== "done";
  const compGroups = compActive
    ? [
        { cls: "t-title", lines: wrapText(tr("上下文压缩"), CHIP_INNER, TITLE_FS, 1) },
        {
          cls: "t-sub",
          lines: padLines(
            wrapText(
              `${s.compaction.status === "running" ? tr("压缩中") : tr("失败")} · ${fmtTok(s.compaction.chars)} ${lang === "zh" ? "字" : "chars"}`,
              CHIP_INNER,
              SUB_FS,
              2
            ),
            2
          ),
        },
      ]
    : [];
  const compH = compGroups.length ? nodeH(compGroups, LH_CH, 10, 10) : 0;
  const last = rows[rows.length - 1];
  const compY = last ? last.y + Math.max(last.h, CHIPS_TOP + last.chipsH) + 12 : userH + ROW_GAP;
  const H = compActive ? Math.max(y, compY + compH + ROW_GAP) : y;
  svg.setAttribute("width", CHIP_X + CHIP_W + 16);
  svg.setAttribute("height", H);

  const queued = (snap.strata.live?.queued ?? 0) > 0;

  // 用户输入节点
  usedNode.add("user");
  const user = ensure(nodeEls, "user", svg, () => {
    const g = el("g", {}, "node node-idle");
    g.appendChild(el("rect", { x: 0, y: 0, width: STEP_W, height: userH, rx: 8 }));
    return g;
  });
  user.setAttribute("class", "node node-idle" + (tipPinned === "user" ? " node-hover" : ""));
  user.setAttribute("data-key", "user");
  details.set("user", userDetail(s));
  user.querySelector("rect").setAttribute("height", userH);
  applyTexts(user, userGroups, PAD, PAD + TITLE_FS, LH);

  rows.forEach((r, i) => {
    const step = r.step;
    const running = !step.endedAt;
    const cls = step.finish === "error" ? "node-error" : running ? "node-running" : "node-done";
    usedNode.add(`step:${step.messageID}`);

    const g = ensure(nodeEls, `step:${step.messageID}`, svg, () => {
      const grp = el("g", {}, "node " + cls);
      grp.appendChild(el("rect", { x: 0, y: 0, width: STEP_W, height: 100, rx: 8 }));
      return grp;
    });
    g.setAttribute("class", "node " + cls + (tipPinned === `step:${step.messageID}` ? " node-hover" : ""));
    g.setAttribute("data-key", `step:${step.messageID}`);
    details.set(`step:${step.messageID}`, stepDetail(step));
    const rect = g.querySelector("rect");
    rect.setAttribute("x", 0);
    rect.setAttribute("y", r.y);
    rect.setAttribute("width", STEP_W);
    rect.setAttribute("height", r.h);
    applyTexts(g, r.groups, PAD, r.y + PAD + TITLE_FS, LH);

    // 工具扇出（右侧竖排）
    let cy = r.chipY0;
    r.chips.forEach((c) => {
      const tool = c.tool;
      const tone = tool.status === "running" ? "node-running" : tool.status === "error" ? "node-error" : tool.status === "done" ? "node-done" : "node-idle";
      usedNode.add(`chip:${tool.id}`);
      const cg = ensure(nodeEls, `chip:${tool.id}`, svg, () => {
        const grp = el("g", {}, "node " + tone);
        grp.appendChild(el("rect", { x: CHIP_X, y: 0, width: CHIP_W, height: 56, rx: 8 }));
        grp.appendChild(el("circle", { cx: CHIP_X + 20, cy: 28, r: 8 }, "spinner"));
        return grp;
      });
      cg.setAttribute("class", "node " + tone + (tipPinned === `chip:${tool.id}` ? " node-hover" : ""));
      cg.setAttribute("data-key", `chip:${tool.id}`);
      details.set(`chip:${tool.id}`, chipDetail(tool));
      const rect = cg.querySelector("rect");
      rect.setAttribute("x", CHIP_X);
      rect.setAttribute("y", cy);
      rect.setAttribute("width", CHIP_W);
      rect.setAttribute("height", c.h);
      const spin = cg.querySelector("circle");
      spin.setAttribute("cx", CHIP_X + 20);
      spin.setAttribute("cy", cy + c.h / 2);
      spin.style.display = tool.status === "running" ? "" : "none";
      applyTexts(cg, c.groups, CHIP_X + 38, cy + 10 + TITLE_FS, LH_CH);

      // step → 工具
      usedEdge.add(`e:${step.messageID}:${tool.id}`);
      const e = ensure(edgeEls, `e:${step.messageID}:${tool.id}`, svg, () => el("path", {}, "edge"));
      e.setAttribute(
        "d",
        `M ${STEP_W} ${r.y + r.h / 2} C ${STEP_W + 34} ${r.y + r.h / 2}, ${CHIP_X - 30} ${cy + c.h / 2}, ${CHIP_X} ${cy + c.h / 2}`
      );
      edgeCls(e, tool.status === "running" ? "edge edge-active" : tool.status === "error" ? "edge edge-blocked" : "edge edge-done");

      // 工具 → 下一个 step（收敛回去）
      if (step.finish === "tool-calls" && rows[i + 1]) {
        usedEdge.add(`c:${step.messageID}:${tool.id}`);
        const ny = rows[i + 1].y + rows[i + 1].h / 2;
        const e2 = ensure(edgeEls, `c:${step.messageID}:${tool.id}`, svg, () => el("path", {}, "edge"));
        e2.setAttribute(
          "d",
          `M ${CHIP_X + CHIP_W} ${cy + c.h / 2} C ${CHIP_X + CHIP_W + 30} ${cy + c.h / 2}, ${STEP_W + 60} ${ny - 30}, ${STEP_W} ${ny}`
        );
        edgeCls(e2, queued ? "edge edge-blocked" : rows[i + 1].step.endedAt ? "edge edge-done" : rows[i + 1].step.startedAt ? "edge edge-active" : "edge");
      }

      cy += c.h + CHIP_GAP;
    });

    // step → 下一个 step
    if (rows[i + 1]) {
      usedEdge.add(`s:${step.messageID}`);
      const e = ensure(edgeEls, `s:${step.messageID}`, svg, () => el("path", {}, "edge"));
      e.setAttribute("d", `M ${STEP_W / 2} ${r.y + r.h} L ${STEP_W / 2} ${rows[i + 1].y}`);
      edgeCls(e, queued ? "edge edge-blocked" : rows[i + 1].step.endedAt ? "edge edge-done" : rows[i + 1].step.startedAt ? "edge edge-active" : "edge");
    }
  });

  // 用户 → 第一个 step
  usedEdge.add("e:user");
  const first = ensure(edgeEls, "e:user", svg, () => el("path", {}, "edge"));
  first.setAttribute("d", `M ${STEP_W / 2} ${userH} L ${STEP_W / 2} ${rows.length ? rows[0].y : userH + ROW_GAP}`);
  edgeCls(first, rows.length && !rows[0].step.endedAt ? "edge edge-active" : "edge edge-done");

  // 压缩节点：挂在最后一个 step 的工具列下方（完成后隐藏）
  if (compActive) {
    usedNode.add("compaction");
    const tone = s.compaction.status === "running" ? "node-running" : s.compaction.status === "failed" ? "node-error" : "node-done";
    const g = ensure(nodeEls, "compaction", svg, () => {
      const grp = el("g", {}, "node " + tone);
      grp.appendChild(el("rect", { x: CHIP_X, y: 0, width: CHIP_W, height: 56, rx: 8 }));
      return grp;
    });
    g.setAttribute("class", "node " + tone + (tipPinned === "compaction" ? " node-hover" : ""));
    g.setAttribute("data-key", "compaction");
    details.set("compaction", compactionDetail(s.compaction));
    const rect = g.querySelector("rect");
    rect.setAttribute("y", compY);
    rect.setAttribute("height", compH);
    applyTexts(g, compGroups, CHIP_X + 38, compY + 10 + TITLE_FS, LH_CH);
  }

  // 清掉已经不存在的节点与连线
  for (const [k, e] of [...nodeEls]) if (!usedNode.has(k)) { e.remove(); nodeEls.delete(k); }
  for (const [k, e] of [...edgeEls]) if (!usedEdge.has(k)) { e.remove(); edgeEls.delete(k); }
  for (const k of [...details.keys()]) if (!usedNode.has(k)) details.delete(k);

  // 固定高度的框里把当前 step（含右侧工具块）垂直居中；用户手动滚动过就暂停自动跟随 8 秒
  const view = box.clientHeight || 0;
  // 锚定最后一个未结束的 step（若有残留的未结束旧行，跟随真正的当前行而不是第一条）
  const openRows = rows.filter((r) => !r.step.endedAt);
  const curRow = openRows[openRows.length - 1] ?? rows[rows.length - 1];
  if (view && curRow && Date.now() >= manualScrollUntil) {
    const blockH = Math.max(curRow.h, CHIPS_TOP + curRow.chipsH);
    // 整块放得下就居中；放不下就把块顶贴到视野顶，保证块底不被裁掉
    const base = blockH > view ? curRow.y : curRow.y + blockH / 2 - view / 2;
    const top = Math.max(0, Math.min(base, Math.max(0, H - view)));
    if (box.scrollTop !== top) {
      lastAutoTop = top;
      box.scrollTop = top;
    }
  }

  // 钉住/悬停的浮层跟随实时数据刷新（位置不动）；鼠标进入或正在选择文字时冻结
  const frozen = tipHover || selecting;
  if (tipPinned) {
    if (!details.has(tipPinned)) {
      tipPinned = null;
      hideTip();
    } else if (!frozen) {
      showTip(details.get(tipPinned), nodeEls.get(tipPinned) ?? null, true);
    }
  } else if (tipKey) {
    if (!details.has(tipKey)) hideTip();
    else if (!frozen) {
      const t = $("tip");
      if (!t.classList.contains("hidden")) setTipContent(details.get(tipKey));
    }
  }
}

function renderTimeline() {
  const s = cur();
  const steps = s?.steps ?? [];
  const max = Math.max(1, ...steps.map((x) => (x.endedAt ?? Date.now()) - x.startedAt));
  $("timeline").innerHTML = steps
    .slice(-14)
    .map((x) => {
      const dur = (x.endedAt ?? Date.now()) - x.startedAt;
      const w = Math.max(4, (dur / max) * 100);
      const gpu = x.gpu;
      let inner;
      if (gpu?.promptMs && gpu?.decodeMs) {
        const p = (gpu.promptMs / (gpu.promptMs + gpu.decodeMs)) * 100;
        inner = `<div class="bar-prefill" style="width:${p}%"></div><div class="bar-decode" style="width:${100 - p}%"></div>`;
      } else {
        inner = `<div class="bar-total" style="width:100%"></div>`;
      }
      const tok = x.tokens ? `↓${fmtTok(x.tokens.output)}` : "";
      return `<div class="flex items-center gap-2 text-[11px] font-mono">
        <span class="w-8 text-ink-dim">#${x.index}</span>
        <div class="bar flex-1" style="width:${w}%">${inner}</div>
        <span class="w-16 text-right text-ink-dim">${fmtDur(dur)}</span>
        <span class="w-12 text-right text-ink-dim">${tok}</span>
      </div>`;
    })
    .join("");
}

function renderGpu() {
  const g = snap.strata;
  if (!g.alive) {
    $("gpu").innerHTML = `<div class="text-xs text-error font-mono">${tr("Strata 未连通")}${sep()}${g.lastError ?? tr("未启动")}</div>`;
    return;
  }
  const hw = g.hardware ?? {};
  const eng = g.engine ?? {};
  const live = g.live ?? {};
  const st = g.status ?? {};
  const tot = g.totals ?? {};
  const memUsed = hw.gpu_mem_used ? (hw.gpu_mem_used / 2 ** 30).toFixed(1) : "?";
  const memTotal = hw.gpu_mem_total ? (hw.gpu_mem_total / 2 ** 30).toFixed(0) : "?";
  const ctxPct = st.prompt_tokens && eng.max_context ? Math.round((st.prompt_tokens / eng.max_context) * 100) : null;
  const hit = g.requests?.[0]?.hit_rate;
  const draft = g.requests?.[0]?.drafts_offered ? Math.round((g.requests[0].drafts_accepted / g.requests[0].drafts_offered) * 100) : null;

  // 折线铺满整个宽度：最老样本贴左、最新样本贴右（样本少时自动拉伸间距）
  const hist = g.history?.gpu_util ?? [];
  const yOf = (v) => 40 - (v / 100) * 38;
  const spark = hist.length === 1
    ? `256,${yOf(hist[0])} 260,${yOf(hist[0])}`
    : hist.map((v, i) => `${((i * 260) / (hist.length - 1)).toFixed(1)},${yOf(v)}`).join(" ");
  $("gpu").innerHTML = `
    <div class="grid grid-cols-2 gap-1 text-[11px] font-mono">
      <span class="text-gpu">${live.state ?? "idle"}${live.phase ? ` · ${live.phase}` : ""}</span>
      <span class="text-ink-dim">${tr("排队")} ${live.queued ?? 0}</span>
      <span class="text-ink-dim">GPU ${hw.gpu_util ?? "?"}%</span>
      <span class="text-ink-dim">${tr("显存")} ${memUsed}/${memTotal} GiB</span>
      <span class="text-ink-dim">${tr("温度")} ${hw.gpu_temp ?? "?"}℃</span>
      <span class="text-ink-dim">${tr("功率")} ${hw.gpu_power ? Math.round(hw.gpu_power) : "?"}W</span>
      <span class="text-ink-dim">tok/s ${live.tok_s ? Math.round(live.tok_s) : "?"}</span>
      <span class="text-ink-dim">slot ${(g.slots ?? []).length ?? "?"}</span>
      <span class="text-ink-dim">${tr("缓存命中")} ${hit != null ? Math.round(hit * 100) : "?"}%</span>
      <span class="text-ink-dim">${tr("草稿接受")} ${draft != null ? draft : "?"}%</span>
      <span class="text-ink-dim">${tr("上下文")} ${ctxPct != null ? ctxPct + "%" : "?"} / ${fmtTok(eng.max_context)}</span>
      <span class="text-ink-dim">KV ${eng.kv ?? "?"} · ${tr("prefill 上限")} ${fmtTok(eng.prefill_cap)}</span>
    </div>
    <svg width="260" height="44" class="mt-1">
      <polyline points="0,42 260,42" class="spark-base" />
      <polyline points="${spark}" class="spark" />
    </svg>
    <div class="text-[11px] text-ink-dim font-mono">${tr("总请求")} ${tot.requests ?? "?"} · prompt ${fmtTok(tot.prompt_tokens)} · ${tr("复用")} ${fmtTok(tot.reused)} · ${tr("输出")} ${fmtTok(tot.output_tokens)}</div>
    <div class="text-[10px] text-ink-dim">${tr("只有 1 个推理 slot：并行工具调用与 subagent 会在 GPU 上串行排队")}</div>
  `;
}

function renderPending() {
  const p = snap.pending;
  const rows = [];
  for (const x of p.permissions ?? []) rows.push(`<span class="dot dot-blocked"></span><span class="font-mono">${tr("权限待批")} ${x.action ?? "?"} · ${trunc((x.resources ?? []).join(", "), 30)}</span>`);
  for (const x of p.forms ?? []) rows.push(`<span class="dot dot-blocked"></span><span class="font-mono">${tr("等你回答")}${sep()}${trunc(x.title, 30)}</span>`);
  for (const x of p.shells ?? []) rows.push(`<span class="dot dot-running"></span><span class="font-mono">shell ${trunc(x.command, 30)} · ${x.status}</span>`);
  $("pending").innerHTML = rows.length ? rows.join("<br>") : `<span class="text-ink-dim text-xs">${tr("没有挂起的请求")}</span>`;
}

function renderLog() {
  const evs = (snap.events ?? []).slice().reverse().filter((e) => !logFilter || e.type.toLowerCase().includes(logFilter));
  $("log").innerHTML = evs
    .slice(0, 90)
    .map((e) => `<div class="flex gap-2"><span class="text-ink-dim">${clock(e.at)}</span><span class="text-running">${e.type}</span><span class="text-ink-dim truncate">${trunc(e.summary, 40)}</span></div>`)
    .join("");
}
