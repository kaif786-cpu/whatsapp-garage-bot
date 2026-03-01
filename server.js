require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// In-memory database
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
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
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
  } catch (error) {
    console.log("SendText Error:", error.response?.data || error.message);
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
      const message = body.entry[0].changes[0].value.messages[0];
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

      // ===== SAVE SERVICE =====
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
        await sendText(from, "Kitne KM baad next service karni hai?");
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
          customers[from].step = "enter_present_km";
          await sendText(from, "Apna present KM enter karo:");
        }
      }

      else if (customers[from].step === "enter_present_km") {
        const presentKM = parseInt(msg);
        const lastKM = parseInt(customers[from].serviceKM);
        const nextAfter = parseInt(customers[from].nextServiceKM);

        const nextServiceAt = lastKM + nextAfter;
        const remaining = nextServiceAt - presentKM;

        customers[from].step = null;

        if (remaining > 0) {
          await sendText(
            from,
            `📋 Service Details:

Last Service KM: ${lastKM}
Next Service At: ${nextServiceAt} KM

🚗 ${remaining} KM baaki hai service me.`
          );
        } else {
          await sendText(
            from,
            `⚠️ Service Due!

Last Service KM: ${lastKM}
Next Service At: ${nextServiceAt} KM

Reply "book" to book service.`
          );
        }
      }

      // ===== BOOK SERVICE =====
      else if (msg === "book") {
        await sendText(
          from,
          "✅ Service Booking Request Received.\nHam jaldi contact karenge."
        );
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

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log("Server running...");
});