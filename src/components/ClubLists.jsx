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

export default function ClubLists({
  listSubTab,
  setListSubTab,
  clubListSelectedId,
  setClubListSelectedId,
  clubListSearch,
  setClubListSearch,
  monthlyRecords,
  quarterlyRecords,
  masterMembers,
  appSettings,
  setHistoryMember
}) {
  const now = new Date();
  const currentMonthDocId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const yearsFromData = Array.from(
    new Set(
      (monthlyRecords || [])
        .map((r) => (r.id || '').split('-')[0])
        .filter((y) => /^\d{4}$/.test(y))
        .map(Number)
    )
  ).sort((a, b) => b - a);
  const years = yearsFromData.length ? yearsFromData : [2026, 2025, 2024];

  function monthRec(docId) {
    return (monthlyRecords || []).find((r) => r.id === docId);
  }

  function quarterMonthIds(year, qNum) {
    const start = (qNum - 1) * 3 + 1;
    return [0, 1, 2].map((i) => `${year}-${String(start + i).padStart(2, '0')}`);
  }

  function membersForQuarter(year, qNum) {
    const ids = quarterMonthIds(year, qNum);
    const recs = ids.map(monthRec).filter(Boolean);
    if (recs.length < 3) return [];
    return masterMembers.filter((m) =>
      recs.every((r) => (r.qualifierIds || []).includes(m.id))
    );
  }

  function membersUnbroken(year) {
    const recs = (monthlyRecords || []).filter((r) => {
      if (!(r.id || '').startsWith(`${year}-`)) return false;
      return r.id < currentMonthDocId || r.isUploaded;
    });
    if (recs.length === 0) return [];
    return masterMembers.filter((m) =>
      recs.every((r) => (r.qualifierIds || []).includes(m.id))
    );
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="bg-gray-800 p-3 sm:p-6 rounded-xl border border-gray-700 shadow-md">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 pb-4 border-b border-gray-700">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-amber-400">Committed Club Historical Lists</h2>
            <p className="text-gray-400 text-[11px] sm:text-xs">Select a category sub-tab below to filter views.</p>
          </div>
          <div className="flex bg-gray-900 p-1 rounded-xl border border-gray-700 gap-1 w-full sm:w-auto">
            {['monthly', 'quarterly', 'unbroken'].map(sub => (
              <button
                key={sub}
                onClick={() => setListSubTab(sub)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${listSubTab === sub ? 'bg-amber-500 text-gray-900' : 'text-gray-400 hover:text-white'}`}
              >
                {sub === 'monthly' && '📅 Monthly'}
                {sub === 'quarterly' && '🏆 Quarterly'}
                {sub === 'unbroken' && '🔥 Unbroken'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">
              {listSubTab === 'monthly' ? 'Select Month:' : listSubTab === 'quarterly' ? 'Select Quarter:' : 'Select Year:'}
            </label>
            <select
              value={clubListSelectedId}
              onChange={(e) => setClubListSelectedId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs sm:text-sm text-white focus:outline-none font-semibold cursor-pointer"
            >
              <option value="">-- Select --</option>
              {listSubTab === 'monthly' && monthlyRecords.map(r => (
                <option key={r.id} value={`M:${r.id}`}>{formatMonthYearDisplay(r.id)} ({(r.qualifierIds || []).length} qualified)</option>
              ))}
              {listSubTab === 'quarterly' && years.flatMap((yr) =>
                [4, 3, 2, 1].map((qNum) => (
                  <option key={`${yr}-Q${qNum}`} value={`Q:${yr}-Q${qNum}`}>
                    {`Q${qNum} ${yr}`}
                  </option>
                ))
              )}
              {listSubTab === 'unbroken' && years.map((yr) => (
                <option key={`unbroken-${yr}`} value={`unbroken-${yr}`}>{yr} Unbroken</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Search</label>
            <input
              type="text"
              value={clubListSearch}
              onChange={(e) => setClubListSearch(e.target.value)}
              placeholder="Search athlete..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-gray-300">
            <thead className="bg-gray-900 text-gray-400 uppercase text-[10px] sm:text-xs font-bold border-b border-gray-700">
              <tr>
                <th className="p-2 sm:p-3 w-10 text-center">#</th>
                <th className="p-2 sm:p-3">Athlete Name</th>
                <th className="p-2 sm:p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {(() => {
                let list = [];

                if (!clubListSelectedId) {
                  return <tr><td colSpan="3" className="p-6 text-center text-gray-500">Select a list above to view members.</td></tr>;
                }

                let winnerId = '';
                let winnerName = '';

                if (clubListSelectedId.startsWith('M:')) {
                  const docId = clubListSelectedId.replace('M:', '');
                  const rec = monthlyRecords.find(r => r.id === docId);
                  if (rec) {
                    const qSet = new Set(rec.qualifierIds || []);
                    list = masterMembers.filter(m => qSet.has(m.id));
                    winnerId = rec.winnerId || rec.winner || '';
                    winnerName = rec.winnerName || '';
                  }
                } else if (clubListSelectedId.startsWith('Q:')) {
                  const key = clubListSelectedId.replace('Q:', '');
                  const rec = (quarterlyRecords || []).find(r => r.id === key || r.id === clubListSelectedId);
                  if (rec && (rec.qualifierIds || rec.memberIds || []).length) {
                    const qSet = new Set(rec.qualifierIds || rec.memberIds || []);
                    list = masterMembers.filter(m => qSet.has(m.id));
                    winnerId = rec.winnerId || rec.winner || '';
                    winnerName = rec.winnerName || '';
                  } else {
                    const [yrStr, qStr] = key.split('-');
                    const yr = parseInt(yrStr, 10);
                    const qNum = parseInt(String(qStr).replace('Q', ''), 10);
                    if (yr && qNum) list = membersForQuarter(yr, qNum);
                    if (rec) {
                      winnerId = rec.winnerId || rec.winner || '';
                      winnerName = rec.winnerName || '';
                    }
                  }
                } else if (clubListSelectedId.startsWith('unbroken-')) {
                  const yr = parseInt(clubListSelectedId.replace('unbroken-', ''), 10);
                  list = membersUnbroken(yr);
                }

                const winnerMember = masterMembers.find((m) =>
                  (winnerId && m.id === winnerId) ||
                  (winnerName && m.name && m.name.toLowerCase() === String(winnerName).toLowerCase())
                );
                if (winnerMember) winnerId = winnerMember.id;

                if (clubListSearch) {
                  list = list.filter(m => m.name.toLowerCase().includes(clubListSearch.toLowerCase()));
                }

                list.sort((a, b) => {
                  if (winnerId && a.id === winnerId) return -1;
                  if (winnerId && b.id === winnerId) return 1;
                  return a.name.localeCompare(b.name);
                });

                if (list.length === 0) {
                  return <tr><td colSpan="3" className="p-6 text-center text-gray-500">No members found for this selection.</td></tr>;
                }

                return list.map((m, idx) => {
                  const isWinner = winnerId && m.id === winnerId;
                  return (
                  <tr key={m.id} className={isWinner ? 'bg-amber-500/10' : 'hover:bg-gray-800/50'}>
                    <td className="p-2 sm:p-3 text-center font-mono text-gray-400 font-bold">{idx + 1}</td>
                    <td className="p-2 sm:p-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="cursor-pointer hover:underline text-amber-400 font-bold" onClick={() => setHistoryMember(m)}>{m.name}</span>
                        {isWinner && <span className="bg-amber-500 text-gray-900 text-[9px] px-1.5 py-0.5 rounded font-black">🏆 WINNER</span>}
                        {m.isCoach && <span className="bg-purple-900/60 text-purple-300 border border-purple-700/50 text-[9px] px-1.5 py-0.5 rounded font-bold">COACH</span>}
                        {(m.wins || []).length > 0 && !isWinner && (
                          <span className="text-[10px] text-amber-300/80 font-mono">{m.wins.join(' · ')}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 sm:p-3 text-center">
                      <span className="bg-green-900/60 text-green-300 border border-green-700/50 px-2.5 py-1 rounded-full text-[10px] font-bold">✓ Qualified</span>
                    </td>
                  </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}