const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(express.json());

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

let userSessions = {};

// ================= VERIFY WEBHOOK =================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
});

// ================= HANDLE MESSAGES =================
app.post("/webhook", async (req, res) => {
  let body = req.body;

  if (body.object) {
    let change = body.entry?.[0]?.changes?.[0]?.value;

    if (change?.messages) {
      let message = change.messages[0];
      let from = message.from;
      let msg = message.text?.body;

      if (!userSessions[from]) {
        userSessions[from] = { step: 0 };
      }

      let replyText = "";

      // START
      if (msg?.toLowerCase() === "hi") {
        userSessions[from] = { step: 0 };
        replyText =
          "Namaste 🙏\n\n1️⃣ Service Due (Date se)\n2️⃣ Service Due (KM se)\n3️⃣ Service Booking";
      }

      // ===== OPTION 1 DATE BASED =====
      else if (msg === "1") {
        userSessions[from].step = 1;
        replyText = "Last service kab hui thi? (DD-MM-YYYY)";
      }

      else if (userSessions[from].step === 1) {
        let parts = msg.split("-");
        let serviceDate = new Date(parts[2], parts[1] - 1, parts[0]);
        serviceDate.setMonth(serviceDate.getMonth() + 3);

        let nextService = serviceDate.toLocaleDateString("en-GB");

        replyText =
          `🛠 Next Service Date: ${nextService}\n\nDhanyavaad 🙏`;

        userSessions[from] = { step: 0 };
      }

      // ===== OPTION 2 KM BASED =====
      else if (msg === "2") {
        userSessions[from].step = 20;
        replyText = "Last service par kitne KM the?";
      }

      else if (userSessions[from].step === 20) {
        userSessions[from].lastKm = parseInt(msg);
        userSessions[from].step = 21;
        replyText = "Mechanic ne kitne KM baad service bola tha? (Example: 4000)";
      }

      else if (userSessions[from].step === 21) {
        userSessions[from].intervalKm = parseInt(msg);
        userSessions[from].step = 22;
        replyText = "Abhi gaadi kitne KM chali hai?";
      }

      else if (userSessions[from].step === 22) {
        let lastKm = userSessions[from].lastKm;
        let intervalKm = userSessions[from].intervalKm;
        let currentKm = parseInt(msg);

        let nextServiceKm = lastKm + intervalKm;
        let remainingKm = nextServiceKm - currentKm;

        if (remainingKm <= 0) {
          replyText =
            `⚠️ Service Due ho chuki hai!\nNext service tha ${nextServiceKm} KM par.\nJaldi service karwa lo 🚗`;
        } else {
          replyText =
            `🛠 Next Service at: ${nextServiceKm} KM\n\nAbhi ${remainingKm} KM baad service hogi 👍`;
        }

        userSessions[from] = { step: 0 };
      }

      // ===== OPTION 3 BOOKING =====
      else if (msg === "3") {
        userSessions[from].step = 30;
        replyText = "Gaadi ka model batao 🚗";
      }

      else if (userSessions[from].step === 30) {
        userSessions[from].model = msg;
        userSessions[from].step = 31;
        replyText = "Service date kya chahiye? (DD-MM-YYYY)";
      }

      else if (userSessions[from].step === 31) {
        userSessions[from].date = msg;
        userSessions[from].step = 32;
        replyText = "Time batao (Example: 11:30 AM)";
      }

      else if (userSessions[from].step === 32) {
        let booking = {
          phone: from,
          model: userSessions[from].model,
          date: userSessions[from].date,
          time: msg,
        };

        let bookings = [];
        if (fs.existsSync("bookings.json")) {
          bookings = JSON.parse(fs.readFileSync("bookings.json"));
        }

        bookings.push(booking);
        fs.writeFileSync("bookings.json", JSON.stringify(bookings, null, 2));

        replyText =
          `✅ Booking Confirmed!\n\n🚗 ${booking.model}\n📅 ${booking.date}\n⏰ ${booking.time}\n\nDhanyavaad 🙏`;

        userSessions[from] = { step: 0 };
      }

      else {
        replyText = "Kripya 'Hi' bhej kar shuru karein.";
      }

      await axios.post(
        `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: { body: replyText },
        },
        {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return res.sendStatus(200);
  } else {
    return res.sendStatus(404);
  }
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});