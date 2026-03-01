require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

let customers = {};

// ================= VERIFY WEBHOOK =================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// ================= SEND TEXT =================
async function sendText(to, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.986804867849479}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.EAAg6o4omib8BQwz6hkgr0RRKTT9vS1ZCrvb5fy9qakkKAyaYnhM0nZCBL56lMIlt9k1COMZA21yqdgeRmCWVX2bdYcoe6JzewjPvSPg5cEwND5jR3ADY3ZAEvtkVV36yyrEVeVemK4BiCHdGazX0HLwQ5FcvqdClbWIHPzGLKJPKxfKBZBcSsuLBVeyRrSAZDZD}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    console.log("Text Error:", error.response?.data || error.message);
  }
}

// ================= SEND MENU =================
async function sendMenu(to) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
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
                reply: { id: "check_due", title: "Check Due" }
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
  } catch (error) {
    console.log("Menu Error:", error.response?.data || error.message);
  }
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

      // ===== SAVE SERVICE FLOW =====
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
          `✅ Service Saved!

Date: ${customers[from].serviceDate}
KM: ${customers[from].serviceKM}
Next Service After: ${customers[from].nextServiceKM} KM`
        );
      }

      // ===== CHECK DUE =====
      else if (msg === "check_due") {
        if (!customers[from].serviceKM) {
          await sendText(from, "❌ No service record found.");
        } else {
          await sendText(
            from,
            `📋 Last Service Details:

Date: ${customers[from].serviceDate}
KM: ${customers[from].serviceKM}
Next Service After: ${customers[from].nextServiceKM} KM`
          );
        }
      }

      else {
        await sendText(from, "Type 'hi' to open menu.");
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.log("Webhook Error:", error.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log("Server running...");
});