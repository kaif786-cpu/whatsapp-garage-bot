const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(express.json());

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

let userSessions = {};

// ===== VERIFY WEBHOOK =====
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ===== SEND BUTTON MESSAGE =====
async function sendButtons(to, text, buttons) {
  await axios.post(
    `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: text },
        action: {
          buttons: buttons.map((btn, index) => ({
            type: "reply",
            reply: {
              id: btn.id,
              title: btn.title
            }
          }))
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ===== SEND TEXT =====
async function sendText(to, text) {
  await axios.post(
    `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: to,
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ===== HANDLE MESSAGES =====
app.post("/webhook", async (req, res) => {
  let body = req.body;

  if (body.object) {
    let change = body.entry?.[0]?.changes?.[0]?.value;

    if (change?.messages) {
      let message = change.messages[0];
      let from = message.from;

      let msg =
        message.text?.body ||
        message.interactive?.button_reply?.id;

      if (!userSessions[from]) {
        userSessions[from] = { step: 0 };
      }

      // ===== MAIN MENU =====
      if (msg === "hi" || msg === "menu") {
        userSessions[from] = { step: 0 };

        await sendButtons(from, "Namaste 🙏\nChoose option:", [
          { id: "due", title: "🛠 Service Due Check" },
          { id: "booking", title: "📅 Service Booking" },
          { id: "save", title: "💾 Save Service Record" }
        ]);

        return res.sendStatus(200);
      }

      // ===== SAVE SERVICE RECORD =====
      if (msg === "save") {
        userSessions[from].step = 1;
        return sendButtons(from, "Select unit:", [
          { id: "km", title: "KM" },
          { id: "hours", title: "Hours" }
        ]);
      }

      if (msg === "km" || msg === "hours") {
        userSessions[from].unit = msg;
        userSessions[from].step = 2;
        return sendText(from, "Service date (DD-MM-YYYY) likho:");
      }

      if (userSessions[from].step === 2) {
        userSessions[from].date = msg;
        userSessions[from].step = 3;
        return sendText(from, `Service ke time ${userSessions[from].unit} kitne the?`);
      }

      if (userSessions[from].step === 3) {
        userSessions[from].value = parseInt(msg);
        userSessions[from].step = 4;
        return sendText(from, `Next service kitne ${userSessions[from].unit} baad karni hai?`);
      }

      if (userSessions[from].step === 4) {
        let interval = parseInt(msg);

        let record = {
          phone: from,
          date: userSessions[from].date,
          unit: userSessions[from].unit,
          value: userSessions[from].value,
          interval: interval
        };

        let services = [];
        if (fs.existsSync("services.json")) {
          services = JSON.parse(fs.readFileSync("services.json"));
        }

        services = services.filter(s => s.phone !== from);
        services.push(record);

        fs.writeFileSync("services.json", JSON.stringify(services, null, 2));

        await sendText(
          from,
          `✅ Service Record Saved!\n\n📅 ${record.date}\n🔧 ${record.value} ${record.unit}\n🔁 Next at ${record.value + record.interval} ${record.unit}`
        );

        userSessions[from] = { step: 0 };
        return res.sendStatus(200);
      }

      // ===== SERVICE DUE CHECK =====
      if (msg === "due") {
        if (!fs.existsSync("services.json")) {
          return sendText(from, "❌ No service record found.");
        }

        let services = JSON.parse(fs.readFileSync("services.json"));
        let record = services.find(s => s.phone === from);

        if (!record) {
          return sendText(from, "❌ No service record found.");
        }

        userSessions[from].record = record;
        userSessions[from].step = 10;

        return sendText(from, `Abhi current ${record.unit} kitne hai?`);
      }

      if (userSessions[from].step === 10) {
        let current = parseInt(msg);
        let record = userSessions[from].record;

        let next = record.value + record.interval;
        let remaining = next - current;

        let reply =
          `📅 Last Service: ${record.date}\n` +
          `🔧 Last ${record.unit}: ${record.value}\n` +
          `🔁 Interval: ${record.interval} ${record.unit}\n\n` +
          `🛠 Next Service: ${next} ${record.unit}\n`;

        if (remaining <= 0) {
          reply += "⚠️ Service Due ho chuki hai!";
        } else {
          reply += `👍 ${remaining} ${record.unit} baad service hogi.`;
        }

        await sendText(from, reply);

        userSessions[from] = { step: 0 };
        return res.sendStatus(200);
      }

      // ===== BOOKING =====
      if (msg === "booking") {
        return sendText(from, "Service booking system coming soon 😉");
      }

      await sendText(from, "Type 'Hi' to start.");
    }

    return res.sendStatus(200);
  }

  return res.sendStatus(404);
});

// ===== SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});