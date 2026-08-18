import React from 'react';

const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(docId) {
  if (!docId || !docId.includes('-')) return docId || '';
  const [yr, mo] = docId.split('-');
  return `${MONTH_SHORT[parseInt(mo, 10)] || mo} ${String(yr).slice(-2)}`;
}

export default function Athletes({
  masterMembers,
  monthlyRecords,
  rosterStatusFilter,
  setRosterStatusFilter,
  rosterSearch,
  setRosterSearch,
  getMemberStreak,
  setHistoryMember,
  setEditMember,
  setShowAddModal
}) {
  const filtered = masterMembers
    .filter(m => {
      if (rosterStatusFilter === 'active') return m.status === 'active' || !m.status;
      if (rosterStatusFilter === 'inactive') return m.status === 'inactive';
      if (rosterStatusFilter === 'coaches') return m.isCoach;
      return true;
    })
    .filter(m => m.name.toLowerCase().includes((rosterSearch || '').toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  function winsFor(member) {
    const fromMonths = (monthlyRecords || [])
      .filter((r) => r.winnerId === member.id || r.winner === member.id)
      .map((r) => monthLabel(r.id));
    const stored = member.wins || [];
    return Array.from(new Set([...fromMonths, ...stored]));
  }

  return (
    <section className="space-y-4">
      <div className="bg-gray-800 p-3 sm:p-6 rounded-xl border border-gray-700 shadow-md">
        <div className="flex flex-col gap-3 mb-4">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-amber-400">Master Athletes</h2>
            <p className="text-gray-400 text-[11px] sm:text-xs">Roster, streaks, and wins. Tap a name for history.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={rosterStatusFilter}
              onChange={(e) => setRosterStatusFilter(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-white focus:outline-none font-semibold cursor-pointer"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
              <option value="coaches">Coaches</option>
            </select>
            <input
              type="text"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              placeholder="Search..."
              className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-amber-500 flex-1 min-w-[100px]"
            />
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold text-xs px-3 py-2 rounded-lg transition cursor-pointer whitespace-nowrap"
            >
              + Add
            </button>
          </div>
        </div>

        <div className="sm:hidden space-y-2">
          {filtered.map(m => {
            const monthsQualCount = monthlyRecords.filter(r => r.qualifierIds && r.qualifierIds.includes(m.id)).length;
            const streak = getMemberStreak(m.id);
            const winsList = winsFor(m);
            return (
              <div key={m.id} className="bg-gray-900/60 border border-gray-700 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="cursor-pointer hover:underline text-amber-400 font-bold text-sm" onClick={() => setHistoryMember(m)}>{m.name}</span>
                      {m.isCoach && <span className="bg-purple-900/60 text-purple-300 border border-purple-700/50 text-[9px] px-1.5 py-0.5 rounded font-bold">COACH</span>}
                      {m.status === 'inactive'
                        ? <span className="bg-gray-700 text-gray-400 text-[9px] px-1.5 py-0.5 rounded font-bold">Inactive</span>
                        : <span className="bg-green-900/60 text-green-300 text-[9px] px-1.5 py-0.5 rounded font-bold">Active</span>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-400">
                      <span><span className="text-amber-400 font-bold">{monthsQualCount}</span> mos</span>
                      {streak > 0
                        ? <span className="bg-orange-950/60 text-orange-400 border border-orange-700/50 px-1.5 py-0.5 rounded-full font-bold text-[10px] whitespace-nowrap">🔥 {streak}</span>
                        : <span>—</span>}
                    </div>
                    {winsList.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {winsList.map((w, idx) => (
                          <span key={idx} className="bg-amber-900/60 text-amber-300 border border-amber-700/50 text-[9px] px-1.5 py-0.5 rounded font-mono">{w}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setEditMember(m)}
                    className="shrink-0 bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10px] px-2.5 py-1.5 rounded transition"
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs font-bold border-b border-gray-700">
              <tr>
                <th className="p-3">Athlete Name</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-center">Months Qualified</th>
                <th className="p-3 text-center">Streak</th>
                <th className="p-3">Wins</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {filtered.map(m => {
                const monthsQualCount = monthlyRecords.filter(r => r.qualifierIds && r.qualifierIds.includes(m.id)).length;
                const streak = getMemberStreak(m.id);
                const winsList = winsFor(m);
                return (
                  <tr key={m.id} className="hover:bg-gray-800/50">
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="cursor-pointer hover:underline text-amber-400 font-bold" onClick={() => setHistoryMember(m)}>{m.name}</span>
                        {m.isCoach && <span className="bg-purple-900/60 text-purple-300 border border-purple-700/50 text-[9px] px-1.5 py-0.5 rounded font-bold">COACH</span>}
                      </div>
                    </td>
                    <td className="p-3">
                      {m.status === 'inactive'
                        ? <span className="bg-gray-700 text-gray-400 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">Inactive</span>
                        : <span className="bg-green-900/60 text-green-300 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">Active</span>}
                    </td>
                    <td className="p-3 text-center font-bold text-amber-400 text-sm">{monthsQualCount}</td>
                    <td className="p-3 text-center">
                      {streak > 0
                        ? <span className="bg-orange-950/60 text-orange-400 border border-orange-700/50 px-2 py-0.5 rounded-full font-bold text-xs whitespace-nowrap">🔥 {streak}</span>
                        : <span className="text-gray-500">—</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {winsList.length > 0
                          ? winsList.map((w, idx) => (
                              <span key={idx} className="bg-amber-900/60 text-amber-300 border border-amber-700/50 text-[10px] px-1.5 py-0.5 rounded font-mono">{w}</span>
                            ))
                          : <span className="text-gray-500">—</span>}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setEditMember(m)}
                        className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-3 py-1.5 rounded transition cursor-pointer"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}