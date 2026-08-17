import React from 'react';

export default function Dashboard({
  masterMembers,
  monthlyRecords,
  rosterStatusFilter,
  setRosterStatusFilter,
  rosterSearch,
  setRosterSearch,
  activeMembersCount,
  activeStreaksCount,
  unbrokenCount2026,
  totalLifetimeQuals,
  getMemberStreak,
  setHistoryMember,
  setEditMember,
  setShowAddModal
}) {
  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-gray-800 border border-gray-700 p-3.5 sm:p-4 rounded-xl shadow-md text-center">
          <div className="text-2xl sm:text-4xl font-black text-amber-400">{activeMembersCount}</div>
          <div className="text-[10px] sm:text-xs uppercase font-bold text-gray-400 mt-1">Active Athletes</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 p-3.5 sm:p-4 rounded-xl shadow-md text-center">
          <div className="text-2xl sm:text-4xl font-black text-orange-400">{activeStreaksCount}</div>
          <div className="text-[10px] sm:text-xs uppercase font-bold text-gray-400 mt-1">Active Streaks 🔥</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 p-3.5 sm:p-4 rounded-xl shadow-md text-center">
          <div className="text-2xl sm:text-4xl font-black text-yellow-400">{unbrokenCount2026}</div>
          <div className="text-[10px] sm:text-xs uppercase font-bold text-gray-400 mt-1">2026 Unbroken Club 🏆</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 p-3.5 sm:p-4 rounded-xl shadow-md text-center">
          <div className="text-2xl sm:text-4xl font-black text-emerald-400">{totalLifetimeQuals}</div>
          <div className="text-[10px] sm:text-xs uppercase font-bold text-gray-400 mt-1">Lifetime Qualifications</div>
        </div>
      </div>

      <div className="bg-gray-800 p-3 sm:p-6 rounded-xl border border-gray-700 shadow-md">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-amber-400">Master Athlete Roster</h2>
            <p className="text-gray-400 text-[11px] sm:text-xs">Click on any athlete&apos;s name to view their complete history, streak, and wins.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={rosterStatusFilter}
              onChange={(e) => setRosterStatusFilter(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs sm:text-sm text-white focus:outline-none font-semibold cursor-pointer"
            >
              <option value="active">Active Athletes</option>
              <option value="inactive">Inactive</option>
              <option value="all">All Athletes</option>
              <option value="coaches">Coaches Only</option>
            </select>
            <input
              type="text"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              placeholder="Search athlete..."
              className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 flex-1 sm:w-40"
            />
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold text-xs px-3 py-2 rounded-lg transition cursor-pointer"
            >
              + Add Athlete
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-gray-300">
            <thead className="bg-gray-900 text-gray-400 uppercase text-[10px] sm:text-xs font-bold border-b border-gray-700">
              <tr>
                <th className="p-2 sm:p-3">Athlete Name</th>
                <th className="p-2 sm:p-3">Status</th>
                <th className="p-2 sm:p-3 text-center">Months Qualified</th>
                <th className="p-2 sm:p-3 text-center">Streak</th>
                <th className="p-2 sm:p-3">Wins</th>
                <th className="p-2 sm:p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {masterMembers
                .filter(m => {
                  if (rosterStatusFilter === 'active') return m.status === 'active' || !m.status;
                  if (rosterStatusFilter === 'inactive') return m.status === 'inactive';
                  if (rosterStatusFilter === 'coaches') return m.isCoach;
                  return true;
                })
                .filter(m => m.name.toLowerCase().includes((rosterSearch || '').toLowerCase()))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(m => {
                  const monthsQualCount = monthlyRecords.filter(r => r.qualifierIds && r.qualifierIds.includes(m.id)).length;
                  const streak = getMemberStreak(m.id);
                  const winsList = m.wins || [];

                  return (
                    <tr key={m.id} className="hover:bg-gray-800/50">
                      <td className="p-2 sm:p-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="cursor-pointer hover:underline text-amber-400 font-bold"
                            onClick={() => setHistoryMember(m)}
                          >
                            {m.name}
                          </span>
                          {m.isCoach && (
                            <span className="bg-purple-900/60 text-purple-300 border border-purple-700/50 text-[9px] px-1.5 py-0.5 rounded font-bold">
                              COACH
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2 sm:p-3">
                        {m.status === 'inactive'
                          ? <span className="bg-gray-700 text-gray-400 text-[10px] px-2 py-1 rounded font-bold">Inactive</span>
                          : <span className="bg-green-900/60 text-green-300 text-[10px] px-2 py-1 rounded font-bold">Active</span>}
                      </td>
                      <td className="p-2 sm:p-3 text-center font-bold text-amber-400 text-sm">{monthsQualCount}</td>
                      <td className="p-2 sm:p-3 text-center">
                        {streak > 0
                          ? <span className="bg-orange-950/60 text-orange-400 border border-orange-700/50 px-2 py-0.5 rounded-full font-bold text-xs">🔥 {streak}</span>
                          : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="p-2 sm:p-3 flex flex-wrap gap-1">
                        {winsList.length > 0
                          ? winsList.map((w, idx) => (
                              <span key={idx} className="bg-amber-900/60 text-amber-300 border border-amber-700/50 text-[10px] px-1.5 py-0.5 rounded font-mono">{w}</span>
                            ))
                          : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="p-2 sm:p-3 text-right">
                        <button
                          onClick={() => setEditMember(m)}
                          className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10px] sm:text-xs px-3 py-1.5 rounded transition cursor-pointer"
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
