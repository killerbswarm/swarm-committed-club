import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { 
  auth, db, signInAnonymously, onAuthStateChanged,
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, 
  writeBatch, serverTimestamp, arrayUnion, arrayRemove 
} from './firebase';

const AUTH_PASS = "Coach1103!";
const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function makeNameKey(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

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

export default function App() {
  // Auth & System State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passInput, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Tab State
  const [activeTab, setActiveTab] = useState('roster'); // roster, live, lists, upload, draw, settings
  const [listSubTab, setListSubTab] = useState('monthly'); // monthly, quarterly, unbroken

  // Core Data Cache
  const [masterMembers, setMasterMembers] = useState([]);
  const [monthlyRecords, setMonthlyRecords] = useState([]);
  const [quarterlyRecords, setQuarterlyRecords] = useState([]);
  const [appSettings, setAppSettings] = useState({ minCheckins: 15, ghlWebhook: '', theme: 'dark', inactiveThreshold: 12 });

  // Filters & Search
  const [rosterStatusFilter, setRosterStatusFilter] = useState('active');
  const [rosterSearch, setRosterSearch] = useState('');
  
  const [liveMonthId, setLiveMonthId] = useState('');
  const [liveSearch, setLiveSearch] = useState('');

  const [clubListSelectedId, setClubListSelectedId] = useState('');
  const [clubListSearch, setClubListSearch] = useState('');

  // Modals & Draw State
  const [historyMember, setHistoryMember] = useState(null);
  const [editMember, setEditMember] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addNameInput, setAddNameInput] = useState('');
  const [addIsCoachInput, setAddIsCoachInput] = useState(false);

  // Upload Tab State
  const [uploadYear, setUploadYear] = useState(2026);
  const [uploadMonth, setUploadMonth] = useState(8);
  const [uploadText, setUploadText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState({ msg: '', type: '' });

  // Draws Tab State
  const [drawMYear, setDrawMYear] = useState(2026);
  const [drawMMonth, setDrawMMonth] = useState(8);
  const [drawQYear, setDrawQYear] = useState(2026);
  const [drawQQuarter, setDrawQQuarter] = useState(3);
  const [wheelModal, setWheelModal] = useState(null); // { title, pool, onWin }
  const [revealedWinner, setRevealedWinner] = useState(null); // { title, name, prize }
  const [ghlStatus, setGhlStatus] = useState('');
  const [manualWinnerSelect, setManualWinnerSelect] = useState('');

  // Canvas Wheel Ref
  const canvasRef = useRef(null);
  const [isSpinning, setIsSpinning] = useState(false);

  // Theme Sync
  useEffect(() => {
    if (appSettings.theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [appSettings.theme]);

  // Firebase Auth Check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && sessionStorage.getItem('cc_auth') === 'true') {
        setIsAuthenticated(true);
        loadAllData();
      } else {
        setIsAuthenticated(false);
      }
    });
    loadSettings();
    return () => unsubscribe();
  }, []);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    if (passInput === AUTH_PASS) {
      setIsAuthLoading(true);
      try {
        sessionStorage.setItem('cc_auth', 'true');
        await signInAnonymously(auth);
        setIsAuthenticated(true);
        setAuthError('');
        loadAllData();
      } catch (err) {
        setAuthError(`Auth Failed: ${err.message}`);
      } finally {
        setIsAuthLoading(false);
      }
    } else {
      setAuthError("Incorrect password. Please try again.");
    }
  }

  async function loadSettings() {
    try {
      const snap = await getDoc(doc(db, 'settings', 'app_config'));
      if (snap.exists()) {
        const data = snap.data();
        setAppSettings({
          minCheckins: data.minCheckins !== undefined ? data.minCheckins : 15,
          ghlWebhook: data.ghlWebhook || '',
          theme: data.theme || 'dark',
          inactiveThreshold: data.inactiveThreshold !== undefined ? data.inactiveThreshold : 12
        });
      }
    } catch (err) {
      console.error("Settings load error:", err);
    }
  }

  async function loadAllData() {
    try {
      const [membersSnap, monthlySnap, quarterlySnap] = await Promise.all([
        getDocs(collection(db, 'members')),
        getDocs(collection(db, 'monthly_records')),
        getDocs(collection(db, 'quarterly_records'))
      ]);

      const membersList = membersSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => m.name && m.name.trim() !== '');

      const monthlyList = monthlySnap.docs.map(d => ({ id: d.id, ...d.data() }));
      monthlyList.sort((a, b) => b.id.localeCompare(a.id));

      const quarterlyList = quarterlySnap.docs.map(d => ({ id: d.id, ...d.data() }));

      setMasterMembers(membersList);
      setMonthlyRecords(monthlyList);
      setQuarterlyRecords(quarterlyList);

      if (monthlyList.length > 0 && !liveMonthId) {
        setLiveMonthId(monthlyList[0].id);
      }
    } catch (err) {
      console.error("Data load error:", err);
    }
  }

  // Helper Streak Engine (Excludes Current In-Progress Month)
  function getMemberStreak(memberId) {
    const sorted = [...monthlyRecords].sort((a, b) => a.id.localeCompare(b.id));
    if (sorted.length === 0) return 0;

    const now = new Date();
    const curDocId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const completedRecords = sorted.filter(r => r.id < curDocId || r.isUploaded);

    let streak = 0;
    for (let i = completedRecords.length - 1; i >= 0; i--) {
      const r = completedRecords[i];
      const minThreshold = appSettings.minCheckins || 15;
      const cMap = r.checkinsMap || {};
      const isValid = cMap[memberId] === undefined || parseInt(cMap[memberId], 10) >= minThreshold;

      if (r.qualifierIds && r.qualifierIds.includes(memberId) && isValid) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  function getMemberFirstMonth(memberId) {
    const sorted = [...monthlyRecords].sort((a, b) => a.id.localeCompare(b.id));
    const first = sorted.find(r => r.qualifierIds && r.qualifierIds.includes(memberId));
    return first ? first.id : null;
  }

  function getPastWinnersMapForMonth(targetDocId) {
    const pastWinnersMap = new Map();
    let targetYear = 2026, targetMonth = 7;

    if (targetDocId && targetDocId.includes('-')) {
      const [yrStr, moStr] = targetDocId.split('-');
      targetYear = parseInt(yrStr, 10);
      targetMonth = parseInt(moStr, 10);
    }

    const targetDate = new Date(targetYear, targetMonth - 1, 1);

    for (let i = 1; i <= 12; i++) {
      const prevDate = new Date(targetDate);
      prevDate.setMonth(prevDate.getMonth() - i);
      const pYear = prevDate.getFullYear();
      const pMonth = String(prevDate.getMonth() + 1).padStart(2, '0');
      const pDocId = `${pYear}-${pMonth}`;

      const prevDoc = monthlyRecords.find(r => r.id === pDocId);
      if (prevDoc && prevDoc.winnerId && !pastWinnersMap.has(prevDoc.winnerId)) {
        pastWinnersMap.set(prevDoc.winnerId, formatMonthYearDisplay(pDocId));
      }
    }

    quarterlyRecords.forEach(qRec => {
      const qYear = qRec.year;
      const qNum = qRec.quarter;
      const qEndDate = new Date(qYear, qNum * 3, 0);
      const diffDays = (targetDate - qEndDate) / (1000 * 60 * 60 * 24);

      if (diffDays > 0 && diffDays <= 365 && qRec.winnerId && !pastWinnersMap.has(qRec.winnerId)) {
        pastWinnersMap.set(qRec.winnerId, `Q${qNum} ${qYear}`);
      }
    });

    return pastWinnersMap;
  }

  async function saveSettings(newSettings) {
    try {
      const updated = { ...appSettings, ...newSettings };
      setAppSettings(updated);
      await setDoc(doc(db, 'settings', 'app_config'), {
        ...updated,
        updatedAt: serverTimestamp()
      }, { merge: true });
      alert("Settings saved successfully!");
    } catch (err) {
      alert(`Error saving settings: ${err.message}`);
    }
  }

  function postDataViaHtmlForm(url, data) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    form.target = '_blank';
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = data[key];
        form.appendChild(input);
      }
    }
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  }

  async function sendWinnerGhl(winnerName, prizeText) {
    if (!appSettings.ghlWebhook) {
      alert("Please enter and save your GoHighLevel Webhook URL in Settings first.");
      return;
    }
    try {
      setGhlStatus("Sending webhook...");
      postDataViaHtmlForm(appSettings.ghlWebhook, {
        name: winnerName,
        prize: prizeText || '',
        source: 'Committed Club Tracker'
      });
      setGhlStatus("Success! Prize SMS triggered in GoHighLevel 🎉");
    } catch (err) {
      setGhlStatus(`Error: ${err.message}`);
    }
  }

  // Upload Logic
  async function processUpload() {
    if (!selectedFile && !uploadText) {
      alert("Please select a CSV file or paste text entries.");
      return;
    }
    setUploadStatus({ msg: "Parsing attendance data and updating Firestore...", type: "info" });

    try {
      let parsed = [];
      if (selectedFile) {
        parsed = await new Promise((resolve, reject) => {
          Papa.parse(selectedFile, {
            header: true,
            skipEmptyLines: true,
            complete: (res) => {
              const list = [];
              res.data.forEach(row => {
                const fn = (row['First Name'] || row['FirstName'] || row['first_name'] || '').toString().trim();
                const ln = (row['Last Name'] || row['LastName'] || row['last_name'] || '').toString().trim();
                let full = (fn || ln) ? `${fn} ${ln}`.trim() : (row['Name'] || row['Member'] || '').toString().trim();
                full = full.replace(/\s+/g, ' ');

                if (!full || full.toLowerCase().includes('total')) return;

                const cRaw = row['Days'] || row['Checked-In'] || row['Total Check-ins'] || row['Checked In'] || row['Reserved + Checked-In'] || row['Checkins'] || row['Check-ins'] || '0';
                const count = parseInt(cRaw.toString().replace(/,/g, ''), 10) || 0;
                list.push({ name: full, checkins: count });
              });
              resolve(list);
            },
            error: (err) => reject(err)
          });
        });
      } else {
        const lines = uploadText.replace(/Client/gi, '').replace(/Total Check[- ]?ins?/gi, '').split('\n').map(l => l.trim()).filter(l => l !== '');
        lines.forEach(line => {
          let name = line.replace(/\d{4}-\d{2}-\d{2}/g, '').replace(/\b(ex-member|coach|admin|non-member|member)\b/gi, '').trim();
          const match = line.match(/(\d{1,3})\s*$/);
          const count = match ? parseInt(match[1], 10) : appSettings.minCheckins;
          if (name && name.length > 1) list.push({ name, checkins: count });
        });
      }

      if (parsed.length === 0) {
        setUploadStatus({ msg: "No valid athletes found in the uploaded file.", type: "error" });
        return;
      }

      const existingMap = new Map(masterMembers.map(m => [makeNameKey(m.nameKey || m.name), m]));
      const batch = writeBatch(db);
      const qualifierIds = [];
      const checkinsMap = {};

      for (const item of parsed) {
        const nameKey = makeNameKey(item.name);
        let mDoc = existingMap.get(nameKey);
        let mId = mDoc ? mDoc.id : doc(collection(db, 'members')).id;

        if (!mDoc) {
          batch.set(doc(db, 'members', mId), {
            name: item.name,
            nameKey: nameKey,
            status: 'active',
            isCoach: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          existingMap.set(nameKey, { id: mId, name: item.name });
        } else {
          batch.update(doc(db, 'members', mId), {
            name: item.name,
            status: 'active',
            updatedAt: serverTimestamp()
          });
        }

        checkinsMap[mId] = item.checkins;
        if (item.checkins >= appSettings.minCheckins && !qualifierIds.includes(mId)) {
          qualifierIds.push(mId);
        }
      }

      await batch.commit();

      const docId = `${uploadYear}-${String(uploadMonth).padStart(2, '0')}`;
      const now = new Date();
      const currentLiveMonthDocId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      await setDoc(doc(db, 'monthly_records', docId), {
        year: uploadYear,
        month: uploadMonth,
        qualifierIds: qualifierIds,
        unqualifiedIds: [],
        checkinsMap: checkinsMap,
        isUploaded: docId < currentLiveMonthDocId,
        updatedAt: serverTimestamp()
      }, { merge: true });

      await loadAllData();
      setUploadStatus({ msg: `Success! Updated check-in records for ${parsed.length} athletes (${qualifierIds.length} qualified) for ${formatMonthYearDisplay(docId)}.`, type: "success" });
      setUploadText('');
      setSelectedFile(null);
    } catch (err) {
      setUploadStatus({ msg: `Upload Error: ${err.message}`, type: "error" });
    }
  }

  // Wheel Drawing Animation Engine
  function drawWheel(members, angle) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 15;

    ctx.clearRect(0, 0, width, height);
    if (!members || members.length === 0) return;

    const numSlices = members.length;
    const sliceAngle = (2 * Math.PI) / numSlices;
    const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

    for (let i = 0; i < numSlices; i++) {
      const start = angle + i * sliceAngle;
      const end = start + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      const fontSize = Math.max(11, Math.min(16, Math.floor(380 / numSlices)));
      ctx.font = `bold ${fontSize}px sans-serif`;
      let text = members[i].name || 'Unknown';
      if (text.length > 18) text = text.substring(0, 16) + '...';
      ctx.fillText(text, radius - 15, fontSize / 3);
      ctx.restore();
    }

    // Wheel Pin & Center Cap
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 30, 0, 2 * Math.PI);
    ctx.fillStyle = '#111827';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(centerX - 12, 4);
    ctx.lineTo(centerX + 12, 4);
    ctx.lineTo(centerX, 26);
    ctx.closePath();
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
  }

  useEffect(() => {
    if (wheelModal) {
      drawWheel(wheelModal.pool, 0);
    }
  }, [wheelModal]);

  function executeSpin() {
    if (isSpinning || !wheelModal) return;
    setIsSpinning(true);

    const pool = wheelModal.pool;
    const winnerIndex = Math.floor(Math.random() * pool.length);
    const winner = pool[winnerIndex];

    const sliceAngle = (2 * Math.PI) / pool.length;
    const targetAngle = (1.5 * Math.PI) - (winnerIndex * sliceAngle + sliceAngle / 2);
    const totalRotation = targetAngle + (6 * 2 * Math.PI);
    const duration = 4500;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - t, 3);
      const currentAngle = totalRotation * easeOut;

      drawWheel(pool, currentAngle);

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        setIsSpinning(false);
        wheelModal.onWin(winner);
        setRevealedWinner({ title: wheelModal.title, name: winner.name });
      }
    }
    requestAnimationFrame(step);
  }

  // Render Stats Calculation
  const activeMembersCount = masterMembers.filter(m => m.status === 'active' || !m.status).length;
  const activeStreaksCount = masterMembers.filter(m => getMemberStreak(m.id) > 0).length;
  
  const now = new Date();
  const currentMonthDocId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const yrRecords2026 = monthlyRecords.filter(r => r.year === 2026);
  const completed2026Records = yrRecords2026.filter(r => r.id < currentMonthDocId || r.isUploaded);
  const recsToUse2026 = completed2026Records.length > 0 ? completed2026Records : yrRecords2026;

  const unbrokenCount2026 = masterMembers.filter(m => {
    return recsToUse2026.length > 0 && recsToUse2026.every(r => {
      const qIds = r.qualifierIds || [];
      const cMap = r.checkinsMap || {};
      return qIds.includes(m.id) && (cMap[m.id] === undefined || parseInt(cMap[m.id], 10) >= appSettings.minCheckins);
    });
  }).length;

  let totalLifetimeQuals = 0;
  monthlyRecords.forEach(r => {
    const cMap = r.checkinsMap || {};
    const valid = (r.qualifierIds || []).filter(id => cMap[id] === undefined || parseInt(cMap[id], 10) >= appSettings.minCheckins);
    totalLifetimeQuals += valid.length;
  });

  if (!isAuthenticated) {
    return (
      <div id="auth-overlay" className="fixed inset-0 bg-gray-900/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div className="bg-gray-800 border border-gray-700 p-6 sm:p-8 rounded-2xl max-w-sm w-full shadow-2xl text-center space-y-4">
          <div className="bg-amber-500 text-gray-900 font-black px-3 py-1 rounded-lg text-2xl tracking-wider inline-block">CC</div>
          <h2 className="text-xl font-bold text-white leading-tight">Committed Club Tracker</h2>
          <p className="text-xs text-gray-400">Please enter the coach password to access the app.</p>
          <form onSubmit={handleAuthSubmit} className="space-y-3">
            <input 
              type="password" 
              value={passInput} 
              onChange={(e) => setAuthPassword(e.target.value)} 
              placeholder="Enter Password" 
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-white text-center focus:outline-none focus:border-amber-500 font-mono tracking-widest" 
            />
            <button type="submit" disabled={isAuthLoading} className="w-full bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-2.5 rounded-lg transition text-sm cursor-pointer uppercase tracking-wider">
              {isAuthLoading ? 'Unlocking...' : 'Unlock Dashboard 🔓'}
            </button>
          </form>
          {authError && <div className="text-xs font-semibold text-red-400">{authError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Navigation Header */}  
      <header className="bg-gray-800 border-b border-gray-700 px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row justify-between items-center gap-3 shadow-lg">
        <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-start">
          <div className="bg-amber-500 text-gray-900 font-black px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-lg text-lg sm:text-xl tracking-wider shrink-0">CC</div>
          <div>
            <h1 className="text-base sm:text-xl font-bold tracking-wide text-white leading-tight">Committed Club Tracker</h1>
            <p className="text-[10px] sm:text-xs text-gray-400">React + Firestore Edition</p>
          </div>
        </div>
        <nav className="flex space-x-1.5 sm:space-x-2 w-full sm:w-auto justify-between sm:justify-end overflow-x-auto pb-1 sm:pb-0">
          {['roster', 'live', 'lists', 'upload', 'draw', 'settings'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)} 
              className={`tab-btn px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer shrink-0 ${activeTab === tab ? 'bg-amber-500 text-gray-900' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              {tab === 'roster' && 'Dashboard 📊'}
              {tab === 'live' && 'Live View ⚡'}
              {tab === 'lists' && 'Club Lists 🏆'}
              {tab === 'upload' && 'Upload 📥'}
              {tab === 'draw' && 'Draws 🎡'}
              {tab === 'settings' && 'Settings ⚙️'}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-6 py-3 sm:py-8">
        
        {/* 1. DASHBOARD TAB */}
        {activeTab === 'roster' && (
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
                  <h2 class="text-base sm:text-xl font-bold text-amber-400">Master Athlete Roster</h2>
                  <p class="text-gray-400 text-[11px] sm:text-xs">Click on any athlete's name to view their complete history, streak, and wins.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <select 
                    value={rosterStatusFilter} 
                    onChange={(e) => setRosterStatusFilter(e.target.value)} 
                    className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs sm:text-sm text-white focus:outline-none font-semibold cursor-pointer"
                  >
                    <option value="active">Active Athletes</option>
                    <option value="inactive">Inactive Athletes</option>
                    <option value="all">All Statuses</option>
                  </select>
                  <button onClick={() => setShowAddModal(true)} className="bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold text-xs px-3 py-2 rounded-lg transition shadow cursor-pointer">
                    ➕ Add Member
                  </button>
                  <input 
                    type="text" 
                    value={rosterSearch} 
                    onChange={(e) => setRosterSearch(e.target.value)} 
                    placeholder="Search name..." 
                    className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 flex-1 sm:w-44" 
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm text-gray-300">
                  <thead className="bg-gray-900 text-gray-400 uppercase text-[10px] sm:text-xs font-bold border-b border-gray-700">
                    <tr>
                      <th className="p-2 sm:p-3">Member Name</th>
                      <th className="p-2 sm:p-3">Status</th>
                      <th className="p-2 sm:p-3 text-center">Months</th>
                      <th className="p-2 sm:p-3 text-center">Streak</th>
                      <th className="p-2 sm:p-3">Wins</th>
                      <th className="p-2 sm:p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {masterMembers
                      .filter(m => rosterStatusFilter === 'all' || (rosterStatusFilter === 'active' ? (m.status === 'active' || !m.status) : m.status === 'inactive'))
                      .filter(m => m.name.toLowerCase().includes(rosterSearch.toLowerCase()))
                      .map(m => {
                        const monthsQualCount = monthlyRecords.filter(r => r.qualifierIds && r.qualifierIds.includes(m.id)).length;
                        const streak = getMemberStreak(m.id);
                        const mWins = monthlyRecords.filter(r => r.winnerId === m.id).map(r => formatMonthYearDisplay(r.id));
                        const qWins = quarterlyRecords.filter(r => r.winnerId === m.id).map(r => `Q${r.quarter} ${r.year}`);
                        const winsList = [...mWins, ...qWins];

                        return (
                          <tr key={m.id} className="hover:bg-gray-800/50">
                            <td className="p-2 sm:p-3 font-semibold text-white">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="cursor-pointer hover:underline text-amber-400 font-bold" onClick={() => setHistoryMember(m)}>{m.name}</span>
                                {m.isCoach && <span className="bg-purple-900/60 text-purple-300 border border-purple-700/50 text-[9px] px-1.5 py-0.5 rounded font-bold">COACH</span>}
                              </div>
                            </td>
                            <td className="p-2 sm:p-3">
                              {m.status === 'inactive' 
                                ? <span className="bg-gray-700 text-gray-400 text-[10px] px-2 py-1 rounded font-bold">Inactive</span>
                                : <span className="bg-green-900/60 text-green-300 text-[10px] px-2 py-1 rounded font-bold">Active</span>}
                            </td>
                            <td className="p-2 sm:p-3 text-center font-bold text-amber-400 text-sm">{monthsQualCount}</td>
                            <td className="p-2 sm:p-3 text-center">
                              {streak > 0 ? <span className="bg-orange-950/60 text-orange-400 border border-orange-700/50 px-2 py-0.5 rounded-full font-bold text-xs">🔥 {streak}</span> : <span className="text-gray-500">—</span>}
                            </td>
                            <td className="p-2 sm:p-3 flex flex-wrap gap-1">
                              {winsList.length > 0 ? winsList.map((w, idx) => (
                                <span key={idx} className="bg-amber-900/60 text-amber-300 border border-amber-700/50 text-[10px] px-1.5 py-0.5 rounded font-mono">{w}</span>
                              )) : <span className="text-gray-500">—</span>}
                            </td>
                            <td className="p-2 sm:p-3 text-right">
                              <button onClick={() => setEditMember(m)} className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10px] sm:text-xs px-3 py-1.5 rounded transition cursor-pointer">
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
        )}

        {/* 2. LIVE VIEW TAB */}
        {activeTab === 'live' && (
          <section className="space-y-4 sm:space-y-6">
            <div className="bg-gray-800 p-3 sm:p-6 rounded-xl border border-gray-700 shadow-md">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <div>
                  <h2 className="text-base sm:text-xl font-bold text-amber-400">Current Month Live View</h2>
                  <p className="text-gray-400 text-[11px] sm:text-xs">Showing active members and coaches with 1+ check-ins for the selected month.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select 
                    value={liveMonthId} 
                    onChange={(e) => setLiveMonthId(e.target.value)} 
                    className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs sm:text-sm text-white focus:outline-none font-semibold cursor-pointer"
                  >
                    {monthlyRecords.map(r => (
                      <option key={r.id} value={r.id}>{formatMonthYearDisplay(r.id)}</option>
                    ))}
                  </select>
                  <input 
                    type="text" 
                    value={liveSearch} 
                    onChange={(e) => setLiveSearch(e.target.value)} 
                    placeholder="Search athlete..." 
                    className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 flex-1 sm:w-48" 
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm text-gray-300">
                  <thead className="bg-gray-900 text-gray-400 uppercase text-[10px] sm:text-xs font-bold border-b border-gray-700">
                    <tr>
                      <th className="p-2 sm:p-3 w-10 text-center">#</th>
                      <th className="p-2 sm:p-3">Athlete Name</th>
                      <th className="p-2 sm:p-3 text-center">Check-Ins</th>
                      <th className="p-2 sm:p-3 text-center">Status</th>
                      <th className="p-2 sm:p-3 text-right">Quick Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {(() => {
                      const curRecord = monthlyRecords.find(r => r.id === liveMonthId);
                      const cMap = curRecord ? (curRecord.checkinsMap || {}) : {};
                      const liveMembers = masterMembers
                        .filter(m => (m.status === 'active' || !m.status) && (parseInt(cMap[m.id] || 0, 10) > 0))
                        .filter(m => m.name.toLowerCase().includes(liveSearch.toLowerCase()));

                      liveMembers.sort((a, b) => (parseInt(cMap[b.id] || 0, 10) - parseInt(cMap[a.id] || 0, 10)) || a.name.localeCompare(b.name));

                      if (liveMembers.length === 0) {
                        return <tr><td colSpan="5" className="p-4 text-center text-gray-500">No members with check-ins found for this month yet.</td></tr>;
                      }

                      return liveMembers.map((m, idx) => {
                        const count = parseInt(cMap[m.id] || 0, 10);
                        const isQual = count >= appSettings.minCheckins;
                        const pct = Math.min(100, Math.round((count / appSettings.minCheckins) * 100));

                        return (
                          <tr key={m.id} className="hover:bg-gray-800/50">
                            <td className="p-2 sm:p-3 text-center font-mono text-gray-400 font-bold">{idx + 1}</td>
                            <td className="p-2 sm:p-3 font-semibold text-white">
                              <div className="flex items-center gap-1.5">
                                <span className="cursor-pointer hover:underline text-amber-400 font-bold" onClick={() => setHistoryMember(m)}>{m.name}</span>
                                {m.isCoach && <span className="bg-purple-900/60 text-purple-300 border border-purple-700/50 text-[9px] px-1.5 py-0.5 rounded font-bold">COACH</span>}
                              </div>
                            </td>
                            <td className="p-2 sm:p-3 text-center">
                              <div className="font-black text-amber-400 text-base">{count}</div>
                              <div className="w-24 bg-gray-700 h-1.5 rounded-full mx-auto mt-1 overflow-hidden">
                                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                              </div>
                            </td>
                            <td className="p-2 sm:p-3 text-center">
                              {isQual 
                                ? <span className="bg-green-900/60 text-green-300 border border-green-700/50 px-2.5 py-1 rounded-full text-[10px] font-bold">✓ Qualified</span> 
                                : <span className="bg-gray-700/60 text-gray-300 border border-gray-600 px-2.5 py-1 rounded-full text-[10px] font-medium">{appSettings.minCheckins - count} left</span>}
                            </td>
                            <td className="p-2 sm:p-3 text-right">
                              <button 
                                onClick={async () => {
                                  const input = prompt(`Update check-in count for ${m.name}:`, count);
                                  if (input === null) return;
                                  const val = parseInt(input.trim(), 10);
                                  if (isNaN(val) || val < 0) return alert("Invalid number.");

                                  const shouldQual = val >= appSettings.minCheckins;
                                  const mRef = doc(db, 'monthly_records', liveMonthId);
                                  const snap = await getDoc(mRef);
                                  let qIds = snap.exists() ? (snap.data().qualifierIds || []) : [];
                                  let updatedCMap = snap.exists() ? (snap.data().checkinsMap || {}) : {};

                                  updatedCMap[m.id] = val;
                                  if (shouldQual && !qIds.includes(m.id)) qIds.push(m.id);
                                  if (!shouldQual) qIds = qIds.filter(id => id !== m.id);

                                  await setDoc(mRef, { qualifierIds: qIds, checkinsMap: updatedCMap, updatedAt: serverTimestamp() }, { merge: true });
                                  loadAllData();
                                }} 
                                className="bg-gray-700 hover:bg-gray-600 text-amber-400 font-bold text-xs px-2.5 py-1.5 rounded transition cursor-pointer"
                              >
                                ✏️ Edit Count
                              </button>
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
        )}

        {/* 3. CLUB LISTS TAB */}
        {activeTab === 'lists' && (
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

              {/* Dynamic Target Filters */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-4">
                <div className="flex items-center gap-2 flex-1">
                  <label className="text-xs uppercase font-bold text-amber-400 whitespace-nowrap">
                    {listSubTab === 'monthly' ? 'Select Month:' : listSubTab === 'quarterly' ? 'Select Quarter:' : 'Select Year:'}
                  </label>
                  <select 
                    value={clubListSelectedId} 
                    onChange={(e) => setClubListSelectedId(e.target.value)} 
                    className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs sm:text-sm text-white focus:outline-none font-semibold cursor-pointer w-full sm:w-64"
                  >
                    {listSubTab === 'monthly' && monthlyRecords.map(r => (
                      <option key={r.id} value={`M:${r.id}`}>{formatMonthYearDisplay(r.id)} ({(r.qualifierIds || []).length} qualified)</option>
                    ))}
                    {listSubTab === 'quarterly' && [2026, 2025].map(yr => [4,3,2,1].map(qNum => (
                      <option key={`${yr}-Q${qNum}`} value={`Q:${yr}-Q${qNum}`}>{yr} Q{qNum}</option>
                    )))}
                    {listSubTab === 'unbroken' && [2026, 2025].map(yr => (
                      <option key={yr} value={`unbroken-${yr}`}>{yr} Unbroken Club</option>
                    ))}
                  </select>
                </div>
                <input 
                  type="text" 
                  value={clubListSearch} 
                  onChange={(e) => setClubListSearch(e.target.value)} 
                  placeholder="Search athlete..." 
                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 w-full sm:w-48" 
                />
              </div>

              {/* Results Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm text-gray-300">
                  <thead className="bg-gray-900 text-gray-400 uppercase text-[10px] sm:text-xs font-bold border-b border-gray-700">
                    <tr>
                      <th className="p-2 sm:p-3 w-10 text-center">#</th>
                      <th className="p-2 sm:p-3">Athlete Name</th>
                      <th className="p-2 sm:p-3 text-right">Qualification Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {(() => {
                      let list = [];
                      if (clubListSelectedId.startsWith('M:')) {
                        const docId = clubListSelectedId.replace('M:', '');
                        const rec = monthlyRecords.find(r => r.id === docId);
                        if (rec) {
                          const qSet = new Set(rec.qualifierIds || []);
                          list = masterMembers.filter(m => qSet.has(m.id));
                        }
                      } else if (clubListSelectedId.startsWith('unbroken-')) {
                        const yr = parseInt(clubListSelectedId.replace('unbroken-', ''), 10);
                        const yearRecs = monthlyRecords.filter(r => r.year === yr && (r.id < currentMonthDocId || r.isUploaded));
                        list = masterMembers.filter(m => yearRecs.every(r => (r.qualifierIds || []).includes(m.id)));
                      }

                      list = list.filter(m => m.name.toLowerCase().includes(clubListSearch.toLowerCase()));

                      if (list.length === 0) return <tr><td colSpan="3" className="p-4 text-center text-gray-500">No qualified members found for this list.</td></tr>;

                      return list.map((m, idx) => (
                        <tr key={m.id} className="hover:bg-gray-800/50">
                          <td className="p-2 sm:p-3 text-center font-mono text-gray-400 font-bold">{idx + 1}</td>
                          <td className="p-2 sm:p-3 font-semibold text-white">
                            <span className="cursor-pointer hover:underline text-amber-400 font-bold" onClick={() => setHistoryMember(m)}>{m.name}</span>
                          </td>
                          <td className="p-2 sm:p-3 text-right">
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
        )}

        {/* 4. UPLOAD TAB */}
        {activeTab === 'upload' && (
          <section className="space-y-4 sm:space-y-6">
            <div className="bg-gray-800 p-3.5 sm:p-6 rounded-xl border border-gray-700 shadow-md">
              <h2 className="text-lg sm:text-xl font-semibold mb-1 text-amber-400">Upload Monthly Attendance List</h2>
              <p className="text-gray-400 text-xs sm:text-sm mb-4">Upload CSV export or paste text lines to update check-in counts in Firestore.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Year</label>
                  <input type="number" value={uploadYear} onChange={(e) => setUploadYear(parseInt(e.target.value, 10))} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm text-white" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Month</label>
                  <select value={uploadMonth} onChange={(e) => setUploadMonth(parseInt(e.target.value, 10))} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm text-white">
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                      <option key={m} value={m}>{monthNames[m]} ({String(m).padStart(2, '0')})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Option A: Select CSV File</label>
                <input type="file" accept=".csv" onChange={(e) => setSelectedFile(e.target.files[0])} className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-white w-full" />
              </div>

              <div className="mb-4">
                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Option B: Or Paste List Text</label>
                <textarea rows="4" value={uploadText} onChange={(e) => setUploadText(e.target.value)} placeholder="Brian Cook 15..." className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-xs text-white font-mono" />
              </div>

              <button onClick={processUpload} className="w-full bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-2.5 rounded-lg transition text-sm cursor-pointer uppercase">
                Process Attendance Upload
              </button>

              {uploadStatus.msg && (
                <div className={`mt-3 text-center text-xs font-semibold ${uploadStatus.type === 'error' ? 'text-red-400' : uploadStatus.type === 'success' ? 'text-green-400' : 'text-amber-400'}`}>
                  {uploadStatus.msg}
                </div>
              )}
            </div>
          </section>
        )}

        {/* 5. DRAWS TAB */}
        {activeTab === 'draw' && (
          <section className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
              <div className="bg-gray-800 p-4 sm:p-6 rounded-xl border border-gray-700 shadow-md">
                <h2 className="text-lg font-bold text-amber-400 mb-2">Monthly Winner Raffle</h2>
                <p className="text-gray-400 text-xs mb-4">Randomly picks a winner excluding coaches and past 12-month winners.</p>
                <button 
                  onClick={() => {
                    const docId = `${drawMYear}-${String(drawMMonth).padStart(2, '0')}`;
                    const rec = monthlyRecords.find(r => r.id === docId);
                    if (!rec) return alert("No monthly list found.");
                    const pool = masterMembers.filter(m => (rec.qualifierIds || []).includes(m.id) && !m.isCoach);
                    setWheelModal({ title: `Monthly Winner — ${formatMonthYearDisplay(docId)}`, pool, onWin: (winner) => sendWinnerGhl(winner.name, formatMonthYearDisplay(docId)) });
                  }} 
                  className="w-full bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-3 rounded-lg transition text-xs shadow cursor-pointer uppercase"
                >
                  Open Monthly Raffle Wheel 🎡
                </button>
              </div>

              <div className="bg-gray-800 p-4 sm:p-6 rounded-xl border border-gray-700 shadow-md">
                <h2 className="text-lg font-bold text-amber-400 mb-2">Quarterly Streak Raffle</h2>
                <p className="text-gray-400 text-xs mb-4">Picks from athletes qualified in all 3 consecutive months of the quarter.</p>
                <button 
                  onClick={() => {
                    const startM = (drawQQuarter - 1) * 3 + 1;
                    const docIds = [startM, startM + 1, startM + 2].map(m => `${drawQYear}-${String(m).padStart(2, '0')}`);
                    const recs = docIds.map(id => monthlyRecords.find(r => r.id === id));
                    if (recs.some(r => !r)) return alert("Upload all 3 months of the quarter first.");
                    const pool = masterMembers.filter(m => recs.every(r => (r.qualifierIds || []).includes(m.id)) && !m.isCoach);
                    setWheelModal({ title: `Quarterly Winner — Q${drawQQuarter} ${drawQYear}`, pool, onWin: (winner) => sendWinnerGhl(winner.name, `Q${drawQQuarter} ${drawQYear}`) });
                  }} 
                  className="w-full bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-3 rounded-lg transition text-xs shadow cursor-pointer uppercase"
                >
                  Open Quarterly Raffle Wheel 🎡
                </button>
              </div>
            </div>

            {revealedWinner && (
              <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-gray-900 p-6 rounded-2xl text-center shadow-2xl space-y-2">
                <div className="text-xs uppercase font-black tracking-widest">{revealedWinner.title}</div>
                <div className="text-4xl font-extrabold">{revealedWinner.name}</div>
                <button onClick={() => sendWinnerGhl(revealedWinner.name, revealedWinner.prize)} className="bg-gray-900 text-amber-400 font-bold py-2 px-6 rounded-xl text-xs uppercase tracking-wide cursor-pointer">
                  🚀 Send Prize SMS
                </button>
                {ghlStatus && <div className="text-xs font-bold text-gray-900 mt-1">{ghlStatus}</div>}
              </div>
            )}
          </section>
        )}

        {/* 6. SETTINGS TAB */}
        {activeTab === 'settings' && (
          <section className="space-y-4 sm:space-y-6">
            <div className="bg-gray-800 p-4 sm:p-6 rounded-xl border border-gray-700 shadow-md space-y-6">
              <h2 className="text-lg font-bold text-amber-400">Tracker Settings & Integrations</h2>

              <div className="border-t border-gray-700 pt-4">
                <label className="block text-xs uppercase font-bold text-amber-400 mb-1">Theme Mode</label>
                <select 
                  value={appSettings.theme} 
                  onChange={(e) => saveSettings({ theme: e.target.value })} 
                  className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-white max-w-xs w-full cursor-pointer"
                >
                  <option value="dark">Dark Mode 🌙</option>
                  <option value="light">Light Mode ☀️</option>
                </select>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <label className="block text-xs uppercase font-bold text-amber-400 mb-1">Minimum Check-Ins Required</label>
                <input 
                  type="number" 
                  value={appSettings.minCheckins} 
                  onChange={(e) => saveSettings({ minCheckins: parseInt(e.target.value, 10) })} 
                  className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white max-w-xs w-full" 
                />
              </div>

              <div className="border-t border-gray-700 pt-4">
                <label className="block text-xs uppercase font-bold text-amber-400 mb-1">GHL Winner Webhook URL</label>
                <input 
                  type="text" 
                  value={appSettings.ghlWebhook} 
                  onChange={(e) => saveSettings({ ghlWebhook: e.target.value.trim() })} 
                  className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-white font-mono w-full" 
                  placeholder="https://services.leadconnectorhq.com/hooks/..."
                />
              </div>
            </div>
          </section>
        )}

      </main>

      {/* RAFFLE WHEEL MODAL */}
      {wheelModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-3xl p-6 text-center max-w-2xl w-full relative flex flex-col items-center">
            <button onClick={() => setWheelModal(null)} className="absolute top-4 right-4 bg-gray-700 text-gray-400 hover:text-white w-8 h-8 rounded-full font-bold">&times;</button>
            <h3 className="text-xl font-black text-amber-400 uppercase mb-3">{wheelModal.title}</h3>
            <canvas ref={canvasRef} width="500" height="580" className="max-w-full h-auto drop-shadow-2xl" />
            <button onClick={executeSpin} disabled={isSpinning} className="mt-4 w-full bg-amber-500 hover:bg-amber-400 text-gray-900 font-black py-3 rounded-2xl uppercase tracking-wider text-lg cursor-pointer">
              {isSpinning ? 'SPINNING...' : 'SPIN THE WHEEL! 🎯'}
            </button>
          </div>
        </div>
      )}

      {/* ATHLETE HISTORY MODAL */}
      {historyMember && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-lg w-full relative">
            <button onClick={() => setHistoryMember(null)} className="absolute top-4 right-4 bg-gray-700 text-gray-400 hover:text-white w-8 h-8 rounded-full font-bold">&times;</button>
            <h3 className="text-2xl font-bold text-amber-400 mb-4">{historyMember.name}</h3>
            <div className="grid grid-cols-3 gap-3 text-center mb-4">
              <div className="bg-gray-900 p-3 rounded-xl border border-gray-700">
                <div className="text-2xl font-black text-amber-400">{monthlyRecords.filter(r => (r.qualifierIds || []).includes(historyMember.id)).length}</div>
                <div className="text-[10px] uppercase text-gray-400 font-bold">Total Months</div>
              </div>
              <div className="bg-gray-900 p-3 rounded-xl border border-gray-700">
                <div className="text-2xl font-black text-orange-400">{getMemberStreak(historyMember.id)}</div>
                <div className="text-[10px] uppercase text-gray-400 font-bold">Streak</div>
              </div>
              <div className="bg-gray-900 p-3 rounded-xl border border-gray-700">
                <div className="text-2xl font-black text-yellow-400">{monthlyRecords.filter(r => r.winnerId === historyMember.id).length}</div>
                <div className="text-[10px] uppercase text-gray-400 font-bold">Wins</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD MEMBER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-md w-full relative space-y-4">
            <button onClick={() => setShowAddModal(false)} className="absolute top-4 right-4 bg-gray-700 text-gray-400 hover:text-white w-8 h-8 rounded-full font-bold">&times;</button>
            <h3 className="text-lg font-bold text-amber-400 uppercase">Add New Athlete</h3>
            <input type="text" value={addNameInput} onChange={(e) => setAddNameInput(e.target.value)} placeholder="Full Name" className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm text-white" />
            <div className="flex items-center space-x-2">
              <input type="checkbox" id="addCoach" checked={addIsCoachInput} onChange={(e) => setAddIsCoachInput(e.target.checked)} className="rounded" />
              <label htmlFor="addCoach" className="text-xs text-gray-300">Designate as Coach</label>
            </div>
            <button 
              onClick={async () => {
                if (!addNameInput.trim()) return alert("Enter a name.");
                const nameKey = makeNameKey(addNameInput);
                await setDoc(doc(collection(db, 'members')), { name: addNameInput.trim(), nameKey, status: 'active', isCoach: addIsCoachInput, createdAt: serverTimestamp() });
                setShowAddModal(false);
                setAddNameInput('');
                loadAllData();
              }} 
              className="w-full bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-2.5 rounded-lg text-sm uppercase"
            >
              Create Athlete
            </button>
          </div>
        </div>
      )}

      {/* EDIT MEMBER MODAL */}
      {editMember && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-md w-full relative space-y-4">
            <button onClick={() => setEditMember(null)} className="absolute top-4 right-4 bg-gray-700 text-gray-400 hover:text-white w-8 h-8 rounded-full font-bold">&times;</button>
            <h3 className="text-lg font-bold text-amber-400 uppercase">Edit Profile</h3>
            <input type="text" value={editMember.name} onChange={(e) => setEditMember({ ...editMember, name: e.target.value })} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm text-white" />
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setEditMember({ ...editMember, status: editMember.status === 'inactive' ? 'active' : 'inactive' })} 
                className={`py-2 rounded-lg text-xs font-bold border ${editMember.status === 'inactive' ? 'bg-red-950/60 text-red-200 border-red-700' : 'bg-green-950/60 text-green-200 border-green-700'}`}
              >
                {editMember.status === 'inactive' ? 'Inactive' : 'Active'}
              </button>
              <button 
                onClick={() => setEditMember({ ...editMember, isCoach: !editMember.isCoach })} 
                className={`py-2 rounded-lg text-xs font-bold border ${editMember.isCoach ? 'bg-purple-950/60 text-purple-200 border-purple-700' : 'bg-gray-700 text-gray-200 border-gray-600'}`}
              >
                {editMember.isCoach ? 'Coach' : '+ Coach'}
              </button>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={async () => {
                  if (!confirm(`Delete ${editMember.name}?`)) return;
                  await deleteDoc(doc(db, 'members', editMember.id));
                  setEditMember(null);
                  loadAllData();
                }} 
                className="bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 px-4 rounded-lg text-sm uppercase"
              >
                Delete
              </button>
              <button 
                onClick={async () => {
                  await updateDoc(doc(db, 'members', editMember.id), {
                    name: editMember.name.trim(),
                    nameKey: makeNameKey(editMember.name),
                    status: editMember.status || 'active',
                    isCoach: editMember.isCoach || false,
                    updatedAt: serverTimestamp()
                  });
                  setEditMember(null);
                  loadAllData();
                }} 
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-2.5 rounded-lg text-sm uppercase"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}