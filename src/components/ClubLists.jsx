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

function pastWinnersForMonth(monthlyRecords, quarterlyRecords, targetDocId) {
  const map = new Map();
  if (!targetDocId || !targetDocId.includes('-')) return map;
  const [yrStr, moStr] = targetDocId.split('-');
  const targetDate = new Date(parseInt(yrStr, 10), parseInt(moStr, 10) - 1, 1);
  for (let i = 1; i <= 12; i++) {
    const prev = new Date(targetDate);
    prev.setMonth(prev.getMonth() - i);
    const pDocId = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    const prevDoc = (monthlyRecords || []).find((r) => r.id === pDocId);
    if (prevDoc && prevDoc.winnerId && !map.has(prevDoc.winnerId)) {
      map.set(prevDoc.winnerId, formatMonthYearDisplay(pDocId));
    }
  }
  (quarterlyRecords || []).forEach((qRec) => {
    if (!qRec.winnerId || map.has(qRec.winnerId)) return;
    const qEndDate = new Date(qRec.year, qRec.quarter * 3, 0);
    const diffDays = (targetDate - qEndDate) / (1000 * 60 * 60 * 24);
    if (diffDays > 0 && diffDays <= 365) {
      map.set(qRec.winnerId, `Q${qRec.quarter} ${qRec.year}`);
    }
  });
  return map;
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
  setHistoryMember,
  checkins = [],
  toggleDisqualify
}) {
  const now = new Date();
  const currentMonthDocId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const minCheckins = appSettings?.minCheckins || 15;

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

  function daysByEmailForMonth(prefix) {
    const map = {};
    (checkins || []).forEach((c) => {
      if (!c.classDate || !c.classDate.startsWith(prefix)) return;
      if (isCoachMeeting(c.className)) return;
      const email = (c.email || '').toLowerCase();
      if (!email) return;
      if (!map[email]) map[email] = new Set();
      map[email].add(c.classDate);
    });
    return map;
  }

  function hasLiveCheckins(prefix) {
    return (checkins || []).some((c) => c.classDate && c.classDate.startsWith(prefix));
  }

  function liveMonthMembers(docId) {
    const days = daysByEmailForMonth(docId);
    const byEmail = {};
    (masterMembers || []).forEach((m) => {
      const email = (m.email || '').toLowerCase();
      if (email) byEmail[email] = m;
    });
    const list = [];
    Object.entries(days).forEach(([email, set]) => {
      if (set.size < minCheckins) return;
      const m = byEmail[email];
      if (m) list.push({ ...m, days: set.size, email });
      else list.push({ id: email, name: email, email, days: set.size });
    });
    return list;
  }

  function qualifierIdsForMonth(docId) {
    if (hasLiveCheckins(docId)) return new Set(liveMonthMembers(docId).map((m) => m.id));
    return new Set(monthRec(docId)?.qualifierIds || []);
  }

  function monthQualifiedCount(docId) {
    return qualifierIdsForMonth(docId).size;
  }

  const monthOptions = Array.from(
    new Set([
      ...(monthlyRecords || []).map((r) => r.id),
      ...Array.from(new Set((checkins || []).map((c) => (c.classDate || '').slice(0, 7)).filter((id) => /^\d{4}-\d{2}$/.test(id)))),
    ])
  ).sort((a, b) => b.localeCompare(a));

  function quarterMonthIds(year, qNum) {
    const start = (qNum - 1) * 3 + 1;
    return [0, 1, 2].map((i) => `${year}-${String(start + i).padStart(2, '0')}`);
  }

  function membersForQuarter(year, qNum) {
    const ids = quarterMonthIds(year, qNum);
    const sets = ids.map(qualifierIdsForMonth);
    if (sets.some((s) => s.size === 0) && ids.some((id) => !hasLiveCheckins(id) && !monthRec(id))) return [];
    return masterMembers.filter((m) => sets.every((s) => s.has(m.id)));
  }

  function membersUnbroken(year) {
    const recs = monthOptions.filter((id) => id.startsWith(`${year}-`) && (id < currentMonthDocId || id === currentMonthDocId));
    if (!recs.length) return [];
    const completed = recs.filter((id) => id < currentMonthDocId);
    const use = completed.length ? completed : recs;
    return masterMembers.filter((m) => use.every((id) => qualifierIdsForMonth(id).has(m.id)));
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="bg-gray-800 p-3 sm:p-6 rounded-xl border border-gray-700 shadow-md">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 pb-4 border-b border-gray-700">
          <div>
           <h2 className="text-base sm:text-xl font-bold text-amber-400">History</h2>
<p className="text-gray-400 text-[11px] sm:text-xs">
  Past monthly, quarterly, and unbroken lists. Uncheck someone to disqualify them from the wheel. Last-12-month winners are auto-DQ’d.
</p>
          </div>
          <div className="flex bg-gray-900 p-1 rounded-xl border border-gray-700 gap-1 w-full sm:w-auto">
            {['monthly', 'quarterly', 'unbroken'].map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => { setListSubTab(sub); setClubListSelectedId(''); }}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold ${
                  listSubTab === sub ? 'bg-amber-500 text-gray-900' : 'text-gray-300'
                }`}
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
              {listSubTab === 'monthly' && monthOptions.map((id) => (
                <option key={id} value={`M:${id}`}>{formatMonthYearDisplay(id)} ({monthQualifiedCount(id)} qualified)</option>
              ))}
              {listSubTab === 'quarterly' && years.flatMap((yr) =>
                [4, 3, 2, 1].map((qNum) => (
                  <option key={`${yr}-Q${qNum}`} value={`Q:${yr}-Q${qNum}`}>{`Q${qNum} ${yr}`}</option>
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
                <th className="p-2 sm:p-3 w-10 text-center">In</th>
                <th className="p-2 sm:p-3 w-10 text-center">#</th>
                <th className="p-2 sm:p-3">Athlete Name</th>
                <th className="p-2 sm:p-3 text-center">Days</th>
                <th className="p-2 sm:p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {(() => {
                let list = [];
                let showDays = false;
                let monthDocId = '';
                if (!clubListSelectedId) {
                  return <tr><td colSpan="5" className="p-6 text-center text-gray-500">Select a list above to view members.</td></tr>;
                }

                let winnerId = '';
                let winnerName = '';
                let dqSet = new Set();
                let autoDq = new Map();

                if (clubListSelectedId.startsWith('M:')) {
                  monthDocId = clubListSelectedId.replace('M:', '');
                  const rec = monthRec(monthDocId);
                  dqSet = new Set(rec?.unqualifiedIds || []);
                  autoDq = pastWinnersForMonth(monthlyRecords, quarterlyRecords, monthDocId);
                  if (hasLiveCheckins(monthDocId)) {
                    list = liveMonthMembers(monthDocId);
                    showDays = true;
                  } else if (rec) {
                    const qSet = new Set(rec.qualifierIds || []);
                    list = masterMembers.filter((m) => qSet.has(m.id));
                  }
                  if (rec) {
                    winnerId = rec.winnerId || rec.winner || '';
                    winnerName = rec.winnerName || '';
                  }
                } else if (clubListSelectedId.startsWith('Q:')) {
                  const key = clubListSelectedId.replace('Q:', '');
                  const rec = (quarterlyRecords || []).find((r) => r.id === key || r.id === clubListSelectedId);
                  const [yrStr, qStr] = key.split('-');
                  const yr = parseInt(yrStr, 10);
                  const qNum = parseInt(String(qStr).replace('Q', ''), 10);
                  if (yr && qNum) list = membersForQuarter(yr, qNum);
                  if (rec) {
                    winnerId = rec.winnerId || rec.winner || '';
                    winnerName = rec.winnerName || '';
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
                  list = list.filter((m) => (m.name || '').toLowerCase().includes(clubListSearch.toLowerCase()));
                }

                list.sort((a, b) => {
                  if (winnerId && a.id === winnerId) return -1;
                  if (winnerId && b.id === winnerId) return 1;
                  if (showDays && (b.days || 0) !== (a.days || 0)) return (b.days || 0) - (a.days || 0);
                  return (a.name || '').localeCompare(b.name || '');
                });

                if (!list.length) {
                  return <tr><td colSpan="5" className="p-6 text-center text-gray-500">No members found for this selection.</td></tr>;
                }

                return list.map((m, idx) => {
                  const isWinner = winnerId && m.id === winnerId;
                  const wonWhen = autoDq.get(m.id);
                  const manualDq = dqSet.has(m.id);
                  const inDraw = !m.isCoach && !wonWhen && !manualDq;
                  return (
                    <tr key={m.id || m.email || idx} className={isWinner ? 'bg-amber-500/10' : 'hover:bg-gray-800/50'}>
                      <td className="p-2 sm:p-3 text-center">
                        {monthDocId && !m.isCoach && !wonWhen ? (
                          <input
                            type="checkbox"
                            checked={inDraw}
                            onChange={(e) => toggleDisqualify && toggleDisqualify(monthDocId, m.id, !e.target.checked)}
                            className="accent-amber-500 cursor-pointer"
                            title={inDraw ? 'In the wheel' : 'Disqualified'}
                          />
                        ) : (
                          <input type="checkbox" checked={false} disabled className="opacity-40" />
                        )}
                      </td>
                      <td className="p-2 sm:p-3 text-center font-mono text-gray-400 font-bold">{idx + 1}</td>
                      <td className="p-2 sm:p-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="cursor-pointer hover:underline text-amber-400 font-bold" onClick={() => setHistoryMember(m)}>{m.name}</span>
                          {isWinner && <span className="bg-amber-500 text-gray-900 text-[9px] px-1.5 py-0.5 rounded font-black">🏆 WINNER</span>}
                          {m.isCoach && <span className="bg-purple-900/60 text-purple-300 border border-purple-700/50 text-[9px] px-1.5 py-0.5 rounded font-bold">COACH</span>}
                        </div>
                      </td>
                      <td className="p-2 sm:p-3 text-center font-black text-white">{showDays ? m.days : '—'}</td>
                      <td className="p-2 sm:p-3 text-center">
                        {m.isCoach ? (
                          <span className="bg-purple-900/60 text-purple-300 border border-purple-700/50 px-2.5 py-1 rounded-full text-[10px] font-bold">Coach</span>
                        ) : wonWhen ? (
                          <span className="bg-red-900/60 text-red-300 border border-red-700/50 px-2.5 py-1 rounded-full text-[10px] font-bold">Auto DQ · {wonWhen}</span>
                        ) : manualDq ? (
                          <span className="bg-red-900/60 text-red-300 border border-red-700/50 px-2.5 py-1 rounded-full text-[10px] font-bold">Disqualified</span>
                        ) : (
                          <span className="bg-green-900/60 text-green-300 border border-green-700/50 px-2.5 py-1 rounded-full text-[10px] font-bold">✓ In draw</span>
                        )}
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