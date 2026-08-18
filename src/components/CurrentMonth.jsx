import React, { useState } from 'react';

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function isCoachMeeting(className) {
  return (className || "").toLowerCase().includes("coach meeting");
}

function formatClassTime(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2}):(\d{1,2})(\s*[ap]m)?$/i);
  if (!m) return s;
  return `${m[1]}:${String(m[2]).padStart(2, "0")}${m[3] || ""}`;
}

export default function CurrentMonth({ checkins, appSettings, masterMembers = [], setHistoryMember, checkinsApi, onCheckinsChanged }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); // athlete row
  const [dayAction, setDayAction] = useState(null);
  const [formClassName, setFormClassName] = useState('CrossFit');
  const [formClassTime, setFormClassTime] = useState('');
  const [saving, setSaving] = useState(false);

  const minCheckins = appSettings?.minCheckins || 15;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const currentPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

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
        classes: [],
        totalAttendanceCount: c.totalAttendanceCount || null
      };
    }
    byEmail[email].classes.push({
      date: c.classDate,
      name: c.className || '',
      time: c.classTime || '',
      docId: c.id,
      totalAttendanceCount: c.totalAttendanceCount,
      isCoachMeeting: isCoachMeeting(c.className)
    });
    // Days only count if they did a real class (not coach-meeting-only)
    if (!isCoachMeeting(c.className)) {
      byEmail[email].dates.add(c.classDate);
    }
    // keep latest CHIP total
    if (c.totalAttendanceCount != null) {
      byEmail[email].totalAttendanceCount = c.totalAttendanceCount;
    }
  });

  let rows = Object.values(byEmail).map(m => {
    const sortedDates = Array.from(m.dates).sort();
    const lastDate = sortedDates[sortedDates.length - 1] || null;
    const lastClass = (m.classes || [])
      .filter(c => c.date === lastDate && !c.isCoachMeeting)
      .pop() || (m.classes || []).filter(c => c.date === lastDate).pop() || null;
    return {
      ...m,
      days: m.dates.size,
      sortedDates,
      lastDate,
      lastClassName: lastClass?.name || '',
      lastClassTime: formatClassTime(lastClass?.time || '')
    };
  });

  const q = (search || '').toLowerCase().trim();
  if (q) {
    rows = rows.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    );
  }
  rows.sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));

  function openAthlete(row) {
    setSelected(row);
    setDayAction(null);
  }

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
    if (!selected || !dayAction || !checkinsApi) return;
    setSaving(true);
    try {
      const email = selected.email.toLowerCase();
      const res = await fetch(`${checkinsApi}/upsertCheckin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          firstName: selected.firstName || '',
          lastName: selected.lastName || '',
          classDate: dayAction.dateStr,
          className: formClassName || 'CrossFit',
          classTime: formClassTime || '',
          source: 'manual'
        })
      });
      if (!res.ok) throw new Error(await res.text());
      setDayAction(null);
      if (onCheckinsChanged) await onCheckinsChanged();
      // optimistic local update
      setSelected(prev => {
        if (!prev) return prev;
        const newDates = new Set(prev.dates);
        newDates.add(dayAction.dateStr);
        const classes = (prev.classes || []).filter(c => c.date !== dayAction.dateStr);
        classes.push({
          date: dayAction.dateStr,
          name: formClassName || 'CrossFit',
          time: formClassTime || '',
          docId: `${email}_${dayAction.dateStr}`
        });
        const sortedDates = Array.from(newDates).sort();
        return {
          ...prev,
          dates: newDates,
          days: newDates.size,
          classes,
          sortedDates,
          lastDate: sortedDates[sortedDates.length - 1],
          lastClassName: formClassName || 'CrossFit',
          lastClassTime: formClassTime || ''
        };
      });
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selected || !dayAction || !checkinsApi) return;
    if (!confirm(`Delete check-in for ${dayAction.dateStr}?`)) return;
    setSaving(true);
    try {
      const email = selected.email.toLowerCase();
      const docId = dayAction.docId || `${email}_${dayAction.dateStr}`;
      const res = await fetch(`${checkinsApi}/deleteCheckin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docId, email, classDate: dayAction.dateStr })
      });
      if (!res.ok) throw new Error(await res.text());
      setDayAction(null);
      if (onCheckinsChanged) await onCheckinsChanged();
      setSelected(prev => {
        if (!prev) return prev;
        const newDates = new Set(prev.dates);
        newDates.delete(dayAction.dateStr);
        const classes = (prev.classes || []).filter(c => c.date !== dayAction.dateStr);
        const sortedDates = Array.from(newDates).sort();
        const lastDate = sortedDates[sortedDates.length - 1] || null;
        const lastClass = classes.filter(c => c.date === lastDate).pop();
        return {
          ...prev,
          dates: newDates,
          days: newDates.size,
          classes,
          sortedDates,
          lastDate,
          lastClassName: lastClass?.name || '',
          lastClassTime: lastClass?.time || ''
        };
      });
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function StatusBadge({ days }) {
    const isQual = days >= minCheckins;
    const left = minCheckins - days;
    if (isQual) {
      return <span className="bg-green-900/60 text-green-300 border border-green-700/50 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap">✓ Qual</span>;
    }
    return <span className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap">{left} left</span>;
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="bg-gray-800 p-3 sm:p-6 rounded-xl border border-gray-700 shadow-md">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-amber-400">Current Month (New System)</h2>
            <p className="text-gray-400 text-[11px] sm:text-xs">
              Tap a row for details, calendar, and edit options.
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

        {/* Mobile cards — whole row clickable */}
        <div className="sm:hidden space-y-2">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">No dated check-ins recorded for this month yet.</div>
          ) : (
            rows.map((m, idx) => {
              const pct = Math.min(100, Math.round((m.days / minCheckins) * 100));
              return (
                <button
                  key={m.email}
                  type="button"
                  onClick={() => openAthlete(m)}
                  className="w-full text-left bg-gray-900/60 border border-gray-700 rounded-xl p-3 flex items-center gap-3 hover:border-amber-500/50 transition"
                >
                  <div className="text-gray-500 font-mono text-xs w-5 shrink-0">{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-amber-400 text-sm truncate">{m.name}</div>
                    <div className="text-[10px] text-gray-500 truncate">{m.email}</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="font-black text-amber-400 text-sm">{m.days}</span>
                      <div className="flex-1 max-w-[80px] bg-gray-700 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-amber-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                      </div>
                      <StatusBadge days={m.days} />
                    </div>
                  </div>
                  <div className="text-gray-500 text-lg shrink-0">›</div>
                </button>
              );
            })
          )}
        </div>

        {/* Desktop table — whole row clickable */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs font-bold border-b border-gray-700">
              <tr>
                <th className="p-3 w-10 text-center">#</th>
                <th className="p-3">Athlete</th>
                <th className="p-3 text-center">Days</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3">Last Check-In</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-6 text-center text-gray-500">No dated check-ins recorded for this month yet.</td>
                </tr>
              ) : (
                rows.map((m, idx) => {
                  const pct = Math.min(100, Math.round((m.days / minCheckins) * 100));
                  return (
                    <tr
                      key={m.email}
                      onClick={() => openAthlete(m)}
                      className="hover:bg-gray-800/80 cursor-pointer transition"
                    >
                      <td className="p-3 text-center font-mono text-gray-400 font-bold">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-semibold text-amber-400">{m.name}</div>
                        <div className="text-[10px] text-gray-500">{m.email}</div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="font-black text-amber-400 text-base">{m.days}</div>
                        <div className="w-24 bg-gray-700 h-1.5 rounded-full mx-auto mt-1 overflow-hidden">
                          <div className="bg-amber-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <StatusBadge days={m.days} />
                      </td>
                      <td className="p-3 text-xs text-gray-400">
                        {m.lastDate ? (
                          <span>{m.lastDate}{m.lastClassName ? ` · ${m.lastClassName}` : ''}{m.lastClassTime ? ` @ ${m.lastClassTime}` : ''}</span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Combined detail + calendar modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70"
          onClick={() => { setSelected(null); setDayAction(null); }}
        >
          <div
            className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b border-gray-700">
              <div className="min-w-0 pr-2">
                <h3 className="text-lg font-bold text-amber-400 truncate">{selected.name}</h3>
                <p className="text-xs text-gray-400 truncate">{selected.email}</p>
              </div>
              <button
                onClick={() => { setSelected(null); setDayAction(null); }}
                className="text-gray-400 hover:text-white text-xl font-bold leading-none px-2 shrink-0"
              >
                ×
              </button>
            </div>

            {/* CHIP / stats summary */}
            <div className="p-4 border-b border-gray-700 bg-gray-900/40">
              <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wide mb-2">Latest from Chalk It Pro</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase text-gray-500 font-bold">Last Check-In Date</div>
                  <div className="text-white font-semibold">{selected.lastDate || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-gray-500 font-bold">Last Class Name</div>
                  <div className="text-white font-semibold">{selected.lastClassName || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-gray-500 font-bold">Last Class Time</div>
                  <div className="text-white font-semibold">{selected.lastClassTime || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-gray-500 font-bold">Total Check-Ins (CHIP)</div>
                  <div className="text-amber-400 font-black text-lg">
                    {selected.totalAttendanceCount != null ? selected.totalAttendanceCount : '—'}
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-700 flex justify-between text-xs text-gray-400">
                <span>Days this month (app)</span>
                <span className="text-amber-400 font-bold">{selected.days} / {minCheckins}</span>
              </div>
            </div>

            {/* Calendar */}
            <div className="p-4">
              {(() => {
                const firstDay = new Date(year, month, 1);
                const lastDay = new Date(year, month + 1, 0);
                const startWeekday = firstDay.getDay();
                const daysInMonth = lastDay.getDate();
                const checkedSet = selected.dates instanceof Set ? selected.dates : new Set(selected.sortedDates || []);
                const classMap = {};
                (selected.classes || []).forEach(c => {
                  if (!classMap[c.date]) classMap[c.date] = [];
                  classMap[c.date].push(c);
                });
                const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const cells = [];
                for (let i = 0; i < startWeekday; i++) {
                  cells.push(<div key={`empty-${i}`} className="h-9" />);
                }
                for (let day = 1; day <= daysInMonth; day++) {
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isChecked = checkedSet.has(dateStr);
                  const classes = classMap[dateStr] || [];
                  cells.push(
                    <button
                      key={day}
                      type="button"
                      title={isChecked ? (classes.map(c => `${c.name}${c.time ? ' @ ' + c.time : ''}`).join(', ') || 'Checked in') : 'Add check-in'}
                      onClick={() => openDay(dateStr, isChecked, classes[0])}
                      className={`h-9 flex items-center justify-center rounded-lg text-sm font-semibold transition cursor-pointer
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
                    <div className="text-center text-sm font-bold text-white mb-2">
                      {monthNames[month + 1]} {year}
                    </div>
                    <div className="grid grid-cols-7 gap-1 mb-1">
                      {weekDays.map(d => (
                        <div key={d} className="text-center text-[10px] font-bold text-gray-500 uppercase">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">{cells}</div>
                    <div className="mt-3 flex items-center gap-3 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500 inline-block" /> Checked in</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-900 border border-gray-600 inline-block" /> Tap empty to add</span>
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
                    {dayAction.isChecked ? 'Edit / Delete' : 'Add check-in'}
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
                    {saving ? 'Saving…' : (dayAction.isChecked ? 'Save' : 'Add')}
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
