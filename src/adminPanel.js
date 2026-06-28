// src/adminPanel.js — Admin SPA (served at GET /admin)
"use strict";

module.exports = function adminPanel() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TradeForge Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d1117;--bg2:#161b22;--bg3:#21262d;--bg4:#30363d;
  --border:#30363d;--border2:#484f58;
  --text:#e6edf3;--text2:#8b949e;--text3:#6e7681;
  --blue:#58a6ff;--green:#3fb950;--red:#f85149;--yellow:#d29922;--purple:#bc8cff;
  --orange:#f0883e;
  --radius:8px;--radius-sm:6px;
}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;min-height:100vh;display:flex}
a{color:var(--blue);text-decoration:none}

/* ── Login ── */
#loginScreen{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:1000}
.loginBox{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:40px;width:360px;text-align:center}
.loginBox h1{font-size:22px;margin-bottom:6px}.loginBox p{color:var(--text2);margin-bottom:24px;font-size:13px}
.loginInput{width:100%;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:14px;margin-bottom:12px}
.loginInput:focus{outline:none;border-color:var(--blue)}
.loginBtn{width:100%;padding:10px;background:var(--blue);border:none;border-radius:var(--radius);color:#fff;font-size:14px;font-weight:600;cursor:pointer}
.loginBtn:hover{opacity:.9}.loginErr{color:var(--red);font-size:12px;margin-top:8px}

/* ── Layout ── */
#sidebar{width:220px;flex-shrink:0;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;height:100vh;position:sticky;top:0}
.sidebarLogo{padding:20px 16px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
.sidebarLogo .logoMark{width:32px;height:32px;background:linear-gradient(135deg,#1f6feb,#388bfd);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;flex-shrink:0}
.sidebarLogo .logoText{font-weight:700;font-size:15px;color:var(--text)}
.sidebarLogo .logoBadge{font-size:10px;color:var(--text3);background:var(--bg4);padding:2px 6px;border-radius:4px;margin-left:auto}
nav{flex:1;padding:8px 0;overflow-y:auto}
.navItem{display:flex;align-items:center;gap:10px;padding:8px 16px;color:var(--text2);cursor:pointer;border-radius:0;transition:background .12s,color .12s;border:none;background:none;width:100%;text-align:left;font-size:13px}
.navItem:hover{background:var(--bg3);color:var(--text)}
.navItem.active{background:rgba(88,166,255,.1);color:var(--blue);font-weight:600}
.navItem .navIcon{font-size:15px;width:20px;text-align:center;flex-shrink:0}
.navItem .navBadge{margin-left:auto;background:var(--green);color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;font-weight:700}
.navItem .navBadgeRed{background:var(--red)}
.sidebarFooter{padding:12px 16px;border-top:1px solid var(--border);font-size:11px;color:var(--text3)}
.serverDot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);margin-right:5px;vertical-align:middle}
.serverDot.red{background:var(--red)}

/* ── Main ── */
#main{flex:1;overflow-y:auto;padding:0}
.pageHeader{padding:20px 24px 0;border-bottom:1px solid var(--border);margin-bottom:0}
.pageHeader h1{font-size:20px;font-weight:700;margin-bottom:4px}
.pageHeader p{color:var(--text2);font-size:13px;padding-bottom:16px}
.pageBody{padding:20px 24px}

/* ── Cards ── */
.statsRow{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px}
.statCard{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:16px}
.statCard .statLabel{font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
.statCard .statVal{font-size:26px;font-weight:700;line-height:1;color:var(--text)}
.statCard .statSub{font-size:11px;color:var(--text3);margin-top:4px}
.statCard.green .statVal{color:var(--green)}
.statCard.blue .statVal{color:var(--blue)}
.statCard.yellow .statVal{color:var(--yellow)}
.statCard.red .statVal{color:var(--red)}
.statCard.purple .statVal{color:var(--purple)}

/* ── Panels ── */
.panel{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:16px;overflow:hidden}
.panelHeader{padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.panelHeader h2{font-size:14px;font-weight:600}
.panelBody{padding:16px}
.panelGrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:900px){.panelGrid{grid-template-columns:1fr}}

/* ── Table ── */
.tableWrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th{padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text2);border-bottom:1px solid var(--border);font-weight:600;white-space:nowrap}
td{padding:9px 12px;border-bottom:1px solid var(--border);color:var(--text);vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,.02)}

/* ── Badges ── */
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;white-space:nowrap}
.badge.green{background:rgba(63,185,80,.15);color:var(--green)}
.badge.red{background:rgba(248,81,73,.15);color:var(--red)}
.badge.yellow{background:rgba(210,153,34,.15);color:var(--yellow)}
.badge.blue{background:rgba(88,166,255,.15);color:var(--blue)}
.badge.gray{background:var(--bg4);color:var(--text2)}
.badge.purple{background:rgba(188,140,255,.15);color:var(--purple)}
.dot{width:6px;height:6px;border-radius:50%;display:inline-block}
.dot.green{background:var(--green)}.dot.red{background:var(--red)}.dot.yellow{background:var(--yellow)}.dot.gray{background:var(--text3)}

/* ── Buttons ── */
.btn{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:12px;font-weight:500;cursor:pointer;transition:border-color .12s,background .12s;white-space:nowrap}
.btn:hover{border-color:var(--border2);background:var(--bg4)}
.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}
.btn.primary:hover{opacity:.9}
.btn.danger{background:rgba(248,81,73,.15);border-color:rgba(248,81,73,.4);color:var(--red)}
.btn.danger:hover{background:rgba(248,81,73,.25)}
.btn.success{background:rgba(63,185,80,.15);border-color:rgba(63,185,80,.4);color:var(--green)}
.btn.success:hover{background:rgba(63,185,80,.25)}
.btn.sm{padding:4px 8px;font-size:11px}
.btnGroup{display:flex;gap:6px;flex-wrap:wrap}

