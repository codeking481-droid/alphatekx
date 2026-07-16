import React from "react";

export default function GlassBackground({ children }) {
  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: "linear-gradient(145deg, #F8F9FF 0%, #EEF2FF 45%, #F5F3FF 100%)" }}>
      {/* Aurora blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute rounded-full" style={{ width: 600, height: 600, top: -100, left: -100, background: "radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)", filter: "blur(120px)" }} />
        <div className="absolute rounded-full" style={{ width: 800, height: 800, top: -200, right: -200, background: "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)", filter: "blur(150px)" }} />
        <div className="absolute rounded-full" style={{ width: 500, height: 500, bottom: 0, left: "40%", background: "radial-gradient(circle, rgba(6,182,212,0.15) 0%, transparent 70%)", filter: "blur(100px)" }} />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}