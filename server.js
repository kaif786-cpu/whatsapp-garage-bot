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

🚗 Abhi ${remaining} KM baaki hai service me.`
    );
  } else {
    await sendText(
      from,
      `⚠️ Service Due!

Last Service KM: ${lastKM}
Next Service At: ${nextServiceAt} KM

❗ Aapki service due ho chuki hai.

Reply "book" to book service.`
    );
  }
}

// ===== BOOK SERVICE =====
else if (msg === "book") {
  await sendText(
    from,
    "✅ Service Booking Request Received.\nHam aapse jaldi contact karenge."
  );
}