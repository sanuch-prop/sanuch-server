const storage = require("./storage");
const { makeId, nowIso, safeNumber } = require("./utils");
const { JOURNAL_PLANS, LEGACY_DEPOSIT_PROGRAMS, TABLE_MODES } = require("./journalDepositPlans");

function round2(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function pct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function formatUsd(value) {
  return `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function getTradePayoutPercent(trade, payoutStore) {
  const direct = safeNumber(trade.payoutPercent, null);
  if (direct !== null) return direct;

  const metaDirect = safeNumber(trade.meta?.payoutPercent, null);
  if (metaDirect !== null) return metaDirect;

  const metaPayout = safeNumber(trade.meta?.payout?.payoutPercent, null);
  if (metaPayout !== null) return metaPayout;

  const current = payoutStore?.get(trade.symbol);
  const currentPct = safeNumber(current?.payoutPercent, null);
  if (currentPct !== null) return currentPct;

  return 0;
}

function estimateTradePnl(trade, payoutStore) {
  const amount = safeNumber(trade.amount, 0);

  if (trade.result === "WIN") {
    const payoutPercent = getTradePayoutPercent(trade, payoutStore);
    return { pnl: round2(amount * payoutPercent / 100), payoutPercent, estimated: true };
  }

  if (trade.result === "LOSS") {
    return { pnl: round2(-amount), payoutPercent: getTradePayoutPercent(trade, payoutStore), estimated: true };
  }

  return { pnl: 0, payoutPercent: getTradePayoutPercent(trade, payoutStore), estimated: true };
}

function normalizeMode(modeId) {
  const mode = String(modeId || "medium").trim();
  return TABLE_MODES.some(m => m.id === mode) ? mode : "medium";
}

function scaleRow(row, scale) {
  const capital = round2(safeNumber(row.capital, 0) * scale);
  const profit = round2(safeNumber(row.profit, 0) * scale);
  const stake = round2(safeNumber(row.stake, 0) * scale);

  return {
    ...row,
    capital,
    profit,
    stake,
    expectedBalance: round2(capital + profit),
    load: safeNumber(row.load, 0),
    level: row.level || ""
  };
}

class DepositStore {
  constructor() {
    // v1.9.9: жёсткая нормализация старого deposits.json.
    // В прошлых версиях файл мог быть создан без history, из-за этого /state падал на history.length.
    const loaded = storage.readJson("deposits.json", { active: null, history: [] });
    this.data = {
      ...(loaded && typeof loaded === "object" ? loaded : {}),
      active: loaded && typeof loaded === "object" ? (loaded.active || null) : null,
      history: Array.isArray(loaded?.history) ? loaded.history : []
    };

    if (!this.data.active) {
      const first = JOURNAL_PLANS[0];
      this.data.active = this.createRun(first, {
        userId: "default-user",
        accountMode: "DEMO",
        modeId: "medium",
        source: "DEFAULT_BOOT"
      });
    }
  }

  listPlans() {
    return JOURNAL_PLANS.map(plan => ({
      id: plan.id,
      name: plan.name,
      title: plan.name,
      startBalance: plan.start,
      targetBalance: plan.target,
      start: plan.start,
      target: plan.target,
      days: plan.days,
      tag: plan.tag || "",
      sourceType: "journal-table",
      modes: Object.keys(plan.modes || {}).map(modeId => ({
        id: modeId,
        title: TABLE_MODES.find(m => m.id === modeId)?.title || modeId,
        rows: Array.isArray(plan.modes?.[modeId]) ? plan.modes[modeId].length : 0
      }))
    }));
  }

  listLegacyPrograms() {
    return LEGACY_DEPOSIT_PROGRAMS;
  }

  listModes() {
    return TABLE_MODES;
  }

  getPlan(planId) {
    return JOURNAL_PLANS.find(p => p.id === planId) || JOURNAL_PLANS[0];
  }

  createRun(plan, input = {}) {
    const modeId = normalizeMode(input.modeId);
    const startBalance = safeNumber(input.startBalance, plan.start);
    const targetBalance = safeNumber(input.targetBalance, plan.target);
    const days = Math.max(1, Math.floor(safeNumber(input.days, plan.days)));
    const dailyLossPercent = Math.max(0, safeNumber(input.dailyLossPercent, 0));

    return {
      runId: makeId("deposit_run"),
      planId: plan.id,
      modeId,
      title: input.title || plan.name || `${formatUsd(startBalance)} → ${formatUsd(targetBalance)}`,
      userId: input.userId || "default-user",
      accountMode: String(input.accountMode || "DEMO").toUpperCase() === "REAL" ? "REAL" : "DEMO",
      startBalance: round2(startBalance),
      targetBalance: round2(targetBalance),
      days,
      dailyLossPercent,
      currency: "USD",
      status: "ACTIVE",
      source: input.source || "MANUAL",
      startedAt: nowIso(),
      startedAtMs: Date.now(),
      updatedAt: nowIso()
    };
  }

  select(input = {}) {
    const plan = this.getPlan(input.planId || JOURNAL_PLANS[0].id);

    if (!Array.isArray(this.data.history)) this.data.history = [];

    if (this.data.active) {
      this.data.history.unshift({ ...this.data.active, archivedAt: nowIso(), archivedAtMs: Date.now() });
      if (this.data.history.length > 50) this.data.history.length = 50;
    }

    this.data.active = this.createRun(plan, input);
    this.save();
    return { ok: true, active: this.data.active };
  }

  reset(input = {}) {
    const current = this.data.active;
    if (!current) return this.select(input);

    return this.select({
      planId: current.planId,
      modeId: input.modeId || current.modeId,
      userId: current.userId,
      accountMode: input.accountMode || current.accountMode,
      startBalance: input.startBalance ?? current.startBalance,
      targetBalance: input.targetBalance ?? current.targetBalance,
      days: input.days ?? current.days,
      dailyLossPercent: input.dailyLossPercent ?? current.dailyLossPercent,
      source: "RESET"
    });
  }

  getPlanRows(active) {
    const plan = this.getPlan(active.planId);
    const modeId = normalizeMode(active.modeId);
    const baseRows = plan.modes?.[modeId] || plan.modes?.medium || plan.modes?.fast || [];
    const scale = plan.start ? active.startBalance / plan.start : 1;

    return baseRows.slice(0, active.days).map(row => scaleRow(row, scale));
  }

  getClosedTradesForRun(trades = []) {
    const active = this.data.active;
    if (!active) return [];

    return trades.filter(t => {
      const closedAtMs = safeNumber(t.closedAtMs, null);
      if (closedAtMs === null) return false;
      if (closedAtMs < active.startedAtMs) return false;
      if (t.status !== "CLOSED") return false;
      if (t.accountMode !== active.accountMode) return false;
      return true;
    });
  }

  calculate(trades = [], payoutStore = null) {
    const active = this.data.active;
    if (!active) {
      return { ok: true, active: null, modes: TABLE_MODES, legacyPrograms: LEGACY_DEPOSIT_PROGRAMS, summary: null, rows: [], trades: [] };
    }

    const plan = this.getPlan(active.planId);
    const rowsSource = this.getPlanRows(active);
    const runTrades = this.getClosedTradesForRun(trades);

    let totalPnl = 0;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let noPrice = 0;

    const tradesWithPnl = runTrades.map(t => {
      const estimate = estimateTradePnl(t, payoutStore);
      totalPnl += estimate.pnl;

      if (t.result === "WIN") wins += 1;
      else if (t.result === "LOSS") losses += 1;
      else if (t.result === "DRAW") draws += 1;
      else if (t.result === "NO_PRICE") noPrice += 1;

      const closedAtMs = safeNumber(t.closedAtMs, Date.now());
      const day = Math.max(1, Math.min(active.days, Math.floor((closedAtMs - active.startedAtMs) / 86400000) + 1));

      return {
        id: t.id,
        taskId: t.taskId,
        symbol: t.symbol,
        action: t.action,
        amount: t.amount,
        result: t.result,
        closedAt: t.closedAt,
        day,
        pnl: estimate.pnl,
        payoutPercent: estimate.payoutPercent,
        estimated: estimate.estimated,
        source: t.source || "UNKNOWN"
      };
    });

    totalPnl = round2(totalPnl);
    const currentBalance = round2(active.startBalance + totalPnl);

    let firstOpenFound = false;
    let failed = false;
    let activeDay = rowsSource[rowsSource.length - 1]?.day || 1;
    const rows = [];

    for (const src of rowsSource) {
      const dayTrades = tradesWithPnl.filter(t => t.day === src.day);
      const dayPnl = round2(dayTrades.reduce((sum, t) => sum + t.pnl, 0));
      const dayStart = src.capital;
      const dayTarget = round2(src.capital + src.profit);
      const lossLimit = active.dailyLossPercent > 0 ? round2(dayStart * active.dailyLossPercent / 100) : round2(src.profit || src.stake || 0);
      const failLine = round2(dayStart - lossLimit);

      let access = "LOCKED";
      let status = "LOCKED";

      if (failed) {
        access = "LOCKED";
        status = "LOCKED_AFTER_FAIL";
      } else if (currentBalance >= dayTarget) {
        access = "OPEN";
        status = "PASSED";
      } else if (!firstOpenFound) {
        firstOpenFound = true;
        activeDay = src.day;
        access = "OPEN";

        if (lossLimit > 0 && currentBalance < failLine) {
          status = "FAILED_LOCKED";
          failed = true;
        } else {
          status = "ACTIVE";
        }
      }

      rows.push({
        day: src.day,
        capital: dayStart,
        profit: src.profit,
        stake: src.stake,
        load: src.load,
        level: src.level,
        expectedBalance: dayTarget,
        lossLimit,
        failLine,
        currentBalance: src.day === activeDay ? currentBalance : null,
        needToTarget: status === "ACTIVE" || status === "FAILED_LOCKED" ? round2(Math.max(0, dayTarget - currentBalance)) : null,
        drawdownToFail: status === "ACTIVE" ? round2(Math.max(0, currentBalance - failLine)) : null,
        trades: dayTrades.length,
        pnl: dayPnl,
        access,
        status
      });
    }

    const decisive = wins + losses;
    const winRate = decisive ? pct(wins / decisive * 100) : 0;
    const progressPercent = pct(Math.max(0, Math.min(100, (currentBalance - active.startBalance) / (active.targetBalance - active.startBalance) * 100)));
    const activeRow = rows.find(r => r.status === "ACTIVE" || r.status === "FAILED_LOCKED") || rows[rows.length - 1];
    const toFinalTarget = round2(Math.max(0, active.targetBalance - currentBalance));

    const summary = {
      runId: active.runId,
      planId: active.planId,
      modeId: active.modeId,
      modeTitle: TABLE_MODES.find(m => m.id === active.modeId)?.title || active.modeId,
      title: active.title,
      accountMode: active.accountMode,
      currency: active.currency,
      startedAt: active.startedAt,
      days: rows.length,
      activeDay: activeRow?.day || activeDay,
      status: failed ? "FAILED_LOCKED" : (currentBalance >= active.targetBalance ? "COMPLETED" : "ACTIVE"),
      startBalance: active.startBalance,
      targetBalance: active.targetBalance,
      currentBalance,
      totalPnl,
      toFinalTarget,
      progressPercent,
      dailyLossPercent: active.dailyLossPercent,
      trades: runTrades.length,
      wins,
      losses,
      draws,
      noPrice,
      winRate,
      estimatedPnl: true,
      tableSource: "copied-from-uploaded-journal",
      legacyProgramsCopied: LEGACY_DEPOSIT_PROGRAMS.length,
      note: "Таблицы и режимы перенесены из загруженного проекта. P/L считается оценочно: WIN = сумма × payout%, LOSS = -сумма."
    };

    return {
      ok: true,
      active,
      plan: { id: plan.id, name: plan.name, start: plan.start, target: plan.target, days: plan.days, tag: plan.tag || "" },
      modes: TABLE_MODES,
      legacyPrograms: LEGACY_DEPOSIT_PROGRAMS,
      summary,
      rows,
      trades: tradesWithPnl.slice(-200).reverse()
    };
  }

  state(trades = [], payoutStore = null) {
    const calculated = this.calculate(trades, payoutStore);
    return {
      active: this.data.active,
      summary: calculated.summary,
      historyCount: Array.isArray(this.data.history) ? this.data.history.length : 0,
      plansCount: JOURNAL_PLANS.length,
      legacyProgramsCount: LEGACY_DEPOSIT_PROGRAMS.length
    };
  }

  save() {
    storage.writeJson("deposits.json", this.data);
  }
}

module.exports = DepositStore;