/* ── Forms ── */
.formRow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.formRow label{font-size:12px;color:var(--text2);white-space:nowrap}
input.fi,select.fi{padding:7px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:13px;min-width:0}
input.fi:focus,select.fi:focus{outline:none;border-color:var(--blue)}
input.fi.sm{padding:5px 8px;font-size:12px}

/* ── Status indicators ── */
.statusLine{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px}
.statusLine:last-child{border-bottom:none}
.statusLine .sLabel{color:var(--text2);min-width:160px}
.statusLine .sVal{color:var(--text);font-weight:500}

/* ── Flow diagram ── */
.flowDiagram{display:flex;flex-direction:column;gap:0;align-items:flex-start;padding:8px 0}
.flowNode{display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:4px;min-width:280px;position:relative}
.flowNode .fnIcon{font-size:16px;width:24px;text-align:center}
.flowNode .fnLabel{font-weight:600;font-size:13px}
.flowNode .fnSub{font-size:11px;color:var(--text2);margin-top:1px}
.flowNode .fnStatus{margin-left:auto}
.flowArrow{padding:0 0 0 26px;color:var(--text3);font-size:18px;line-height:1;margin-bottom:4px}

/* ── Logs ── */
.logBox{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;font-family:'Courier New',monospace;font-size:12px;max-height:400px;overflow-y:auto}
.logLine{padding:2px 0;border-bottom:1px solid rgba(255,255,255,.03);display:flex;gap:8px}
.logLine:last-child{border-bottom:none}
.logTime{color:var(--text3);flex-shrink:0}
.logMsg{color:var(--text2);word-break:break-word}
.logMsg.error{color:var(--red)}
.logMsg.warn{color:var(--yellow)}

/* ── Online indicator ── */
.onlineDot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

/* ── Empty state ── */
.empty{text-align:center;padding:40px;color:var(--text3);font-size:13px}

/* ── Tabs ── */
.tabs{display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:16px}
.tab{padding:8px 16px;font-size:13px;color:var(--text2);cursor:pointer;border-bottom:2px solid transparent;background:none;border-top:none;border-left:none;border-right:none}
.tab:hover{color:var(--text)}
.tab.active{color:var(--blue);border-bottom-color:var(--blue);font-weight:600}

/* ── Toast ── */
#toast{position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px}
.toastMsg{padding:10px 16px;border-radius:var(--radius);font-size:13px;font-weight:500;min-width:200px;animation:slideIn .2s ease}
.toastMsg.ok{background:#1a3a2a;border:1px solid var(--green);color:var(--green)}
.toastMsg.err{background:#3a1a1a;border:1px solid var(--red);color:var(--red)}
@keyframes slideIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}

/* ── Refresh bar ── */
.refreshBar{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text3)}
.refreshBar select.fi{padding:4px 8px;font-size:12px}
</style>
</head>
<body>

<!-- Login -->
<div id="loginScreen">
  <div class="loginBox">
    <h1>🔐 TradeForge Admin</h1>
    <p>Введите токен администратора для входа</p>
    <input id="tokenInput" class="loginInput" type="password" placeholder="ADMIN_TOKEN" autocomplete="off">
    <button class="loginBtn" id="loginBtn">Войти</button>
    <div class="loginErr" id="loginErr"></div>
  </div>
</div>

<!-- App -->
<div id="app" style="display:none;width:100%;display:none">

  <div id="sidebar">
    <div class="sidebarLogo">
      <div class="logoMark">TF</div>
      <span class="logoText">Admin</span>
      <span class="logoBadge">v2</span>
    </div>
    <nav id="nav">
      <button class="navItem active" data-page="dashboard"><span class="navIcon">◉</span> Дашборд</button>
      <button class="navItem" data-page="users"><span class="navIcon">👤</span> Пользователи</button>
      <button class="navItem" data-page="trades"><span class="navIcon">📊</span> Сделки</button>
      <button class="navItem" data-page="engine"><span class="navIcon">⚙</span> Торговый движок</button>
      <button class="navItem" data-page="flow"><span class="navIcon">⟳</span> Потоки данных</button>
      <button class="navItem" data-page="server"><span class="navIcon">🖥</span> Сервер</button>
      <button class="navItem" data-page="extensions"><span class="navIcon">🧩</span> Расширения</button>
      <button class="navItem" data-page="settings"><span class="navIcon">⚙</span> Настройки</button>
    </nav>
    <div class="sidebarFooter">
      <span class="serverDot" id="sidebarDot"></span>
      <span id="sidebarStatus">Проверка...</span><br>
      <span id="sidebarUptime" style="margin-top:3px;display:block"></span>
    </div>
  </div>

  <div id="main">
    <div id="pageContent"></div>
  </div>

</div>

<div id="toast"></div>

<script>
// ═══════════════════════════════════════════════
//  CORE
// ═══════════════════════════════════════════════
let TOKEN = sessionStorage.getItem("admin_token") || "";
let _currentPage = "dashboard";
let _autoRefresh = null;
let _refreshSec = 30;

const BASE = window.location.origin;

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", "X-Admin-Token": TOKEN, ...(opts.headers || {}) }
  });
  if (res.status === 403) throw new Error("FORBIDDEN");
  if (!res.ok) throw new Error("HTTP_" + res.status);
  return res.json();
}
async function post(path, body) { return api(path, { method: "POST", body: JSON.stringify(body) }); }

