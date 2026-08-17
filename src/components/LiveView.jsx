import React from 'react';
import { db, doc, getDoc, setDoc, serverTimestamp } from '../firebase';

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

export default function LiveView({
  monthlyRecords,
  masterMembers,
  liveMonthId,
  setLiveMonthId,
  liveSearch,
  setLiveSearch,
  appSettings,
  setHistoryMember,
  loadAllData
}) {
  const minCheckins = appSettings?.minCheckins || 15;

  const curRecord = monthlyRecords.find(r => r.id === liveMonthId);
  const cMap = curRecord ? (curRecord.checkinsMap || {}) : {};
  let liveMembers = masterMembers
    .filter(m => (parseInt(cMap[m.id] || 0, 10) > 0) && (m.status === 'active' || !m.status))
    .filter(m => m.name.toLowerCase().includes((liveSearch || '').toLowerCase()));
  liveMembers.sort((a, b) => (parseInt(cMap[b.id] || 0, 10) - parseInt(cMap[a.id] || 0, 10)) || a.name.localeCompare(b.name));

  async function handleEditCount(m, count) {
    const input = prompt(`Update check-in count for ${m.name}:`, count);
    if (input === null) return;
    const newCount = parseInt(input, 10);
    if (isNaN(newCount) || newCount < 0) return alert("Please enter a valid number");

    const mRef = doc(db, 'monthly_records', liveMonthId);
    const snap = await getDoc(mRef);
    let updatedCMap = snap.exists() ? (snap.data().checkinsMap || {}) : {};
    let qIds = snap.exists() ? (snap.data().qualifierIds || []) : [];

    updatedCMap[m.id] = newCount;
    if (newCount >= minCheckins) {
      if (!qIds.includes(m.id)) qIds.push(m.id);
    } else {
      qIds = qIds.filter(id => id !== m.id);
    }

    await setDoc(mRef, { qualifierIds: qIds, checkinsMap: updatedCMap, updatedAt: serverTimestamp() }, { merge: true });
    loadAllData();
  }

  function MemberRow({ m, idx, mobile }) {
    const count = parseInt(cMap[m.id] || 0, 10);
    const isQual = count >= minCheckins;
    const pct = Math.min(100, Math.round((count / minCheckins) * 100));
    const left = minCheckins - count;

    if (mobile) {
      return (
        <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-3 flex items-center gap-3">
          <div className="text-gray-500 font-mono text-xs w-5 shrink-0">{idx + 1}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="cursor-pointer hover:underline text-amber-400 font-bold text-sm truncate" onClick={() => setHistoryMember(m)}>{m.name}</span>
              {m.isCoach && <span className="bg-purple-900/60 text-purple-300 border border-purple-700/50 text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0">COACH</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="font-black text-amber-400 text-sm">{count}</span>
              <div className="w-16 bg-gray-700 h-1.5 rounded-full overflow-hidden shrink-0">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
              </div>
              {isQual
                ? <span className="bg-green-900/60 text-green-300 border border-green-700/50 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap">✓ Qual</span>
                : <span className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap">{left} left</span>}
            </div>
          </div>
          <button onClick={() => handleEditCount(m, count)} className="shrink-0 bg-gray-700 hover:bg-gray-600 text-amber-400 font-bold text-[10px] px-2.5 py-2 rounded-lg">
            Edit
          </button>
        </div>
      );
    }

    return (
      <tr className="hover:bg-gray-800/50">
        <td className="p-3 text-center font-mono text-gray-400 font-bold">{idx + 1}</td>
        <td className="p-3 font-semibold text-white">
          <div className="flex items-center gap-1.5">
            <span className="cursor-pointer hover:underline text-amber-400 font-bold" onClick={() => setHistoryMember(m)}>{m.name}</span>
            {m.isCoach && <span className="bg-purple-900/60 text-purple-300 border border-purple-700/50 text-[9px] px-1.5 py-0.5 rounded font-bold">COACH</span>}
          </div>
        </td>
        <td className="p-3 text-center">
          <div className="font-black text-amber-400 text-base">{count}</div>
          <div className="w-24 bg-gray-700 h-1.5 rounded-full mx-auto mt-1 overflow-hidden">
            <div className="bg-amber-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
          </div>
        </td>
        <td className="p-3 text-center">
          {isQual
            ? <span className="bg-green-900/60 text-green-300 border border-green-700/50 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap">✓ Qualified</span>
            : <span className="bg-gray-700/60 text-gray-300 border border-gray-600 px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap">{left} left</span>}
        </td>
        <td className="p-3 text-right">
          <button onClick={() => handleEditCount(m, count)} className="bg-gray-700 hover:bg-gray-600 text-amber-400 font-bold text-xs px-2.5 py-1.5 rounded transition cursor-pointer">
            ✏️ Edit Count
          </button>
        </td>
      </tr>
    );
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="bg-gray-800 p-3 sm:p-6 rounded-xl border border-gray-700 shadow-md">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-amber-400">Current Month Live View</h2>
            <p className="text-gray-400 text-[11px] sm:text-xs">Active members with 1+ check-ins for the selected month.</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={liveMonthId}
              onChange={(e) => setLiveMonthId(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs sm:text-sm text-white focus:outline-none font-semibold cursor-pointer min-w-0 flex-1 sm:flex-none"
            >
              {monthlyRecords.map(r => (
                <option key={r.id} value={r.id}>{formatMonthYearDisplay(r.id)}</option>
              ))}
            </select>
            <input
              type="text"
              value={liveSearch}
              onChange={(e) => setLiveSearch(e.target.value)}
              placeholder="Search..."
              className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 w-28 sm:w-48"
            />
          </div>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden space-y-2">
          {liveMembers.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">No members with check-ins found for this month yet.</div>
          ) : (
            liveMembers.map((m, idx) => <MemberRow key={m.id} m={m} idx={idx} mobile />)
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs font-bold border-b border-gray-700">
              <tr>
                <th className="p-3 w-10 text-center">#</th>
                <th className="p-3">Athlete Name</th>
                <th className="p-3 text-center">Check-Ins</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Quick Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {liveMembers.length === 0 ? (
                <tr><td colSpan="5" className="p-6 text-center text-gray-500">No members with check-ins found for this month yet.</td></tr>
              ) : (
                liveMembers.map((m, idx) => <MemberRow key={m.id} m={m} idx={idx} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
