"""orders.py — In-memory order manager."""

from datetime import datetime, date
from threading import Lock

VALID_STATUSES = {"new", "confirmed", "preparing", "ready", "delivered", "cancelled"}


class OrderManager:
    def __init__(self):
        self._orders: list[dict] = []
        self._counter = 1
        self._lock = Lock()

    def create(self, phone: str, customer_name: str, order_data: dict) -> dict:
        with self._lock:
            order = {
                "id": f"ORD-{str(self._counter).zfill(4)}",
                "phone": phone,
                "customer_name": customer_name,
                "items": order_data.get("items", []),
                "total": round(float(order_data.get("total", 0)), 2),
                "status": "new",
                "created_at": datetime.utcnow().isoformat(),
                "time": datetime.now().strftime("%H:%M"),
                "updated_at": datetime.utcnow().isoformat(),
            }
            self._orders.insert(0, order)
            self._counter += 1
            return order

    def get_all(self) -> list[dict]:
        return list(self._orders)

    def get_by_id(self, order_id: str) -> dict | None:
        return next((o for o in self._orders if o["id"] == order_id), None)

    def update_status(self, order_id: str, status: str) -> dict | None:
        if status not in VALID_STATUSES:
            return None
        order = self.get_by_id(order_id)
        if not order:
            return None
        with self._lock:
            order["status"] = status
            order["updated_at"] = datetime.utcnow().isoformat()
        return order

    def total_revenue(self) -> float:
        return round(
            sum(o["total"] for o in self._orders if o["status"] != "cancelled"), 2
        )

    def today_orders(self) -> list[dict]:
        today = date.today().isoformat()
        return [o for o in self._orders if o["created_at"].startswith(today)]
