import React, { useState } from 'react';
import { db, doc, setDoc, deleteDoc, serverTimestamp } from '../firebase';

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CurrentMonth({ checkins, appSettings }) {
  const [search, setSearch] = useState('');
  const [calendarMember, setCalendarMember] = useState(null);
  const [dayAction, setDayAction] = useState(null); // { dateStr, isChecked, className, classTime }
  const [formClassName, setFormClassName] = useState('CrossFit');
  const [formClassTime, setFormClassTime] = useState('');
  const [saving, setSaving] = useState(false);

  const minCheckins = appSettings?.minCheckins || 15;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const currentPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

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
      time: c.classTime || '',
      docId: c.id
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

  function openDay(dateStr, isChecked, classInfo) {
    setDayAction({
      dateStr,
      isChecked,
      className: classInfo?.name || 'CrossFit',
      classTime: classInfo?.time || '',
      docId: classInfo?.docId || null
    });
    setFormClassName(classInfo?.name || 'CrossFit');
    setFormClassTime(classInfo?.time || '');
  }

  async function handleAddOrEdit() {
    if (!calendarMember || !dayAction) return;
    setSaving(true);
    try {
      const email = calendarMember.email.toLowerCase();
      const docId = `${email}_${dayAction.dateStr}`;
      await setDoc(doc(db, 'checkins', docId), {
        email,
        firstName: calendarMember.firstName || '',
        lastName: calendarMember.lastName || '',
        classDate: dayAction.dateStr,
        className: formClassName || 'CrossFit',
        classTime: formClassTime || '',
        recordedAt: serverTimestamp(),
        source: 'manual'
      }, { merge: true });
      setDayAction(null);
      // calendarMember will refresh via live listener; update local set for snappy UI
      setCalendarMember(prev => {
        if (!prev) return prev;
        const newDates = new Set(prev.dates);
        newDates.add(dayAction.dateStr);
        const classes = (prev.classes || []).filter(c => c.date !== dayAction.dateStr);
        classes.push({
          date: dayAction.dateStr,
          name: formClassName || 'CrossFit',
          time: formClassTime || '',
          docId
        });
        return { ...prev, dates: newDates, days: newDates.size, classes, sortedDates: Array.from(newDates).sort() };
      });
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!calendarMember || !dayAction) return;
    if (!confirm(`Delete check-in for ${dayAction.dateStr}?`)) return;
    setSaving(true);
    try {
      const email = calendarMember.email.toLowerCase();
      const docId = dayAction.docId || `${email}_${dayAction.dateStr}`;
      await deleteDoc(doc(db, 'checkins', docId));
      setDayAction(null);
      setCalendarMember(prev => {
        if (!prev) return prev;
        const newDates = new Set(prev.dates);
        newDates.delete(dayAction.dateStr);
        const classes = (prev.classes || []).filter(c => c.date !== dayAction.dateStr);
        return { ...prev, dates: newDates, days: newDates.size, classes, sortedDates: Array.from(newDates).sort() };
      });
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="bg-gray-800 p-3 sm:p-6 rounded-xl border border-gray-700 shadow-md">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-amber-400">Current Month (New System)</h2>
            <p className="text-gray-400 text-[11px] sm:text-xs">
              Accurate dated check-ins. Open calendar → click a day to add, edit, or delete.
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

        {/* Mobile card list */}
        <div className="sm:hidden space-y-2">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">No dated check-ins recorded for this month yet.</div>
          ) : (
            rows.map((m, idx) => {
              const isQual = m.days >= minCheckins;
              const pct = Math.min(100, Math.round((m.days / minCheckins) * 100));
              const left = minCheckins - m.days;
              return (
                <div key={m.email} className="bg-gray-900/60 border border-gray-700 rounded-xl p-3 flex items-center gap-3">
                  <div className="text-gray-500 font-mono text-xs w-5 shrink-0">{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white text-sm truncate">{m.name}</div>
                    <div className="text-[10px] text-gray-500 truncate">{m.email}</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="font-black text-amber-400 text-sm">{m.days}</span>
                      <div className="flex-1 max-w-[80px] bg-gray-700 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-amber-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                      </div>
                      {isQual
                        ? <span className="bg-green-900/60 text-green-300 border border-green-700/50 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap">✓ Qual</span>
                        : <span className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap">{left} left</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => setCalendarMember(m)}
                    className="shrink-0 bg-gray-700 hover:bg-amber-600 text-white text-[10px] font-semibold px-2.5 py-2 rounded-lg"
                  >
                    Calendar
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs font-bold border-b border-gray-700">
              <tr>
                <th className="p-3 w-10 text-center">#</th>
                <th className="p-3">Athlete</th>
                <th className="p-3 text-center">Days This Month</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Calendar</th>
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
                      <td className="p-3 text-center font-mono text-gray-400 font-bold">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-semibold text-white">{m.name}</div>
                        <div className="text-[10px] text-gray-500">{m.email}</div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="font-black text-amber-400 text-base">{m.days}</div>
                        <div className="w-24 bg-gray-700 h-1.5 rounded-full mx-auto mt-1 overflow-hidden">
                          <div className="bg-amber-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {isQual
                          ? <span className="bg-green-900/60 text-green-300 border border-green-700/50 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap">✓ Qualified</span>
                          : <span className="bg-gray-700/60 text-gray-300 border border-gray-600 px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap">{minCheckins - m.days} left</span>}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setCalendarMember(m)}
                          className="bg-gray-700 hover:bg-amber-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition"
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

      {/* Calendar Popup */}
      {calendarMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => { setCalendarMember(null); setDayAction(null); }}>
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
                onClick={() => { setCalendarMember(null); setDayAction(null); }}
                className="text-gray-400 hover:text-white text-xl font-bold leading-none px-2"
              >
                ×
              </button>
            </div>

            <div className="p-4">
              {(() => {
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
                    : 'Click to add check-in';

                  cells.push(
                    <button
                      key={day}
                      type="button"
                      title={title}
                      onClick={() => openDay(dateStr, isChecked, classes[0])}
                      className={`h-10 flex items-center justify-center rounded-lg text-sm font-semibold transition cursor-pointer
                        ${isChecked
                          ? 'bg-amber-500 text-gray-900 shadow hover:bg-amber-400'
                          : 'bg-gray-900/60 text-gray-500 hover:bg-gray-700 hover:text-white'}`}
                    >
                      {day}
                    </button>
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
                        <span>Checked in (click to edit/delete)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 rounded bg-gray-900/60 border border-gray-700" />
                        <span>Empty (click to add)</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Day action panel */}
            {dayAction && (
              <div className="border-t border-gray-700 p-4 bg-gray-900/50 space-y-3">
                <div className="text-sm font-bold text-white">
                  {dayAction.dateStr}
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {dayAction.isChecked ? 'Edit / Delete check-in' : 'Add check-in'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Class Name</label>
                    <input
                      type="text"
                      value={formClassName}
                      onChange={(e) => setFormClassName(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-white"
                      placeholder="CrossFit"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Class Time</label>
                    <input
                      type="text"
                      value={formClassTime}
                      onChange={(e) => setFormClassTime(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-white"
                      placeholder="5:00"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddOrEdit}
                    disabled={saving}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-2 rounded-lg text-xs uppercase disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : (dayAction.isChecked ? 'Save Changes' : 'Add Check-In')}
                  </button>
                  {dayAction.isChecked && (
                    <button
                      onClick={handleDelete}
                      disabled={saving}
                      className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg text-xs uppercase disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    onClick={() => setDayAction(null)}
                    className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
