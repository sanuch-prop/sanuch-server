const CONFIG = require("./config");
const { normalizeAccountMode, normalizeAction, normalizeSymbol, safeNumber } = require("./utils");
function validateTradeTask(input) {
  const errors = [];
  const accountMode = normalizeAccountMode(input.accountMode);
  const symbol = normalizeSymbol(input.symbol);
  const action = normalizeAction(input.action || input.side);
  const amount = safeNumber(input.amount);
  const expirySec = safeNumber(input.expirySec ?? input.time);
  if (!CONFIG.trading.allowedAccountModes.includes(accountMode)) errors.push(`BAD_ACCOUNT_MODE: ${accountMode}`);
  if (!symbol || !/^[#A-Z0-9_-]+(_otc)?$/i.test(symbol)) errors.push(`BAD_SYMBOL: ${symbol}`);
  if (!CONFIG.trading.allowedActions.includes(action)) errors.push(`BAD_ACTION: ${action}`);
  if (amount === null || amount < CONFIG.trading.minAmount || amount > CONFIG.trading.maxAmount) errors.push(`BAD_AMOUNT: ${amount}`);
  if (expirySec === null || expirySec < CONFIG.trading.minExpirySec || expirySec > CONFIG.trading.maxExpirySec) errors.push(`BAD_EXPIRY: ${expirySec}`);
  return { ok: errors.length === 0, errors, normalized: { accountMode, symbol, action, amount, expirySec } };
}
module.exports = { validateTradeTask };
