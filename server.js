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
          "Namaste 🙏\n\n1️⃣ Service Due (KM se)\n2️⃣ Service Booking\n3️⃣ Service Record Save";
      }

      // ===== OPTION 1 KM DUE CHECK =====
      else if (msg === "1") {
        userSessions[from].step = 10;
        replyText = "Last service par kitne KM the?";
      }

      else if (userSessions[from].step === 10) {
        userSessions[from].lastKm = parseInt(msg);
        userSessions[from].step = 11;
        replyText = "Mechanic ne kitne KM baad service bola tha?";
      }

      else if (userSessions[from].step === 11) {
        userSessions[from].intervalKm = parseInt(msg);
        userSessions[from].step = 12;
        replyText = "Abhi gaadi kitne KM chali hai?";
      }

      else if (userSessions[from].step === 12) {
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

      // ===== OPTION 2 BOOKING =====
      else if (msg === "2") {
        userSessions[from].step = 20;
        replyText = "Gaadi ka model batao 🚗";
      }

      else if (userSessions[from].step === 20) {
        userSessions[from].model = msg;
        userSessions[from].step = 21;
        replyText = "Service date kya chahiye? (DD-MM-YYYY)";
      }

      else if (userSessions[from].step === 21) {
        userSessions[from].date = msg;
        userSessions[from].step = 22;
        replyText = "Time batao (Example: 11:30 AM)";
      }

      else if (userSessions[from].step === 22) {
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
          `✅ Booking Confirmed!\n\n🚗 ${booking.model}\n📅 ${booking.date}\n⏰ ${booking.time}`;

        userSessions[from] = { step: 0 };
      }

      // ===== OPTION 3 SERVICE RECORD SAVE =====
      else if (msg === "3") {
        userSessions[from].step = 30;
        replyText = "Service date batao (DD-MM-YYYY)";
      }

      else if (userSessions[from].step === 30) {
        userSessions[from].serviceDate = msg;
        userSessions[from].step = 31;
        replyText = "Service ke time gaadi kitne KM chali thi?";
      }

      else if (userSessions[from].step === 31) {
        userSessions[from].serviceKm = parseInt(msg);
        userSessions[from].step = 32;
        replyText = "Agli service kitne KM baad karni hai?";
      }

      else if (userSessions[from].step === 32) {
        let record = {
          phone: from,
          serviceDate: userSessions[from].serviceDate,
          serviceKm: userSessions[from].serviceKm,
          intervalKm: parseInt(msg),
        };

        let services = [];
        if (fs.existsSync("services.json")) {
          services = JSON.parse(fs.readFileSync("services.json"));
        }

        services.push(record);
        fs.writeFileSync("services.json", JSON.stringify(services, null, 2));

        replyText =
          `✅ Service Record Save Ho Gaya!\n\n📅 ${record.serviceDate}\n🛞 ${record.serviceKm} KM\n🔁 Next at ${record.serviceKm + record.intervalKm} KM`;

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