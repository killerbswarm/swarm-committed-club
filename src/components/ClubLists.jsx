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
              {listSubTab === 'quarterly' && [2026, 2025].map(yr => [4, 3, 2, 1].map(qNum => (
                <option key={`${yr}-Q${qNum}`} value={`Q:${yr}-Q${qNum}`}>{`Q${qNum} ${yr}`}</option>
              )))}
              {listSubTab === 'unbroken' && [2026, 2025].map(yr => (
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

                if (clubListSelectedId.startsWith('M:')) {
                  const docId = clubListSelectedId.replace('M:', '');
                  const rec = monthlyRecords.find(r => r.id === docId);
                  if (rec) {
                    const qSet = new Set(rec.qualifierIds || []);
                    list = masterMembers.filter(m => qSet.has(m.id));
                  }
                } else if (clubListSelectedId.startsWith('Q:')) {
                  // Quarterly - keep simple for now (uses quarterlyRecords if available)
                  const key = clubListSelectedId.replace('Q:', '');
                  const rec = (quarterlyRecords || []).find(r => r.id === key || r.id === clubListSelectedId);
                  if (rec) {
                    const qSet = new Set(rec.qualifierIds || rec.memberIds || []);
                    list = masterMembers.filter(m => qSet.has(m.id));
                  }
                } else if (clubListSelectedId.startsWith('unbroken-')) {
                  const yr = parseInt(clubListSelectedId.replace('unbroken-', ''), 10);
                  const yearRecs = monthlyRecords.filter(r => r.year === yr && (r.id < currentMonthDocId || r.isUploaded));
                  if (yearRecs.length > 0) {
                    list = masterMembers.filter(m => yearRecs.every(r => (r.qualifierIds || []).includes(m.id)));
                  }
                }

                if (clubListSearch) {
                  list = list.filter(m => m.name.toLowerCase().includes(clubListSearch.toLowerCase()));
                }

                list.sort((a, b) => a.name.localeCompare(b.name));

                if (list.length === 0) {
                  return <tr><td colSpan="3" className="p-6 text-center text-gray-500">No members found for this selection.</td></tr>;
                }

                return list.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-gray-800/50">
                    <td className="p-2 sm:p-3 text-center font-mono text-gray-400 font-bold">{idx + 1}</td>
                    <td className="p-2 sm:p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="cursor-pointer hover:underline text-amber-400 font-bold" onClick={() => setHistoryMember(m)}>{m.name}</span>
                        {m.isCoach && <span className="bg-purple-900/60 text-purple-300 border border-purple-700/50 text-[9px] px-1.5 py-0.5 rounded font-bold">COACH</span>}
                      </div>
                    </td>
                    <td className="p-2 sm:p-3 text-center">
                      <span className="bg-green-900/60 text-green-300 border border-green-700/50 px-2.5 py-1 rounded-full text-[10px] font-bold">✓ Qualified</span>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
