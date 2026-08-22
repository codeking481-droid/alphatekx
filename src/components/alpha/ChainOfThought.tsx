import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Search,
  Wrench,
  FlaskConical,
  Globe,
  Film,
  Shield,
  Cpu,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Clock,
  Circle,
} from "lucide-react";

export type ThoughtStep = {
  id: string;
  label: string;
  icon: string;
  status: string;
  summary?: string;
  details?: string[];
  logs?: string[];
  tavilySources?: { title: string; url: string; score?: number; snippet: string }[];
};

// Every engine (V1/V2/V4) may emit its own icon names — an unknown one must
// fall back gracefully instead of rendering an undefined component
// (which crashes the entire app).
const ICON_MAP: Record<string, React.FC<{ size?: number; className?: string }>> = {
  scan: Brain,
  diagnose: Search,
  plan: Wrench,
  test: FlaskConical,
  search: Globe,
  film: Film,
  shield: Shield,
  fix: Cpu,
  clock: Clock,
  crawl: Globe,
  browser: Globe,
  verify: CheckCircle2,
  repair: Wrench,
  deliver: CheckCircle2,
  memory: Brain,
};
const FALLBACK_ICON = Clock;

function StepIconFor(icon: string): React.FC<{ size?: number; className?: string }> {
  return ICON_MAP[icon] || FALLBACK_ICON;
}

// Engines may attach rich objects (diagnosis results, etc.) to summary/details.
// React crashes with error #31 if an object is rendered as a child — coerce
// everything to plain text before it touches the DOM.
function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    const s = (value as { summary?: unknown }).summary;
    if (typeof s === "string" && s.trim()) return s;
    try { return JSON.stringify(value); } catch { return ""; }
  }
  return String(value);
}

const STATUS_COLORS: Record<string, string> = {
  pending: "border-zinc-600 bg-zinc-800/40",
  active: "border-[#D6FF00]/60 bg-[#D6FF00]/5",
  done: "border-emerald-500/60 bg-emerald-500/5",
  error: "border-red-500/60 bg-red-500/5",
};

const STEP_ICON_COLORS: Record<string, string> = {
  pending: "text-zinc-500",
  active: "text-[#D6FF00]",
  done: "text-emerald-400",
  error: "text-red-400",
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function StatusDot({ status }: { status: string }) {
  const dotStatus = (["pending", "active", "done", "error"].includes(status) ? status : "pending") as "pending" | "active" | "done" | "error";
  return (
    <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
      {dotStatus === "active" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
      )}
      {dotStatus === "active" && (
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(74,222,128,0.6)]" />
      )}
      {dotStatus === "done" && (
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_3px_rgba(74,222,128,0.5)]" />
      )}
      {dotStatus === "error" && (
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_10px_3px_rgba(239,68,68,0.5)]" />
      )}
      {dotStatus === "pending" && (
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-zinc-500 bg-transparent" />
      )}
    </span>
  );
}

