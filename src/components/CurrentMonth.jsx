import React, { useState } from 'react';

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CurrentMonth({ checkins, appSettings }) {
  const [search, setSearch] = useState('');
  const [calendarMember, setCalendarMember] = useState(null);

  const minCheckins = appSettings?.minCheckins || 15;
  const now = new Date();
  const currentPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Group checkins by email for current month
  const byEmail = {};
  (checkins || []).forEach(c => {
    if (!c.classDate || !c.classDate.startsWith(currentPrefix)) return;
    const email = (c.email || '').toLowerCase();
    if (!email) return;
    if (!byEmail[email]) {
      byEmail[email] = {
        email,
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || email,
        dates: new Set(),
        classes: []
      };
    }
    byEmail[email].dates.add(c.classDate);
    byEmail[email].classes.push({
      date: c.classDate,
      name: c.className || '',
      time: c.classTime || ''
    });
  });

  let rows = Object.values(byEmail).map(m => ({
    ...m,
    days: m.dates.size,
    sortedDates: Array.from(m.dates).sort()
  }));

  const q = (search || '').toLowerCase().trim();
  if (q) {
    rows = rows.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    );
  }

  rows.sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="bg-gray-800 p-3 sm:p-6 rounded-xl border border-gray-700 shadow-md">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-amber-400">Current Month (New System)</h2>
            <p className="text-gray-400 text-[11px] sm:text-xs">
              Accurate dated check-ins from Zapier. Click an athlete to see their calendar.
            </p>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search athlete or email..."
            className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 w-full sm:w-56"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-gray-300">
            <thead className="bg-gray-900 text-gray-400 uppercase text-[10px] sm:text-xs font-bold border-b border-gray-700">
              <tr>
                <th className="p-2 sm:p-3 w-10 text-center">#</th>
                <th className="p-2 sm:p-3">Athlete</th>
                <th className="p-2 sm:p-3 text-center">Days This Month</th>
                <th className="p-2 sm:p-3 text-center">Status</th>
                <th className="p-2 sm:p-3 text-right">Calendar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-6 text-center text-gray-500">
                    No dated check-ins recorded for this month yet.
                  </td>
                </tr>
              ) : (
                rows.map((m, idx) => {
                  const isQual = m.days >= minCheckins;
                  const pct = Math.min(100, Math.round((m.days / minCheckins) * 100));
                  return (
                    <tr key={m.email} className="hover:bg-gray-800/50">
                      <td className="p-2 sm:p-3 text-center font-mono text-gray-400 font-bold">{idx + 1}</td>
                      <td className="p-2 sm:p-3">
                        <div className="font-semibold text-white">{m.name}</div>
                        <div className="text-[10px] text-gray-500">{m.email}</div>
                      </td>
                      <td className="p-2 sm:p-3 text-center">
                        <div className="font-black text-amber-400 text-base">{m.days}</div>
                        <div className="w-24 bg-gray-700 h-1.5 rounded-full mx-auto mt-1 overflow-hidden">
                          <div className="bg-amber-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                      </td>
                      <td className="p-2 sm:p-3 text-center">
                        {isQual
                          ? <span className="bg-green-900/60 text-green-300 border border-green-700/50 px-2.5 py-1 rounded-full text-[10px] font-bold">✓ Qualified</span>
                          : <span className="bg-gray-700/60 text-gray-300 border border-gray-600 px-2.5 py-1 rounded-full text-[10px] font-medium">{minCheckins - m.days} left</span>}
                      </td>
                      <td className="p-2 sm:p-3 text-right">
                        <button
                          onClick={() => setCalendarMember(m)}
                          className="bg-gray-700 hover:bg-amber-600 text-white text-[10px] sm:text-xs font-semibold px-2.5 py-1.5 rounded-lg transition"
                        >
                          View Calendar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Calendar Popup Modal */}
      {calendarMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setCalendarMember(null)}>
          <div
            className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <div>
                <h3 className="text-lg font-bold text-amber-400">{calendarMember.name}</h3>
                <p className="text-xs text-gray-400">
                  {calendarMember.email} · {calendarMember.days} day{calendarMember.days !== 1 ? 's' : ''} this month
                </p>
              </div>
              <button
                onClick={() => setCalendarMember(null)}
                className="text-gray-400 hover:text-white text-xl font-bold leading-none px-2"
              >
                ×
              </button>
            </div>

            <div className="p-4">
              {(() => {
                const year = now.getFullYear();
                const month = now.getMonth();
                const firstDay = new Date(year, month, 1);
                const lastDay = new Date(year, month + 1, 0);
                const startWeekday = firstDay.getDay();
                const daysInMonth = lastDay.getDate();

                const checkedSet = calendarMember.dates instanceof Set
                  ? calendarMember.dates
                  : new Set(calendarMember.sortedDates || []);

                const classMap = {};
                (calendarMember.classes || []).forEach(c => {
                  if (!classMap[c.date]) classMap[c.date] = [];
                  classMap[c.date].push(c);
                });

                const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const cells = [];

                for (let i = 0; i < startWeekday; i++) {
                  cells.push(<div key={`empty-${i}`} className="h-10" />);
                }

                for (let day = 1; day <= daysInMonth; day++) {
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isChecked = checkedSet.has(dateStr);
                  const classes = classMap[dateStr] || [];
                  const title = classes.length
                    ? classes.map(c => `${c.name}${c.time ? ' @ ' + c.time : ''}`).join(', ')
                    : '';

                  cells.push(
                    <div
                      key={day}
                      title={title}
                      className={`h-10 flex items-center justify-center rounded-lg text-sm font-semibold transition
                        ${isChecked
                          ? 'bg-amber-500 text-gray-900 shadow'
                          : 'bg-gray-900/60 text-gray-500'}`}
                    >
                      {day}
                    </div>
                  );
                }

                return (
                  <>
                    <div className="text-center text-sm font-bold text-white mb-3">
                      {monthNames[month + 1]} {year}
                    </div>
                    <div className="grid grid-cols-7 gap-1 mb-1">
                      {weekDays.map(d => (
                        <div key={d} className="text-center text-[10px] font-bold text-gray-500 uppercase">
                          {d}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {cells}
                    </div>
                    <div className="mt-4 flex items-center gap-3 text-xs text-gray-400">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 rounded bg-amber-500" />
                        <span>Checked in</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 rounded bg-gray-900/60 border border-gray-700" />
                        <span>No check-in</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}