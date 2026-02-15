const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

exports.unifiWebhook = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const db = admin.firestore();

    const plateRaw = req.body?.plate;
    const camera = req.body?.camera;

    if (!plateRaw) {
      return res.status(400).json({ ok: false, error: "Missing plate" });
    }

    // Normalize plate
    const plate = plateRaw.toUpperCase().trim();

    // Check paidSessions collection
    const paidDoc = await db.collection("paidSessions").doc(plate).get();

    let isPaid = false;

    if (paidDoc.exists) {
      const data = paidDoc.data();

      const now = new Date();
      const validUntil = data.validUntil?.toDate();

      if (data.active === true && validUntil && validUntil > now) {
        isPaid = true;
      }
    }

    // Store event with payment status
    const docRef = await db.collection("events").add({
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      plate,
      camera,
      paid: isPaid,
      rawPayload: req.body,
    });

    logger.info("Event processed", {
      plate,
      camera,
      paid: isPaid,
      eventId: docRef.id,
    });

    return res.status(200).json({
      ok: true,
      paid: isPaid,
      eventId: docRef.id,
    });

  } catch (err) {
    logger.error("Webhook error", err);
    return res.status(500).json({
      ok: false,
      error: String(err),
    });
  }
});
