import React, { useEffect, useState } from "react";

export default function AppVersion() {
  const [version, setVersion] = useState("");

  useEffect(() => {
    fetch("/version.json?t=" + Date.now(), { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setVersion(d.version || ""))
      .catch(() => {});
  }, []);

  if (!version) return null;

  return (
    <div className="text-[10px] text-gray-400 font-mono">
      v{version}
    </div>
  );
}