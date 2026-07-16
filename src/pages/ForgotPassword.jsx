const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState } from "react";

import { Sparkles, Mail } from "lucide-react";
import { Link } from "react-router-dom";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try { await db.auth.resetPasswordRequest(email); } catch {}
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: "linear-gradient(145deg, #F8F9FF 0%, #EEF2FF 45%, #F5F3FF 100%)" }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute rounded-full" style={{ width: 600, height: 600, top: -100, left: -100, background: "radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)", filter: "blur(120px)" }} />
      </div>
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="p-8 rounded-3xl" style={{ background: "rgba(255,255,255,0.75)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.6)", boxShadow: "0 8px 32px rgba(0,0,0,0.06)" }}>
          <div className="flex items-center justify-center gap-2.5 mb-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}>
              <Sparkles className="w-5 h-5 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-2">Reset password</h2>
          <p className="text-sm text-slate-500 text-center mb-6">Enter your email and we'll send a reset link</p>
          {sent ? (
            <div className="text-center">
              <p className="text-sm text-emerald-600 mb-4">If an account exists, a reset link has been sent.</p>
              <Link to="/login" className="text-sm text-blue-500 font-medium no-underline">Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" required className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
              </div>
              <button type="submit" disabled={loading} className="w-full py-3 rounded-2xl text-sm font-semibold text-white border-0 cursor-pointer disabled:opacity-50" style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}>
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
              <p className="text-sm text-slate-500 text-center">
                <Link to="/login" className="text-blue-500 no-underline">Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}