function toast(msg, type = "ok") {
  const el = document.createElement("div");
  el.className = "toastMsg " + type;
  el.textContent = msg;
  document.getElementById("toast").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(typeof iso === "number" ? iso : iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleString("ru-RU", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
}
function fmtUptime(sec) {
  if (!sec) return "—";
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return d ? d + "д " + h + "ч" : h ? h + "ч " + m + "м" : m + "м";
}
function badge(text, cls) { return '<span class="badge ' + cls + '">' + esc(text) + '</span>'; }
function statusBadge(s) {
  if (s === "active")  return badge("● Активен",   "green");
  if (s === "trial")   return badge("◎ Триал",     "blue");
  if (s === "blocked") return badge("✕ Заблокирован","red");
  return badge(s, "gray");
}
function resultBadge(r) {
  if (r === "WIN")  return badge("WIN",  "green");
  if (r === "LOSS") return badge("LOSS", "red");
  return badge(r || "?", "gray");
}

// ═══════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════
async function doLogin(t) {
  const errEl = document.getElementById("loginErr");
  const btn   = document.getElementById("loginBtn");
  errEl.textContent = "Подключение...";
  btn.disabled = true;
  try {
    const res = await fetch(BASE + "/admin/metrics", {
      headers: { "Content-Type": "application/json", "X-Admin-Token": t }
    });
    if (res.status === 403) {
      errEl.textContent = "Неверный токен (403)";
      return;
    }
    if (!res.ok) {
      errEl.textContent = "Ошибка сервера: HTTP " + res.status;
      return;
    }
    const data = await res.json();
    if (!data?.ok) {
      errEl.textContent = "Сервер вернул ok:false";
      return;
    }
    TOKEN = t;
    sessionStorage.setItem("admin_token", TOKEN);
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("app").style.display = "flex";
    errEl.textContent = "";
    init();
  } catch(e) {
    errEl.textContent = "Ошибка: " + e.message;
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("loginBtn").onclick = () => {
  const t = document.getElementById("tokenInput").value.trim();
  if (t) doLogin(t);
};
document.getElementById("tokenInput").addEventListener("keydown", e => { if (e.key === "Enter") { const t = e.target.value.trim(); if (t) doLogin(t); } });

function logout() {
  sessionStorage.removeItem("admin_token");
  TOKEN = "";
  location.reload();
}

// ═══════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════
document.getElementById("nav").addEventListener("click", e => {
  const btn = e.target.closest("[data-page]");
  if (!btn) return;
  document.querySelectorAll(".navItem").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  _currentPage = btn.dataset.page;
  renderPage(_currentPage);
});

function renderPage(page) {
  const pages = {
    dashboard:  pageDashboard,
    users:      pageUsers,
    trades:     pageTrades,
    engine:     pageEngine,
    flow:       pageFlow,
    server:     pageServer,
    extensions: pageExtensions,
    settings:   pageSettings,
  };
  (pages[page] || pageDashboard)();
}

// ═══════════════════════════════════════════════
//  AUTO-REFRESH
// ═══════════════════════════════════════════════
function startRefresh() {
  if (_autoRefresh) clearInterval(_autoRefresh);
  if (_refreshSec > 0) _autoRefresh = setInterval(() => renderPage(_currentPage), _refreshSec * 1000);
}

// ═══════════════════════════════════════════════
//  PAGES
// ═══════════════════════════════════════════════

// ── DASHBOARD ──────────────────────────────────
async function pageDashboard() {
  setContent('<div class="pageHeader"><h1>Дашборд</h1><p>Общее состояние системы в реальном времени</p></div><div class="pageBody"><div id="dashBody">Загрузка...</div></div>');
  const [metrics, state] = await Promise.all([
    api("/admin/metrics").catch(() => null),
    api("/state").catch(() => null)
  ]);
  if (!metrics) { document.getElementById("dashBody").innerHTML = '<div class="empty">Ошибка загрузки метрик</div>'; return; }
  const m = metrics;
  const upStr = fmtUptime(m.server?.uptime);

  // update sidebar
  document.getElementById("sidebarDot").className = "serverDot";
  document.getElementById("sidebarStatus").textContent = "Сервер онлайн";
  document.getElementById("sidebarUptime").textContent = upStr;

  document.getElementById("dashBody").innerHTML =
    '<div class="statsRow">' +
    stat("Пользователи", m.users?.total, "Всего зарегистрировано", "blue") +
    stat("Активных лицензий", m.users?.active, "Оплатили доступ", "green") +
    stat("Триал", m.users?.trial, "Тестируют", "yellow") +
    stat("Заблокировано", m.users?.blocked, "", "red") +
    stat("Сделок сегодня", m.trades?.today, "Всего: " + (m.trades?.total || 0), "blue") +
    stat("WinRate", (m.trades?.winRate || 0) + "%", "Сегодня: " + (m.trades?.wins || 0) + "W / " + (m.trades?.losses || 0) + "L", m.trades?.winRate >= 60 ? "green" : m.trades?.winRate >= 50 ? "yellow" : "red") +
    stat("Активов (тики)", m.engine?.tickSymbols, "Получают котировки", "purple") +
    stat("RAM", (m.server?.memMB || 0) + " MB", "Heap used", "") +
    stat("Расширений онлайн", m.extensions?.online, "Всего видели: " + (m.extensions?.total || 0), "green") +
    '</div>' +

    '<div class="panelGrid">' +

    '<div class="panel"><div class="panelHeader"><h2>🖥 Сервер</h2></div><div class="panelBody">' +
    statusLine("Статус", '<span class="badge green">● Работает</span>') +
    statusLine("Версия", esc(m.server?.version || "?")) +
    statusLine("Порт", esc(m.server?.port || "?")) +
    statusLine("Uptime", upStr) +
    statusLine("Память", (m.server?.memMB || 0) + " MB heap") +
    '</div></div>' +

    '<div class="panel"><div class="panelHeader"><h2>⚙ Торговый движок</h2></div><div class="panelBody">' +
    statusLine("Состояние", m.engine?.enabled ? '<span class="badge green">▶ Работает</span>' : '<span class="badge gray">⏹ Остановлен</span>') +
    statusLine("Индикаторов", esc(m.engine?.indicators)) +
    statusLine("Символов с тиками", esc(m.engine?.tickSymbols)) +
    statusLine("Последний тик", fmtTime(m.engine?.lastTickAt)) +
    '</div></div>' +

    '<div class="panel"><div class="panelHeader"><h2>👤 Пользователи</h2></div><div class="panelBody">' +
    statusLine("Активных", '<span class="badge green">' + (m.users?.active || 0) + '</span>') +
    statusLine("Триал", '<span class="badge blue">' + (m.users?.trial || 0) + '</span>') +
    statusLine("Заблокировано", '<span class="badge red">' + (m.users?.blocked || 0) + '</span>') +
    statusLine("Всего", esc(m.users?.total)) +
    '</div></div>' +

    '<div class="panel"><div class="panelHeader"><h2>📊 Торговля сегодня</h2></div><div class="panelBody">' +
    statusLine("Сделок", esc(m.trades?.today)) +
    statusLine("Побед", '<span class="badge green">' + (m.trades?.wins || 0) + '</span>') +
    statusLine("Проигрышей", '<span class="badge red">' + (m.trades?.losses || 0) + '</span>') +
    statusLine("WinRate", '<b>' + (m.trades?.winRate || 0) + '%</b>') +
    '</div></div>' +

    '</div>';
}

function stat(label, val, sub, cls) {
  return '<div class="statCard ' + cls + '"><div class="statLabel">' + esc(label) + '</div><div class="statVal">' + esc(String(val ?? "—")) + '</div>' + (sub ? '<div class="statSub">' + esc(sub) + '</div>' : '') + '</div>';
}
function statusLine(label, val) {
  return '<div class="statusLine"><span class="sLabel">' + esc(label) + '</span><span class="sVal">' + val + '</span></div>';
}

// ── USERS ──────────────────────────────────────
let _usersData = [];
async function pageUsers() {
  setContent('<div class="pageHeader"><h1>Пользователи</h1><p>Лицензии, статусы, управление доступом</p></div><div class="pageBody"><div id="usersBody">Загрузка...</div></div>');
  const data = await api("/admin/users").catch(() => null);
  if (!data?.ok) { document.getElementById("usersBody").innerHTML = '<div class="empty">Ошибка загрузки</div>'; return; }
  _usersData = data.users || [];

  const html =
    '<div class="formRow" style="margin-bottom:16px">' +
    '<label>Поиск:</label><input class="fi" id="userSearch" placeholder="ID / ключ / статус" style="width:260px">' +
    '<select class="fi" id="userFilter"><option value="">Все статусы</option><option value="active">Активные</option><option value="trial">Триал</option><option value="blocked">Заблокированные</option></select>' +
    '<button class="btn primary" id="createKeyBtn">+ Новый ключ</button>' +
    '</div>' +
    '<div class="panel"><div class="panelHeader"><h2>Пользователи <span id="userCount" style="color:var(--text3);font-weight:400"></span></h2><div class="refreshBar"><button class="btn sm" id="refreshUsersBtn">↺ Обновить</button></div></div>' +
    '<div class="tableWrap"><table id="usersTable"><thead><tr>' +
    '<th>Platform ID</th><th>Статус</th><th>Сделок</th><th>Лицензионный ключ</th><th>Зарегистрирован</th><th>Активирован</th><th>Действия</th>' +
    '</tr></thead><tbody id="usersTbody"></tbody></table></div></div>';

  document.getElementById("usersBody").innerHTML = html;
  renderUsersTable(_usersData);

  document.getElementById("userSearch").addEventListener("input", filterUsers);
  document.getElementById("userFilter").addEventListener("change", filterUsers);
  document.getElementById("refreshUsersBtn").addEventListener("click", pageUsers);
  document.getElementById("createKeyBtn").addEventListener("click", showCreateKeyModal);
}

function filterUsers() {
  const q = document.getElementById("userSearch")?.value?.toLowerCase() || "";
  const f = document.getElementById("userFilter")?.value || "";
  const filtered = _usersData.filter(u => {
    const matchQ = !q || (u.platformId || "").toLowerCase().includes(q) || (u.licenseKey || "").toLowerCase().includes(q) || (u.status || "").includes(q);
    const matchF = !f || u.status === f;
    return matchQ && matchF;
  });
  renderUsersTable(filtered);
}

function renderUsersTable(users) {
  const cnt = document.getElementById("userCount");
  if (cnt) cnt.textContent = "(" + users.length + ")";
  const tbody = document.getElementById("usersTbody");
  if (!tbody) return;
  if (!users.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">Нет пользователей</td></tr>'; return; }
  tbody.innerHTML = users.map(u => {
    const trialPct = u.status === "trial" ? Math.round((u.tradesUsed || 0) / 100 * 100) : null;
    return '<tr data-pid="' + esc(u.platformId) + '">' +
      '<td><code style="font-size:11px;color:var(--text2)">' + esc(u.platformId) + '</code></td>' +
      '<td>' + statusBadge(u.status) + (trialPct !== null ? ' <span style="font-size:11px;color:var(--text3)">' + trialPct + '%</span>' : '') + '</td>' +
      '<td>' + esc(u.tradesUsed || 0) + '</td>' +
      '<td><code style="font-size:11px">' + esc(u.licenseKey || "—") + '</code></td>' +
      '<td style="color:var(--text3);font-size:12px">' + fmtTime(u.createdAt) + '</td>' +
      '<td style="color:var(--text3);font-size:12px">' + (u.activatedAt ? fmtTime(u.activatedAt) : '<span style="color:var(--text3)">—</span>') + '</td>' +
      '<td><div class="btnGroup">' +
        (u.status !== "active" ? '<button class="btn success sm" onclick="adminActivate(\'' + esc(u.platformId) + '\')">Активировать</button>' : '') +
        (u.status !== "blocked" ? '<button class="btn danger sm" onclick="adminBlock(\'' + esc(u.platformId) + '\')">Блок</button>' : '<button class="btn sm" onclick="adminActivate(\'' + esc(u.platformId) + '\')">Разблокировать</button>') +
        '<button class="btn sm" onclick="adminResetTrial(\'' + esc(u.platformId) + '\')">Сброс триала</button>' +
        (u.licenseKey ? '<button class="btn sm" onclick="adminRebind(\'' + esc(u.licenseKey) + '\')">Сброс привязки</button>' : '') +
      '</div></td>' +
    '</tr>';
  }).join("");
}

async function adminActivate(pid) {
  const r = await post("/admin/activate", { platform_id: pid }).catch(() => null);
  if (r?.ok) { toast("Активировано: " + pid); pageUsers(); } else toast("Ошибка", "err");
}
async function adminBlock(pid) {
  if (!confirm("Заблокировать " + pid + "?")) return;
  const r = await post("/admin/block", { platform_id: pid }).catch(() => null);
  if (r?.ok) { toast("Заблокировано"); pageUsers(); } else toast("Ошибка", "err");
}
async function adminResetTrial(pid) {
  if (!confirm("Сбросить триал " + pid + "?")) return;
  const r = await post("/admin/reset-trial", { platform_id: pid }).catch(() => null);
  if (r?.ok) { toast("Триал сброшен"); pageUsers(); } else toast("Ошибка", "err");
}
async function adminRebind(key) {
  if (!confirm("Сбросить привязку ключа " + key + "?")) return;
  const r = await post("/admin/rebind", { key }).catch(() => null);
  if (r?.ok) { toast("Привязка сброшена"); pageUsers(); } else toast("Ошибка", "err");
}
async function showCreateKeyModal() {
  const pid = prompt("Platform ID для нового ключа (оставьте пустым — сгенерируется автоматически):");
  if (pid === null) return;
  const r = await post("/admin/create-key", { platform_id: pid || undefined }).catch(() => null);
  if (r?.ok) {
    toast("Ключ создан: " + (r.status?.licenseKey || "OK"));
    pageUsers();
  } else toast("Ошибка создания ключа", "err");
}

// ── TRADES ──────────────────────────────────────
async function pageTrades() {
  setContent('<div class="pageHeader"><h1>Сделки</h1><p>История торговли с фильтрами</p></div><div class="pageBody"><div id="tradesBody">Загрузка...</div></div>');
  const data = await api("/auto/history?limit=500").catch(() => null);
  if (!data?.ok) { document.getElementById("tradesBody").innerHTML = '<div class="empty">Ошибка загрузки</div>'; return; }
  const trades = data.trades || [];
  const stats = data.stats || {};
  const indStats = data.indicatorStats || {};

  const today = new Date().toISOString().slice(0, 10);

  document.getElementById("tradesBody").innerHTML =
    '<div class="statsRow">' +
    stat("Всего сделок", stats.total || 0, "", "blue") +
    stat("Побед", stats.wins || 0, "", "green") +
    stat("Проигрышей", stats.losses || 0, "", "red") +
    stat("WinRate", stats.total ? Math.round((stats.wins || 0) / stats.total * 100) + "%" : "—", "", (stats.wins / (stats.total || 1)) >= 0.6 ? "green" : "yellow") +
    '</div>' +

    '<div class="panel"><div class="panelHeader"><h2>Последние сделки</h2>' +
    '<div class="formRow" style="margin:0;gap:8px">' +
    '<select class="fi sm" id="trFilter"><option value="">Все</option><option value="WIN">WIN</option><option value="LOSS">LOSS</option><option value="DRAW">DRAW</option></select>' +
    '<input class="fi sm" id="trSymbol" placeholder="Актив..." style="width:110px">' +
    '<button class="btn sm" id="refreshTradesBtn">↺</button>' +
    '</div></div>' +
    '<div class="tableWrap"><table><thead><tr><th>Время</th><th>Пара</th><th>Тип</th><th>Сумма</th><th>Результат</th><th>P/L</th><th>Payout</th><th>Источник</th></tr></thead>' +
    '<tbody id="tradesTbody"></tbody></table></div></div>';

  let _trades = trades;
  function renderTrades() {
    const f = document.getElementById("trFilter")?.value || "";
    const s = (document.getElementById("trSymbol")?.value || "").toUpperCase();
    const filtered = _trades.filter(t => (!f || t.result === f) && (!s || (t.symbol || "").toUpperCase().includes(s)));
    const tbody = document.getElementById("tradesTbody");
    if (!tbody) return;
    if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty">Нет сделок</td></tr>'; return; }
    tbody.innerHTML = filtered.slice(0, 200).map(t =>
      '<tr>' +
      '<td style="color:var(--text3);font-size:12px;white-space:nowrap">' + fmtTime(t.closedAt || t.openedAt) + '</td>' +
      '<td><b>' + esc(t.symbol || "?") + '</b></td>' +
      '<td>' + (t.action === "CALL" ? '<span style="color:var(--green)">▲ CALL</span>' : '<span style="color:var(--red)">▼ PUT</span>') + '</td>' +
      '<td>$' + esc(t.amount || 0) + '</td>' +
      '<td>' + resultBadge(t.result) + '</td>' +
      '<td style="' + (t.pnl > 0 ? 'color:var(--green)' : t.pnl < 0 ? 'color:var(--red)' : '') + '">' + (t.pnl != null ? (t.pnl > 0 ? '+' : '') + '$' + Number(t.pnl).toFixed(2) : '—') + '</td>' +
      '<td>' + esc(t.payoutPercent ? t.payoutPercent + "%" : "—") + '</td>' +
      '<td style="color:var(--text3);font-size:11px">' + esc(t.source || t.meta?.source || "—") + '</td>' +
      '</tr>'
    ).join("");
  }
  renderTrades();
  document.getElementById("trFilter")?.addEventListener("change", renderTrades);
  document.getElementById("trSymbol")?.addEventListener("input", renderTrades);
  document.getElementById("refreshTradesBtn")?.addEventListener("click", pageTrades);
}

// ── ENGINE ──────────────────────────────────────
async function pageEngine() {
  setContent('<div class="pageHeader"><h1>Торговый движок</h1><p>Состояние SignalRunner, индикаторов и тиков</p></div><div class="pageBody"><div id="engineBody">Загрузка...</div></div>');
  const [state, bridge] = await Promise.all([
    api("/auto/status").catch(() => null),
    api("/bridge/status").catch(() => null)
  ]);
  const cfg = state?.config || {};
  const indicators = cfg.indicators || [];

  document.getElementById("engineBody").innerHTML =
    '<div class="panelGrid">' +

    '<div class="panel"><div class="panelHeader"><h2>SignalRunner</h2></div><div class="panelBody">' +
    statusLine("Состояние", cfg.enabled ? '<span class="badge green">▶ Запущен</span>' : '<span class="badge gray">⏹ Остановлен</span>') +
    statusLine("Режим счёта", esc(cfg.accountMode || "—")) +
    statusLine("Таймфрейм", esc(cfg.timeframe || "—")) +
    statusLine("Экспирация", esc(cfg.expirySec ? cfg.expirySec + "с" : "—")) +
    statusLine("Сумма сделки", esc(cfg.amount ? "$" + cfg.amount : "—")) +
    statusLine("Cooldown", esc(cfg.cooldownMs ? cfg.cooldownMs + "мс" : "—")) +
    statusLine("Мин. выплата", esc(cfg.minPayoutPercent ? cfg.minPayoutPercent + "%" : "—")) +
    statusLine("Мартингейл", cfg.martingaleEnabled ? '<span class="badge yellow">Включён × ' + (cfg.martingaleMultiplier || 2) + '</span>' : '<span class="badge gray">Выключен</span>') +
    '</div></div>' +

    '<div class="panel"><div class="panelHeader"><h2>Поток тиков</h2></div><div class="panelBody">' +
    statusLine("Символов с тиками", esc(bridge?.prices?.total || 0)) +
    statusLine("Целевых символов", esc(bridge?.targets?.total || 0)) +
    statusLine("Покрытие", esc(bridge?.targets?.withLatest || 0) + ' / ' + esc(bridge?.targets?.total || 0)) +
    statusLine("Ключей свечей", esc(bridge?.candles?.keys || 0)) +
    statusLine("Таймфреймов", esc((bridge?.timeframes || []).join(", ") || "—")) +
    '</div></div>' +

    '</div>' +

    '<div class="panel"><div class="panelHeader"><h2>Индикаторы в конфиге (' + indicators.length + ')</h2></div>' +
    (indicators.length
      ? '<div class="tableWrap"><table><thead><tr><th>ID</th><th>Активы</th><th>Сумма</th><th>Экспирация</th><th>SL</th><th>TP</th></tr></thead><tbody>' +
        indicators.map(ind =>
          '<tr>' +
          '<td><b>' + esc(ind.id || ind.name || "?") + '</b></td>' +
          '<td style="font-size:11px;color:var(--text2)">' + esc((ind.assets || []).slice(0,5).join(", ") + ((ind.assets || []).length > 5 ? "..." : "") || "все") + '</td>' +
          '<td>' + esc(ind.settings?.amount ? "$" + ind.settings.amount : cfg.amount ? "$" + cfg.amount : "—") + '</td>' +
          '<td>' + esc(ind.settings?.expirySec ? ind.settings.expirySec + "с" : cfg.expirySec ? cfg.expirySec + "с" : "—") + '</td>' +
          '<td>' + esc(ind.settings?.stopLoss ? "$" + ind.settings.stopLoss : "—") + '</td>' +
          '<td>' + esc(ind.settings?.takeProfit ? "$" + ind.settings.takeProfit : "—") + '</td>' +
          '</tr>'
        ).join("") +
        '</tbody></table></div>'
      : '<div class="empty">Индикаторы не добавлены</div>') +
    '</div>' +

    '<div class="panel"><div class="panelHeader"><h2>Активные задачи</h2><button class="btn sm" onclick="pageEngine()">↺</button></div><div id="tasksBox" class="panelBody">Загрузка...</div></div>';

  const tasks = await api("/tasks").catch(() => null);
  const tb = document.getElementById("tasksBox");
  if (tb) {
    const list = tasks?.tasks || [];
    tb.innerHTML = list.length
      ? '<div class="tableWrap"><table><thead><tr><th>ID</th><th>Пара</th><th>Тип</th><th>Сумма</th><th>Статус</th><th>Открыта</th></tr></thead><tbody>' +
        list.slice(0, 50).map(t =>
          '<tr><td style="font-size:11px;color:var(--text3)">' + esc(String(t.id || "").slice(0,8)) + '…</td>' +
          '<td><b>' + esc(t.symbol) + '</b></td>' +
          '<td>' + (t.action === "CALL" ? '<span style="color:var(--green)">▲ CALL</span>' : '<span style="color:var(--red)">▼ PUT</span>') + '</td>' +
          '<td>$' + esc(t.amount) + '</td>' +
          '<td>' + badge(t.status || "?", t.status === "PENDING" ? "yellow" : "gray") + '</td>' +
          '<td style="font-size:12px;color:var(--text3)">' + fmtTime(t.openedAt) + '</td></tr>'
        ).join("") + '</tbody></table></div>'
      : '<div class="empty" style="padding:20px">Нет активных задач</div>';
  }
}

// ── FLOW ──────────────────────────────────────
async function pageFlow() {
  setContent('<div class="pageHeader"><h1>Мониторинг потоков данных</h1><p>Статус каждого компонента в цепочке обработки</p></div><div class="pageBody"><div id="flowBody">Загрузка...</div></div>');
  const [state, bridge, health] = await Promise.all([
    api("/state").catch(() => null),
    api("/bridge/status").catch(() => null),
    api("/health").catch(() => null)
  ]);

  const tickOk = (bridge?.prices?.total || 0) > 0;
  const candleOk = (bridge?.candles?.keys || 0) > 0;
  const engineOk = state?.auto?.config?.enabled;
  const tasksOk  = (state?.tasks?.pending || 0) >= 0;
  const tradesOk = (state?.trades?.total || 0) >= 0;

  function node(icon, label, sub, ok, detail) {
    const cls = ok ? "green" : "red";
    const dot = ok ? "🟢" : "🔴";
    return '<div class="flowNode">' +
      '<span class="fnIcon">' + icon + '</span>' +
      '<div><div class="fnLabel">' + esc(label) + '</div><div class="fnSub">' + esc(sub) + '</div></div>' +
      '<div class="fnStatus">' + badge(ok ? "OK" : "Нет данных", ok ? "green" : "red") + '</div>' +
      (detail ? '<div style="margin-left:auto;font-size:11px;color:var(--text3)">' + esc(detail) + '</div>' : '') +
      '</div>';
  }
  const arrow = '<div class="flowArrow">↓</div>';

  document.getElementById("flowBody").innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">' +

    '<div>' +
    '<h3 style="margin-bottom:12px;color:var(--text2);font-size:12px;text-transform:uppercase;letter-spacing:.05em">Поток данных</h3>' +
    '<div class="flowDiagram">' +
    node("🌐", "Pocket Option", "Источник котировок", tickOk, "") +
    arrow +
    node("📡", "Tick Store", "Хранилище тиков", tickOk, (bridge?.prices?.total || 0) + " символов") +
    arrow +
    node("🕯", "Candle Builder", "Построение свечей", candleOk, (bridge?.candles?.keys || 0) + " ключей") +
    arrow +
    node("⚡", "Signal Engine", "Анализ сигналов", engineOk === true, engineOk ? "Запущен" : "Остановлен") +
    arrow +
    node("📋", "Task Store", "Очередь задач", tasksOk, (state?.tasks?.pending || 0) + " ожидают") +
    arrow +
    node("📈", "Trade Tracker", "Учёт сделок", tradesOk, (state?.trades?.total || 0) + " всего") +
    '</div></div>' +

    '<div>' +
    '<h3 style="margin-bottom:12px;color:var(--text2);font-size:12px;text-transform:uppercase;letter-spacing:.05em">Детали компонентов</h3>' +
    '<div class="panel"><div class="panelBody">' +
    statusLine("Сервер", badge(health?.status || "?", health?.ok ? "green" : "red")) +
    statusLine("Версия", esc(health?.version || "?")) +
    statusLine("Символов с тиками", esc(bridge?.prices?.total || 0)) +
    statusLine("Целевых символов", esc(bridge?.targets?.total || 0)) +
    statusLine("Покрытие целей", esc(bridge?.targets?.withLatest || 0) + " / " + esc(bridge?.targets?.total || 0)) +
    statusLine("Свечей (ключей)", esc(bridge?.candles?.keys || 0)) +
    statusLine("Задач в очереди", esc(state?.tasks?.pending || 0)) +
    statusLine("Задач выполнено", esc(state?.tasks?.completed || 0)) +
    statusLine("Сделок всего", esc(state?.trades?.total || 0)) +
    statusLine("WIN / LOSS", esc(state?.trades?.wins || 0) + " / " + esc(state?.trades?.losses || 0)) +
    '</div></div>' +

    '<div class="panel" style="margin-top:12px"><div class="panelHeader"><h2>Payouts</h2></div><div class="panelBody">' +
    statusLine("Записей выплат", esc(state?.payouts?.count || 0)) +
    statusLine("Последнее обновление", fmtTime(state?.payouts?.lastUpdatedAt)) +
    '</div></div>' +

    '</div></div>';
}

// ── SERVER ──────────────────────────────────────
async function pageServer() {
  setContent('<div class="pageHeader"><h1>Сервер</h1><p>Здоровье, конфигурация и логи</p></div><div class="pageBody"><div id="serverBody">Загрузка...</div></div>');
  const [health, metrics, logs] = await Promise.all([
    api("/health").catch(() => null),
    api("/admin/metrics").catch(() => null),
    api("/admin/logs?limit=100").catch(() => null)
  ]);

  document.getElementById("serverBody").innerHTML =
    '<div class="panelGrid">' +

    '<div class="panel"><div class="panelHeader"><h2>Статус</h2></div><div class="panelBody">' +
    statusLine("Состояние", badge("● Онлайн", "green")) +
    statusLine("Версия", esc(health?.version || "?")) +
    statusLine("Порт", esc(health?.port || "?")) +
    statusLine("Uptime", fmtUptime(metrics?.server?.uptime)) +
    statusLine("Память", (metrics?.server?.memMB || 0) + " MB heap") +
    statusLine("Время сервера", fmtTime(health?.time)) +
    '</div></div>' +

    '<div class="panel"><div class="panelHeader"><h2>Конфигурация</h2></div><div class="panelBody">' +
    statusLine("App Name", esc(health?.name || "?")) +
    statusLine("Build Tag", esc(health?.buildTag || "?")) +
    '</div></div>' +

    '</div>' +

    '<div class="panel"><div class="panelHeader"><h2>Журнал событий (последние 100 строк)</h2>' +
    '<div class="btnGroup"><button class="btn sm" id="refreshLogsBtn">↺ Обновить</button>' +
    '<select class="fi sm" id="logFilter"><option value="">Все</option><option value="error">Только ошибки</option><option value="warn">Только warnings</option></select>' +
    '</div></div>' +
    '<div class="panelBody" style="padding:0"><div class="logBox" id="logBox">Загрузка...</div></div></div>';

  renderLogs(logs?.logs || []);
  document.getElementById("refreshLogsBtn")?.addEventListener("click", async () => {
    const fresh = await api("/admin/logs?limit=100").catch(() => null);
    renderLogs(fresh?.logs || []);
  });
  document.getElementById("logFilter")?.addEventListener("change", () => renderLogs(logs?.logs || []));
}

function renderLogs(lines) {
  const box = document.getElementById("logBox");
  if (!box) return;
  const f = document.getElementById("logFilter")?.value || "";
  const filtered = f ? lines.filter(l => l.l === f) : lines;
  if (!filtered.length) { box.innerHTML = '<div class="empty" style="padding:20px">Нет записей</div>'; return; }
  box.innerHTML = filtered.slice().reverse().map(l =>
    '<div class="logLine">' +
    '<span class="logTime">' + new Date(l.t).toLocaleTimeString("ru-RU") + '</span>' +
    '<span class="logMsg ' + (l.l === "error" ? "error" : l.l === "warn" ? "warn" : "") + '">' + esc(l.m) + '</span>' +
    '</div>'
  ).join("");
}

// ── EXTENSIONS ──────────────────────────────────
async function pageExtensions() {
  setContent('<div class="pageHeader"><h1>Расширения</h1><p>Активность установленных расширений</p></div><div class="pageBody"><div id="extBody">Загрузка...</div></div>');
  const data = await api("/admin/extensions").catch(() => null);
  if (!data?.ok) { document.getElementById("extBody").innerHTML = '<div class="empty">Ошибка загрузки</div>'; return; }
  const exts = data.extensions || [];
  const online = exts.filter(e => e.online).length;

  document.getElementById("extBody").innerHTML =
    '<div class="statsRow">' +
    stat("Онлайн", online, "Активны последние 5 минут", "green") +
    stat("Всего видели", exts.length, "Уникальных расширений", "blue") +
    '</div>' +

    '<div class="panel"><div class="panelHeader"><h2>Список расширений</h2>' +
    '<button class="btn sm" onclick="pageExtensions()">↺ Обновить</button></div>' +
    (exts.length
      ? '<div class="tableWrap"><table><thead><tr><th>Platform ID</th><th>Статус</th><th>Версия</th><th>Браузер</th><th>IP</th><th>Последний ping</th></tr></thead><tbody>' +
        exts.map(e =>
          '<tr>' +
          '<td><code style="font-size:11px;color:var(--text2)">' + esc(e.platformId) + '</code></td>' +
          '<td>' + (e.online ? '<span class="badge green"><span class="onlineDot"></span> Онлайн</span>' : '<span class="badge gray">Офлайн</span>') + '</td>' +
          '<td>' + esc(e.version || "?") + '</td>' +
          '<td style="color:var(--text2)">' + esc(e.browser || "?") + '</td>' +
          '<td style="color:var(--text3);font-size:12px">' + esc(e.ip || "?") + '</td>' +
          '<td style="color:var(--text3);font-size:12px">' + (e.agoSec < 60 ? e.agoSec + "с назад" : Math.floor(e.agoSec / 60) + "м назад") + '</td>' +
          '</tr>'
        ).join("") + '</tbody></table></div>'
      : '<div class="empty" style="padding:30px">Ни одно расширение ещё не отправляло heartbeat.<br><span style="font-size:12px;color:var(--text3)">Расширение будет отправлять POST /extensions/heartbeat каждые 2 минуты.</span></div>') +
    '</div>';
}

// ── SETTINGS ──────────────────────────────────────
async function pageSettings() {
  setContent('<div class="pageHeader"><h1>Настройки</h1><p>Параметры системы, конфигурация торгового движка</p></div><div class="pageBody"><div id="settingsBody">Загрузка...</div></div>');
  const state = await api("/auto/status").catch(() => null);
  const cfg = state?.config || {};

  document.getElementById("settingsBody").innerHTML =
    '<div class="panel"><div class="panelHeader"><h2>Текущие параметры бота</h2><span style="font-size:12px;color:var(--text3)">Только просмотр — изменения через расширение</span></div>' +
    '<div class="panelBody">' +
    statusLine("Режим счёта",      esc(cfg.accountMode || "—")) +
    statusLine("Таймфрейм",        esc(cfg.timeframe || "—")) +
    statusLine("Экспирация",       esc(cfg.expirySec ? cfg.expirySec + "с" : "—")) +
    statusLine("Сумма сделки",     esc(cfg.amount ? "$" + cfg.amount : "—")) +
    statusLine("Cooldown",         esc(cfg.cooldownMs ? cfg.cooldownMs + "мс" : "—")) +
    statusLine("Мин. выплата",     esc(cfg.minPayoutPercent ? cfg.minPayoutPercent + "%" : "—")) +
    statusLine("Фильтр выплаты",   cfg.usePayoutFilter ? badge("Включён", "green") : badge("Выключен", "gray")) +
    statusLine("Мартингейл",       cfg.martingaleEnabled ? badge("Включён ×" + (cfg.martingaleMultiplier || 2), "yellow") : badge("Выключен", "gray")) +
    statusLine("Шагов мартингейл", esc(cfg.martingaleSteps || "—")) +
    statusLine("Индикаторов",      esc((cfg.indicators || []).length)) +
    statusLine("Watchlist",        esc((cfg.watchlist || []).slice(0,5).join(", ") + ((cfg.watchlist || []).length > 5 ? "..." : "") || "все активы")) +
    '</div></div>' +

    '<div class="panel" style="margin-top:16px"><div class="panelHeader"><h2>Управление сервером</h2></div><div class="panelBody">' +
    '<p style="color:var(--text2);font-size:13px;margin-bottom:16px">Аварийные действия для администратора</p>' +
    '<div class="btnGroup">' +
    '<button class="btn danger" onclick="emergencyStop()">🛑 Аварийная остановка торговли</button>' +
    '<button class="btn sm" onclick="resetDeposit()">↺ Сбросить разгон депозита</button>' +
    '</div></div></div>';
}

async function emergencyStop() {
  if (!confirm("АВАРИЙНАЯ ОСТАНОВКА: остановить всю торговлю прямо сейчас?")) return;
  const r = await post("/auto/emergencyStop", {}).catch(() => null);
  if (r?.ok) toast("Торговля остановлена"); else toast("Ошибка", "err");
}
async function resetDeposit() {
  if (!confirm("Сбросить активный разгон депозита?")) return;
  const r = await post("/deposits/reset", {}).catch(() => null);
  if (r?.ok) toast("Разгон сброшен"); else toast("Ошибка", "err");
}

// ═══════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════
function setContent(html) {
  document.getElementById("pageContent").innerHTML = html;
}

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════
async function init() {
  renderPage("dashboard");
  startRefresh();
}

// Auto-login if token already in session
if (TOKEN) {
  doLogin(TOKEN);
}
</script>
</body>
</html>`;
};
