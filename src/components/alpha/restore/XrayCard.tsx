import { motion } from 'framer-motion'
import { Activity, AlertTriangle, AlertCircle, Info, GitBranch, Database, Globe, Server, Shield, Clock, Layers, Package, Zap } from 'lucide-react'

type Risk = {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  message: string
  file?: string
  suggestion: string
}

type FailurePattern = {
  pattern: string
  description: string
  files: string[]
  severity: string
}

type RecentChange = {
  commit: string
  author: string
  date: string
  message: string
}

type ArchLayer = {
  name: string
  files: string[]
  tech: string[]
}

type Vulnerability = {
  id: string
  package: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  summary: string
  fixedVersion?: string
  source: 'npm-audit' | 'osv'
  aliases: string[]
}

type BlastRadius = {
  package: string
  severity: string
  affectedFiles: string[]
  affectedLayers: string[]
  totalImpact: number
}

type EnrichedGraph = {
  layers: ArchLayer[]
  apiEndpoints: { method: string; path: string; file: string }[]
  dbTables: { name: string; type: string }[]
  componentDeps: any[]
  blastRadius: BlastRadius[]
  inferences: string[]
}

export type XrayData = {
  healthScore: number
  grade: string
  summary: string
  risks: Risk[]
  failurePatterns: FailurePattern[]
  recentChanges: RecentChange[]
  stats: {
    totalRisks: number
    criticalRisks: number
    highRisks: number
    mediumRisks: number
    lowRisks: number
    recentCommits: number
    filesChangedRecently: number
  }
  vulnerabilities: Vulnerability[]
  enrichedGraph: EnrichedGraph
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-red-400'
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-green-400/10 border-green-400/20'
  if (score >= 50) return 'bg-amber-400/10 border-amber-400/20'
  return 'bg-red-400/10 border-red-400/20'
}

function severityIcon(severity: string) {
  if (severity === 'critical') return <AlertCircle size={12} className="text-red-400" />
  if (severity === 'high') return <AlertTriangle size={12} className="text-orange-400" />
  if (severity === 'medium') return <Info size={12} className="text-amber-400" />
  return <Info size={12} className="text-white/40" />
}

function severityBg(severity: string): string {
  if (severity === 'critical') return 'border-red-400/15 bg-red-400/[0.04]'
  if (severity === 'high') return 'border-orange-400/15 bg-orange-400/[0.04]'
  if (severity === 'medium') return 'border-amber-400/15 bg-amber-400/[0.04]'
  return 'border-white/[0.06] bg-white/[0.02]'
}

const LAYER_ICONS: Record<string, any> = {
  Frontend: Globe,
  API: Server,
  Services: Layers,
  DB: Database,
  Infra: Shield,
}

