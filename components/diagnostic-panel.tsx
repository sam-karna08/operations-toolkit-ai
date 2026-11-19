"use client";

import {
  Activity,
  ArrowRight,
  Check,
  ChevronDown,
  CircleDot,
  Lightbulb,
  Network,
  ShieldAlert,
  Target,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { OperationsDiagnostic } from "@/lib/diagnostic";

function Badge({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "orange" | "purple" | "red" }) {
  const colors = {
    green: "border border-[#53d5c6]/20 bg-[#14323a] text-[#83e2d7]",
    orange: "border border-[#e9af69]/20 bg-[#342719] text-[#f0c386]",
    purple: "border border-[#a496ff]/20 bg-[#25223c] text-[#c2b9ff]",
    red: "border border-[#f2a088]/20 bg-[#351f23] text-[#f2b1a1]",
  };
  return <span className={`rounded-full px-2 py-1 text-[8px] font-bold tracking-[0.35px] ${colors[tone]}`}>{children}</span>;
}

function SectionTitle({ icon, title, detail }: { icon: ReactNode; title: string; detail?: string }) {
  return <div className="mb-3 flex items-start gap-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#53d5c6]/15 bg-[#12313a] text-[#75dcd2]">{icon}</span><div><h3 className="text-[13px] font-semibold text-[#dcebed]">{title}</h3>{detail && <p className="mt-0.5 text-[9px] text-[#8ba3ab]">{detail}</p>}</div></div>;
}

function displayedContext(value: string) {
  return !value.trim() || value.trim().toLocaleLowerCase() === "unknown"
    ? "Not specified in the input."
    : value;
}

export function DiagnosticPanel({ diagnostic }: { diagnostic: OperationsDiagnostic }) {
  const [expandedFactor, setExpandedFactor] = useState(0);
  const [showEvidence, setShowEvidence] = useState(false);
  const [selectedMapNode, setSelectedMapNode] = useState<string | null>(null);
  const supportedFacts = diagnostic.evidenceItems.filter((item) => item.status === "SUPPORTED").slice(0, 3);
  const validationItems = diagnostic.evidenceItems.filter((item) => item.status === "VALIDATION REQUIRED").slice(0, 3);
  const mapStages = [
    { key: "signal", label: "User-reported signal", detail: supportedFacts[0]?.statement ?? diagnostic.problemBrief.problemStatement, tone: "cyan" },
    { key: "hypothesis", label: "Possible drivers", detail: diagnostic.causalFactors.slice(0, 2).map((factor) => factor.title).join(" · ") || "No cause established", tone: "violet" },
    { key: "evidence", label: "Evidence to validate", detail: validationItems[0]?.statement ?? "Additional evidence is required.", tone: "amber" },
    { key: "action", label: "Proposed next step", detail: diagnostic.recommendedActions[0]?.action ?? "Review the evidence before acting.", tone: "green" },
  ];
  const selectedNode = mapStages.find(({ key }) => key === selectedMapNode);
  return (
    <section className="fade-in mt-7">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#53d5c6]/15 bg-[#102932] px-2.5 py-1 text-[9px] font-semibold text-[#7bded3]"><CircleDot size={11} /> AI OPERATIONS DIAGNOSTIC</div>
          <h2 className="text-[22px] font-semibold tracking-[-0.6px] text-[#e2eff1]">From evidence to a decision</h2>
          <p className="mt-1 text-[10px] text-[#8ba3ab]">Facts, hypotheses, and evidence requests remain visibly distinct.</p>
        </div>
        <Badge tone={diagnostic.mode === "DEMO / FALLBACK" ? "orange" : "green"}>{diagnostic.mode}</Badge>
      </div>
      {diagnostic.notice && <p className="mb-3 rounded-lg border border-[#eabf77]/20 bg-[#261f18] px-3 py-2 text-[10px] text-[#e5c891]">{diagnostic.notice}</p>}

      <details className="mb-3 rounded-xl border border-white/[0.08] bg-[#0b1621]">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 text-[10px] font-semibold text-[#c2d5d9]">
          <span className="flex items-center gap-2"><Activity size={14} className="text-[#76dcd2]" /> Model and request details</span>
          <span className="text-[9px] font-normal text-[#8ba3ab]">{diagnostic.providerMetadata?.requestStatus === "success" ? "Provider response validated" : diagnostic.providerMetadata?.requestStatus === "fallback" ? "Fallback result · Gemini not validated" : "Provider metadata unavailable"}</span>
        </summary>
        <div className="grid gap-2 border-t border-white/[0.07] px-4 py-3 text-[9px] sm:grid-cols-2 lg:grid-cols-4">
          <p className="text-[#8ba3ab]"><span className="block font-semibold text-[#c6d9db]">Provider</span>{diagnostic.providerMetadata?.provider ?? "Unavailable"}</p>
          <p className="text-[#8ba3ab]"><span className="block font-semibold text-[#c6d9db]">Configured model</span><code className="break-all">{diagnostic.providerMetadata?.model ?? "Unavailable"}</code></p>
          <p className="text-[#8ba3ab]"><span className="block font-semibold text-[#c6d9db]">Runtime</span>{diagnostic.providerMetadata?.deployment ?? "Unavailable"} · {diagnostic.providerMetadata?.modelConfigSource ?? "Unavailable"}</p>
          <p className="text-[#8ba3ab]"><span className="block font-semibold text-[#c6d9db]">Request</span>{diagnostic.providerMetadata?.requestStatus ?? "Unavailable"}{diagnostic.providerMetadata ? ` · ${(diagnostic.providerMetadata.elapsedMs / 1000).toFixed(1)}s` : ""}</p>
          <p className="text-[#77919a] sm:col-span-2 lg:col-span-4">Gemini is an external model provider. Its output can be inaccurate; verify hypotheses against your operational data. No credentials or raw environment values are included here.</p>
        </div>
      </details>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[13px] border border-white/[0.08] bg-[#0d1925] p-4 sm:p-5">
          <SectionTitle icon={<Target size={15} />} title="Problem identified" detail="Carried forward from the confirmed Problem Brief" />
          <p className="text-[14px] font-medium leading-[1.65] text-[#d7e7e9]">{diagnostic.problemBrief.problemStatement}</p>
          <div className="mt-4 grid gap-x-4 gap-y-2 border-t border-white/[0.07] pt-3 sm:grid-cols-2">
            <p className="text-[9px] leading-[1.55] text-[#91a8af]"><strong className="text-[#c0d3d6]">Time period: </strong>{displayedContext(diagnostic.operationalContext.timePeriod)}</p>
            <p className="text-[9px] leading-[1.55] text-[#91a8af]"><strong className="text-[#c0d3d6]">Process: </strong>{displayedContext(diagnostic.operationalContext.processInvolved)}</p>
            <p className="text-[9px] leading-[1.55] text-[#91a8af] sm:col-span-2"><strong className="text-[#c0d3d6]">Stakeholders: </strong>{diagnostic.operationalContext.stakeholders.map(displayedContext).join(", ") || "Not specified in the input."}</p>
          </div>
        </article>
        <article className="rounded-[13px] border border-[#62d4ca]/15 bg-[linear-gradient(140deg,#10242e,#10212c)] p-4 sm:p-5">
          <SectionTitle icon={<ArrowRight size={15} />} title="Executive diagnosis" detail="Management readout based on stated facts and unconfirmed causes" />
          <p className="text-[12px] leading-[1.8] text-[#bfd3d6]">{diagnostic.executiveSummary}</p>
        </article>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <article className="rounded-[13px] border border-white/[0.08] bg-[#0d1925] p-4 sm:p-5">
          <SectionTitle icon={<ArrowRight size={15} />} title="Prioritized investigations" detail="Three evidence-led checks, ordered by decision value" />
          <ol className="flex flex-col gap-3">
            {diagnostic.investigationPriorities.slice(0, 3).map((item) => <li key={item.order} className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#15343b] text-[9px] font-bold text-[#80e1d7]">{item.order}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#d0e0e2]">{item.action}</p>
                <p className="mt-1 text-[10px] leading-[1.6] text-[#9bb0b6]">{item.whyItMatters ?? item.reason}</p>
                <p className="mt-1 text-[9px] leading-[1.55] text-[#8ba1a8]"><strong className="text-[#b5c9cc]">Validate with:</strong> {item.evidenceRequired ?? "Evidence not specified."}</p>
                {item.owner && <p className="mt-1 text-[9px] text-[#8ba1a8]"><strong className="text-[#b5c9cc]">Suggested owner:</strong> {item.owner}</p>}
              </div>
            </li>)}
          </ol>
        </article>
        <article className="rounded-[13px] border border-[#53d5c6]/15 bg-[#0c1924] p-4 sm:p-5">
          <SectionTitle icon={<Check size={15} />} title="Corrective actions" detail="Practical next steps; verify before scaling or quantifying impact" />
          <ol className="flex flex-col gap-3">
            {diagnostic.recommendedActions.slice(0, 3).map((action, index) => <li key={action.action} className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#14323a] text-[9px] font-bold text-[#80e1d7]">{index + 1}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#d0e0e2]">{action.action}</p>
                <p className="mt-1 text-[10px] leading-[1.6] text-[#9bb0b6]">{action.reason}</p>
                <p className="mt-1 text-[9px] leading-[1.55] text-[#8ba1a8]"><strong className="text-[#b5c9cc]">Expected impact:</strong> {action.expectedImpact}</p>
                <p className="mt-1 text-[9px] leading-[1.55] text-[#8ba1a8]"><strong className="text-[#b5c9cc]">Validate with:</strong> {action.evidenceRequired}</p>
                <p className="mt-1 text-[9px] text-[#8ba1a8]"><strong className="text-[#b5c9cc]">Suggested owner:</strong> {action.owner}</p>
              </div>
            </li>)}
          </ol>
        </article>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[13px] border border-white/[0.08] bg-[#0d1925] p-4 sm:p-5">
          <SectionTitle icon={<Lightbulb size={15} />} title="Possible root-cause areas" detail="Hypotheses only — validate before treating them as causes" />
          <div className="flex flex-col gap-2">
            {diagnostic.causalFactors.map((factor, index) => <div key={factor.title} className="rounded-lg border border-white/[0.07] bg-[#101d29]">
              <button onClick={() => setExpandedFactor(expandedFactor === index ? -1 : index)} className="flex w-full items-start gap-3 p-3 text-left">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#342719] text-[9px] font-bold text-[#f0c386]">{index + 1}</span>
                <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-1.5"><span className="text-[11px] font-semibold text-[#d4e3e5]">{factor.title}</span><Badge tone={factor.priority === "High" ? "orange" : "purple"}>{factor.priority} · {factor.confidence}</Badge></span><span className="mt-1 block text-[9px] leading-[1.6] text-[#9bb0b6]">{factor.description}</span></span>
                <ChevronDown size={14} className={`shrink-0 text-[#8199a1] transition-transform ${expandedFactor === index ? "rotate-180" : ""}`} />
              </button>
              {expandedFactor === index && <div className="border-t border-white/[0.07] px-3 pb-3 pt-2.5"><p className="text-[8px] font-bold uppercase tracking-[0.5px] text-[#89a0a8]">Evidence mentioned</p><ul className="mt-1 space-y-1">{factor.evidence.map((item) => <li key={item} className="text-[9px] leading-[1.55] text-[#a4b7bc]">• {item}</li>)}</ul><p className="mt-2 text-[8px] font-bold uppercase tracking-[0.5px] text-[#89a0a8]">Validation required</p><ul className="mt-1 space-y-1">{factor.validationRequired.map((item) => <li key={item} className="text-[9px] leading-[1.55] text-[#a4b7bc]">• {item}</li>)}</ul></div>}
            </div>)}
          </div>
        </article>

        <article className="rounded-[13px] border border-white/[0.08] bg-[#0d1925] p-4 sm:p-5">
          <SectionTitle icon={<Network size={15} />} title="Decision path" detail="Select a node to inspect its evidence status" />
          <div className="grid gap-2 sm:grid-cols-2">
            {mapStages.map((stage, index) => {
              const isSelected = selectedMapNode === stage.key;
              const tone = stage.tone === "violet" ? "border-[#9c91ff]/25 bg-[#211f35] text-[#c8c0ff]" : stage.tone === "amber" ? "border-[#e7b66c]/25 bg-[#2c241a] text-[#efd19e]" : stage.tone === "green" ? "border-[#52d2a7]/25 bg-[#142c29] text-[#99e5c4]" : "border-[#55cbd5]/25 bg-[#122a33] text-[#a5e5e9]";
              return <button key={stage.key} type="button" aria-pressed={isSelected} onClick={() => setSelectedMapNode(isSelected ? null : stage.key)} className={`relative min-h-[92px] rounded-xl border p-3 text-left transition-colors hover:brightness-110 ${tone} ${isSelected ? "ring-1 ring-white/40" : ""}`}>
                <span className="flex items-center justify-between gap-2 text-[8px] font-bold uppercase tracking-[0.8px]">{stage.label}<span className="text-[8px] opacity-60">{String(index + 1).padStart(2, "0")}</span></span>
                <span className="mt-2 line-clamp-3 block text-[9px] leading-[1.55] text-[#d0dfe1]">{stage.detail}</span>
              </button>;
            })}
          </div>
          <div className="mt-2 flex items-center justify-center gap-1 text-[8px] text-[#78949d]"><span>reported</span><ArrowRight size={10} /><span>hypothesized</span><ArrowRight size={10} /><span>test</span><ArrowRight size={10} /><span>proposed action</span></div>
          {selectedNode && <p role="status" className="mt-2 rounded-lg border border-white/[0.07] bg-black/10 p-2.5 text-[9px] leading-[1.6] text-[#a7bdc2]"><strong className="text-[#e1edef]">{selectedNode.label}: </strong>{selectedNode.detail}{selectedNode.key === "evidence" && " These are required checks, not completed validations."}</p>}
        </article>
      </div>

      <article className="mt-3 rounded-[13px] border border-white/[0.08] bg-[#0d1925] p-4 sm:p-5">
        <SectionTitle icon={<ShieldAlert size={15} />} title="Evidence status" detail="Keep confirmed information separate from hypotheses." />
        <div className="grid gap-2 sm:grid-cols-3">
          {(["SUPPORTED", "HYPOTHESIS", "VALIDATION REQUIRED"] as const).map((status) => <div key={status} className="rounded-lg border border-white/[0.05] bg-[#101d29] p-3"><Badge tone={status === "SUPPORTED" ? "green" : status === "HYPOTHESIS" ? "orange" : "purple"}>{status}</Badge><p className="mt-2 text-[9px] leading-[1.6] text-[#9bb0b6]">{diagnostic.evidenceItems.filter((item) => item.status === status).slice(0, 2).map((item) => item.statement).join(" ") || "None recorded."}</p></div>)}
        </div>
        <button onClick={() => setShowEvidence((visible) => !visible)} className="mt-3 text-[9px] font-semibold text-[#75d8d0] hover:underline">{showEvidence ? "Hide evidence list" : "View evidence list"}</button>
        {showEvidence && <div className="mt-2 border-t border-white/[0.07] pt-2">{diagnostic.evidenceItems.map((item) => <p key={`${item.status}-${item.statement}`} className="py-1 text-[9px] leading-[1.55] text-[#9bb0b6]"><strong className="text-[#c2d5d8]">{item.status}: </strong>{item.statement} <span className="text-[#718990]">({item.source})</span></p>)}</div>}
      </article>

      <article className="mt-3 rounded-[13px] border border-white/[0.08] bg-[#0d1925] p-4 sm:p-5">
        <SectionTitle icon={<Check size={15} />} title="Frameworks applied by AI" detail="Analytical methods selected for this problem" />
        <div className="flex flex-wrap gap-2">{diagnostic.frameworksApplied.map((framework) => <div key={framework.name} className="rounded-lg border border-white/[0.08] bg-[#101d29] px-2.5 py-2"><p className="text-[10px] font-semibold text-[#cbdcde]">{framework.name}</p><p className="mt-1 text-[8px] leading-[1.5] text-[#91a7ae]">{framework.reasonSelected}</p>{framework.keyInsight && <p className="mt-1 text-[8px] leading-[1.5] text-[#7f989f]">{framework.keyInsight}</p>}</div>)}</div>
      </article>
    </section>
  );
}