function StepIcon({ icon, status }: { icon: string; status: string }) {
  const IconComponent = StepIconFor(icon);
  const safeStatus = ["pending", "active", "done", "error"].includes(status) ? status : "pending";
  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-lg border ${STATUS_COLORS[safeStatus]} ${STEP_ICON_COLORS[safeStatus]}`}
    >
      <IconComponent size={16} />
    </div>
  );
}

function ThoughtStepComponent({
  step,
  index,
  isLast,
}: {
  step: ThoughtStep;
  index: number;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasExpandable = (step.details && (Array.isArray(step.details) ? step.details.length > 0 : true)) || (step.logs && step.logs.length > 0) || (step.tavilySources && step.tavilySources.length > 0);

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: index * 0.08, ease: [0.23, 1, 0.32, 1] }}
      className="relative flex gap-3"
    >
      <div className="flex flex-col items-center">
        <StatusDot status={step.status} />
        {!isLast && (
          <div className="mt-1 w-px flex-1 bg-gradient-to-b from-zinc-600/80 to-transparent" />
        )}
      </div>

      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2">
          <StepIcon icon={step.icon} status={step.status} />
          <span
            className={`text-sm italic ${
              step.status === "active"
                ? "text-zinc-200"
                : step.status === "done"
                  ? "text-zinc-400"
                  : step.status === "error"
                    ? "text-red-300"
                    : "text-zinc-500"
            }`}
          >
            {step.label}
          </span>
          {step.status === "active" && (
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="ml-1 inline-block h-1 w-1 rounded-full bg-[#D6FF00]"
            />
          )}
          {step.status === "error" && (
            <AlertCircle size={14} className="ml-1 text-red-400" />
          )}
          {step.status === "done" && (
            <CheckCircle2 size={14} className="ml-1 text-emerald-400" />
          )}
        </div>

        {step.summary && (
          <p className="mt-1 pl-10 text-xs text-zinc-400 italic leading-relaxed">{toText(step.summary)}</p>
        )}

        {hasExpandable && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 ml-10 flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={12} />
            </motion.span>
            {expanded ? "Less" : "Details"}
          </button>
        )}

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-2 ml-10 rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-3 space-y-2">
                {step.details && (
                  <div className="space-y-1">
                    {(Array.isArray(step.details) ? step.details : [step.details]).map((d, i) => (
                      <p key={i} className="text-xs text-zinc-300 leading-relaxed">{toText(d)}</p>
                    ))}
                  </div>
                )}

                {step.logs && step.logs.length > 0 && (
                  <div className="rounded-md bg-black/40 p-2 max-h-32 overflow-y-auto">
                    <p className="mb-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                      Logs
                    </p>
                    {step.logs.map((log, i) => (
                      <p key={i} className="font-mono text-[11px] text-zinc-400 leading-relaxed">
                        <span className="text-zinc-600">{">"} </span>
                        {toText(log)}
                      </p>
                    ))}
                  </div>
                )}

                {step.tavilySources && step.tavilySources.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                      Sources
                    </p>
                    {step.tavilySources.map((src, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-zinc-700/30 bg-zinc-800/30 p-2"
                      >
                        <p className="text-[11px] text-zinc-200 font-medium truncate">{src.title}</p>
                        <p className="text-[10px] text-zinc-500 truncate">{src.url}</p>
                        {src.snippet && (
                          <p className="mt-1 text-[10px] text-zinc-400 italic leading-relaxed">
                            {src.snippet}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

interface ChainOfThoughtProps {
  steps: ThoughtStep[];
  isActive?: boolean;
  startTime?: number | null;
  className?: string;
}

export default function ChainOfThought({
  steps,
  isActive: isActiveProp,
  startTime: startTimeProp,
  className = "",
}: ChainOfThoughtProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(startTimeProp || Date.now());

  const hasActiveStep = steps.some((s) => s.status === "active");
  const allDone = steps.length > 0 && steps.every((s) => s.status === "done" || s.status === "error");
  const isActive = isActiveProp ?? hasActiveStep;

  const startTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isActive) {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      startTimer();
    } else {
      stopTimer();
    }
    return stopTimer;
  }, [isActive, startTimer, stopTimer]);

  const displayDuration = elapsed > 0 ? elapsed : 0;

  const headerIcon = (() => {
    if (isActive) return <Brain size={16} className="text-[#D6FF00]" />;
    const allDone = steps.length > 0 && steps.every((s) => s.status === "done");
    if (allDone) return <CheckCircle2 size={16} className="text-emerald-400" />;
    const hasError = steps.some((s) => s.status === "error");
    if (hasError) return <AlertCircle size={16} className="text-red-400" />;
    return <Brain size={16} className="text-zinc-400" />;
  })();

  const headerLabel = isActive
    ? `Thinking... ${formatDuration(displayDuration)}`
    : displayDuration > 0
      ? `Thought for ${formatDuration(displayDuration)}`
      : "Chain of Thought";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className={`relative overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-950 shadow-2xl ${className}`}
      style={{ borderLeft: "3px solid #D6FF00" }}
    >
      {isActive && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{
            background: [
              "linear-gradient(90deg, transparent 0%, rgba(214,255,0,0.03) 50%, transparent 100%)",
              "linear-gradient(90deg, transparent 0%, rgba(214,255,0,0.06) 50%, transparent 100%)",
              "linear-gradient(90deg, transparent 0%, rgba(214,255,0,0.03) 50%, transparent 100%)",
            ],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {isActive && (
        <motion.div
          className="absolute top-0 left-0 h-full w-[2px]"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ background: "linear-gradient(180deg, #D6FF00, transparent)" }}
        />
      )}

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="relative z-10 flex w-full items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <motion.span
            animate={
              isActive
                ? { scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }
                : { scale: 1, opacity: 1 }
            }
            transition={
              isActive ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }
            }
          >
            {headerIcon}
          </motion.span>
          <span className="text-sm font-medium text-zinc-300 tracking-tight">{headerLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-600">
            {steps.filter((s) => s.status === "done").length}/{steps.length}
          </span>
          <motion.span animate={{ rotate: collapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={14} className="text-zinc-500" />
          </motion.span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="relative z-10 px-4 pb-4 pt-1">
              <div className="space-y-0">
                {steps.map((step, index) => (
                  <ThoughtStepComponent
                    key={step.id || `${index}-${step.label}`}
                    step={step}
                    index={index}
                    isLast={index === steps.length - 1}
                  />
                ))}
              </div>

              {steps.length === 0 && (
                <p className="py-4 text-center text-xs text-zinc-600 italic">No steps yet...</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
