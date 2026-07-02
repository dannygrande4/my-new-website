"use client";

import dynamic from "next/dynamic";

// three.js needs the browser — load the scene client-side only.
const AstronautScene = dynamic(() => import("./AstronautScene"), { ssr: false });

export default function AstronautLayer() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      <AstronautScene />
    </div>
  );
}
