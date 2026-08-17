import React from 'react';

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatMonthYearDisplay(docId) {
  if (!docId) return '';
  if (docId.includes('Q')) return docId;
  if (docId.includes('-')) {
    const [yr, mo] = docId.split('-');
    const mNum = parseInt(mo, 10);
    return `${monthNames[mNum] || 'Month'} ${yr}`;
  }
  return docId;
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
  masterMembers,
  setWheelModal,
  revealedWinner,
  setRevealedWinner,
  ghlStatus,
  sendWinnerGhl
}) {
  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
        {/* Monthly */}
        <div className="bg-gray-800 p-4 sm:p-6 rounded-xl border border-gray-700 shadow-md">
          <h2 className="text-lg font-bold text-amber-400 mb-2">Monthly Winner Raffle</h2>
          <p className="text-gray-400 text-xs mb-4">Randomly picks a winner excluding coaches and past 12-month winners.</p>

          <div className="grid grid-cols-2 gap-2 mb-4">
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
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                  <option key={m} value={m}>{monthNames[m]}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={() => {
              const docId = `${drawMYear}-${String(drawMMonth).padStart(2, '0')}`;
              const rec = monthlyRecords.find(r => r.id === docId);
              if (!rec) return alert("No monthly list found.");
              const pool = masterMembers.filter(m => (rec.qualifierIds || []).includes(m.id) && !m.isCoach);
              setWheelModal({
                title: `Monthly Winner — ${formatMonthYearDisplay(docId)}`,
                pool,
                onWin: (winner) => sendWinnerGhl(winner.name, formatMonthYearDisplay(docId))
              });
            }}
            className="w-full bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-3 rounded-lg transition text-xs shadow cursor-pointer uppercase"
          >
            Open Monthly Raffle Wheel 🎡
          </button>
        </div>

        {/* Quarterly */}
        <div className="bg-gray-800 p-4 sm:p-6 rounded-xl border border-gray-700 shadow-md">
          <h2 className="text-lg font-bold text-amber-400 mb-2">Quarterly Streak Raffle</h2>
          <p className="text-gray-400 text-xs mb-4">Picks from athletes qualified in all 3 consecutive months of the quarter.</p>

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
                {[1, 2, 3, 4].map(q => (
                  <option key={q} value={q}>Q{q}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={() => {
              const startM = (drawQQuarter - 1) * 3 + 1;
              const docIds = [startM, startM + 1, startM + 2].map(m => `${drawQYear}-${String(m).padStart(2, '0')}`);
              const recs = docIds.map(id => monthlyRecords.find(r => r.id === id));
              if (recs.some(r => !r)) return alert("Upload all 3 months of the quarter first.");
              const pool = masterMembers.filter(m => recs.every(r => (r.qualifierIds || []).includes(m.id)) && !m.isCoach);
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
