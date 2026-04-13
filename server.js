/**
 * WhatsApp Business AI Chatbot — Node.js Backend
 * Uses: Meta WhatsApp Cloud API + Anthropic Claude AI
 *
 * Setup:
 *   npm install
 *   cp .env.example .env   (fill in your credentials)
 *   node server.js
 */

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk");
const { sessionStore } = require("./sessions");
const { orderManager } = require("./orders");
const { buildSystemPrompt } = require("./config");
const logger = require("./logger");

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Webhook Verification (Meta requires this on first setup) ──────────────────
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    logger.info("Webhook verified successfully.");
    return res.status(200).send(challenge);
  }
  logger.warn("Webhook verification failed.");
  return res.sendStatus(403);
});

// ─── Incoming Messages ─────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  // Acknowledge immediately — Meta requires a 200 within 5 seconds
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;

        const value = change.value;
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        for (const message of messages) {
          if (message.type !== "text") {
            // Optionally handle image/audio/interactive messages here
            await sendWhatsAppMessage(
              message.from,
              "I can only read text messages for now. Please type your order or question!"
            );
            continue;
          }

          const from = message.from;          // customer phone number
          const text = message.text.body;
          const customerName =
            contacts.find((c) => c.wa_id === from)?.profile?.name || "Customer";

          logger.info(`[IN]  ${from} (${customerName}): ${text}`);

          // Mark message as read
          await markAsRead(message.id);

          // Send typing indicator
          await sendTypingIndicator(from);

          // Get or create session for this customer
          const session = sessionStore.getOrCreate(from, customerName);

          // Generate AI reply
          const reply = await generateReply(session, text, customerName);

          // Check if this reply contains a confirmed order
          const detectedOrder = detectOrderConfirmation(session, text, reply);
          if (detectedOrder) {
            const order = orderManager.create(from, customerName, detectedOrder);
            logger.info(`[ORDER] ${order.id} for ${customerName}: ${JSON.stringify(detectedOrder.items)}`);
            // Optionally notify your admin here (email, Slack webhook, etc.)
            await notifyAdmin(order);
          }

          // Send reply back to WhatsApp
          await sendWhatsAppMessage(from, reply);
          logger.info(`[OUT] ${from}: ${reply.substring(0, 80)}...`);
        }
      }
    }
  } catch (err) {
    logger.error("Webhook processing error:", err.message);
  }
});

// ─── Admin REST Endpoints ──────────────────────────────────────────────────────

// GET all orders
app.get("/api/orders", (req, res) => {
  res.json({ orders: orderManager.getAll(), total: orderManager.totalRevenue() });
});

// PATCH order status
app.patch("/api/orders/:id", (req, res) => {
  const { status } = req.body;
  const order = orderManager.updateStatus(req.params.id, status);
  if (!order) return res.status(404).json({ error: "Order not found" });

  // Notify customer about status change
  const messages = {
    confirmed: "Your order has been confirmed! We're preparing it now.",
    ready: "Great news! Your order is ready. It's on its way to you.",
    delivered: "Your order has been delivered. Thank you for ordering from us! Enjoy your meal.",
  };
  if (messages[status]) {
    sendWhatsAppMessage(order.phone, messages[status]).catch(console.error);
  }
  res.json(order);
});

// GET active sessions
app.get("/api/sessions", (req, res) => {
  res.json(sessionStore.getAll());
});

// POST send a manual message to a customer (for owner replies)
app.post("/api/send", async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: "phone and message required" });
  await sendWhatsAppMessage(phone, message);
  res.json({ success: true });
});

// ─── Claude AI ─────────────────────────────────────────────────────────────────
async function generateReply(session, userMessage, customerName) {
  session.addMessage("user", userMessage);

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 500,
    system: buildSystemPrompt(customerName),
    messages: session.getHistory(),
  });

  const reply = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  session.addMessage("assistant", reply);
  return reply;
}

// ─── WhatsApp Cloud API Calls ──────────────────────────────────────────────────
async function sendWhatsAppMessage(to, text) {
  await axios.post(
    `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

async function markAsRead(messageId) {
  await axios.post(
    `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

async function sendTypingIndicator(to) {
  // WhatsApp doesn't have a native typing indicator via Cloud API,
  // but you can achieve a short delay to simulate it.
  await new Promise((r) => setTimeout(r, 1200));
}

// ─── Order Detection ───────────────────────────────────────────────────────────
function detectOrderConfirmation(session, userText, botReply) {
  const confirmWords = ["yes", "confirm", "ok", "sure", "proceed", "place it", "go ahead"];
  const isConfirming = confirmWords.some((w) => userText.toLowerCase().includes(w));
  const botMentionsOrder = botReply.toLowerCase().includes("order") &&
    (botReply.toLowerCase().includes("placed") || botReply.toLowerCase().includes("confirmed"));

  if (isConfirming && botMentionsOrder) {
    return session.getPendingOrder();
  }

  // Also parse new order from bot reply
  const priceMatch = botReply.match(/total[:\s]+GHS?\s*([\d.]+)/i);
  const itemMatches = [...botReply.matchAll(/(\d+)x\s+([^\n,]+)/gi)];
  if (priceMatch && itemMatches.length > 0) {
    const pendingOrder = {
      items: itemMatches.map((m) => ({ qty: parseInt(m[1]), name: m[2].trim() })),
      total: parseFloat(priceMatch[1]),
    };
    session.setPendingOrder(pendingOrder);
  }
  return null;
}

// ─── Admin Notification (optional) ────────────────────────────────────────────
async function notifyAdmin(order) {
  if (!process.env.ADMIN_WHATSAPP_NUMBER) return;
  const itemsList = order.items.map((i) => `${i.qty}x ${i.name}`).join(", ");
  const msg = `New Order ${order.id}!\nCustomer: ${order.customerName}\nItems: ${itemsList}\nTotal: GHS ${order.total}\nTime: ${order.time}`;
  await sendWhatsAppMessage(process.env.ADMIN_WHATSAPP_NUMBER, msg);
}

// ─── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`WhatsApp bot server running on port ${PORT}`);
  logger.info(`Webhook URL: https://yourdomain.com/webhook`);
});
