"""sessions.py — In-memory conversation session store."""

from datetime import datetime, timedelta
from threading import Lock, Timer

MAX_HISTORY = 20
SESSION_TTL_MINUTES = 60


class Session:
    def __init__(self, phone: str, name: str):
        self.phone = phone
        self.name = name
        self.history: list[dict] = []
        self.pending_order: dict | None = None
        self.created_at = datetime.utcnow()
        self.last_active = datetime.utcnow()

    def add_message(self, role: str, content: str):
        self.history.append({"role": role, "content": content})
        if len(self.history) > MAX_HISTORY:
            # Drop oldest pair but keep system context at index 0 safe
            self.history.pop(1)
        self.last_active = datetime.utcnow()

    def get_history(self) -> list[dict]:
        return self.history

    def set_pending_order(self, order: dict):
        self.pending_order = order

    def get_pending_order(self) -> dict | None:
        order = self.pending_order
        self.pending_order = None
        return order

    def is_expired(self) -> bool:
        return datetime.utcnow() - self.last_active > timedelta(minutes=SESSION_TTL_MINUTES)

    def to_dict(self) -> dict:
        return {
            "phone": self.phone,
            "name": self.name,
            "message_count": len(self.history),
            "last_active": self.last_active.isoformat(),
            "has_pending_order": self.pending_order is not None,
        }


class SessionStore:
    def __init__(self):
        self._sessions: dict[str, Session] = {}
        self._lock = Lock()
        self._schedule_cleanup()

    def get_or_create(self, phone: str, name: str) -> Session:
        with self._lock:
            session = self._sessions.get(phone)
            if session is None or session.is_expired():
                session = Session(phone, name)
                self._sessions[phone] = session
            return session

    def get_all(self) -> list[dict]:
        with self._lock:
            return [s.to_dict() for s in self._sessions.values()]

    def _cleanup(self):
        with self._lock:
            expired = [p for p, s in self._sessions.items() if s.is_expired()]
            for phone in expired:
                del self._sessions[phone]
            if expired:
                print(f"[Sessions] Cleaned up {len(expired)} expired sessions.")
        self._schedule_cleanup()

    def _schedule_cleanup(self):
        t = Timer(15 * 60, self._cleanup)
        t.daemon = True
        t.start()
