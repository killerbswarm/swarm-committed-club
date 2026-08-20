import React from 'react';

export default function Settings({ appSettings, saveSettings }) {
  return (
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
          <label className="block text-xs uppercase font-bold text-amber-400 mb-1">Winner webhook</label>
          <p className="text-xs text-gray-400">
            {import.meta.env.VITE_ZAPIER_WEBHOOK
              ? "Loaded from .env (VITE_ZAPIER_WEBHOOK)"
              : "Missing — add VITE_ZAPIER_WEBHOOK to .env and restart Vite"}
          </p>
        </div>
      </div>
    </section>
  );
}
