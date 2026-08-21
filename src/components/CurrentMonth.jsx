import React, { useState } from 'react';

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function isCoachMeeting(className) {
  return (className || "").toLowerCase().includes("coach meeting");
}

function formatClassTime(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  const ampm = s.match(/\s*(am|pm)$/i);
  const core = s.replace(/\s*(am|pm)$/i, "").trim();
  const parts = core.split(":");
  let h = parseInt(parts[0], 10);
  let min = parseInt(parts[1] || "0", 10);
  if (isNaN(h)) return s;
  if (isNaN(min)) min = 0;
  if (ampm) {
    const ap = ampm[1].toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  }
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(min).padStart(2, "0")} ${suffix}`;
}

function sortClasses(list) {
  return [...(list || [])].sort((a, b) =>
    String(a.time || "").localeCompare(String(b.time || "")) ||
    String(a.name || "").localeCompare(String(b.name || ""))
  );
}

function withCountFlags(list) {
  const sorted = sortClasses(list);
  let countedUsed = false;
  return sorted.map((c) => {
    if (c.isCoachMeeting) {
      return { ...c, counts: false, reason: "doesn’t count" };
    }
    if (!countedUsed) {
      countedUsed = true;
      return { ...c, counts: true, reason: "" };
    }
    return { ...c, counts: false, reason: "2nd class — not counted" };
  });
}

export default function CurrentMonth({ checkins, appSettings, masterMembers = [], setHistoryMember, checkinsApi, onCheckinsChanged }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
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
    if (!isCoachMeeting(c.className)) {
      byEmail[email].dates.add(c.classDate);
    }
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

  function openDay(dateStr, classes) {
    setDayAction({
      dateStr,
      classes: withCountFlags(classes),
      editingId: null,
      adding: false
    });
    setFormClassName('CrossFit');
    setFormClassTime('');
  }

  function startEdit(cls) {
    setDayAction(prev => prev ? { ...prev, editingId: cls.docId, adding: false } : prev);
    setFormClassName(cls.name || 'CrossFit');
    setFormClassTime(cls.time || '');
  }

  function startAdd() {
    setDayAction(prev => prev ? { ...prev, editingId: null, adding: true } : prev);
    setFormClassName('CrossFit');
    setFormClassTime('');
  }

  function cancelForm() {
    setDayAction(prev => prev ? { ...prev, editingId: null, adding: false } : prev);
    setFormClassName('CrossFit');
    setFormClassTime('');
  }

  async function handleAddOrEdit() {
    if (!selected || !dayAction || !checkinsApi) return;
    setSaving(true);
    try {
      const email = selected.email.toLowerCase();
      const editingId = dayAction.adding ? undefined : (dayAction.editingId || undefined);
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
          id: editingId,
          source: 'manual'
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const savedId = editingId || `${email}_${dayAction.dateStr}_${formClassTime || Date.now()}`;
      if (onCheckinsChanged) await onCheckinsChanged();
      const counts = !isCoachMeeting(formClassName);
      setSelected(prev => {
        if (!prev) return prev;
        const newDates = new Set(prev.dates);
        if (counts) newDates.add(dayAction.dateStr);
        const classes = (prev.classes || []).filter(c => c.docId !== savedId);
        classes.push({
          date: dayAction.dateStr,
          name: formClassName || 'CrossFit',
          time: formClassTime || '',
          docId: savedId,
          isCoachMeeting: !counts
        });
        const stillHasCounted = classes.some(c => c.date === dayAction.dateStr && !c.isCoachMeeting);
        if (!stillHasCounted) newDates.delete(dayAction.dateStr);
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
      const nextClasses = (selected.classes || []).filter(c => c.docId !== savedId);
      nextClasses.push({
        date: dayAction.dateStr,
        name: formClassName || 'CrossFit',
        time: formClassTime || '',
        docId: savedId,
        isCoachMeeting: isCoachMeeting(formClassName)
      });
      openDay(dayAction.dateStr, nextClasses.filter(c => c.date === dayAction.dateStr));
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(docId) {
    if (!selected || !dayAction || !checkinsApi) return;
    const targetId = docId || `${selected.email.toLowerCase()}_${dayAction.dateStr}`;
    if (!confirm(`Delete this check-in for ${dayAction.dateStr}?`)) return;
    setSaving(true);
    try {
      const email = selected.email.toLowerCase();
      const res = await fetch(`${checkinsApi}/deleteCheckin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: targetId, email, classDate: dayAction.dateStr })
      });
      if (!res.ok) throw new Error(await res.text());
      if (onCheckinsChanged) await onCheckinsChanged();
      const remaining = (selected.classes || []).filter(c => c.docId !== targetId);
      setSelected(prev => {
        if (!prev) return prev;
        const classes = (prev.classes || []).filter(c => c.docId !== targetId);
        const remainingThatDay = classes.filter(c => c.date === dayAction.dateStr);
        const newDates = new Set(prev.dates);
        if (!remainingThatDay.some(c => !c.isCoachMeeting)) newDates.delete(dayAction.dateStr);
        const sortedDates = Array.from(newDates).sort();
        const lastDate = sortedDates[sortedDates.length - 1] || null;
        const lastClass = classes.filter(c => c.date === lastDate && !c.isCoachMeeting).pop()
          || classes.filter(c => c.date === lastDate).pop();
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
      const remainingThatDay = remaining.filter(c => c.date === dayAction.dateStr);
      if (remainingThatDay.length) {
        openDay(dayAction.dateStr, remainingThatDay);
      } else {
        setDayAction(null);
      }
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

  const showForm = !!(dayAction && (dayAction.adding || dayAction.editingId));

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
            placeholder="Search athlete..."
            className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 w-full sm:w-56"
          />
        </div>

        <div className="sm:hidden space-y-1">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">No dated check-ins recorded for this month yet.</div>
          ) : (
            rows.map((m, idx) => (
              <button
                key={m.email}
                type="button"
                onClick={() => openAthlete(m)}
                className="w-full text-left bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 flex items-center gap-2 hover:border-amber-500/50 transition"
              >
                <div className="text-gray-500 font-mono text-xs w-5 shrink-0">{idx + 1}</div>
                <div className="flex-1 min-w-0 font-semibold text-amber-400 text-sm truncate">{m.name}</div>
                <span className="font-black text-amber-400 text-sm shrink-0">{m.days}</span>
                <StatusBadge days={m.days} />
                <div className="text-gray-500 text-lg shrink-0">›</div>
              </button>
            ))
          )}
        </div>

        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs font-bold border-b border-gray-700">
              <tr>
                <th className="p-2 w-10 text-center">#</th>
                <th className="p-2">Athlete</th>
                <th className="p-2 text-center">Days</th>
                <th className="p-2 text-center">Status</th>
                <th className="p-2">Last Check-In</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-6 text-center text-gray-500">No dated check-ins recorded for this month yet.</td>
                </tr>
              ) : (
                rows.map((m, idx) => (
                  <tr
                    key={m.email}
                    onClick={() => openAthlete(m)}
                    className="hover:bg-gray-800/80 cursor-pointer transition"
                  >
                    <td className="p-2 text-center font-mono text-gray-400 font-bold">{idx + 1}</td>
                    <td className="p-2">
                      <div className="font-semibold text-amber-400 truncate">{m.name}</div>
                    </td>
                    <td className="p-2 text-center font-black text-amber-400">{m.days}</td>
                    <td className="p-2 text-center">
                      <StatusBadge days={m.days} />
                    </td>
                    <td className="p-2 text-xs text-gray-400 whitespace-nowrap">
                      {m.lastDate ? (
                        <span>{m.lastDate}{m.lastClassName ? ` · ${m.lastClassName}` : ''}{m.lastClassTime ? ` @ ${m.lastClassTime}` : ''}</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70"
          onClick={() => { setSelected(null); setDayAction(null); }}
        >
          <div
            className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-4 border-b border-gray-700">
              <div className="min-w-0 pr-2">
                <h3 className="text-lg font-bold text-amber-400 truncate">{selected.name}</h3>
              </div>
              <button
                onClick={() => { setSelected(null); setDayAction(null); }}
                className="text-gray-400 hover:text-white text-xl font-bold leading-none px-2 shrink-0"
              >
                ×
              </button>
            </div>

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

            <div className="p-4">
              {(() => {
                const firstDay = new Date(year, month, 1);
                const lastDay = new Date(year, month + 1, 0);
                const startWeekday = firstDay.getDay();
                const daysInMonth = lastDay.getDate();
                const countedSet = selected.dates instanceof Set
                  ? selected.dates
                  : new Set(selected.sortedDates || []);
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
                  const classes = withCountFlags(classMap[dateStr] || []);
                  const hasCheckin = classes.length > 0;
                  const isCounted = countedSet.has(dateStr);
                  const extra = classes.length > 1 ? classes.length : 0;
                  const label = hasCheckin
                    ? classes.map(c => `${c.name}${c.time ? ' @ ' + formatClassTime(c.time) : ''}${c.reason ? ` (${c.reason})` : ''}`).join(', ')
                    : 'Add check-in';
                  cells.push(
                    <button
                      key={day}
                      type="button"
                      title={label}
                      onClick={() => openDay(dateStr, classMap[dateStr] || [])}
                      className={`relative h-9 flex items-center justify-center rounded-lg text-sm font-semibold transition cursor-pointer
                        ${isCounted
                          ? 'bg-amber-500 text-gray-900 shadow hover:bg-amber-400'
                          : hasCheckin
                            ? 'bg-slate-600 text-white border border-slate-400 hover:bg-slate-500'
                            : 'bg-gray-900/60 text-gray-500 hover:bg-gray-700 hover:text-white'}`}
                    >
                      {day}
                      {extra > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-gray-900 text-amber-300 text-[9px] leading-[14px]">
                          {classes.length}
                        </span>
                      )}
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
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500 inline-block" /> Counts</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-600 border border-slate-400 inline-block" /> Happened, doesn’t count</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-900 border border-gray-600 inline-block" /> Tap empty to add</span>
                    </div>
                  </>
                );
              })()}
            </div>

            {dayAction && (
              <div className="border-t border-gray-700 p-4 bg-gray-900/50 space-y-3">
                <div className="text-sm font-bold text-white">
                  {dayAction.dateStr}
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {dayAction.classes?.length ? `${dayAction.classes.length} class${dayAction.classes.length === 1 ? '' : 'es'}` : 'No classes yet'}
                  </span>
                </div>

                {dayAction.classes?.length > 0 && (
                  <div className="space-y-1.5">
                    {dayAction.classes.map((cls) => (
                      <div
                        key={cls.docId || `${cls.name}-${cls.time}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white font-semibold truncate">
                            {cls.name || 'Class'}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {cls.time ? formatClassTime(cls.time) : 'No time'}
                            {cls.reason && (
                              <span className="ml-2 text-slate-300">{cls.reason}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEdit(cls)}
                            disabled={saving}
                            className="text-[10px] uppercase font-bold bg-gray-700 hover:bg-gray-600 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(cls.docId)}
                            disabled={saving}
                            className="text-[10px] uppercase font-bold bg-red-700 hover:bg-red-600 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {showForm && (
                  <div className="space-y-3 pt-1">
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
                        {saving ? 'Saving…' : (dayAction.adding ? 'Add' : 'Save')}
                      </button>
                      <button
                        onClick={cancelForm}
                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!showForm && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={startAdd}
                      className="flex-1 bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-2 rounded-lg text-xs uppercase"
                    >
                      Add class
                    </button>
                    <button
                      onClick={() => setDayAction(null)}
                      className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg text-xs"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}