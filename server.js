const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(express.json());

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

let userSessions = {};

// ===== VERIFY =====
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// ===== SEND BUTTONS =====
async function sendButtons(to, text, buttons) {
  await axios.post(
    `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: {
          buttons: buttons.map(b => ({
            type: "reply",
            reply: { id: b.id, title: b.title }
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
      to,
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

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  let body = req.body;

  if (body.object) {
    let change = body.entry?.[0]?.changes?.[0]?.value;

    if (change?.messages) {
      let message = change.messages[0];
      let from = message.from;

    let msg = "";

if (message.type === "text") {
  msg = message.text.body;
} 
else if (message.type === "interactive") {
  msg = message.interactive.button_reply.id;
}

if (msg) {
  msg = msg.trim().toLowerCase();
}

      if (!userSessions[from]) userSessions[from] = { step: 0 };

      // ===== MENU =====
      if (msg === "hi" || msg === "menu") {
        userSessions[from] = { step: 0 };

        await sendButtons(from, "Namaste 🙏 Choose option:", [
          { id: "due", title: "🛠 Service Due Check" },
          { id: "booking", title: "📅 Service Booking" },
          { id: "save", title: "💾 Save Service Record" },
          { id: "history", title: "📜 Service History" }
        ]);
        return res.sendStatus(200);
      }

      // ===== SAVE RECORD =====
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
        return sendText(from, `Next service kitne ${userSessions[from].unit} baad?`);
      }

      if (userSessions[from].step === 4) {
        let record = {
          phone: from,
          date: userSessions[from].date,
          unit: userSessions[from].unit,
          value: userSessions[from].value,
          interval: parseInt(msg)
        };

        let services = [];
        if (fs.existsSync("services.json")) {
          services = JSON.parse(fs.readFileSync("services.json"));
        }

        services.push(record);
        fs.writeFileSync("services.json", JSON.stringify(services, null, 2));

        await sendText(from, "✅ Service record saved successfully!");

        userSessions[from] = { step: 0 };
        return res.sendStatus(200);
      }

      // ===== HISTORY =====
      if (msg === "history") {
        if (!fs.existsSync("services.json"))
          return sendText(from, "❌ No history found.");

        let services = JSON.parse(fs.readFileSync("services.json"));
        let userRecords = services.filter(s => s.phone === from);

        if (userRecords.length === 0)
          return sendText(from, "❌ No history found.");

        let reply = "📜 Service History:\n\n";

        userRecords.forEach((r, i) => {
          reply += `${i + 1}. 📅 ${r.date}\n`;
          reply += `   🔧 ${r.value} ${r.unit}\n`;
          reply += `   🔁 Next at ${r.value + r.interval} ${r.unit}\n\n`;
        });

        return sendText(from, reply);
      }

      // ===== DUE CHECK =====
      if (msg === "due") {
        if (!fs.existsSync("services.json"))
          return sendText(from, "❌ No service record found.");

        let services = JSON.parse(fs.readFileSync("services.json"));
        let userRecords = services.filter(s => s.phone === from);

        if (userRecords.length === 0)
          return sendText(from, "❌ No service record found.");

        let last = userRecords[userRecords.length - 1];

        userSessions[from].record = last;
        userSessions[from].step = 10;

        return sendText(from, `Current ${last.unit} kitne hai?`);
      }

      if (userSessions[from].step === 10) {
        let current = parseInt(msg);
        let r = userSessions[from].record;

        let next = r.value + r.interval;
        let remaining = next - current;

        let reply =
          `📅 Last Service: ${r.date}\n` +
          `🔧 ${r.value} ${r.unit}\n` +
          `🔁 Interval: ${r.interval} ${r.unit}\n\n` +
          `🛠 Next Service: ${next} ${r.unit}\n`;

        if (remaining <= 0)
          reply += "⚠️ Service Due ho chuki hai!";
        else reply += `👍 ${remaining} ${r.unit} baad service hogi.`;

        await sendText(from, reply);

        userSessions[from] = { step: 0 };
        return res.sendStatus(200);
      }

      await sendText(from, "Type 'Hi' to open menu.");
    }

    return res.sendStatus(200);
  }

  return res.sendStatus(404);
});

// ===== SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running...");
});