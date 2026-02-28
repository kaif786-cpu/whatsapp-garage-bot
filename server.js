require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

let customers = {};

// ================= VERIFY WEBHOOK =================
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ================= SEND TEXT =================
async function sendText(to, message) {
  await axios.post(
    `https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: to,
      text: { body: message }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ================= SEND MENU =================
async function sendMenu(to) {
  await axios.post(
    `https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Garage Bot Menu 👇" },
        action: {
          buttons: [
            {
              type: "reply",
              reply: { id: "save_service", title: "Save Service" }
            },
            {
              type: "reply",
              reply: { id: "check_due", title: "Check Service Due" }
            }
          ]
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (
      body.object &&
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0].value.messages
    ) {
      const message =
        body.entry[0].changes[0].value.messages[0];

      const from = message.from;
      let msg = "";

      if (message.type === "text") {
        msg = message.text.body.trim().toLowerCase();
      }

      if (message.type === "interactive") {
        msg = message.interactive.button_reply.id;
      }

      if (!customers[from]) customers[from] = {};

      // ===== OPEN MENU =====
      if (msg === "hi") {
        await sendMenu(from);
      }

      // ===== SAVE SERVICE BUTTON =====
      else if (msg === "save_service") {
        customers[from].step = "ask_date";
        await sendText(from, "Service date bhejo (DD-MM-YYYY)");
      }

      else if (customers[from].step === "ask_date") {
        customers[from].serviceDate = msg;
        customers[from].step = "ask_km";
        await sendText(from, "Present KM kitna hai?");
      }

      else if (customers[from].step === "ask_km") {
        customers[from].serviceKM = msg;
        customers[from].step = "ask_next_km";
        await sendText(from, "Mechanic ne kitne KM baad service bola?");
      }

      else if (customers[from].step === "ask_next_km") {
        customers[from].nextServiceKM = msg;
        customers[from].step = null;

        await sendText(
          from,
          "✅ Service Saved!\n\nDate: " +
            customers[from].serviceDate +
            "\nKM: " +
            customers[from].serviceKM +
            "\nNext Service After: " +
            customers[from].nextServiceKM +
            " KM"
        );
      }

      // ===== CHECK SERVICE DUE =====
      else if (msg === "check_due") {
        if (!customers[from].serviceKM) {
          await sendText(from, "❌ No service record found.");
        } else {
          await sendText(
            from,
            "📋 Last Service Details:\n\nDate: " +
              customers[from].serviceDate +
              "\nKM: " +
              customers[from].serviceKM +
              "\nNext Service After: " +
              customers[from].nextServiceKM +
              " KM"
          );
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});