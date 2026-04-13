# WhatsApp Business AI Chatbot

An AI-powered WhatsApp bot for businesses — takes orders, answers questions, and chats like a human. Powered by **Claude AI** and **Meta WhatsApp Cloud API**.

---

## Features

- Natural human-like conversation (powered by Claude)
- Automatic order detection and management
- Real-time order status updates sent to customers via WhatsApp
- Admin notification when a new order is placed
- REST API to manage orders from your dashboard
- Session memory per customer (1-hour window)
- Mark messages as read automatically

---

## Project Structure

```
whatsapp-bot/
├── nodejs/
│   ├── server.js       ← Main Express server & webhook
│   ├── sessions.js     ← Conversation session store
│   ├── orders.js       ← Order management
│   ├── config.js       ← Business config & AI prompt
│   ├── logger.js       ← Logging utility
│   ├── package.json
│   └── .env.example
└── python/
    ├── server.py       ← Main Flask server & webhook
    ├── sessions.py     ← Conversation session store
    ├── orders.py       ← Order management
    ├── config.py       ← Business config & AI prompt
    ├── requirements.txt
    └── .env.example
```

---

## Step-by-Step Setup

### Step 1 — Meta Developer Account & App

1. Go to https://developers.facebook.com and create an account.
2. Click **My Apps → Create App → Business**.
3. Add the **WhatsApp** product to your app.
4. Under **WhatsApp → API Setup**, you'll find:
   - `Phone Number ID` → copy this to `WHATSAPP_PHONE_NUMBER_ID`
   - `Temporary access token` → copy to `WHATSAPP_ACCESS_TOKEN`
   - For production, generate a **permanent token** via System User in Business Manager.

### Step 2 — Get a WhatsApp Business Number

- Meta gives you a free test number for development.
- For production, add your own number under **WhatsApp → Phone Numbers → Add phone number**.

### Step 3 — Get Your Anthropic API Key

1. Go to https://console.anthropic.com
2. Create an API key and paste it into `ANTHROPIC_API_KEY`.

### Step 4 — Configure Your Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### Step 5 — Install & Run

**Node.js:**
```bash
cd nodejs
npm install
npm run dev        # development (auto-restart)
npm start          # production
```

**Python:**
```bash
cd python
pip install -r requirements.txt
python server.py   # development
gunicorn server:app --bind 0.0.0.0:5000  # production
```

### Step 6 — Expose Your Server Publicly (for development)

Meta needs a public HTTPS URL to send messages to. Use a tunnel:

```bash
# Option A — localtunnel (free, Node.js)
npx localtunnel --port 3000

# Option B — ngrok (free tier available)
ngrok http 3000
```

Copy the HTTPS URL it gives you (e.g. `https://abc123.ngrok.io`).

### Step 7 — Register Your Webhook with Meta

1. In Meta Developer Console → **WhatsApp → Configuration → Webhook**.
2. Click **Edit** and enter:
   - **Callback URL**: `https://your-tunnel-url.ngrok.io/webhook`
   - **Verify token**: the same string you put in `WEBHOOK_VERIFY_TOKEN`
3. Click **Verify and Save**.
4. Subscribe to the **messages** field.

Your bot is now live! Send a WhatsApp message to your test number.

---

## Customising Your Business

Edit `config.js` (Node.js) or `config.py` (Python):

```js
const BUSINESS_CONFIG = {
  name: "Your Business Name",
  hours: "Mon–Fri: 9am–6pm",
  delivery: "Free delivery within 10km",
  payment: "Card, cash, or mobile money",
  menu: [
    { name: "Product 1", price: 20, description: "..." },
    // add more...
  ],
};
```

---

## REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | Get all orders + total revenue |
| PATCH | `/api/orders/:id` | Update order status |
| GET | `/api/sessions` | List active customer sessions |
| POST | `/api/send` | Send a manual WhatsApp message |

**Update order status (triggers WhatsApp notification to customer):**
```bash
curl -X PATCH http://localhost:3000/api/orders/ORD-0001 \
  -H "Content-Type: application/json" \
  -d '{"status": "confirmed"}'
```

Valid statuses: `new` → `confirmed` → `preparing` → `ready` → `delivered` / `cancelled`

**Send a manual message:**
```bash
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "233201234567", "message": "Your order is almost ready!"}'
```

---

## Deploying to Production

### Railway (easiest — free tier available)
```bash
npm install -g railway
railway login
railway init
railway up
```
Set your environment variables in the Railway dashboard.

### Render
1. Push your code to GitHub.
2. Create a new **Web Service** on https://render.com.
3. Set build command: `npm install` (or `pip install -r requirements.txt`)
4. Set start command: `node server.js` (or `gunicorn server:app`)
5. Add environment variables in Render dashboard.
6. Update your Meta webhook URL to the Render URL.

### VPS (DigitalOcean / AWS / Hetzner)
```bash
# Install PM2 for process management (Node.js)
npm install -g pm2
pm2 start server.js --name whatsapp-bot
pm2 save
pm2 startup

# Or systemd service (Python)
# Create /etc/systemd/system/whatsapp-bot.service
```

---

## Production Checklist

- [ ] Replace temporary Meta access token with a permanent System User token
- [ ] Add your real business phone number in Meta (not the test number)
- [ ] Set up a proper database (PostgreSQL / MongoDB) instead of in-memory stores
- [ ] Add request signature verification (`X-Hub-Signature-256` header from Meta)
- [ ] Set up HTTPS with a valid SSL certificate
- [ ] Configure rate limiting (max messages per customer per minute)
- [ ] Set up error alerting (e.g., Sentry)
- [ ] Back up conversation logs regularly

---

## Verifying Meta Webhook Signatures (Security)

Add this middleware to verify requests are genuinely from Meta:

```js
// Node.js
const crypto = require("crypto");
app.use("/webhook", (req, res, next) => {
  const sig = req.headers["x-hub-signature-256"];
  const expected = "sha256=" + crypto
    .createHmac("sha256", process.env.WHATSAPP_APP_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");
  if (sig !== expected) return res.sendStatus(403);
  next();
});
```

```python
# Python
import hmac, hashlib
@app.before_request
def verify_signature():
    if request.path == "/webhook" and request.method == "POST":
        sig = request.headers.get("X-Hub-Signature-256", "")
        body = request.get_data()
        expected = "sha256=" + hmac.new(
            os.environ["WHATSAPP_APP_SECRET"].encode(),
            body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            abort(403)
```

---

## Support

- Meta WhatsApp API docs: https://developers.facebook.com/docs/whatsapp/cloud-api
- Anthropic API docs: https://docs.anthropic.com
