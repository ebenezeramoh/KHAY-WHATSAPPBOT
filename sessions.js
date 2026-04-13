/**
 * sessions.js — In-memory session store for conversation history.
 * For production, replace with Redis or a database.
 */

const MAX_HISTORY = 20; // keep last 20 messages per customer
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour inactivity clears session

class Session {
  constructor(phone, name) {
    this.phone = phone;
    this.name = name;
    this.history = [];
    this.pendingOrder = null;
    this.createdAt = new Date();
    this.lastActive = new Date();
  }

  addMessage(role, content) {
    this.history.push({ role, content });
    if (this.history.length > MAX_HISTORY) {
      // Always keep the first greeting context, trim from message index 2
      this.history.splice(1, 2);
    }
    this.lastActive = new Date();
  }

  getHistory() {
    return this.history;
  }

  setPendingOrder(order) {
    this.pendingOrder = order;
  }

  getPendingOrder() {
    const order = this.pendingOrder;
    this.pendingOrder = null; // consume it
    return order;
  }

  isExpired() {
    return Date.now() - this.lastActive.getTime() > SESSION_TTL_MS;
  }
}

class SessionStore {
  constructor() {
    this.sessions = new Map();
    // Clean up expired sessions every 15 minutes
    setInterval(() => this.cleanup(), 15 * 60 * 1000);
  }

  getOrCreate(phone, name) {
    if (this.sessions.has(phone) && !this.sessions.get(phone).isExpired()) {
      return this.sessions.get(phone);
    }
    const session = new Session(phone, name);
    this.sessions.set(phone, session);
    return session;
  }

  getAll() {
    const result = [];
    this.sessions.forEach((s, phone) => {
      result.push({
        phone,
        name: s.name,
        messageCount: s.history.length,
        lastActive: s.lastActive,
        hasPendingOrder: !!s.pendingOrder,
      });
    });
    return result;
  }

  cleanup() {
    let removed = 0;
    this.sessions.forEach((s, phone) => {
      if (s.isExpired()) {
        this.sessions.delete(phone);
        removed++;
      }
    });
    if (removed > 0) console.log(`[Sessions] Cleaned up ${removed} expired sessions.`);
  }
}

module.exports = { sessionStore: new SessionStore() };
