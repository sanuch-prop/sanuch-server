const CONFIG = require("./config");
const storage = require("./storage");
const { makeId, nowIso, accountModeToIsDemo, makeRequestId } = require("./utils");
const { validateTradeTask } = require("./riskGuard");
class TaskStore {
  constructor() { this.tasks = storage.readJson("tasks.json", []); this.events = storage.readJson("task-events.json", []); this.seenIdemKeys = new Set(this.tasks.map(t => t.idemKey).filter(Boolean)); }
  addEvent(type, message, data={}) { const event = { id:makeId("task_evt"), type, message, time:nowIso(), data }; this.events.push(event); if (this.events.length > 2000) this.events.splice(0, this.events.length-2000); return event; }
  createOpenTradeTask(input) {
    const validation = validateTradeTask(input); if (!validation.ok) return { ok:false, error:"TASK_VALIDATION_FAILED", errors:validation.errors };
    const n = validation.normalized;
    const idemKey = input.idemKey || `${input.userId || "user"}|${input.clientId || "all"}|${n.accountMode}|${n.symbol}|${n.action}|${n.amount}|${n.expirySec}|${input.signalId || ""}|${Math.floor(Date.now()/1000)}`;
    if (this.seenIdemKeys.has(idemKey)) return { ok:false, error:"DUPLICATE_TASK", idemKey };
    this.seenIdemKeys.add(idemKey);
    const now = Date.now();
    const task = { id:makeId("task"), type:"OPEN_TRADE", userId:input.userId || "default-user", clientId:input.clientId || "all", accountMode:n.accountMode, isDemo:accountModeToIsDemo(n.accountMode), symbol:n.symbol, action:n.action, amount:n.amount, expirySec:n.expirySec, optionType:CONFIG.trading.optionType, requestId:makeRequestId(), source:input.source || "MANUAL", signalId:input.signalId || null, signalPrice:input.signalPrice ?? null, reason:input.reason || "", meta:input.meta || {}, status:"CREATED", idemKey, createdAt:nowIso(), createdAtMs:now, expiresAtMs:now + (input.ttlMs || CONFIG.tasks.ttlMs), deliveredAt:null, ackedAt:null, ack:null };
    this.tasks.push(task); this.addEvent("TASK_CREATED", `${task.accountMode} ${task.action} ${task.symbol} ${task.expirySec}s`, { taskId:task.id }); return { ok:true, task };
  }
  poll(clientId="default-client", limit=CONFIG.tasks.pollLimit, accountMode=null) {
    const now = Date.now(), out = [];
    for (const task of this.tasks) {
      if (out.length >= limit) break;
      if (!["CREATED","DELIVERED"].includes(task.status)) continue;
      if (task.expiresAtMs <= now) { task.status = "EXPIRED"; this.addEvent("TASK_EXPIRED", task.id, {taskId:task.id}); continue; }
      if (!(task.clientId === "all" || task.clientId === clientId)) continue;
      // Guard: never deliver a DEMO task to a REAL client (or vice versa).
      if (accountMode && task.accountMode && task.accountMode !== accountMode) continue;
      if (task.status === "CREATED") { task.status = "DELIVERED"; task.deliveredAt = nowIso(); task.deliveredTo = clientId; this.addEvent("TASK_DELIVERED", `${task.id} delivered to ${clientId}`, {taskId:task.id, clientId}); }
      out.push(task);
    }
    return out;
  }
  ack(input) {
    const task = this.tasks.find(t => t.id === input.taskId); if (!task) return { ok:false, error:"TASK_NOT_FOUND" };
    task.status = input.status || "ACKED"; task.ackedAt = nowIso(); task.ack = { clientId:input.clientId || null, status:task.status, message:input.message || "", requestId:input.requestId || task.requestId, socketResponse:input.socketResponse || null, time:nowIso() };
    this.addEvent("TASK_ACKED", `${task.id} => ${task.status}`, {taskId:task.id, status:task.status}); return { ok:true, task };
  }
  cancelByClient(clientId) {
    let count = 0;
    for (const task of this.tasks) {
      if (!["CREATED","DELIVERED"].includes(task.status)) continue;
      if (task.clientId !== clientId && task.clientId !== "all") continue;
      task.status = "CANCELLED";
      task.cancelledAt = nowIso();
      this.addEvent("TASK_CANCELLED", `${task.id} cancelled (client disconnect)`, { taskId: task.id, clientId });
      count++;
    }
    return count;
  }
  list({limit=100}={}) { return this.tasks.slice(-Number(limit||100)).reverse(); }
  save() { storage.writeJson("tasks.json", this.tasks); storage.writeJson("task-events.json", this.events); }
  state() { const byStatus = {}; for (const t of this.tasks) byStatus[t.status] = (byStatus[t.status] || 0) + 1; return { total:this.tasks.length, byStatus, last:this.tasks[this.tasks.length-1] || null }; }
}
module.exports = TaskStore;
