const CONFIG = {
  appName: "Sanuch Auto Trading",
  version: "2.4.2",
  port: Number(process.env.PORT) || 8787,

  storage: {
    autoSaveMs: 30000,
    maxTicksPerSymbol: 2000,
    maxCandlesPerKey: 110,
    dataDir: "data"
  },

  trading: {
    allowedAccountModes: ["DEMO", "REAL"],
    allowedActions: ["call", "put"],
    minExpirySec: 1,
    maxExpirySec: 86400,
    optionType: 100,
    minAmount: 1,
    maxAmount: 100000
  },

  candles: {
    timeframes: {
      S5: 5,
      S10: 10,
      S15: 15,
      S30: 30,
      M1: 60,
      M2: 120,
      M3: 180,
      M5: 300,
      M10: 600,
      M15: 900
    }
  },

  signal: {
    defaultTimeframe: "S15",
    defaultFast: 5,
    defaultSlow: 10,
    minScoreToCreateTask: 3
  },

  autoSignal: {
    enabled: false,
    scanMs: 1000,
    userId: "auto-user",
    clientId: "all",
    accountMode: "DEMO",
    watchlist: [],
    subscribeAllAssets: true,
    timeframe: "S15",
    fast: 5,
    slow: 10,
    amount: 1,
    expirySec: 15,
    minScore: 1,
    minAgree: 1,
    aggregation: "majority",
    indicators: [],
    cooldownMs: 15000,
    source: "AUTO_STRATEGY_ENGINE",
    usePayoutFilter: false,
    minPayoutPercent: 75,
    martingaleEnabled: false,
    martingaleMultiplier: 2,
    martingaleSteps: 3,
    martingaleReset: "yes"
  },

  payouts: {
    maxAssets: 1000,
    staleAfterMs: 60000
  },

  tasks: {
    ttlMs: 60000,
    pollLimit: 5
  }
};

module.exports = CONFIG;
