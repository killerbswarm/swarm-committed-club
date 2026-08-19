const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
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

function makeNameKey(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getMemberStreak(memberId, monthlyRecords, minCheckins) {
  const now = new Date();
  const curDocId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const completed = [...monthlyRecords]
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((r) => r.id < curDocId || r.isUploaded);

  let streak = 0;
  for (let i = completed.length - 1; i >= 0; i--) {
    const r = completed[i];
    const cMap = r.checkinsMap || {};
    const isValid = cMap[memberId] === undefined || parseInt(cMap[memberId], 10) >= minCheckins;
    if (r.qualifierIds && r.qualifierIds.includes(memberId) && isValid) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// POST { email, firstName, lastName } → { streak }
exports.pushClubStreak = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const email = String((req.body || {}).email || "").toLowerCase().trim();
    const firstName = (req.body || {}).firstName || "";
    const lastName = (req.body || {}).lastName || "";
    const nameKey = makeNameKey(`${firstName} ${lastName}`);

    const [settingsSnap, membersSnap, monthsSnap] = await Promise.all([
      db.collection("settings").doc("app_config").get(),
      db.collection("members").get(),
      db.collection("monthly_records").get()
    ]);

    const minCheckins = settingsSnap.exists
      ? (settingsSnap.data().minCheckins !== undefined ? settingsSnap.data().minCheckins : 15)
      : 15;

    const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const member =
      members.find((m) => (m.email || "").toLowerCase() === email) ||
      members.find((m) => makeNameKey(m.nameKey || m.name) === nameKey);

    if (!member) {
      return res.status(200).json({ streak: null, reason: "member not found" });
    }

    const monthlyRecords = monthsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const streak = getMemberStreak(member.id, monthlyRecords, minCheckins);
    return res.status(200).json({ streak, memberId: member.id, name: member.name });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message);
  }
});

async function updateGhlStreak(email, streak) {
  const GHL_API_KEY = process.env.GHL_API_KEY;
  const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
  if (!GHL_API_KEY || !GHL_LOCATION_ID) {
    throw new Error("GHL_API_KEY or GHL_LOCATION_ID not set");
  }
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
  if (!contact) return { email, streak, status: "not_in_ghl" };
  await axios.put(
    `https://services.leadconnectorhq.com/contacts/${contact.id}`,
    {
      customFields: [
        { key: "committed_club_streak", field_value: String(streak) }
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
  return { email, streak, status: "updated" };
}

// One-time / on-demand: push the APP streak to GHL for every member who has an email
exports.pushAllClubStreaks = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") return res.status(204).send("");

    try {
      const [settingsSnap, membersSnap, monthsSnap] = await Promise.all([
        db.collection("settings").doc("app_config").get(),
        db.collection("members").get(),
        db.collection("monthly_records").get()
      ]);

      const minCheckins = settingsSnap.exists
        ? (settingsSnap.data().minCheckins !== undefined ? settingsSnap.data().minCheckins : 15)
        : 15;

      const monthlyRecords = monthsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const extraEmails = (req.body && req.body.emails) || {};
      const start = Math.max(0, parseInt(req.query.start || req.body?.start || "0", 10) || 0);
      const limit = Math.min(30, Math.max(1, parseInt(req.query.limit || req.body?.limit || "20", 10) || 20));

      const withEmail = [];
      const skipped = [];
      for (const member of members) {
        const email = (
          member.email ||
          extraEmails[makeNameKey(member.nameKey || member.name)] ||
          ""
        ).toLowerCase().trim();
        if (!email) skipped.push(member.name || member.id);
        else withEmail.push({ member, email });
      }

      const slice = withEmail.slice(start, start + limit);
      const results = [];
      for (const { member, email } of slice) {
        const streak = getMemberStreak(member.id, monthlyRecords, minCheckins);
        try {
          const row = await updateGhlStreak(email, streak);
          results.push({ ...row, name: member.name });
        } catch (err) {
          results.push({
            email,
            name: member.name,
            streak,
            status: "error",
            error: err.response?.data || err.message
          });
        }
      }

      const next = start + slice.length;
      return res.status(200).json({
        start,
        limit,
        processed: slice.length,
        remaining: Math.max(0, withEmail.length - next),
        nextStart: next < withEmail.length ? next : null,
        nextUrl: next < withEmail.length
          ? `https://us-central1-committed-club.cloudfunctions.net/pushAllClubStreaks?start=${next}&limit=${limit}`
          : null,
        updated: results.filter((r) => r.status === "updated").length,
        notInGhl: results.filter((r) => r.status === "not_in_ghl").length,
        errors: results.filter((r) => r.status === "error").length,
        skippedNoEmailCount: skipped.length,
        skippedNoEmail: skipped,
        results
      });
    } catch (err) {
      console.error(err);
      return res.status(500).send(err.message);
    }
  });


const CHECKINS_API = process.env.CHECKINS_API || "https://us-central1-swarm-checkins-5436d.cloudfunctions.net/getCheckins";

function prevMonthKey() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function resetMissedStreaks() {
  const minDays = 15;
  const lastKey = prevMonthKey();

  const [membersSnap, checkinsRes] = await Promise.all([
    db.collection("members").get(),
    axios.get(CHECKINS_API, { timeout: 30000 })
  ]);

  const checkins = checkinsRes.data?.checkins || [];
  const daysByEmail = {};
  checkins.forEach((c) => {
    const email = String(c.email || "").toLowerCase().trim();
    const date = c.classDate || "";
    if (!email || !date.startsWith(lastKey)) return;
    if (String(c.className || "").toLowerCase().includes("coach meeting")) return;
    if (!daysByEmail[email]) daysByEmail[email] = new Set();
    daysByEmail[email].add(date);
  });

  const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const emails = new Set();
  members.forEach((m) => {
    const e = String(m.email || "").toLowerCase().trim();
    if (e) emails.add(e);
  });
  Object.keys(daysByEmail).forEach((e) => emails.add(e));

  const results = [];
  for (const email of emails) {
    const days = daysByEmail[email] ? daysByEmail[email].size : 0;
    if (days >= minDays) {
      results.push({ email, days, status: "kept" });
      continue;
    }
    try {
      results.push({ ...(await updateGhlStreak(email, 0)), days, status: "reset" });
    } catch (err) {
      results.push({ email, days, status: "error", error: err.message });
    }
  }
  return { lastMonth: lastKey, results };
}

exports.monthlyResetStreaks = onSchedule(
  { schedule: "0 5 1 * *", timeZone: "America/New_York" },
  async () => {
    const out = await resetMissedStreaks();
    console.log("monthlyResetStreaks", JSON.stringify({
      lastMonth: out.lastMonth,
      reset: out.results.filter((r) => r.status === "reset").length
    }));
  }
);

exports.monthlyResetStreaksNow = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).send("");
  try {
    const out = await resetMissedStreaks();
    return res.status(200).json({
      lastMonth: out.lastMonth,
      reset: out.results.filter((r) => r.status === "reset").length,
      kept: out.results.filter((r) => r.status === "kept").length,
      errors: out.results.filter((r) => r.status === "error").length,
      results: out.results
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message);
  }
});
