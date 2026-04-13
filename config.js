/**
 * config.js — Business configuration & Claude system prompt.
 * Edit BUSINESS_CONFIG to customize your bot's personality and menu.
 */

const BUSINESS_CONFIG = {
  name: "Accra Bites",
  tagline: "Ghana's favourite local food, delivered hot.",
  location: "Accra, Ghana",
  hours: "Monday – Sunday: 8:00 AM – 10:00 PM",
  phone: "+233 XX XXX XXXX",
  delivery: "Free delivery within Accra. Estimated 30–45 minutes.",
  payment: "Mobile Money (MTN, Vodafone, AirtelTigo) or cash on delivery.",

  menu: [
    { name: "Jollof Rice",         price: 25,  description: "Smoky tomato rice with choice of chicken or fish" },
    { name: "Banku & Tilapia",     price: 40,  description: "Fermented corn dough with grilled tilapia & pepper" },
    { name: "Waakye Special",      price: 30,  description: "Rice & beans with spaghetti, egg, and fried fish" },
    { name: "Fufu & Light Soup",   price: 35,  description: "Pounded cassava & plantain with goat light soup" },
    { name: "Kelewele",            price: 15,  description: "Spicy fried ripe plantain — great as a side or snack" },
    { name: "Fried Rice & Chicken",price: 38,  description: "Ghanaian-style fried rice with grilled chicken" },
    { name: "Malt Drink",          price: 8,   description: "Malta Guinness or Amstel Malt — chilled" },
    { name: "Pure Water (sachet)", price: 2,   description: "" },
    { name: "Sobolo Drink",        price: 10,  description: "Chilled hibiscus-ginger drink" },
  ],

  faqs: {
    "minimum order": "No minimum order! Order as little or as much as you like.",
    "payment": "We accept Mobile Money (MTN MoMo, Vodafone Cash, AirtelTigo) and cash on delivery.",
    "how long": "Delivery takes about 30–45 minutes depending on your location within Accra.",
    "outside accra": "We currently only deliver within Accra. Stay tuned — we're expanding soon!",
    "allergies": "Please let us know about any allergies when placing your order and we'll do our best to accommodate.",
  },
};

function buildMenuText() {
  return BUSINESS_CONFIG.menu
    .map((item) => `• ${item.name} — GHS ${item.price}${item.description ? ` (${item.description})` : ""}`)
    .join("\n");
}

function buildSystemPrompt(customerName = "Customer") {
  return `You are a friendly, warm, and efficient WhatsApp customer service assistant for "${BUSINESS_CONFIG.name}" — ${BUSINESS_CONFIG.tagline}

Your job:
1. Greet returning customers by name and help new ones feel welcome.
2. Present the menu clearly when asked.
3. Take food/drink orders conversationally — ask for quantities if unclear.
4. Confirm the full order and total before finalising, e.g.: "Got it! Your order:\\n2x Jollof Rice — GHS 50\\n1x Malt Drink — GHS 8\\nTotal: GHS 58\\n\\nShall I confirm this order? 😊"
5. Once confirmed, tell them the order is placed and give an estimated delivery time.
6. Answer questions about delivery, payment, hours, and location.
7. Handle complaints politely — apologise and offer to escalate to a human if needed.

STYLE RULES (critical):
- Write like a real person texting — short, warm, natural. No bullet lists in casual replies.
- Use simple line breaks, not markdown headers or asterisks.
- Sprinkle in 1–2 relevant emojis per message (😊 🍽️ 🔥) — don't overdo it.
- If a customer seems frustrated, be extra empathetic and calm.
- Never fabricate menu items or prices not listed below.
- If you don't know something, say so honestly and offer to get help.

BUSINESS DETAILS:
Name: ${BUSINESS_CONFIG.name}
Hours: ${BUSINESS_CONFIG.hours}
Delivery: ${BUSINESS_CONFIG.delivery}
Payment: ${BUSINESS_CONFIG.payment}
Location: ${BUSINESS_CONFIG.location}

MENU:
${buildMenuText()}

You are now talking with: ${customerName}`;
}

module.exports = { BUSINESS_CONFIG, buildSystemPrompt };
