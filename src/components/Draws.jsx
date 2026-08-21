import React from 'react';

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatMonthYearDisplay(docId) {
  if (!docId) return '';
  if (docId.includes('Q')) return docId;
  if (docId.includes('-')) {
    const [yr, mo] = docId.split('-');
    return `${monthNames[parseInt(mo, 10)] || 'Month'} ${yr}`;
  }
  return docId;
}

function isCoachMeeting(className) {
  return (className || '').toLowerCase().includes('coach meeting');
}

export default function Draws({
  drawMYear,
  setDrawMYear,
  drawMMonth,
  setDrawMMonth,
  drawQYear,
  setDrawQYear,
  drawQQuarter,
  setDrawQQuarter,
  monthlyRecords,
  quarterlyRecords = [],
  masterMembers,
  checkins = [],
  appSettings,
  getPastWinnersMapForMonth,
  setWheelModal,
  revealedWinner,
  setRevealedWinner,
  ghlStatus,
  sendWinnerGhl
}) {
  const minCheckins = appSettings?.minCheckins || 15;

  function monthRec(docId) {
    return (monthlyRecords || []).find((r) => r.id === docId);
  }

  function hasLiveCheckins(prefix) {
    return (checkins || []).some((c) => c.classDate && c.classDate.startsWith(prefix));
  }

  function liveMonthMembers(docId) {
    const days = {};
    (checkins || []).forEach((c) => {
      if (!c.classDate || !c.classDate.startsWith(docId)) return;
      if (isCoachMeeting(c.className)) return;
      const email = (c.email || '').toLowerCase();
      if (!email) return;
      if (!days[email]) days[email] = new Set();
      days[email].add(c.classDate);
    });
    const byEmail = {};
    (masterMembers || []).forEach((m) => {
      const email = (m.email || '').toLowerCase();
      if (email) byEmail[email] = m;
    });
    const list = [];
    Object.entries(days).forEach(([email, set]) => {
      if (set.size < minCheckins) return;
      const m = byEmail[email];
      list.push(m ? { ...m, days: set.size } : { id: email, name: email, email, days: set.size });
    });
    return list;
  }

  function qualifiedForMonth(docId) {
    if (hasLiveCheckins(docId)) return liveMonthMembers(docId);
    const rec = monthRec(docId);
    const qSet = new Set(rec?.qualifierIds || []);
    return (masterMembers || []).filter((m) => qSet.has(m.id));
  }

  function monthlyPool(docId) {
    const rec = monthRec(docId);
    const dq = new Set(rec?.unqualifiedIds || []);
    const past = getPastWinnersMapForMonth ? getPastWinnersMapForMonth(docId) : new Map();
    return qualifiedForMonth(docId).filter((m) =>
      !m.isCoach && !dq.has(m.id) && !past.has(m.id)
    );
  }

  const monthDocId = `${drawMYear}-${String(drawMMonth).padStart(2, '0')}`;
  const monthPool = monthlyPool(monthDocId);

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
        <div className="bg-gray-800 p-4 sm:p-6 rounded-xl border border-gray-700 shadow-md">
          <h2 className="text-lg font-bold text-amber-400 mb-2">Monthly Winner Raffle</h2>
          <p className="text-gray-400 text-xs mb-4">
            Uses this month’s live check-ins. Excludes coaches, manual DQs, and winners from the last 12 months.
          </p>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Year</label>
              <input
                type="number"
                value={drawMYear}
                onChange={(e) => setDrawMYear(parseInt(e.target.value, 10))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Month</label>
              <select
                value={drawMMonth}
                onChange={(e) => setDrawMMonth(parseInt(e.target.value, 10))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white"
              >
                {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
                  <option key={m} value={m}>{monthNames[m]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs text-gray-400 mb-2">
            Wheel pool: <span className="text-amber-400 font-bold">{monthPool.length}</span>
          </div>
          <div className="max-h-32 overflow-y-auto text-[11px] text-gray-300 mb-4 space-y-0.5">
            {monthPool.length === 0
              ? <div className="text-gray-500">No eligible names yet.</div>
              : monthPool.map((m) => <div key={m.id}>{m.name}</div>)}
          </div>

          <button
            onClick={() => {
              if (!monthPool.length) return alert('No eligible athletes for this month.');
              setWheelModal({
                title: `Monthly Winner — ${formatMonthYearDisplay(monthDocId)}`,
                pool: monthPool,
                onWin: (winner) => sendWinnerGhl(winner.name, formatMonthYearDisplay(monthDocId))
              });
            }}
            className="w-full bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-3 rounded-lg transition text-xs shadow cursor-pointer uppercase"
          >
            Open Monthly Raffle Wheel 🎡
          </button>
        </div>

        <div className="bg-gray-800 p-4 sm:p-6 rounded-xl border border-gray-700 shadow-md">
          <h2 className="text-lg font-bold text-amber-400 mb-2">Quarterly Streak Raffle</h2>
          <p className="text-gray-400 text-xs mb-4">Picks from athletes qualified in all 3 months of the quarter.</p>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Year</label>
              <input
                type="number"
                value={drawQYear}
                onChange={(e) => setDrawQYear(parseInt(e.target.value, 10))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Quarter</label>
              <select
                value={drawQQuarter}
                onChange={(e) => setDrawQQuarter(parseInt(e.target.value, 10))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white"
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>Q{q}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={() => {
              const startM = (drawQQuarter - 1) * 3 + 1;
              const docIds = [startM, startM + 1, startM + 2].map((m) => `${drawQYear}-${String(m).padStart(2, '0')}`);
              const recs = docIds.map((id) => monthRec(id));
              if (recs.some((r, i) => !r && !hasLiveCheckins(docIds[i]))) {
                return alert('Need all 3 months of the quarter first.');
              }
              const sets = docIds.map((id) => new Set(qualifiedForMonth(id).map((m) => m.id)));
              const pool = (masterMembers || []).filter((m) =>
                !m.isCoach && sets.every((s) => s.has(m.id))
              );
              if (!pool.length) return alert('No eligible quarterly athletes.');
              setWheelModal({
                title: `Quarterly Winner — Q${drawQQuarter} ${drawQYear}`,
                pool,
                onWin: (winner) => sendWinnerGhl(winner.name, `Q${drawQQuarter} ${drawQYear}`)
              });
            }}
            className="w-full bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-3 rounded-lg transition text-xs shadow cursor-pointer uppercase"
          >
            Open Quarterly Raffle Wheel 🎡
          </button>
        </div>
      </div>

      {revealedWinner && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-gray-900 p-6 rounded-2xl text-center shadow-2xl space-y-2">
          <div className="text-xs uppercase font-black tracking-widest">{revealedWinner.title}</div>
          <div className="text-4xl font-extrabold">{revealedWinner.name}</div>
          <button
            onClick={() => sendWinnerGhl(revealedWinner.name, revealedWinner.prize || revealedWinner.title)}
            className="bg-gray-900 text-amber-400 font-bold py-2 px-6 rounded-xl text-xs uppercase tracking-wide cursor-pointer"
          >
            🚀 Send Prize SMS
          </button>
          {ghlStatus && <div className="text-xs font-bold text-gray-900 mt-1">{ghlStatus}</div>}
        </div>
      )}
    </section>
  );
}