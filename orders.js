/**
 * orders.js — In-memory order management.
 * For production, replace with PostgreSQL / MongoDB.
 */

const VALID_STATUSES = ["new", "confirmed", "preparing", "ready", "delivered", "cancelled"];

class OrderManager {
  constructor() {
    this.orders = [];
    this.counter = 1;
  }

  create(phone, customerName, { items, total }) {
    const order = {
      id: `ORD-${String(this.counter++).padStart(4, "0")}`,
      phone,
      customerName,
      items,
      total: parseFloat(total) || 0,
      status: "new",
      createdAt: new Date(),
      time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      updatedAt: new Date(),
    };
    this.orders.unshift(order);
    return order;
  }

  getAll() {
    return this.orders;
  }

  getById(id) {
    return this.orders.find((o) => o.id === id) || null;
  }

  getByPhone(phone) {
    return this.orders.filter((o) => o.phone === phone);
  }

  updateStatus(id, status) {
    if (!VALID_STATUSES.includes(status)) return null;
    const order = this.getById(id);
    if (!order) return null;
    order.status = status;
    order.updatedAt = new Date();
    return order;
  }

  totalRevenue() {
    return this.orders
      .filter((o) => o.status !== "cancelled")
      .reduce((sum, o) => sum + o.total, 0)
      .toFixed(2);
  }

  todayOrders() {
    const today = new Date().toDateString();
    return this.orders.filter((o) => new Date(o.createdAt).toDateString() === today);
  }
}

module.exports = { orderManager: new OrderManager() };
