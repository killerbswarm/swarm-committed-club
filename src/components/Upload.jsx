import React from 'react';

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function Upload({
  uploadYear,
  setUploadYear,
  uploadMonth,
  setUploadMonth,
  uploadText,
  setUploadText,
  selectedFile,
  setSelectedFile,
  uploadStatus,
  processUpload
}) {
  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="bg-gray-800 p-3.5 sm:p-6 rounded-xl border border-gray-700 shadow-md">
        <h2 className="text-lg sm:text-xl font-semibold mb-1 text-amber-400">Upload Monthly Attendance List</h2>
        <p className="text-gray-400 text-xs sm:text-sm mb-4">Upload CSV export or paste text lines to update check-in counts in Firestore.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Year</label>
            <input
              type="number"
              value={uploadYear}
              onChange={(e) => setUploadYear(parseInt(e.target.value, 10))}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Month</label>
            <select
              value={uploadMonth}
              onChange={(e) => setUploadMonth(parseInt(e.target.value, 10))}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm text-white"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                <option key={m} value={m}>{monthNames[m]} ({String(m).padStart(2, '0')})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Option A: Select CSV File</label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setSelectedFile(e.target.files[0])}
            className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-white w-full"
          />
        </div>

        <div className="mb-4">
          <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Option B: Or Paste List Text</label>
          <textarea
            rows="4"
            value={uploadText}
            onChange={(e) => setUploadText(e.target.value)}
            placeholder="Brian Cook 15..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-xs text-white font-mono"
          />
        </div>

        <button
          onClick={processUpload}
          className="w-full bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-2.5 rounded-lg transition text-sm cursor-pointer uppercase"
        >
          Process Attendance Upload
        </button>

        {uploadStatus.msg && (
          <div className={`mt-3 text-center text-xs font-semibold ${uploadStatus.type === 'error' ? 'text-red-400' : uploadStatus.type === 'success' ? 'text-green-400' : 'text-amber-400'}`}>
            {uploadStatus.msg}
          </div>
        )}
      </div>
    </section>
  );
}
