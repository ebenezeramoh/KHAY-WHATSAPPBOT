"""
WhatsApp Business AI Chatbot — Python/Flask Backend
Uses: Meta WhatsApp Cloud API + Anthropic Claude AI

Setup:
    pip install -r requirements.txt
    cp .env.example .env   # fill in your credentials
    python server.py
"""

import os
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify
import anthropic
import requests
from dotenv import load_dotenv

from sessions import SessionStore
from orders import OrderManager
from config import build_system_prompt, BUSINESS_CONFIG

load_dotenv()

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger(__name__)

# ─── App Setup ────────────────────────────────────────────────────────────────
app = Flask(__name__)
claude = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
session_store = SessionStore()
order_manager = OrderManager()

WHATSAPP_API_URL = (
    f"https://graph.facebook.com/v20.0/"
    f"{os.environ['WHATSAPP_PHONE_NUMBER_ID']}/messages"
)
HEADERS = {
    "Authorization": f"Bearer {os.environ['WHATSAPP_ACCESS_TOKEN']}",
    "Content-Type": "application/json",
}


# ─── Webhook Verification ─────────────────────────────────────────────────────
@app.get("/webhook")
def verify_webhook():
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")

    if mode == "subscribe" and token == os.environ["WEBHOOK_VERIFY_TOKEN"]:
        log.info("Webhook verified successfully.")
        return challenge, 200

    log.warning("Webhook verification failed.")
    return "Forbidden", 403


# ─── Incoming Messages ────────────────────────────────────────────────────────
@app.post("/webhook")
def receive_message():
    """Receive and process incoming WhatsApp messages."""
    # Acknowledge immediately — Meta requires a 200 within 5 seconds
    body = request.get_json(silent=True) or {}

    if body.get("object") != "whatsapp_business_account":
        return "OK", 200

    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "messages":
                continue

            value = change.get("value", {})
            messages = value.get("messages", [])
            contacts = value.get("contacts", [])

            for message in messages:
                phone = message["from"]
                customer_name = next(
                    (c["profile"]["name"] for c in contacts if c["wa_id"] == phone),
                    "Customer",
                )

                if message.get("type") != "text":
                    send_whatsapp_message(
                        phone,
                        "I can only read text messages for now. Please type your order or question!",
                    )
                    continue

                text = message["text"]["body"]
                log.info(f"[IN]  {phone} ({customer_name}): {text}")

                # Mark as read
                mark_as_read(message["id"])

                # Get or create session
                session = session_store.get_or_create(phone, customer_name)

                # Generate AI reply
                reply = generate_reply(session, text, customer_name)

                # Detect confirmed orders
                order_data = detect_order_confirmation(session, text, reply)
                if order_data:
                    order = order_manager.create(phone, customer_name, order_data)
                    log.info(f"[ORDER] {order['id']} — {order_data['items']}")
                    notify_admin(order)

                # Send reply
                send_whatsapp_message(phone, reply)
                log.info(f"[OUT] {phone}: {reply[:80]}...")

    return "OK", 200


# ─── Admin REST Endpoints ─────────────────────────────────────────────────────

@app.get("/api/orders")
def get_orders():
    return jsonify({
        "orders": order_manager.get_all(),
        "total_revenue": order_manager.total_revenue(),
        "today_count": len(order_manager.today_orders()),
    })


@app.patch("/api/orders/<order_id>")
def update_order_status(order_id):
    data = request.get_json() or {}
    status = data.get("status")
    order = order_manager.update_status(order_id, status)

    if not order:
        return jsonify({"error": "Order not found or invalid status"}), 404

    # Notify customer
    status_messages = {
        "confirmed": "Your order has been confirmed! We're preparing it now. 🍽️",
        "ready":     "Great news! Your order is ready and on its way to you. 🚀",
        "delivered": "Your order has been delivered. Thank you for ordering! Enjoy your meal. 😊",
    }
    if status in status_messages:
        send_whatsapp_message(order["phone"], status_messages[status])

    return jsonify(order)


@app.get("/api/sessions")
def get_sessions():
    return jsonify(session_store.get_all())


@app.post("/api/send")
def send_manual_message():
    """Send a manual message from the business owner."""
    data = request.get_json() or {}
    phone = data.get("phone")
    message = data.get("message")

    if not phone or not message:
        return jsonify({"error": "phone and message are required"}), 400

    send_whatsapp_message(phone, message)
    return jsonify({"success": True})


# ─── Claude AI ────────────────────────────────────────────────────────────────
def generate_reply(session, user_message: str, customer_name: str) -> str:
    session.add_message("user", user_message)

    response = claude.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=500,
        system=build_system_prompt(customer_name),
        messages=session.get_history(),
    )

    reply = "".join(
        block.text for block in response.content if block.type == "text"
    )
    session.add_message("assistant", reply)
    return reply


# ─── WhatsApp Cloud API Helpers ───────────────────────────────────────────────
def send_whatsapp_message(to: str, text: str) -> None:
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {"body": text},
    }
    resp = requests.post(WHATSAPP_API_URL, json=payload, headers=HEADERS, timeout=10)
    if not resp.ok:
        log.error(f"WhatsApp send failed: {resp.status_code} {resp.text}")


def mark_as_read(message_id: str) -> None:
    payload = {
        "messaging_product": "whatsapp",
        "status": "read",
        "message_id": message_id,
    }
    requests.post(WHATSAPP_API_URL, json=payload, headers=HEADERS, timeout=10)


# ─── Order Detection ──────────────────────────────────────────────────────────
def detect_order_confirmation(session, user_text: str, bot_reply: str):
    confirm_words = ["yes", "confirm", "ok", "sure", "proceed", "place it", "go ahead"]
    is_confirming = any(w in user_text.lower() for w in confirm_words)
    bot_confirmed = (
        "order" in bot_reply.lower()
        and ("placed" in bot_reply.lower() or "confirmed" in bot_reply.lower())
    )

    if is_confirming and bot_confirmed:
        return session.get_pending_order()

    # Parse new order from bot reply
    import re
    price_match = re.search(r"total[:\s]+GHS?\s*([\d.]+)", bot_reply, re.IGNORECASE)
    item_matches = re.findall(r"(\d+)x\s+([^\n,]+)", bot_reply)

    if price_match and item_matches:
        pending = {
            "items": [{"qty": int(q), "name": n.strip()} for q, n in item_matches],
            "total": float(price_match.group(1)),
        }
        session.set_pending_order(pending)

    return None


# ─── Admin Notification ───────────────────────────────────────────────────────
def notify_admin(order: dict) -> None:
    admin_number = os.environ.get("ADMIN_WHATSAPP_NUMBER")
    if not admin_number:
        return
    items_str = ", ".join(f"{i['qty']}x {i['name']}" for i in order.get("items", []))
    msg = (
        f"New Order {order['id']}!\n"
        f"Customer: {order['customer_name']}\n"
        f"Items: {items_str}\n"
        f"Total: GHS {order['total']}\n"
        f"Time: {order['time']}"
    )
    send_whatsapp_message(admin_number, msg)


# ─── Run ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    log.info(f"WhatsApp bot server running on port {port}")
    log.info("Webhook URL: https://yourdomain.com/webhook")
    app.run(host="0.0.0.0", port=port, debug=False)
