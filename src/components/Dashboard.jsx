import React from 'react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function isCoachMeeting(name) {
  return String(name || '').toLowerCase().includes('coach meeting');
}

function formatClassTime(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2}):(\d{1,2})(\s*[ap]m)?$/i);
  if (!m) return s;
  return `${m[1]}:${String(m[2]).padStart(2, '0')}${m[3] || ''}`;
}

function recordedMs(c) {
  const r = c.recordedAt;
  if (!r) return 0;
  if (typeof r.toDate === 'function') return r.toDate().getTime();
  if (r.seconds) return r.seconds * 1000;
  const d = new Date(r);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function timeMinutes(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{1,2})(\s*([ap]m))?$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = (m[4] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

export default function Dashboard({
  checkins = [],
  appSettings,
  activeMembersCount,
  activeStreaksCount,
  unbrokenCount2026,
  setActiveTab
}) {
  const minDays = appSettings?.minCheckins || 15;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthName = MONTHS[month];
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const todayKey = `${prefix}-${String(now.getDate()).padStart(2, '0')}`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const daysLeft = Math.max(0, lastDay - now.getDate());
  const dayNum = now.getDate();

  const byEmail = {};
  const recent = [];

  (checkins || []).forEach((c) => {
    const date = typeof c.classDate === 'string' ? c.classDate : '';
    if (!date || !date.startsWith(prefix)) return;
    const email = (c.email || '').toLowerCase();
    if (!email) return;
    if (!byEmail[email]) {
      byEmail[email] = {
        email,
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || email,
        dates: new Set()
      };
    }
    if (!isCoachMeeting(c.className)) byEmail[email].dates.add(date);
    if (!isCoachMeeting(c.className)) {
      recent.push({
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || email,
        className: c.className || 'Class',
        time: formatClassTime(c.classTime),
        date,
        minutes: timeMinutes(c.classTime),
        ms: recordedMs(c)
      });
    }
  });

  const athletes = Object.values(byEmail).map((a) => {
    const days = a.dates.size;
    const need = Math.max(0, minDays - days);
    const canMakeIt = days + daysLeft >= minDays;
    const qualified = days >= minDays;
    return { ...a, days, need, canMakeIt, qualified };
  });

  const checkedIn = athletes.length;
  const qualified = athletes.filter((a) => a.qualified).length;
  const onPace = athletes.filter((a) => !a.qualified && a.canMakeIt).length;
  const behind = athletes.filter((a) => !a.qualified && !a.canMakeIt).sort((a, b) => a.days - b.days);
  const almost = athletes
    .filter((a) => !a.qualified && a.canMakeIt && a.need <= 5)
    .sort((a, b) => a.need - b.need || b.days - a.days);

  recent.sort((a, b) =>
    String(b.date).localeCompare(String(a.date)) ||
    (b.minutes - a.minutes) ||
    (b.ms - a.ms)
  );
  const todayCount = recent.filter((c) => c.date === todayKey).length;
  const pctMonth = Math.min(100, Math.round((dayNum / lastDay) * 100));

  return (
    <section className="space-y-3">
      <div className="hero-banner rounded-xl border border-amber-500/30 bg-gradient-to-br from-gray-800 to-gray-900 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest font-bold text-amber-500/80">Committed Club</p>
            <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">{monthName} {year}</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Day {dayNum} of {lastDay} · <span className="text-amber-400 font-semibold">{daysLeft} days left</span> · need {minDays} days
            </p>
          </div>
          <button
            onClick={() => setActiveTab && setActiveTab('current')}
            className="shrink-0 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-gray-900 px-3 py-1.5 rounded-lg"
          >
            Current Month →
          </button>
        </div>
        <div className="mt-2.5 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-amber-500" style={{ width: `${pctMonth}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <Kpi value={checkedIn} label="Checked in" color="text-amber-400" />
        <Kpi value={qualified} label="At 15+" color="text-emerald-500" />
        <Kpi value={onPace} label="Can still qualify" color="text-amber-500" />
        <Kpi value={behind.length} label="Can't hit 15" color="text-rose-500" />
        <Kpi value={activeMembersCount} label="Active roster" color="text-amber-400" />
        <Kpi value={activeStreaksCount} label="Active streaks" color="text-amber-400" />
        <Kpi value={unbrokenCount2026} label="2026 unbroken" color="text-amber-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Needs a push" subtitle={`${almost.length} within 5 days of qualifying`}>
          {almost.length === 0 ? (
            <Empty text="Nobody is in the last 5 days right now." />
          ) : (
            <ul>
              {almost.slice(0, 10).map((a) => (
                <li key={a.email} className="flex items-center justify-between gap-2 py-1 border-b border-gray-700/40 last:border-0">
                  <span className="text-sm font-semibold text-gray-100 truncate">{a.name}</span>
                  <span className="text-xs font-bold text-amber-400 whitespace-nowrap">{a.days}/{minDays} · {a.need} to go</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Latest check-ins" subtitle={`${todayCount} today · newest first`}>
          {recent.length === 0 ? (
            <Empty text="No check-ins this month yet." />
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {recent.slice(0, 20).map((c, idx) => (
                <li key={`${c.name}-${c.date}-${c.time}-${idx}`} className="flex items-center justify-between gap-2 py-1 border-b border-gray-700/40 last:border-0">
                  <span className="text-sm font-semibold text-gray-100 truncate">
                    {c.name}
                    <span className="ml-1.5 font-normal text-gray-400">
                      · {c.date === todayKey ? 'Today' : c.date}
                    </span>
                  </span>
                  <div className="text-xs text-gray-400 whitespace-nowrap">
                    {c.className}{c.time ? ` · ${c.time}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  );
}

function Kpi({ value, label, color }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5">
      <div className={`text-2xl font-black leading-none ${color}`}>{value}</div>
      <div className="text-[10px] uppercase font-bold text-gray-400 mt-1 leading-tight">{label}</div>
    </div>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
      <div className="mb-1.5">
        <h3 className="text-sm font-bold text-white leading-tight">{title}</h3>
        {subtitle && <p className="text-[11px] text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }) {
  return <p className="text-sm text-gray-500 italic">{text}</p>;
}