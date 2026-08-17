const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

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

exports.zapierCheckinWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const data = req.body || {};

    const email = (data.email || "").toLowerCase().trim();
    const firstName = data.firstName || "";
    const lastName = data.lastName || "";
    const fullName = `${firstName} ${lastName}`.trim();
    const className = data.className || "";
    const classTime = data.classTime || "";
    const totalAttendanceCount = data.totalAttendanceCount || null;

    let classDate = data.classDate;

    if (!email || !classDate) {
      return res.status(400).send("Missing email or classDate");
    }

    // Ignore Coach Meeting – never counts toward Committed Club
const normalizedClassName = (className || "").toLowerCase().trim();
if (normalizedClassName.includes("coach meeting")) {
  console.log(`Ignored Coach Meeting check-in for ${email}`);
  return res.status(200).json({ 
    success: true, 
    message: "Coach Meeting ignored – does not count" 
  });
}

    // Normalize "8/14/2026" → "2026-08-14"
    const parts = classDate.split("/");
    if (parts.length === 3) {
      const [month, day, year] = parts;
      classDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const docId = `${email}_${classDate}`;
    const checkinRef = db.collection("checkins").doc(docId);

    // 1. Prevent duplicate for the same day
    const existing = await checkinRef.get();
    if (existing.exists) {
      console.log(`Duplicate ignored: ${docId}`);
      return res.status(200).json({ success: true, message: "Already recorded for this date" });
    }

    // 2. Save the individual dated check-in (NEW accurate system)
    await checkinRef.set({
      email,
      firstName,
      lastName,
      classDate,
      className,
      classTime,
      totalAttendanceCount,
      recordedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "zapier"
    });

    // 3. Also update the OLD monthly_records system (keeps August accurate)
    const nameKey = fullName.toLowerCase().replace(/[^a-z0-9]/g, "");
    
    // Find or create member
    const membersSnap = await db.collection("members")
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
        email: email,
        status: "active",
        isCoach: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      memberId = membersSnap.docs[0].id;
      await membersSnap.docs[0].ref.update({
        email: email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Update monthly_records (old system)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
    const monthDocId = `${currentYear}-${currentMonth}`;
    const monthRef = db.collection("monthly_records").doc(monthDocId);
    const minCheckinsThreshold = 15;

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
        qualifierIds,
        unqualifiedIds,
        checkinsMap,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    // 4. Calculate stats for GHL
    const currentMonthPrefix = `${currentYear}-${currentMonth}`;
    const snapshot = await db.collection("checkins")
      .where("email", "==", email)
      .get();

    let daysThisMonth = 0;
    let lastClass = null;

    snapshot.forEach((doc) => {
      const d = doc.data();
      if (d.classDate.startsWith(currentMonthPrefix)) {
        daysThisMonth++;
      }
      if (!lastClass || d.classDate > lastClass.classDate) {
        lastClass = d;
      }
    });

    const totalDays = snapshot.size;

    // 5. Update GHL
    await updateGHLContact(email, {
      totalAttendance: totalDays,
      daysThisMonth: daysThisMonth,
      lastClassName: lastClass?.className || className,
      lastClassTime: lastClass?.classTime || classTime,
      lastClassDate: lastClass?.classDate || classDate
    });

    return res.status(200).json({
      success: true,
      message: `Recorded check-in for ${fullName}`,
      daysThisMonth,
      totalDays
    });

  } catch (err) {
    console.error("Zapier Check-in Error:", err);
    return res.status(500).send(`Server Error: ${err.message}`);
  }
});


// ========== Helper: Update GHL ==========
async function updateGHLContact(email, fields) {
  const GHL_API_KEY = process.env.GHL_API_KEY;
  const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;

  if (!GHL_API_KEY || !GHL_LOCATION_ID) {
    console.log("GHL_API_KEY or GHL_LOCATION_ID not set – skipping GHL update");
    return;
  }

  try {
    // 1. Find contact by email
    const searchRes = await axios.get(
      `https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=${GHL_LOCATION_ID}&email=${encodeURIComponent(email)}`,
      {
        headers: {
          Authorization: `Bearer ${GHL_API_KEY}`,
          Version: "2021-07-28",
          Accept: "application/json"
        }
      }
    );

    const contact = searchRes.data?.contact;
    if (!contact) {
      console.log(`GHL contact not found: ${email}`);
      return;
    }

    // 2. Update the contact
    await axios.put(
      `https://services.leadconnectorhq.com/contacts/${contact.id}`,
      {
        customFields: [
          { key: "checkin_total", field_value: String(fields.totalAttendance) },
          { key: "committed_club_this_month", field_value: String(fields.daysThisMonth) },
          { key: "last_class_name", field_value: fields.lastClassName },
          { key: "last_class_time", field_value: fields.lastClassTime },
          { key: "last_class_date", field_value: fields.lastClassDate }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${GHL_API_KEY}`,
          Version: "2021-07-28",
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );

    console.log(`GHL updated successfully for ${email}`);
  } catch (err) {
    console.error("GHL update failed:", err.response?.data || err.message);
  }
}