import React, { useEffect, useState } from "react";

export default function AppVersion() {
  const [version, setVersion] = useState("");

  useEffect(() => {
    fetch("/version.json?t=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.version) setVersion(d.version);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="text-[10px] text-gray-400 font-mono">
      {version ? `v${version}` : ""}
    </div>
  );
}