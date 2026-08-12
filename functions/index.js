const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.ghlCheckinWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const body = req.body || {};
    const rawName = 
      body.full_name || 
      body.name || 
      body.fullName || 
      body.customData?.name ||
      body.contact?.name ||
      `${body.first_name || body.firstname || ""} ${body.last_name || body.lastname || ""}`.trim();

    const fullName = (rawName || "").toString().trim();

    if (!fullName || fullName === "") {
      return res.status(400).send(`Missing contact name in webhook payload.`);
    }

    const nameKey = fullName.toLowerCase().replace(/[^a-z0-9]/g, "");

    // 1. Find or create member in Firestore
    const membersSnap = await db
      .collection("members")
      .where("nameKey", "==", nameKey)
      .limit(1)
      .get();

    let memberId = "";

    if (membersSnap.empty) {
      const newMemberRef = db.collection("members").doc();
      memberId = newMemberRef.id;

      await newMemberRef.set({
        name: fullName,
        nameKey: nameKey,
        status: "active",
        isCoach: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      const memberDoc = membersSnap.docs[0];
      memberId = memberDoc.id;

      await memberDoc.ref.update({
        status: "active",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 2. Transactionally update check-ins and qualification status
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
    const monthDocId = `${currentYear}-${currentMonth}`;
    const monthRef = db.collection("monthly_records").doc(monthDocId);
    const minCheckinsThreshold = 15; // Minimum check-ins for Committed Club qualification

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(monthRef);
      let checkinsMap = {};
      let qualifierIds = [];
      let unqualifiedIds = [];

      if (doc.exists) {
        const data = doc.data();
        checkinsMap = data.checkinsMap || {};
        qualifierIds = data.qualifierIds || [];
        unqualifiedIds = data.unqualifiedIds || [];
      }

      const currentCount = (parseInt(checkinsMap[memberId], 10) || 0) + 1;
      checkinsMap[memberId] = currentCount;

      // Only add to qualifierIds if they meet or exceed the minimum threshold (e.g. 15)
      if (currentCount >= minCheckinsThreshold) {
        if (!qualifierIds.includes(memberId)) {
          qualifierIds.push(memberId);
        }
        unqualifiedIds = unqualifiedIds.filter(id => id !== memberId);
      } else {
        if (!unqualifiedIds.includes(memberId) && !qualifierIds.includes(memberId)) {
          unqualifiedIds.push(memberId);
        }
      }

      transaction.set(monthRef, {
        year: currentYear,
        month: parseInt(currentMonth, 10),
        qualifierIds: qualifierIds,
        unqualifiedIds: unqualifiedIds,
        checkinsMap: checkinsMap,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    return res.status(200).json({
      success: true,
      message: `Recorded check-in for ${fullName}`,
      memberId: memberId,
      month: monthDocId,
    });
  } catch (err) {
    console.error("GHL Webhook Error:", err);
    return res.status(500).send(`Server Error: ${err.message}`);
  }
});