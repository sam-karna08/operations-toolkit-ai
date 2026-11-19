"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  ShieldAlert,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useEffect } from "react";
import type { FrameworkApplication, FrameworkVisualizationGroup } from "@/lib/diagnostic";
import type { Framework } from "@/lib/frameworks";
import type { ProblemBrief } from "@/lib/problem-brief";

type Props = {
  framework: Framework;
  problemBrief: ProblemBrief | null;
  application: FrameworkApplication | null;
  loading: boolean;
  error: string;
  elapsedMs: number;
  onClose: () => void;
  onRetry: () => void;
  onDescribeProblem: () => void;
  onOpenFiveWhys: () => void;
};

function EvidencePill({ status }: { status: "SUPPORTED" | "HYPOTHESIS" | "VALIDATION REQUIRED" }) {
  const classes = status === "SUPPORTED"
    ? "border-[#9ccdc0] bg-[#e6f4ee] text-[#456f62]"
    : status === "HYPOTHESIS"
      ? "border-[#cfb5e7] bg-[#f2eafb] text-[#73508f]"
      : "border-[#e8c69f] bg-[#fff3e5] text-[#946c3e]";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[8px] font-bold tracking-[0.3px] ${classes}`}>{status}</span>;
}

function DiagramNode({ label, detail, status }: FrameworkVisualizationGroup["items"][number]) {
  return (
    <div className="framework-diagram-node">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4>{label}</h4>
        <EvidencePill status={status} />
      </div>
      <p>{detail}</p>
    </div>
  );
}

function FrameworkVisualization({ application }: { application: FrameworkApplication }) {
  const { visualization } = application;
  if (visualization.kind === "five-whys") {
    const chain = visualization.chain.length ? visualization.chain : [application.problem, ...application.hypotheses.map((item) => item.title)];
    return (
      <div className="framework-chain" aria-label="Problem-specific 5 Whys causal chain">
        {chain.map((item, index) => (
          <div className="framework-chain-step" key={`${index}-${item}`}>
            <span>{index === 0 ? "SIGNAL" : `WHY ${index}`}</span>
            <p>{item}</p>
            {index < chain.length - 1 && <ArrowDown size={14} aria-hidden="true" />}
          </div>
        ))}
        <p className="framework-diagram-note">Unverified links are investigative hypotheses, not confirmed root causes. Continue in the editable 5 Whys workspace to record your own evidence.</p>
      </div>
    );
  }

  if (visualization.kind === "sipoc") {
    return (
      <div className="framework-sipoc" aria-label="Problem-specific SIPOC map">
        {visualization.groups.map((group) => (
          <section key={group.label}>
            <span>{group.label}</span>
            {group.items.map((item) => <DiagramNode key={`${group.label}-${item.label}`} {...item} />)}
            {group.items.length === 0 && <p className="framework-empty-node">Not specified — clarify this process boundary.</p>}
          </section>
        ))}
      </div>
    );
  }

  if (visualization.kind === "process-map") {
    return (
      <div className="framework-process-map" aria-label="Problem-specific process map">
        {visualization.groups.map((group, index) => (
          <section key={`${index}-${group.label}`}>
            <span className="framework-step-number">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h4>{group.label}</h4>
              <div className="mt-2 grid gap-2">
                {group.items.map((item) => <DiagramNode key={`${group.label}-${item.label}`} {...item} />)}
              </div>
            </div>
            {index < visualization.groups.length - 1 && <ArrowRight className="framework-flow-arrow" size={18} aria-hidden="true" />}
          </section>
        ))}
      </div>
    );
  }

  if (visualization.kind === "swot" || visualization.kind === "matrix" || visualization.kind === "fishbone") {
    return (
      <div className={`framework-group-map framework-${visualization.kind}`} aria-label={`Problem-specific ${visualization.kind} analysis`}>
        {visualization.groups.map((group) => (
          <section key={group.label}>
            <h4>{group.label}</h4>
            {group.items.map((item) => <DiagramNode key={`${group.label}-${item.label}`} {...item} />)}
            {group.items.length === 0 && <p className="framework-empty-node">No supported item yet; gather evidence to complete this area.</p>}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className={`framework-group-map framework-${visualization.kind}`} aria-label={`Problem-specific ${visualization.kind} analysis`}>
      {visualization.groups.map((group, index) => (
        <section key={`${index}-${group.label}`}>
          <span className="framework-step-number">{String(index + 1).padStart(2, "0")}</span>
          <h4>{group.label}</h4>
          {group.items.map((item) => <DiagramNode key={`${group.label}-${item.label}`} {...item} />)}
          {group.items.length === 0 && <p className="framework-empty-node">No data supplied for this area.</p>}
        </section>
      ))}
    </div>
  );
}

export function FrameworkApplicationPanel({
  framework,
  problemBrief,
  application,
  loading,
  error,
  elapsedMs,
  onClose,
  onRetry,
  onDescribeProblem,
  onOpenFiveWhys,
}: Props) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const hasProblem = Boolean(problemBrief?.problemStatement.trim());
  return (
    <div className="framework-application-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="framework-application-title" className="framework-application-dialog">
        <header className="framework-application-header">
          <div className="framework-application-mark">{framework.icon}</div>
          <div className="min-w-0 flex-1">
            <p className="framework-app-eyebrow">{framework.category} · APPLIED ANALYSIS</p>
            <h2 id="framework-application-title">{framework.name}</h2>
            <p>{framework.description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close framework analysis" className="framework-close"><X size={18} /></button>
        </header>

        <div className="framework-application-content">
          <div className="framework-problem-banner">
            <Target size={14} />
            <div>
              <span>APPLIED TO YOUR PROBLEM</span>
              <p>{problemBrief?.problemStatement || "No business problem has been entered yet."}</p>
            </div>
          </div>

          {!hasProblem && (
            <div className="framework-empty-state">
              <CircleHelp size={25} />
              <h3>Start with a real operational signal</h3>
              <p>Enter a problem first so Gemini can apply {framework.name} to your context rather than return a generic example.</p>
              <button type="button" onClick={onDescribeProblem}>Describe a problem <ArrowRight size={14} /></button>
            </div>
          )}

          {loading && (
            <div className="framework-loading" role="status" aria-live="polite">
              <div className="framework-loading-art"><Sparkles size={20} /></div>
              <div>
                <h3>Applying {framework.name} to your evidence</h3>
                <p>Waiting for the configured Gemini provider. No partial analysis or model reasoning is displayed.</p>
              </div>
              <span><Clock3 size={13} /> {(elapsedMs / 1000).toFixed(1)}s</span>
            </div>
          )}

          {error && !loading && (
            <div className="framework-error" role="alert">
              <AlertCircle size={17} />
              <div><h3>Analysis could not be completed</h3><p>{error}</p></div>
              {hasProblem && <button type="button" onClick={onRetry}>Retry <ArrowRight size={13} /></button>}
            </div>
          )}

          {application && (
            <div className="framework-result">
              <div className="framework-result-meta">
                <span><Check size={12} /> Gemini response validated</span>
                {application.providerMetadata && <span>{application.providerMetadata.model} · {(application.providerMetadata.elapsedMs / 1000).toFixed(1)}s</span>}
              </div>
              <section className="framework-rationale">
                <div>
                  <span className="framework-section-label">WHY THIS METHOD FITS</span>
                  <p>{application.whyFit}</p>
                </div>
                <div>
                  <span className="framework-section-label">HOW IT WAS APPLIED</span>
                  <p>{application.methodApplied}</p>
                </div>
                <div>
                  <span className="framework-section-label">LIMITS OF THIS RESULT</span>
                  <p>{application.limitations}</p>
                </div>
              </section>

              <section className="framework-applied-visual">
                <div className="framework-section-heading">
                  <div><span className="framework-section-label">FRAMEWORK APPLIED</span><h3>{application.resultSummary}</h3></div>
                  <span className="framework-kind-label">{application.visualization.kind.replaceAll("-", " ")}</span>
                </div>
                {application.visualization.kind === "pareto" && (
                  <p className="framework-diagram-note">Qualitative ranking only. This view does not invent contribution values; use supplied counts or impact data before treating the order as a Pareto result.</p>
                )}
                <FrameworkVisualization application={application} />
              </section>

              <div className="framework-analysis-grid">
                <section className="framework-analysis-section">
                  <h3><Check size={14} /> Supplied facts</h3>
                  <ul>{application.confirmedFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
                </section>
                <section className="framework-analysis-section">
                  <h3><ShieldAlert size={14} /> Hypotheses to test</h3>
                  {application.hypotheses.map((hypothesis) => (
                    <details key={`${hypothesis.category}-${hypothesis.title}`}>
                      <summary><span>{hypothesis.title}</span><EvidencePill status="HYPOTHESIS" /></summary>
                      <p><strong>{hypothesis.category} · {hypothesis.confidence} confidence.</strong> {hypothesis.mechanism}</p>
                      <p><strong>Evidence needed:</strong> {hypothesis.evidenceRequired}</p>
                    </details>
                  ))}
                </section>
              </div>

              <section className="framework-investigations">
                <div className="framework-section-heading">
                  <div><span className="framework-section-label">WHAT TO INVESTIGATE FIRST</span><h3>Three evidence-led checks</h3></div>
                  <span className="framework-sort-note">Ranked by decision value</span>
                </div>
                {application.investigationPriorities.map((item) => (
                  <article key={item.order}>
                    <span className="framework-step-number">{String(item.order).padStart(2, "0")}</span>
                    <div><h4>{item.action}</h4><p>{item.rationale}</p><p><strong>Evidence:</strong> {item.evidenceRequired} <span>· Owner: {item.owner}</span></p></div>
                  </article>
                ))}
              </section>

              <section className="framework-actions">
                <div className="framework-section-heading">
                  <div><span className="framework-section-label">NEXT ACTIONS</span><h3>Test, measure, then improve</h3></div>
                </div>
                {application.recommendedActions.map((action, index) => (
                  <article key={`${index}-${action.action}`}>
                    <span className="framework-action-number">{index + 1}</span>
                    <div><h4>{action.action}</h4><p>{action.rationale}</p><p><strong>Evidence:</strong> {action.evidenceRequired}</p><p><strong>Owner:</strong> {action.owner} <span>· KPI: {action.kpi}</span></p></div>
                  </article>
                ))}
              </section>

              <div className="framework-uncertainty">
                <ShieldAlert size={15} />
                <div>
                  <h3>Missing evidence and uncertainty</h3>
                  <ul>{[...application.missingEvidence, ...application.uncertainties].map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              </div>

              {framework.id === "five-whys" && (
                <button type="button" className="framework-five-whys-link" onClick={onOpenFiveWhys}>
                  Continue in the editable 5 Whys workspace <ArrowRight size={14} />
                </button>
              )}
            </div>
          )}
        </div>
        <footer className="framework-application-footer">
          <span>AI analysis is a hypothesis-led aid. Validate against your operating data.</span>
          <button type="button" onClick={onClose}>Close <Check size={13} /></button>
        </footer>
      </section>
    </div>
  );
}
