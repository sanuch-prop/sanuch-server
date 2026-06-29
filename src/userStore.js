const storage = require("./storage");
const { nowIso } = require("./utils");

// Per-user config store. Each user record: { userId, clientId, config, createdAt, updatedAt }
class UserStore {
  constructor() {
    this.users = new Map();
    const saved = storage.readJson("users.json", []);
    for (const u of Array.isArray(saved) ? saved : []) {
      if (u && u.userId) this.users.set(String(u.userId), u);
    }
  }

  get(userId) {
    return this.users.get(String(userId)) || null;
  }

  list() {
    return [...this.users.values()];
  }

  upsert(userId, patch) {
    userId = String(userId);
    const existing = this.users.get(userId) || {
      userId,
      clientId: null,
      config: {},
      createdAt: nowIso()
    };
    const updated = {
      ...existing,
      ...patch,
      userId,
      config: { ...existing.config, ...(patch.config || {}) },
      updatedAt: nowIso()
    };
    this.users.set(userId, updated);
    this.save();
    return updated;
  }

  remove(userId) {
    this.users.delete(String(userId));
    this.save();
  }

  save() {
    storage.writeJson("users.json", [...this.users.values()]);
  }
}

module.exports = UserStore;