export default function XrayCard({ data }: { data: XrayData }) {
  const { healthScore, grade, summary, risks, failurePatterns, recentChanges, stats, vulnerabilities, enrichedGraph } = data

  const criticalVulns = vulnerabilities.filter(v => v.severity === 'critical')
  const highVulns = vulnerabilities.filter(v => v.severity === 'high')
  const mediumVulns = vulnerabilities.filter(v => v.severity === 'medium')

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <div className="grid size-8 place-items-center rounded-lg bg-[#D6FF00]/10">
          <Activity size={14} className="text-[#D6FF00]" />
        </div>
        <div className="flex-1">
          <h4 className="text-[13px] font-bold text-white">SYSTEM X-RAY</h4>
          <p className="mt-0.5 text-[11px] text-white/30">Architecture analysis & health detection</p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Health Score */}
        <div className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${scoreBg(healthScore)}`}>
          <div className="text-center">
            <div className={`font-syne text-3xl font-extrabold ${scoreColor(healthScore)}`}>{healthScore}</div>
            <div className="text-[10px] text-white/30">/100</div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-[14px] font-bold ${scoreColor(healthScore)}`}>Grade {grade}</span>
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/40">
                {stats.criticalRisks > 0 ? `${stats.criticalRisks} critical` : stats.highRisks > 0 ? `${stats.highRisks} high risks` : 'healthy'}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-white/50 leading-relaxed">{summary}</p>
          </div>
        </div>

        {/* Architecture Layers */}
        {enrichedGraph?.layers && (
          <div>
            <h5 className="mb-2 text-[11px] font-medium text-white/40">Architecture Layers</h5>
            <div className="flex flex-wrap gap-2">
              {enrichedGraph.layers.filter((l: any) => l.files.length > 0 || l.tech.length > 0).map((layer: any) => {
                const Icon = LAYER_ICONS[layer.name] || Layers
                return (
                  <div key={layer.name} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                    <Icon size={12} className="text-[#D6FF00]/60" />
                    <div>
                      <div className="text-[11px] font-bold text-white/80">{layer.name}</div>
                      <div className="text-[10px] text-white/30">
                        {layer.files.length} files{layer.tech.length > 0 ? ` · ${layer.tech.join(', ')}` : ''}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Layer flow arrows */}
            {enrichedGraph.layers.filter((l: any) => l.files.length > 0).length > 1 && (
              <div className="mt-2 flex items-center gap-1 text-[10px] text-white/20">
                {enrichedGraph.layers.filter((l: any) => l.files.length > 0).map((l: any, i: number, arr: any[]) => (
                  <span key={l.name} className="flex items-center gap-1">
                    <span className="text-white/40">{l.name}</span>
                    {i < arr.length - 1 && <span className="text-[#D6FF00]/30">→</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-center">
            <div className="text-[14px] font-bold text-white/80">{enrichedGraph?.apiEndpoints?.length || 0}</div>
            <div className="text-[10px] text-white/30">API Routes</div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-center">
            <div className="text-[14px] font-bold text-white/80">{enrichedGraph?.dbTables?.length || 0}</div>
            <div className="text-[10px] text-white/30">DB Tables</div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-center">
            <div className="text-[14px] font-bold text-white/80">{stats.filesChangedRecently}</div>
            <div className="text-[10px] text-white/30">Recent Changes</div>
          </div>
        </div>

        {/* Dependency Intelligence */}
        {vulnerabilities.length > 0 && (
          <div>
            <h5 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-white/40">
              <Package size={11} /> DEPENDENCY INTELLIGENCE
            </h5>

            {/* Vulnerability Summary */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className={`rounded-lg border px-2 py-1.5 text-center ${criticalVulns.length > 0 ? 'border-red-400/30 bg-red-400/10' : 'border-white/[0.06] bg-white/[0.03]'}`}>
                <div className={`text-[12px] font-bold ${criticalVulns.length > 0 ? 'text-red-400' : 'text-white/60'}`}>{criticalVulns.length}</div>
                <div className="text-[9px] text-white/30">Critical</div>
              </div>
              <div className={`rounded-lg border px-2 py-1.5 text-center ${highVulns.length > 0 ? 'border-orange-400/30 bg-orange-400/10' : 'border-white/[0.06] bg-white/[0.03]'}`}>
                <div className={`text-[12px] font-bold ${highVulns.length > 0 ? 'text-orange-400' : 'text-white/60'}`}>{highVulns.length}</div>
                <div className="text-[9px] text-white/30">High</div>
              </div>
              <div className={`rounded-lg border px-2 py-1.5 text-center ${mediumVulns.length > 0 ? 'border-amber-400/30 bg-amber-400/10' : 'border-white/[0.06] bg-white/[0.03]'}`}>
                <div className={`text-[12px] font-bold ${mediumVulns.length > 0 ? 'text-amber-400' : 'text-white/60'}`}>{mediumVulns.length}</div>
                <div className="text-[9px] text-white/30">Medium</div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1.5 text-center">
                <div className="text-[12px] font-bold text-white/60">{vulnerabilities.length}</div>
                <div className="text-[9px] text-white/30">Total</div>
              </div>
            </div>

            {/* Blast Radius */}
            {enrichedGraph?.blastRadius && enrichedGraph.blastRadius.length > 0 && (
              <div className="mb-3">
                <h6 className="mb-1.5 text-[10px] font-medium text-white/30">BLAST RADIUS</h6>
                <div className="space-y-1.5">
                  {enrichedGraph.blastRadius.slice(0, 5).map((blast: BlastRadius, i: number) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                      <Zap size={10} className={blast.severity === 'critical' ? 'text-red-400' : blast.severity === 'high' ? 'text-orange-400' : 'text-amber-400'} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-white/80">{blast.package}</span>
                          <span className={`rounded px-1 py-0.5 text-[8px] font-bold ${
                            blast.severity === 'critical' ? 'bg-red-400/20 text-red-400' :
                            blast.severity === 'high' ? 'bg-orange-400/20 text-orange-400' :
                            'bg-amber-400/20 text-amber-400'
                          }`}>
                            {blast.severity.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[10px] text-white/40">
                          Affects {blast.totalImpact} files across {blast.affectedLayers.join(', ') || 'multiple layers'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Critical/High Vulnerabilities List */}
            {(criticalVulns.length > 0 || highVulns.length > 0) && (
              <div>
                <h6 className="mb-1.5 text-[10px] font-medium text-white/30">ACTION REQUIRED</h6>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {[...criticalVulns, ...highVulns].slice(0, 8).map((vuln, i) => (
                    <div key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
                      vuln.severity === 'critical' ? 'border-red-400/15 bg-red-400/[0.04]' : 'border-orange-400/15 bg-orange-400/[0.04]'
                    }`}>
                      {vuln.severity === 'critical' ? (
                        <AlertCircle size={10} className="mt-0.5 text-red-400" />
                      ) : (
                        <AlertTriangle size={10} className="mt-0.5 text-orange-400" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-white/80">{vuln.package}</span>
                          <span className="text-[9px] text-white/30">{vuln.source}</span>
                        </div>
                        <p className="text-[10px] text-white/50 leading-relaxed">{vuln.summary}</p>
                        {vuln.fixedVersion && (
                          <p className="mt-0.5 text-[10px] text-green-400/70">Fix: update to v{vuln.fixedVersion}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Risks */}
        {risks.length > 0 && (
          <div>
            <h5 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-white/40">
              <AlertTriangle size={11} /> Risks ({risks.length})
            </h5>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {risks.slice(0, 10).map((risk) => (
                <div key={risk.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${severityBg(risk.severity)}`}>
                  {severityIcon(risk.severity)}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-white/70 leading-relaxed">{risk.message}</p>
                    {risk.file && <p className="mt-0.5 text-[10px] text-white/30 font-mono">{risk.file}</p>}
                    <p className="mt-0.5 text-[10px] text-white/40">{risk.suggestion}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Failure Patterns */}
        {failurePatterns.length > 0 && (
          <div>
            <h5 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-white/40">
              <AlertCircle size={11} /> Failure Patterns ({failurePatterns.length})
            </h5>
            <div className="space-y-1.5">
              {failurePatterns.map((p, i) => (
                <div key={i} className={`rounded-lg border px-3 py-2 ${severityBg(p.severity)}`}>
                  <p className="text-[11px] text-white/70">{p.description}</p>
                  {p.files.length > 0 && (
                    <p className="mt-1 text-[10px] text-white/30 font-mono">{p.files.slice(0, 3).join(', ')}{p.files.length > 3 ? ` +${p.files.length - 3}` : ''}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Changes */}
        {recentChanges.length > 0 && (
          <div>
            <h5 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-white/40">
              <Clock size={11} /> Recent Commits
            </h5>
            <div className="space-y-1">
              {recentChanges.slice(0, 5).map((c) => (
                <div key={c.commit} className="flex items-center gap-2 text-[11px]">
                  <span className="shrink-0 font-mono text-white/30">{c.commit}</span>
                  <span className="truncate text-white/50">{c.message}</span>
                  <span className="shrink-0 text-white/20">{c.author}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Inferences */}
        {enrichedGraph?.inferences && enrichedGraph.inferences.length > 0 && (
          <div>
            <h5 className="mb-2 text-[11px] font-medium text-white/40">AI Inferences</h5>
            <div className="space-y-1">
              {enrichedGraph.inferences.slice(0, 5).map((inf: string, i: number) => (
                <div key={i} className="rounded-lg border border-[#D6FF00]/10 bg-[#D6FF00]/[0.02] px-3 py-2">
                  <p className="text-[11px] text-white/50 leading-relaxed">{inf}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
