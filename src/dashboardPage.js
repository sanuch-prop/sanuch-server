const CONFIG = require("./config");

function dashboardPage() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sanuch Auto Trading v2.1.4</title>
  <style>
    :root {
      --bg: #060d19;
      --panel: #0d1728;
      --panel2: #111f36;
      --panel3: #09111f;
      --line: #243653;
      --muted: #9eb1cf;
      --text: #edf5ff;
      --green: #48ff9a;
      --red: #ff5261;
      --yellow: #ffd166;
      --blue: #58a6ff;
      --violet: #b987ff;
      --cyan: #22d3ee;
      --shadow: 0 22px 70px rgba(0,0,0,.40);
      --side: 270px;
      --sideSmall: 82px;
    }

    * { box-sizing: border-box; }
    html, body { min-height: 100%; }

    body {
      margin: 0;
      font-family: Inter, Segoe UI, Arial, sans-serif;
      background:
        radial-gradient(circle at 14% 0%, rgba(45, 96, 255, .22), transparent 34%),
        radial-gradient(circle at 100% 18%, rgba(0, 255, 154, .10), transparent 32%),
        radial-gradient(circle at 50% 100%, rgba(185, 135, 255, .10), transparent 32%),
        var(--bg);
      color: var(--text);
      overflow-x: hidden;
    }

    .app {
      display: grid;
      grid-template-columns: var(--side) 1fr;
      min-height: 100vh;
      transition: grid-template-columns .18s ease;
    }

    body.collapsed .app {
      grid-template-columns: var(--sideSmall) 1fr;
    }

    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      border-right: 1px solid rgba(36, 54, 83, .8);
      background:
        linear-gradient(180deg, rgba(12, 24, 43, .96), rgba(7, 14, 27, .96)),
        radial-gradient(circle at top, rgba(88, 166, 255, .16), transparent 45%);
      padding: 18px 14px;
      z-index: 10;
      overflow: hidden;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 48px;
      margin-bottom: 18px;
      padding: 8px 8px;
    }

    .logo {
      width: 42px;
      height: 42px;
      border-radius: 15px;
      background: linear-gradient(135deg, #0a66ff, #22d3ee);
      box-shadow: 0 10px 30px rgba(34, 211, 238, .25);
      display: grid;
      place-items: center;
      font-weight: 900;
      font-size: 21px;
    }

    .brandText {
      line-height: 1.05;
      transition: opacity .16s ease, transform .16s ease;
    }

    .brandText b { display: block; font-size: 17px; letter-spacing: -.03em; }
    .brandText span { color: var(--muted); font-size: 12px; }

    body.collapsed .brandText,
    body.collapsed .navText,
    body.collapsed .sideFootText {
      opacity: 0;
      transform: translateX(-8px);
      pointer-events: none;
      width: 0;
      overflow: hidden;
    }

    .collapseBtn {
      width: 100%;
      border: 1px solid var(--line);
      color: var(--text);
      background: rgba(255,255,255,.045);
      border-radius: 14px;
      padding: 10px;
      cursor: pointer;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 14px;
    }

    .nav {
      display: flex;
      flex-direction: column;
      gap: 9px;
      margin-top: 14px;
    }

    .navItem {
      border: 1px solid transparent;
      background: transparent;
      color: var(--muted);
      border-radius: 16px;
      padding: 12px 12px;
      display: flex;
      align-items: center;
      gap: 13px;
      cursor: pointer;
      text-align: left;
      font-size: 15px;
      font-weight: 750;
      transition: .12s ease;
      min-height: 48px;
    }

    .navItem:hover {
      background: rgba(255,255,255,.055);
      color: var(--text);
    }

    .navItem.active {
      border-color: rgba(88, 166, 255, .45);
      background: linear-gradient(135deg, rgba(88,166,255,.18), rgba(72,255,154,.08));
      color: var(--text);
      box-shadow: inset 0 0 22px rgba(88,166,255,.06);
    }

    .navIcon {
      width: 28px;
      min-width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      font-size: 21px;
    }

    .sideFoot {
      position: absolute;
      left: 14px;
      right: 14px;
      bottom: 16px;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 12px;
      background: rgba(255,255,255,.035);
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
    }

    .content {
      padding: 25px;
      min-width: 0;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 20px;
    }

    h1 {
      margin: 0;
      font-size: 34px;
      letter-spacing: -.045em;
    }

    .subtitle {
      color: var(--muted);
      margin-top: 7px;
      font-size: 14px;
    }

    .statusPill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 13px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: rgba(13, 23, 40, .8);
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--red);
      box-shadow: 0 0 14px currentColor;
    }

    .dot.ok { background: var(--green); }

    .screen { display: none; }
    .screen.active { display: block; animation: fade .14s ease; }

    @keyframes fade {
      from { opacity: .5; transform: translateY(3px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .grid4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 18px;
    }

    .grid2 {
      display: grid;
      grid-template-columns: 430px 1fr;
      gap: 18px;
      align-items: start;
    }

    .grid3cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }

    .card, .panel {
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(17,31,54,.94), rgba(8,16,31,.94));
      border-radius: 20px;
      box-shadow: var(--shadow);
    }

    .card { padding: 16px; }
    .panel { padding: 18px; margin-bottom: 18px; }

    .cardTitle, .metricLabel {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 6px;
    }

    .metric {
      font-size: 27px;
      font-weight: 900;
      letter-spacing: -.03em;
    }

    h2 {
      margin: 0 0 14px;
      font-size: 22px;
      letter-spacing: -.03em;
    }

    h3 {
      margin: 0 0 8px;
      font-size: 16px;
    }

    .green { color: var(--green); }
    .red { color: var(--red); }
    .yellow { color: var(--yellow); }
    .blue { color: var(--blue); }
    .violet { color: var(--violet); }
    .cyan { color: var(--cyan); }
    .muted { color: var(--muted); }

    label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin: 12px 0 6px;
    }

    input, select, textarea {
      width: 100%;
      border: 1px solid #2a3e5d;
      background: #071120;
      color: var(--text);
      border-radius: 13px;
      padding: 10px 12px;
      outline: none;
      font-size: 14px;
    }

    textarea { min-height: 70px; resize: vertical; }

    input:focus, select:focus, textarea:focus {
      border-color: var(--blue);
      box-shadow: 0 0 0 3px rgba(88,166,255,.12);
    }

    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }

    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 14px;
    }

    button {
      border: 0;
      border-radius: 13px;
      padding: 10px 13px;
      cursor: pointer;
      color: white;
      background: #1c3154;
      font-weight: 800;
      transition: transform .08s ease, opacity .08s ease;
    }

    button:hover { transform: translateY(-1px); }
    button:active { transform: translateY(0); opacity: .82; }

    .btnStart { background: linear-gradient(135deg, #0ea85e, #1fd883); }
    .btnStop { background: linear-gradient(135deg, #b72b3a, #ff4f5e); }
    .btnBlue { background: linear-gradient(135deg, #246bff, #58a6ff); }
    .btnYellow { background: linear-gradient(135deg, #b88400, #f0b429); color: #111; }
    .btnViolet { background: linear-gradient(135deg, #6d4bd1, #b987ff); }
    .btnGhost { border: 1px solid var(--line); background: rgba(255,255,255,.045); color: var(--text); }

    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 15px;
    }

    th, td {
      padding: 10px 9px;
      border-bottom: 1px solid rgba(36,54,83,.72);
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }

    th {
      color: var(--muted);
      background: rgba(255,255,255,.035);
      font-weight: 760;
    }

    tr:hover td { background: rgba(255,255,255,.025); }

    .tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 8px;
      border-radius: 999px;
      font-weight: 900;
      font-size: 12px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.08);
      white-space: nowrap;
    }

    .tag.win, .tag.ok { color: var(--green); border-color: rgba(72,255,154,.28); }
    .tag.loss, .tag.bad { color: var(--red); border-color: rgba(255,82,97,.28); }
    .tag.draw, .tag.wait { color: var(--yellow); border-color: rgba(255,209,102,.28); }
    .tag.info { color: var(--blue); border-color: rgba(88,166,255,.28); }

    .log {
      background: #050b15;
      border: 1px solid var(--line);
      border-radius: 15px;
      padding: 12px;
      max-height: 360px;
      overflow: auto;
      color: #cde0ff;
      font-size: 12px;
      white-space: pre-wrap;
    }

    .small {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }

    .checkline {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-top: 12px;
      color: var(--muted);
      font-size: 13px;
    }

    .checkline input { width: auto; }

    .strategyCard {
      min-height: 155px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background:
        linear-gradient(180deg, rgba(17,31,54,.95), rgba(8,16,31,.95)),
        radial-gradient(circle at top right, rgba(88,166,255,.14), transparent 42%);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .strategyMeta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 10px;
    }

    .depositPlan {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }

    .planCard {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 13px;
      background: rgba(255,255,255,.035);
      cursor: pointer;
    }

    .planCard.active {
      border-color: var(--green);
      box-shadow: 0 0 0 3px rgba(72,255,154,.10);
    }

    .analysisGrid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }

    .contactCard {
      display: flex;
      gap: 12px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 17px;
      padding: 14px;
      background: rgba(255,255,255,.035);
    }

    .contactIcon {
      width: 44px;
      height: 44px;
      border-radius: 15px;
      background: rgba(88,166,255,.14);
      display: grid;
      place-items: center;
      font-size: 24px;
    }

    @media (max-width: 1180px) {
      .grid4 { grid-template-columns: repeat(2, 1fr); }
      .grid2 { grid-template-columns: 1fr; }
      .grid3cards { grid-template-columns: repeat(2, 1fr); }
      .depositPlan { grid-template-columns: repeat(2, 1fr); }
      .analysisGrid { grid-template-columns: 1fr; }
    }

    @media (max-width: 760px) {
      .app { grid-template-columns: 1fr; }
      .sidebar {
        position: relative;
        height: auto;
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
      body.collapsed .app { grid-template-columns: 1fr; }
      body.collapsed .brandText,
      body.collapsed .navText,
      body.collapsed .sideFootText {
        opacity: 1;
        width: auto;
        transform: none;
      }
      .sideFoot { position: static; margin-top: 16px; }
      .content { padding: 16px; }
      .grid4, .grid3cards, .row, .row3, .depositPlan { grid-template-columns: 1fr; }
      h1 { font-size: 28px; }
      .topbar { flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo">S</div>
        <div class="brandText">
          <b>Sanuch</b>
          <span>Trading System</span>
        </div>
      </div>

      <button class="collapseBtn" onclick="toggleSidebar()">
        <span>☰</span><span class="navText">Свернуть меню</span>
      </button>

      <nav class="nav">
        <button class="navItem active" data-screen="auto" onclick="openScreen('auto')">
          <span class="navIcon">📈</span><span class="navText">Автоторговля</span>
        </button>
        <button class="navItem" data-screen="deposits" onclick="openScreen('deposits')">
          <span class="navIcon">🧮</span><span class="navText">Разгоны депозитов</span>
        </button>
        <button class="navItem" data-screen="strategies" onclick="openScreen('strategies')">
          <span class="navIcon">🎓</span><span class="navText">Стратегии</span>
        </button>
        <button class="navItem" data-screen="analysis" onclick="openScreen('analysis')">
          <span class="navIcon">📊</span><span class="navText">Анализ аккаунта</span>
        </button>
        <button class="navItem" data-screen="contacts" onclick="openScreen('contacts')">
          <span class="navIcon">💬</span><span class="navText">Контакты</span>
        </button>
      </nav>

      <div class="sideFoot">
        <span class="navIcon">🟢</span>
        <span class="sideFootText">v2.1.4 · рабочее ядро + сворачиваемое меню</span>
      </div>
    </aside>

    <main class="content">
      <div class="topbar">
        <div>
          <h1 id="pageTitle">Автоторговля</h1>
          <div id="pageSubtitle" class="subtitle">Котировки, задачи, сигналы, открытие сделок и журнал.</div>
        </div>
        <div class="statusPill">
          <span id="serverDot" class="dot"></span>
          <span id="serverText">Server check...</span>
        </div>
      </div>

      <section id="screen-auto" class="screen active">
        <div class="grid4">
          <div class="card"><div class="metricLabel">Auto mode</div><div id="autoEnabled" class="metric yellow">...</div></div>
          <div class="card"><div class="metricLabel">Symbols with prices</div><div id="symbolsCount" class="metric blue">0</div></div>
          <div class="card"><div class="metricLabel">Tasks</div><div id="tasksCount" class="metric violet">0</div></div>
          <div class="card"><div class="metricLabel">Trades / Winrate</div><div id="tradesCount" class="metric green">0 / 0%</div></div>
        </div>

        <div class="grid2">
          <div>
            <div class="panel">
              <h2>Авто-режим</h2>
              <div class="row">
                <div><label>Аккаунт</label><select id="autoAccountMode"><option value="DEMO">DEMO</option><option value="REAL">REAL</option></select></div>
                <div><label>Таймфрейм</label><select id="autoTimeframe"><option>S5</option><option>S10</option><option selected>S15</option><option>S30</option><option>M1</option><option>M2</option><option>M3</option><option>M5</option><option>M10</option><option>M15</option></select></div>
              </div>

              <label>Пары через запятую</label>
              <textarea id="autoWatchlist">EURUSD_otc</textarea>

              <div class="row3">
                <div><label>SMA fast</label><input id="autoFast" type="number" value="5" /></div>
                <div><label>SMA slow</label><input id="autoSlow" type="number" value="10" /></div>
                <div><label>Min score</label><input id="autoMinScore" type="number" value="3" /></div>
              </div>

              <div class="row3">
                <div><label>Сумма</label><input id="autoAmount" type="number" value="1" /></div>
                <div><label>Экспирация, сек</label><input id="autoExpiry" type="number" value="15" /></div>
                <div><label>Cooldown, ms</label><input id="autoCooldown" type="number" value="15000" /></div>
              </div>

              <div class="checkline"><input id="autoUsePayout" type="checkbox" /><span>Фильтр по payout</span></div>
              <label>Мин. payout %</label>
              <input id="autoMinPayout" type="number" value="75" />

              <div class="buttons">
                <button class="btnStart" onclick="startAuto()">START AUTO</button>
                <button class="btnStop" onclick="stopAuto()">STOP</button>
                <button class="btnBlue" onclick="saveAutoConfig()">SAVE</button>
                <button class="btnYellow" onclick="scanOnce()">SCAN ONCE</button>
                <button class="btnViolet" onclick="fillFromServer()">SYNC</button>
              </div>
            </div>

            <div class="panel">
              <h2>Ручная задача</h2>
              <div class="row">
                <div><label>Аккаунт</label><select id="manualAccountMode"><option value="DEMO">DEMO</option><option value="REAL">REAL</option></select></div>
                <div><label>Направление</label><select id="manualAction"><option value="call">BUY / call</option><option value="put">SELL / put</option></select></div>
              </div>
              <label>Символ</label>
              <input id="manualSymbol" value="EURUSD_otc" />
              <div class="row">
                <div><label>Сумма</label><input id="manualAmount" type="number" value="1" /></div>
                <div><label>Экспирация, сек</label><input id="manualExpiry" type="number" value="15" /></div>
              </div>
              <div class="buttons"><button class="btnBlue" onclick="createManualTask()">CREATE TASK</button></div>
            </div>

            <div class="panel">
              <h2>Ответы / ошибки</h2>
              <div id="lastResponse" class="log">...</div>
            </div>
          </div>

          <div>
            <div class="panel">
              <h2>Состояние</h2>
              <div id="overviewBox" class="log">Загрузка...</div>
            </div>
            <div class="panel">
              <h2>Последние сигналы</h2>
              <div id="signalsBox">Загрузка...</div>
            </div>
            <div class="panel">
              <h2>Последние задачи</h2>
              <div id="tasksBox">Загрузка...</div>
            </div>
            <div class="panel">
              <h2>Последние сделки</h2>
              <div id="tradesBox">Загрузка...</div>
            </div>
          </div>
        </div>
      </section>

      <section id="screen-deposits" class="screen">
        <div class="panel">
          <h2>Таблица разгонов депозитов</h2>
          <div class="depositPlan">
            <div class="planCard active"><h3>$100 → $1,000</h3><div class="small">30 дней · для новичков</div></div>
            <div class="planCard"><h3>$250 → $2,500</h3><div class="small">30 дней · средний риск</div></div>
            <div class="planCard"><h3>$500 → $5,000</h3><div class="small">30 дней · рабочий режим</div></div>
            <div class="planCard"><h3>$1,000 → $10,000</h3><div class="small">30 дней · продвинутый</div></div>
            <div class="planCard"><h3>Своя таблица</h3><div class="small">позже: ручная настройка</div></div>
          </div>
          <div id="depositTable"></div>
        </div>

        <div class="panel">
          <h2>Логика будущей таблицы</h2>
          <div class="small">
            Здесь будет: день, стартовый баланс, цель дня, текущий баланс, сколько добрать, лимит минуса, статус дня, замок, запрос на сброс и связь с журналом сделок.
          </div>
        </div>
      </section>

      <section id="screen-strategies" class="screen">
        <div class="panel">
          <h2>Стратегии</h2>
          <div class="row">
            <div><label>Поиск</label><input id="strategySearch" placeholder="например: свечи, MACD, Bollinger" oninput="renderStrategies()" /></div>
            <div><label>Категория</label><select id="strategyCategory" onchange="renderStrategies()"><option value="all">Все</option><option value="candles">Тех анализ по свечам</option><option value="indicators">Индикаторы</option><option value="combo">Комбинации</option></select></div>
          </div>
          <div style="height:14px"></div>
          <div id="strategiesGrid" class="grid3cards"></div>
        </div>
      </section>

      <section id="screen-analysis" class="screen">
        <div class="analysisGrid">
          <div class="panel">
            <h2>Анализ стратегий</h2>
            <div class="small">Какие стратегии за всё время дали плюс, какие минус, где много draw/no-price, где слабый winrate.</div>
            <div style="height:12px"></div>
            <div id="strategyAnalysisBox">Загрузка...</div>
          </div>

          <div class="panel">
            <h2>Анализ таблиц разгона</h2>
            <div class="small">Позже сюда подключим дни разгона: где хромает winrate, где слишком много сделок, где цель закрывается плохо.</div>
            <div style="height:12px"></div>
            <div id="depositAnalysisBox">Загрузка...</div>
          </div>
        </div>
      </section>

      <section id="screen-contacts" class="screen">
        <div class="grid3cards">
          <div class="contactCard"><div class="contactIcon">✈️</div><div><h3>Telegram</h3><div class="small">Поддержка, уведомления, быстрые вопросы.</div></div></div>
          <div class="contactCard"><div class="contactIcon">▶️</div><div><h3>YouTube</h3><div class="small">Видео по стратегиям и разгонам.</div></div></div>
          <div class="contactCard"><div class="contactIcon">💬</div><div><h3>Чат трейдеров</h3><div class="small">Будущий раздел сообщества.</div></div></div>
        </div>
      </section>
    </main>
  </div>

<script>
  let lastAutoConfigLoaded = false;
  let lastData = null;

  const screenMeta = {
    auto: ["Автоторговля", "Котировки, задачи, сигналы, открытие сделок и журнал."],
    deposits: ["Разгоны депозитов", "Таблицы роста, цели по дням, замки, лимиты и контроль плана."],
    strategies: ["Стратегии", "Тех анализ, свечные модели, индикаторы и комбинации."],
    analysis: ["Анализ аккаунта", "Отдельно анализ стратегий и анализ таблиц разгона."],
    contacts: ["Контакты", "Поддержка, ссылки и каналы связи."]
  };

  const strategySeed = [
    { name: "Поглощение", cat: "candles", desc: "Свечная модель: импульсная свеча перекрывает предыдущую. Позже добавим условия фильтрации по тренду и payout.", tags: ["Свечи", "Price Action", "S15"] },
    { name: "Пробитие уровня", cat: "candles", desc: "Вход после выхода цены из зоны и подтверждения закрытием свечи.", tags: ["Уровни", "Breakout", "M1"] },
    { name: "3 свечи по тренду", cat: "candles", desc: "Серийное движение 3 свечей с оценкой тел, теней и продолжения импульса.", tags: ["Свечи", "Тренд", "S30"] },
    { name: "Bollinger Bands", cat: "indicators", desc: "Работа от границ канала с оценкой возврата к средней и силы импульса.", tags: ["BB", "Канал", "Откат"] },
    { name: "RSI разворот", cat: "indicators", desc: "Сигнал от зон перекупленности/перепроданности с подтверждением свечой.", tags: ["RSI", "Разворот", "Фильтр"] },
    { name: "MACD пересечение", cat: "indicators", desc: "Пересечение MACD/Signal с фильтром направления и силы гистограммы.", tags: ["MACD", "Trend", "M1"] },
    { name: "Bollinger + RSI", cat: "combo", desc: "Комбинация выхода к границе Bollinger и подтверждения RSI.", tags: ["Combo", "BB", "RSI"] },
    { name: "Свечи + уровень", cat: "combo", desc: "Свечная реакция на уровне: ложный пробой, удержание, откат.", tags: ["PA", "Уровень", "Контекст"] },
    { name: "Supertrend", cat: "indicators", desc: "Направление тренда по Supertrend с проверкой смены линии.", tags: ["Trend", "Supertrend", "Filter"] }
  ];

  function toggleSidebar() {
    document.body.classList.toggle("collapsed");
    localStorage.setItem("sanuch.sidebar.collapsed", document.body.classList.contains("collapsed") ? "1" : "0");
  }

  function openScreen(name) {
    document.querySelectorAll(".screen").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".navItem").forEach(x => x.classList.remove("active"));
    document.getElementById("screen-" + name).classList.add("active");
    document.querySelector('[data-screen="' + name + '"]').classList.add("active");
    document.getElementById("pageTitle").textContent = screenMeta[name][0];
    document.getElementById("pageSubtitle").textContent = screenMeta[name][1];
    localStorage.setItem("sanuch.screen", name);
  }

  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function pretty(obj) { return JSON.stringify(obj, null, 2); }

  async function api(path, options) {
    const res = await fetch(path, options || {});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || "HTTP " + res.status);
    return data;
  }

  async function post(path, body) {
    return api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  function value(id) { return document.getElementById(id).value; }
  function numberValue(id) { return Number(value(id)); }
  function boolValue(id) { return document.getElementById(id).checked; }

  function autoPayload() {
    return {
      accountMode: value("autoAccountMode"),
      watchlist: value("autoWatchlist").split(",").map(s => s.trim()).filter(Boolean),
      timeframe: value("autoTimeframe"),
      fast: numberValue("autoFast"),
      slow: numberValue("autoSlow"),
      minScore: numberValue("autoMinScore"),
      amount: numberValue("autoAmount"),
      expirySec: numberValue("autoExpiry"),
      cooldownMs: numberValue("autoCooldown"),
      usePayoutFilter: boolValue("autoUsePayout"),
      minPayoutPercent: numberValue("autoMinPayout")
    };
  }

  function setResponse(data) {
    document.getElementById("lastResponse").textContent = typeof data === "string" ? data : pretty(data);
  }

  async function startAuto() {
    try { const data = await post("/auto/start", autoPayload()); setResponse(data); await refresh(); }
    catch (err) { setResponse("START ERROR: " + err.message); }
  }

  async function stopAuto() {
    try { const data = await post("/auto/stop"); setResponse(data); await refresh(); }
    catch (err) { setResponse("STOP ERROR: " + err.message); }
  }

  async function saveAutoConfig() {
    try { const data = await post("/auto/config", autoPayload()); setResponse(data); await refresh(); }
    catch (err) { setResponse("SAVE ERROR: " + err.message); }
  }

  async function scanOnce() {
    try { const data = await post("/auto/scan"); setResponse(data); await refresh(); }
    catch (err) { setResponse("SCAN ERROR: " + err.message); }
  }

  async function createManualTask() {
    try {
      const data = await post("/tasks/create", {
        userId: "dashboard-user",
        clientId: "all",
        accountMode: value("manualAccountMode"),
        symbol: value("manualSymbol"),
        action: value("manualAction"),
        amount: numberValue("manualAmount"),
        expirySec: numberValue("manualExpiry"),
        source: "DASHBOARD_MANUAL"
      });
      setResponse(data);
      await refresh();
    } catch (err) {
      setResponse("TASK ERROR: " + err.message);
    }
  }

  function fillForm(config) {
    if (!config) return;
    document.getElementById("autoAccountMode").value = config.accountMode || "DEMO";
    document.getElementById("autoWatchlist").value = Array.isArray(config.watchlist) ? config.watchlist.join(", ") : "";
    document.getElementById("autoTimeframe").value = config.timeframe || "S15";
    document.getElementById("autoFast").value = config.fast || 5;
    document.getElementById("autoSlow").value = config.slow || 10;
    document.getElementById("autoMinScore").value = config.minScore || 3;
    document.getElementById("autoAmount").value = config.amount || 1;
    document.getElementById("autoExpiry").value = config.expirySec || 15;
    document.getElementById("autoCooldown").value = config.cooldownMs || 15000;
    document.getElementById("autoUsePayout").checked = !!config.usePayoutFilter;
    document.getElementById("autoMinPayout").value = config.minPayoutPercent || 75;
  }

  async function fillFromServer() {
    try { const auto = await api("/auto/status"); fillForm(auto.config); setResponse("Синхронизировано."); }
    catch (err) { setResponse("SYNC ERROR: " + err.message); }
  }

  function table(headers, rows) {
    const head = "<tr>" + headers.map(h => "<th>" + esc(h) + "</th>").join("") + "</tr>";
    const body = rows.map(row => "<tr>" + row.map(c => "<td>" + c + "</td>").join("") + "</tr>").join("");
    return "<table>" + head + body + "</table>";
  }

  function renderTasks(data) {
    const rows = (data.tasks || []).slice(0, 60).map(t => [
      esc(t.createdAt || ""),
      esc(t.accountMode || ""),
      esc(t.symbol || ""),
      esc(t.action || ""),
      esc(t.amount || ""),
      esc(t.expirySec || ""),
      '<span class="tag ' + (t.status === "SUCCESS_OPEN_ORDER" ? "ok" : "wait") + '">' + esc(t.status) + '</span>'
    ]);
    const tasksBox = document.getElementById("tasksBox");
    const newTasksHtml = rows.length
      ? table(["Time", "Mode", "Symbol", "Action", "Amount", "Exp", "Status"], rows)
      : '<div class="muted">Задач пока нет.</div>';
    if (tasksBox.innerHTML !== newTasksHtml) tasksBox.innerHTML = newTasksHtml;
  }

  function renderTrades(data) {
    const rows = (data.trades || []).filter(t => t.status === "CLOSED").slice(0, 60).map(t => {
      const resultClass = t.result === "WIN" ? "win" : (t.result === "LOSS" ? "loss" : "draw");
      return [
        esc(t.closedAt || t.openedAt || ""),
        esc(t.accountMode || ""),
        esc(t.symbol || ""),
        esc(t.action || ""),
        esc(t.amount || ""),
        esc(t.entryPrice),
        esc(t.exitPrice),
        esc(t.directionMove),
        '<span class="tag ' + resultClass + '">' + esc(t.result || t.status) + '</span>'
      ];
    });
    const tradesBox = document.getElementById("tradesBox");
    const newTradesHtml = rows.length
      ? table(["Time", "Mode", "Symbol", "Action", "Amount", "Entry", "Exit", "Move", "Result"], rows)
      : '<div class="muted">Сделок пока нет.</div>';
    if (tradesBox.innerHTML !== newTradesHtml) tradesBox.innerHTML = newTradesHtml;
  }

  function renderSignals(auto) {
    const signals = auto.lastSignals || {};
    const rows = Object.keys(signals).sort().map(symbol => {
      const s = signals[symbol] || {};
      return [
        esc(symbol),
        esc(s.timeframe || ""),
        esc(s.side || ""),
        esc((s.score || 0) + "/" + (s.maxScore || 0)),
        esc((s.reasons || []).join(" | "))
      ];
    });
    document.getElementById("signalsBox").innerHTML = rows.length
      ? table(["Symbol", "TF", "Side", "Score", "Reasons"], rows)
      : '<div class="muted">Сигналов пока нет.</div>';
  }

  function renderDepositTable() {
    const rows = [];
    let balance = 100;
    for (let day = 1; day <= 30; day++) {
      const target = balance * 1.08;
      rows.push([
        day,
        "$" + balance.toFixed(2),
        "$" + target.toFixed(2),
        "$0.00",
        day === 1 ? '<span class="tag info">Текущий</span>' : '<span class="tag wait">Закрыт</span>',
        '<span class="tag wait">Ожидает данных</span>'
      ]);
      balance = target;
    }
    document.getElementById("depositTable").innerHTML = table(["День", "Старт", "Цель", "Добрать", "Доступ", "Статус"], rows);
  }

  function renderStrategies() {
    const q = (document.getElementById("strategySearch")?.value || "").toLowerCase();
    const cat = document.getElementById("strategyCategory")?.value || "all";
    const filtered = strategySeed.filter(s => {
      const okCat = cat === "all" || s.cat === cat;
      const blob = (s.name + " " + s.desc + " " + s.tags.join(" ")).toLowerCase();
      return okCat && blob.includes(q);
    });

    document.getElementById("strategiesGrid").innerHTML = filtered.map(s => {
      return ''
        + '<div class="strategyCard">'
        +   '<div>'
        +     '<h3>' + esc(s.name) + '</h3>'
        +     '<div class="small">' + esc(s.desc) + '</div>'
        +   '</div>'
        +   '<div class="strategyMeta">'
        +     s.tags.map(t => '<span class="tag info">' + esc(t) + '</span>').join("")
        +   '</div>'
        + '</div>';
    }).join("");
  }

  function renderAnalysis(tradesData) {
    const trades = (tradesData.trades || []).filter(t => t.status === "CLOSED");
    const groups = {};
    for (const t of trades) {
      const key = t.source || "UNKNOWN";
      if (!groups[key]) groups[key] = { source: key, total: 0, wins: 0, losses: 0, draws: 0, noPrice: 0 };
      groups[key].total += 1;
      if (t.result === "WIN") groups[key].wins += 1;
      else if (t.result === "LOSS") groups[key].losses += 1;
      else if (t.result === "DRAW") groups[key].draws += 1;
      else if (t.result === "NO_PRICE") groups[key].noPrice += 1;
    }

    const rows = Object.values(groups).map(g => {
      const decisive = g.wins + g.losses;
      const wr = decisive ? ((g.wins / decisive) * 100).toFixed(2) + "%" : "0%";
      const cls = g.losses > g.wins ? "bad" : "ok";
      return [
        esc(g.source),
        esc(g.total),
        '<span class="tag win">' + g.wins + '</span>',
        '<span class="tag loss">' + g.losses + '</span>',
        '<span class="tag draw">' + g.draws + '</span>',
        '<span class="tag ' + cls + '">' + wr + '</span>'
      ];
    });

    document.getElementById("strategyAnalysisBox").innerHTML = rows.length
      ? table(["Стратегия/source", "Всего", "WIN", "LOSS", "DRAW", "Winrate"], rows)
      : '<div class="muted">Пока нет сделок для анализа.</div>';

    const stats = tradesData.stats || {};
    const notes = [];
    if ((stats.closed || 0) < 20) notes.push("Мало закрытых сделок: выводы пока слабые.");
    if ((stats.winRate || 0) < 55 && (stats.closed || 0) >= 20) notes.push("Winrate ниже 55% — стратегию/фильтры надо ужесточать.");
    if ((stats.draws || 0) > (stats.wins || 0) + (stats.losses || 0)) notes.push("Много DRAW — нужна проверка экспирации или точности входа.");
    if (!notes.length) notes.push("Пока критичных проблем по разгонам не видно, но нужна связка с дневными таблицами.");

    document.getElementById("depositAnalysisBox").innerHTML = notes
      .map(n => '<div class="contactCard"><div class="contactIcon">🧠</div><div>' + esc(n) + '</div></div>')
      .join("<div style='height:10px'></div>");
  }

  async function refresh() {
    try {
      const [state, auto, tasks, trades] = await Promise.all([
        api("/state"),
        api("/auto/status"),
        api("/tasks?limit=80"),
        api("/trades?limit=80")
      ]);

      lastData = { state, auto, tasks, trades };

      document.getElementById("serverDot").className = "dot ok";
      document.getElementById("serverText").textContent = "Server OK · " + (state.version || "");
      const enabled = !!auto.config.enabled;
      document.getElementById("autoEnabled").textContent = enabled ? "ON" : "OFF";
      document.getElementById("autoEnabled").className = "metric " + (enabled ? "green" : "yellow");

      const symbols = (state.ticks && state.ticks.symbols) || [];
      document.getElementById("symbolsCount").textContent = symbols.length;
      document.getElementById("tasksCount").textContent = (tasks.stats && tasks.stats.total) || 0;

      const st = trades.stats || {};
      document.getElementById("tradesCount").textContent = (st.total || 0) + " / " + (st.winRate || 0) + "%";

      if (!lastAutoConfigLoaded) {
        fillForm(auto.config);
        lastAutoConfigLoaded = true;
      }

      document.getElementById("overviewBox").textContent = pretty({
        server: {
          version: state.version,
          symbols,
          latest: state.ticks ? state.ticks.latest : {}
        },
        auto: {
          enabled: auto.config.enabled,
          accountMode: auto.config.accountMode,
          watchlist: auto.config.watchlist,
          timeframe: auto.config.timeframe,
          lastScanAt: auto.lastScanAt,
          createdTotal: auto.createdTotal,
          lastEvent: auto.lastEvent
        },
        tasks: tasks.stats,
        trades: trades.stats
      });

      renderTasks(tasks);
      renderTrades(trades);
      renderSignals(auto);
      renderAnalysis(trades);

    } catch (err) {
      document.getElementById("serverDot").className = "dot";
      document.getElementById("serverText").textContent = "Server OFF";
      document.getElementById("overviewBox").textContent = "REFRESH ERROR: " + err.message;
    }
  }

  if (localStorage.getItem("sanuch.sidebar.collapsed") === "1") document.body.classList.add("collapsed");
  renderDepositTable();
  renderStrategies();

  const savedScreen = localStorage.getItem("sanuch.screen") || "auto";
  if (screenMeta[savedScreen]) openScreen(savedScreen);

  refresh();
  setInterval(refresh, 3000);
</script>
</body>
</html>`;
}

module.exports = dashboardPage;
