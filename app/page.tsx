"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Activity,
  BookOpen,
  Check,
  CircleHelp,
  CircleDot,
  Clock3,
  Compass,
  Filter,
  History,
  Layers3,
  Lightbulb,
  Network,
  MessageSquareText,
  Plus,
  Type,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ThinkAloud } from "@/components/think-aloud";
import { FiveWhysWorkspace } from "@/components/five-whys-workspace";
import { DiagnosticPanel } from "@/components/diagnostic-panel";
import { analyzeProblem, type Recommendation } from "@/lib/analyzer";
import {
  attachFrameworkApplication,
  attachFiveWhysWorkspace,
  browserHistoryRepository,
  type AnalysisHistoryEntry,
} from "@/lib/history";
import { categories, frameworks, getFramework, type Framework } from "@/lib/frameworks";
import { type FiveWhysWorkspaceData } from "@/lib/five-whys";
import { isFrameworkApplication, type FrameworkApplication, type OperationsDiagnostic } from "@/lib/diagnostic";
import { type ProblemBrief } from "@/lib/problem-brief";
import { problemBriefService } from "@/lib/problem-brief-service";
import { OperationsLandscape } from "@/components/operations-landscape";
import { FrameworkApplicationPanel } from "@/components/framework-application-panel";

type PageName = "Home" | "Framework Library" | "Analysis History" | "About";
type AnalysisContext = {
  businessFunction: string;
  objective: string;
  timePeriod: string;
  availableMetrics: string;
  constraints: string;
  selectedFrameworks: string[];
};

const emptyAnalysisContext: AnalysisContext = {
  businessFunction: "",
  objective: "",
  timePeriod: "",
  availableMetrics: "",
  constraints: "",
  selectedFrameworks: [],
};

const navItems: Array<{ name: PageName; icon: typeof Compass }> = [
  { name: "Home", icon: Compass },
  { name: "Framework Library", icon: BookOpen },
  { name: "Analysis History", icon: History },
  { name: "About", icon: CircleHelp },
];

const examples = [
  "Our order fulfillment is taking too long",
  "We keep running out of our best-selling products",
  "Customer complaints have increased this quarter",
];

function getDateLabel(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function FrameworkMark({ framework, size = "md" }: { framework: Framework; size?: "sm" | "md" | "lg" }) {
  const classes = {
    emerald: "bg-[#e8f3ec] text-[#28764e]",
    blue: "bg-[#eaf1f9] text-[#4c75a7]",
    orange: "bg-[#fff1e3] text-[#c57b36]",
    purple: "bg-[#f0ebf8] text-[#8367a9]",
    teal: "bg-[#e4f2f0] text-[#408a7d]",
  }[framework.accent];
  const dimensions = size === "lg" ? "h-12 w-12 text-[22px]" : size === "sm" ? "h-9 w-9 text-lg" : "h-10 w-10 text-xl";
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-xl font-semibold ${classes} ${dimensions}`}>
      {framework.icon}
    </div>
  );
}

function AppLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#d4c2ed] bg-[#eee5fb] text-[#7454a2] shadow-[0_4px_14px_rgba(104,76,151,0.12)]">
        <Layers3 size={17} strokeWidth={2.5} />
      </div>
      <span className="text-[13px] font-semibold tracking-[-0.25px] text-[#3d3150]">Operations Toolkit <span className="text-[#8061b3]">AI</span></span>
    </div>
  );
}

function FloatingNavigation({
  activePage,
  setActivePage,
}: {
  activePage: PageName;
  setActivePage: (page: PageName) => void;
}) {
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
      <div className="mx-auto flex min-h-[58px] max-w-[1390px] items-center justify-between gap-3 rounded-2xl border border-[#e1d6ef]/90 bg-[#fbf8ff]/95 px-3 shadow-[0_12px_42px_rgba(54,39,76,0.12)] backdrop-blur-xl sm:px-5">
        <div className="shrink-0">
        <AppLogo />
        </div>
        <nav aria-label="Main navigation" className="flex min-w-0 items-center gap-1 overflow-x-auto py-1">
          {navItems.map(({ name, icon: Icon }) => (
            <button
              key={name}
              type="button"
              onClick={() => setActivePage(name)}
              aria-label={name}
              aria-current={activePage === name ? "page" : undefined}
              className={`flex min-h-[40px] shrink-0 items-center gap-2 rounded-xl px-2.5 text-[10px] font-semibold transition-colors sm:px-3 sm:text-[11px] ${
                activePage === name
                  ? "bg-[#eae0f8] text-[#5b3e87] shadow-[inset_0_0_0_1px_#ddccef]"
                  : "text-[#756a86] hover:bg-[#f1eafa] hover:text-[#563b7c]"
              }`}
            >
              <Icon size={14} strokeWidth={1.9} />
              <span className="hidden sm:inline">{name}</span>
            </button>
          ))}
        </nav>
        <div className="hidden items-center gap-2 border-l border-[#e5dced] pl-3 xl:flex">
          <span className="h-2 w-2 rounded-full bg-[#7bbcaf]" />
          <span className="whitespace-nowrap text-[9px] font-medium text-[#756a86]">Evidence before action</span>
        </div>
      </div>
    </header>
  );
}

function RecommendationCard({
  recommendation,
  index,
  alternatives,
  onApply,
}: {
  recommendation: Recommendation;
  index: number;
  alternatives: Recommendation[];
  onApply: (framework: Framework) => void;
}) {
  const { framework } = recommendation;
  const evidenceNeeded = framework.id === "pareto"
    ? "Issue counts, time, or cost by category."
    : framework.id === "process-mapping" || framework.id === "bottleneck-analysis"
      ? "Step timestamps, queues, handoffs, and rework."
      : framework.id === "five-whys" || framework.id === "root-cause-analysis" || framework.id === "fishbone"
        ? "A specific event, observations, and testable cause evidence."
        : framework.category === "Strategy"
          ? "Internal performance plus relevant external evidence."
          : "A clear process boundary, baseline, and outcome measure.";
  return (
    <article className="story-reveal fade-in flex flex-col rounded-[16px] border border-white/[0.09] bg-[#0d1925]/90 p-4 shadow-[0_16px_45px_rgba(0,0,0,0.16)] transition-all hover:-translate-y-1 hover:border-[#69d5cc]/30 hover:shadow-[0_18px_55px_rgba(17,117,129,0.12)] sm:p-[18px]" style={{ animationDelay: `${index * 55}ms` }}>
      <div className="flex items-start gap-3">
        <FrameworkMark framework={framework} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[13px] font-semibold text-[#e2eff1]">{framework.name}</h3>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-[3px] text-[9px] font-medium text-[#92a8af]">{framework.category}</span>
            {index === 0 && <span className="rounded-full border border-[#4bd0c2]/25 bg-[#4bd0c2]/10 px-2 py-[3px] text-[8px] font-bold tracking-wide text-[#72e1d5]">PRIMARY START</span>}
          </div>
          <p className="mt-1.5 text-[11px] leading-[1.55] text-[#9cb0b7]">{framework.description}</p>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-[#4bd0c2]/10 bg-[#10212b] px-3 py-2.5">
        <div className="flex gap-2">
          <Lightbulb size={14} className="mt-0.5 shrink-0 text-[#71d8ce]" />
          <div>
            <span className="text-[10px] font-semibold text-[#b8dcda]">Why it fits </span>
            <span className="text-[10px] leading-[1.6] text-[#9cb0b7]">{recommendation.matchReason}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Target size={13} className="mt-0.5 shrink-0 text-[#71939d]" />
        <p className="text-[10px] leading-[1.6] text-[#9cb0b7]"><span className="font-semibold text-[#c1d1d4]">Best when </span>{framework.when}</p>
      </div>
      <div className="mt-3 rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2.5">
        <p className="text-[9px] leading-[1.6] text-[#9bb0b7]"><span className="font-semibold text-[#c6d9db]">Useful evidence: </span>{evidenceNeeded}</p>
        <p className="mt-1 text-[9px] leading-[1.6] text-[#8099a2]"><span className="font-semibold text-[#a9c2c6]">Limit: </span>Organizes investigation; it cannot confirm causality without evidence.</p>
        {index === 0 && alternatives[0] && <p className="mt-1 border-t border-white/[0.07] pt-1.5 text-[9px] leading-[1.6] text-[#8099a2]"><span className="font-semibold text-[#a9c2c6]">Alternative: </span>{alternatives[0].framework.name} — consider it when {alternatives[0].framework.when.toLocaleLowerCase()}</p>}
      </div>
      <button onClick={() => onApply(framework)} className="mt-4 flex h-[38px] items-center justify-center gap-2 rounded-lg border border-[#62d4ca]/25 bg-[#123b40] text-[11px] font-semibold text-[#88e6dc] transition-colors hover:border-[#71e5d9]/60 hover:bg-[#174b4d]">
        Apply framework <ArrowRight size={13} />
      </button>
    </article>
  );
}

function RecommendationPanel({
  recommendations,
  problem,
  onApply,
  onNewAnalysis,
}: {
  recommendations: Recommendation[];
  problem: string;
  onApply: (framework: Framework) => void;
  onNewAnalysis: () => void;
}) {
  return (
    <div className="fade-in mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#4bd0c2]/20 bg-[#123239] text-[#72ded2]"><Sparkles size={13} /></span>
            <h2 className="text-[14px] font-semibold text-[#e2eff1]">Best-fit analytical methods</h2>
          </div>
          <p className="ml-8 mt-1 text-[10px] text-[#8ba1a9]">A primary starting point and alternatives, matched to the problem · {recommendations.length} methods</p>
        </div>
        <button onClick={onNewAnalysis} className="flex items-center gap-1 text-[10px] font-semibold text-[#76ddd3] hover:text-[#a3f0e9]">New analysis <Plus size={13} /></button>
      </div>
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0a1520] px-3 py-2 text-[10px] text-[#9ab0b6]">
        <MessageSquareText size={13} className="shrink-0 text-[#70d6ce]" />
        <span className="truncate">“{problem}”</span>
        <Check size={13} className="ml-auto shrink-0 text-[#70d6ba]" />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {recommendations.map((recommendation, index) => (
          <RecommendationCard key={recommendation.framework.id} recommendation={recommendation} index={index} alternatives={recommendations.filter((_, alternativeIndex) => alternativeIndex !== index)} onApply={onApply} />
        ))}
      </div>
    </div>
  );
}

function FrameworkTile({ framework, onApply }: { framework: Framework; onApply: (framework: Framework) => void }) {
  return (
    <button onClick={() => onApply(framework)} className="group flex min-h-[85px] items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0d1925] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[#63d9cd]/30 hover:shadow-[0_12px_30px_rgba(16,123,133,0.1)]">
      <FrameworkMark framework={framework} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-semibold text-[#d3e2e4]">{framework.name}</div>
        <div className="mt-1 truncate text-[9px] text-[#879da5]">{framework.category}</div>
      </div>
      <ArrowUpRight size={14} className="shrink-0 text-[#75d8d0] opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function IntelligenceJourney() {
  const steps = [
    { number: "01", label: "Signal", detail: "Capture symptoms, outcomes, and known facts.", icon: Activity },
    { number: "02", label: "Method", detail: "Choose an analytical lens that fits.", icon: Network },
    { number: "03", label: "Decision", detail: "Connect evidence to practical next actions.", icon: Target },
  ];
  return (
    <section aria-label="How Operations Toolkit AI turns a problem into decisions" className="story-reveal relative mt-7 overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#0a1420]/80 px-5 py-5 sm:px-7">
      <div className="intelligence-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative grid items-center gap-5 md:grid-cols-[0.8fr_1.2fr]">
        <div className="flex items-center gap-4">
          <div className="relative flex h-[82px] w-[82px] shrink-0 items-center justify-center">
            <div className="intelligence-orb absolute inset-1 rounded-full" />
            <div className="absolute inset-0 rounded-full border border-[#62ddd1]/35" />
            <div className="absolute inset-[-8px] rounded-full border border-[#68bcdb]/15 [transform:rotateX(68deg)]" />
            <div className="absolute h-2 w-2 rounded-full bg-[#d1fff7] shadow-[0_0_18px_#62ddd1]" />
            <CircleDot size={13} className="absolute right-1 top-4 text-[#72dcd4]" />
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[1.4px] text-[#61cec5]">A guided reasoning path</p>
            <h3 className="mt-1 text-[15px] font-semibold tracking-[-0.3px] text-[#e2eff1]">From signal to decision</h3>
            <p className="mt-1 max-w-[330px] text-[10px] leading-[1.65] text-[#8fa6ae]">Separate what’s known from what needs testing before choosing an action.</p>
          </div>
        </div>
        <div className="relative grid gap-2 sm:grid-cols-3">
          <svg aria-hidden="true" className="pointer-events-none absolute left-[15%] right-[15%] top-5 hidden h-5 w-[70%] sm:block" viewBox="0 0 400 20" fill="none" preserveAspectRatio="none">
            <path d="M2 10H398" stroke="url(#journey-line)" strokeWidth="1.5" strokeDasharray="4 7" />
            <defs><linearGradient id="journey-line"><stop stopColor="#55D5C9" stopOpacity=".18"/><stop offset=".5" stopColor="#59C5E7" stopOpacity=".78"/><stop offset="1" stopColor="#8B7EF4" stopOpacity=".24"/></linearGradient></defs>
          </svg>
          {steps.map(({ number, label, detail, icon: Icon }) => (
            <div key={number} className="relative flex items-start gap-2 rounded-xl border border-white/[0.06] bg-[#101c29]/90 p-3 sm:flex-col sm:gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#56d7ce]/25 bg-[#103239] text-[#75e0d6]"><Icon size={13} /></span>
              <span className="text-[10px] leading-[1.5] text-[#8fa6ae] sm:pl-0"><span className="mr-1.5 font-bold tracking-[0.6px] text-[#d2e4e6]">{number} / {label}</span>{detail}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HomePage({
  problem,
  setProblem,
  context,
  setContext,
  onAnalyze,
  onVoiceConfirm,
  onRetry,
  loading,
  recommendations,
  analyzedProblem,
  onApply,
  onNavigate,
  diagnostic,
  diagnosticLoading,
  diagnosticStage,
  diagnosticElapsedMs,
  diagnosticError,
}: {
  problem: string;
  setProblem: (value: string) => void;
  context: AnalysisContext;
  setContext: (value: AnalysisContext) => void;
  onAnalyze: () => void;
  onVoiceConfirm: (brief: ProblemBrief, transcript?: { rawTranscript: string; cleanedTranscript: string }) => void;
  onRetry: () => void;
  loading: boolean;
  recommendations: Recommendation[];
  analyzedProblem: string;
  onApply: (framework: Framework) => void;
  onNavigate: (page: PageName) => void;
  diagnostic: OperationsDiagnostic | null;
  diagnosticLoading: boolean;
  diagnosticStage: string;
  diagnosticElapsedMs: number;
  diagnosticError: string;
}) {
  const [inputMode, setInputMode] = useState<"type" | "voice">("type");
  const [contextOpen, setContextOpen] = useState(false);
  const setContextField = (key: keyof Omit<AnalysisContext, "selectedFrameworks">, value: string) => {
    setContext({ ...context, [key]: value });
  };
  return (
    <div className="mx-auto max-w-[1520px] px-3 pb-14 sm:px-5 lg:px-8">
      <OperationsLandscape onBegin={() => setInputMode("type")} />
      <section className="relative mx-auto max-w-[1260px] overflow-hidden rounded-[24px] border border-[#796292]/25 bg-[radial-gradient(ellipse_at_82%_0%,rgba(170,139,217,0.25),transparent_38%),linear-gradient(140deg,#32263f_0%,#211a2d_62%,#29213a_100%)] px-5 py-6 shadow-[0_30px_90px_rgba(30,20,43,0.2)] sm:px-8 sm:py-8 lg:px-10">
        <div className="intelligence-grid pointer-events-none absolute inset-0 opacity-35" />
        <div className="relative">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#c2a8e4]/20 bg-[#493958] px-2.5 py-1.5 text-[9px] font-semibold tracking-[0.8px] text-[#e0cafa]">
                <Sparkles size={12} /> YOUR DIAGNOSTIC WORKSPACE
              </div>
              <h2 className="text-[22px] font-semibold tracking-[-0.7px] text-[#f4eef9] sm:text-[27px]">What is happening in your operation?</h2>
              <p className="mt-1.5 max-w-[570px] text-[11px] leading-[1.7] text-[#c5b8d2]">Describe the signal in your own words. We’ll clarify the brief, match a method, and build an evidence-led diagnostic.</p>
            </div>
          </div>

          <div className="relative max-w-[800px]">
            <div role="group" aria-label="Choose how to explain your problem" className="mb-3 grid grid-cols-2 gap-2">
              <button aria-pressed={inputMode === "type"} onClick={() => setInputMode("type")} className={`flex min-h-[42px] items-center justify-center gap-2 rounded-xl border px-3 text-[11px] font-semibold transition-colors ${inputMode === "type" ? "border-[#63d9cd]/30 bg-[#15343d] text-[#85e5db]" : "border-white/[0.08] bg-white/[0.03] text-[#91a8af] hover:bg-white/[0.07]"}`}>
                <Type size={15} /> Type your problem
              </button>
              <button aria-pressed={inputMode === "voice"} onClick={() => setInputMode("voice")} className={`relative flex min-h-[42px] items-center justify-center gap-2 rounded-xl border px-3 text-[11px] font-semibold transition-colors ${inputMode === "voice" ? "border-[#65ded2]/45 bg-[#155057] text-[#d7fffa] shadow-[0_0_24px_rgba(74,204,195,0.12)]" : "border-white/[0.08] bg-white/[0.03] text-[#91a8af] hover:bg-white/[0.07]"}`}>
                🎙️ <span>Think aloud</span><span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[8px] text-[#83c9c4]">ON-DEVICE</span>
              </button>
            </div>
            {inputMode === "type" ? (
              <>
            <div className="rounded-[14px] border border-white/[0.1] bg-[#09131e]/90 p-2 shadow-[0_15px_45px_rgba(0,0,0,0.22)] sm:p-2.5">
            <label htmlFor="business-problem" className="mb-1.5 block px-2 pt-1 text-[10px] font-semibold text-[#c8d9dc]">What business problem are you working through?</label>
            <textarea
              id="business-problem"
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onAnalyze();
              }}
              maxLength={500}
              placeholder="e.g. Our team spends too much time fixing order errors..."
              rows={2}
              className="w-full resize-y bg-transparent px-2 py-2 text-[12px] leading-[1.7] text-[#e0edef] outline-none placeholder:text-[#657e88]"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] px-1 pt-2">
              <div className="pl-1 text-[9px] text-[#718a93]">{problem.length}/500 <span className="mx-1">·</span> Press ⌘ + Enter to analyze</div>
              <button
                onClick={onAnalyze}
                disabled={!problem.trim() || loading || diagnosticLoading}
                className="flex h-[36px] items-center gap-2 rounded-lg border border-[#78e6dc]/20 bg-gradient-to-r from-[#12656a] to-[#1d6178] px-3.5 text-[10px] font-semibold text-[#e5fffb] shadow-[0_5px_20px_rgba(32,160,169,0.16)] transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Preparing analysis…" : diagnosticLoading ? "Analysis in progress…" : <>Start guided diagnostic <ArrowRight size={13} /></>}
              </button>
            </div>
          </div>
          <button type="button" aria-expanded={contextOpen} onClick={() => setContextOpen((open) => !open)} className="mt-3 flex items-center gap-2 rounded-lg px-1 py-1.5 text-[10px] font-semibold text-[#75d8d0] hover:text-[#a8f4ec]">
            <Plus size={13} className={`transition-transform ${contextOpen ? "rotate-45" : ""}`} />
            {contextOpen ? "Hide optional context" : "Add context to sharpen the analysis"}
            <span className="font-normal text-[#718a93]">· all fields optional</span>
          </button>
          {contextOpen && <div className="mt-1 grid gap-2.5 rounded-xl border border-white/[0.08] bg-[#0a1520]/90 p-3 sm:grid-cols-2">
            <label className="text-[9px] font-semibold text-[#a6bdc2]">Business function
              <input value={context.businessFunction} onChange={(event) => setContextField("businessFunction", event.target.value)} placeholder="e.g. FP&A, customer support" className="mt-1 h-9 w-full rounded-lg border border-white/[0.09] bg-[#07111b] px-2.5 text-[10px] font-normal text-[#e0edef] placeholder:text-[#647b84]" />
            </label>
            <label className="text-[9px] font-semibold text-[#a6bdc2]">Desired objective
              <input value={context.objective} onChange={(event) => setContextField("objective", event.target.value)} placeholder="What decision or outcome is needed?" className="mt-1 h-9 w-full rounded-lg border border-white/[0.09] bg-[#07111b] px-2.5 text-[10px] font-normal text-[#e0edef] placeholder:text-[#647b84]" />
            </label>
            <label className="text-[9px] font-semibold text-[#a6bdc2]">Time period
              <input value={context.timePeriod} onChange={(event) => setContextField("timePeriod", event.target.value)} placeholder="e.g. last quarter" className="mt-1 h-9 w-full rounded-lg border border-white/[0.09] bg-[#07111b] px-2.5 text-[10px] font-normal text-[#e0edef] placeholder:text-[#647b84]" />
            </label>
            <label className="text-[9px] font-semibold text-[#a6bdc2]">Available metrics
              <input value={context.availableMetrics} onChange={(event) => setContextField("availableMetrics", event.target.value)} placeholder="Numbers, measures, or reports you have" className="mt-1 h-9 w-full rounded-lg border border-white/[0.09] bg-[#07111b] px-2.5 text-[10px] font-normal text-[#e0edef] placeholder:text-[#647b84]" />
            </label>
            <label className="text-[9px] font-semibold text-[#a6bdc2] sm:col-span-2">Constraints and relevant context
              <input value={context.constraints} onChange={(event) => setContextField("constraints", event.target.value)} placeholder="e.g. fixed controls, limited staffing, seasonal peak" className="mt-1 h-9 w-full rounded-lg border border-white/[0.09] bg-[#07111b] px-2.5 text-[10px] font-normal text-[#e0edef] placeholder:text-[#647b84]" />
            </label>
            <label className="text-[9px] font-semibold text-[#a6bdc2] sm:col-span-2">Optional preferred analytical method
              <select value={context.selectedFrameworks[0] ?? ""} onChange={(event) => setContext({ ...context, selectedFrameworks: event.target.value ? [event.target.value] : [] })} className="mt-1 h-9 w-full rounded-lg border border-white/[0.09] bg-[#07111b] px-2.5 text-[10px] font-normal text-[#dcebed]">
                <option value="">Let the analysis choose</option>
                {frameworks.map((framework) => <option key={framework.id} value={framework.name}>{framework.name}</option>)}
              </select>
              <span className="mt-1 block font-normal text-[#748b94]">The diagnostic still checks fit and limitations; this preference does not establish a cause.</span>
            </label>
          </div>}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
            <span className="mr-0.5 text-[9px] font-medium text-[#8399a1]">Try a starting point</span>
            {examples.map((example) => (
              <button key={example} onClick={() => setProblem(example)} className="rounded-full border border-white/[0.09] bg-white/[0.03] px-2.5 py-1.5 text-[9px] text-[#91a6ad] transition-colors hover:border-[#63d9cd]/30 hover:text-[#b5efea]">{example}</button>
            ))}
          </div>
              </>
            ) : (
            <ThinkAloud
              onConfirm={onVoiceConfirm}
              onTypeInstead={() => setInputMode("type")}
            />
          )}
        </div>
        </div>
      </section>

      <IntelligenceJourney />

      {diagnosticLoading && (
        <div role="status" aria-live="polite" className="fade-in mt-7 flex flex-col items-center rounded-[16px] border border-[#5fd8cf]/15 bg-[#0c1925] p-5 text-center sm:flex-row sm:gap-4 sm:text-left">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
            <div className="intelligence-orb absolute inset-1 rounded-full" />
            <div className="absolute inset-0 rounded-full border border-[#5fd8cf]/30 motion-safe:animate-spin" style={{ animationDuration: "12s" }} />
            <Activity size={17} className="relative text-[#a0f1e7]" />
          </div>
          <div className="mt-3 sm:mt-0">
            <p className="text-[11px] font-semibold text-[#d7e9eb]">{diagnosticStage}</p>
            <p className="mt-1 text-[9px] text-[#8ba3ab]">Waiting for the configured Gemini provider; no model thoughts or partial findings are shown.</p>
          </div>
          <span className="mt-3 font-mono text-[11px] tabular-nums text-[#73ddd3] sm:ml-auto sm:mt-0">{(diagnosticElapsedMs / 1000).toFixed(1)}s</span>
        </div>
      )}
      {diagnosticError && <div role="alert" className="fade-in mt-7 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2a088]/20 bg-[#291b1c] px-4 py-3"><p className="text-[10px] leading-[1.6] text-[#f0b5a2]">{diagnosticError}</p><button onClick={onRetry} disabled={diagnosticLoading} className="rounded-lg border border-[#f2a088]/25 px-3 py-2 text-[9px] font-semibold text-[#ffd2c3] hover:bg-white/[0.05] disabled:opacity-50">Retry diagnostic <ArrowRight size={11} className="ml-1 inline" /></button></div>}
      {diagnostic && <DiagnosticPanel diagnostic={diagnostic} />}

      {recommendations.length > 0 && (
        <RecommendationPanel
          recommendations={recommendations}
          problem={analyzedProblem}
          onApply={onApply}
          onNewAnalysis={() => {
            document.getElementById("business-problem")?.focus();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      <section className={`${recommendations.length ? "mt-9" : "mt-8"}`}>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.07] bg-[#152630] text-[#85bdb9]"><BookOpen size={13} /></span>
              <h2 className="text-[13px] font-semibold text-[#d7e6e8]">Explore the framework library</h2>
            </div>
            <p className="ml-8 mt-1 text-[10px] text-[#8299a1]">A practical toolkit for your everyday challenges</p>
          </div>
          <button onClick={() => onNavigate("Framework Library")} className="hidden items-center gap-1 text-[10px] font-semibold text-[#75d8d0] hover:text-[#b4f3ed] sm:flex">View all {frameworks.length} <ArrowRight size={12} /></button>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {frameworks.slice(0, 6).map((framework) => <FrameworkTile key={framework.id} framework={framework} onApply={onApply} />)}
        </div>
        <button onClick={() => onNavigate("Framework Library")} className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-[10px] font-semibold text-[#75d8d0] hover:bg-white/[0.04] sm:hidden">Browse all frameworks <ArrowRight size={12} /></button>
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <FeatureNote icon={<Target size={15} />} title="The right tool, faster" detail="Find a framework that fits the problem in front of you." />
        <FeatureNote icon={<BookOpen size={15} />} title="Practical by nature" detail="Clear steps turn familiar ideas into useful action." />
        <FeatureNote icon={<Check size={15} />} title="Private by design" detail="Recommendations and voice transcription run locally on your device." />
      </section>
      <div className="mt-8 flex items-center justify-center gap-1.5 text-[9px] text-[#a0aaa2]"><span className="h-1.5 w-1.5 rounded-full bg-[#70a27b]" /> Thoughtful tools for better operations</div>
    </div>
  );
}

function FeatureNote({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-[#0c1722] p-3.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#53d5c6]/15 bg-[#12313a] text-[#75dcd2]">{icon}</div>
      <div><div className="text-[10px] font-semibold text-[#cbdcde]">{title}</div><p className="mt-1 text-[9px] leading-[1.6] text-[#8ba1a8]">{detail}</p></div>
    </div>
  );
}

function LibraryPage({ onApply }: { onApply: (framework: Framework) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All frameworks");
  const filtered = useMemo(() => frameworks.filter((framework) => {
    const matchesCategory = category === "All frameworks" || framework.category === category;
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = !normalizedQuery || [framework.name, framework.description, framework.category, ...framework.keywords].join(" ").toLowerCase().includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  }), [category, query]);

  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-12 pt-8 sm:px-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#53d5c6]/15 bg-[#102932] px-2.5 py-1 text-[9px] font-semibold text-[#7bded3]"><BookOpen size={11} /> THE TOOLKIT</div>
          <h2 className="text-[24px] font-semibold tracking-[-0.7px] text-[#e2eff1]">Framework Library</h2>
          <p className="mt-1.5 text-[11px] text-[#8ba3ab]">Explore practical approaches for solving business and operations challenges.</p>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-[#0c1722] px-3 py-1.5 text-[10px] font-medium text-[#9ab0b6]">{filtered.length} frameworks</span>
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa49c]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search frameworks, topics, or keywords..." className="h-10 w-full rounded-lg border border-white/[0.09] bg-[#0c1722] pl-9 pr-3 text-[11px] text-[#dcebed] outline-none placeholder:text-[#6f8790] focus:border-[#62d4ca]/50" />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Filter size={14} className="mr-1 shrink-0 text-[#849da5]" />
          {categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`shrink-0 rounded-full px-3 py-2 text-[9px] font-medium transition-colors ${category === item ? "border border-[#65ded2]/20 bg-[#14383e] text-[#a2eee6]" : "border border-white/[0.08] bg-[#0c1722] text-[#91a7ae] hover:border-[#62d4ca]/30"}`}>{item}</button>)}
        </div>
      </div>
      {filtered.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((framework) => <LibraryCard key={framework.id} framework={framework} onApply={onApply} />)}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-white/[0.12] bg-[#0c1722] py-14 text-center">
          <Search size={20} className="mx-auto text-[#91a9b0]" />
          <p className="mt-3 text-[12px] font-semibold text-[#d0e0e2]">No frameworks found</p>
          <p className="mt-1 text-[10px] text-[#8a9fa6]">Try another search or category.</p>
        </div>
      )}
    </div>
  );
}

function LibraryCard({ framework, onApply }: { framework: Framework; onApply: (framework: Framework) => void }) {
  return (
    <article className="flex min-h-[208px] flex-col rounded-[13px] border border-white/[0.08] bg-[#0d1925] p-4 transition-all hover:border-[#67d7cd]/25 hover:shadow-[0_12px_35px_rgba(18,112,123,0.1)]">
      <div className="flex items-start gap-3">
        <FrameworkMark framework={framework} />
        <div className="min-w-0 pt-0.5">
          <h3 className="text-[12px] font-semibold text-[#d7e6e8]">{framework.name}</h3>
          <span className="mt-1 inline-flex rounded-full bg-white/[0.05] px-2 py-0.5 text-[9px] text-[#91a7ae]">{framework.category}</span>
        </div>
      </div>
      <p className="mt-3 text-[10px] leading-[1.65] text-[#9bb0b6]">{framework.description}</p>
      <div className="mt-2.5 border-l-2 border-[#55d4c9]/30 pl-2.5 text-[9px] leading-[1.6] text-[#90a6ad]"><span className="font-semibold text-[#b8d5d7]">Use when: </span>{framework.when}</div>
      <button onClick={() => onApply(framework)} className="mt-auto flex items-center justify-between pt-3 text-[10px] font-semibold text-[#75d8d0] hover:text-[#b4f3ed]">
        Explore framework <ArrowRight size={13} />
      </button>
    </article>
  );
}

function HistoryPage({ history, onReopen, onClear }: { history: AnalysisHistoryEntry[]; onReopen: (entry: AnalysisHistoryEntry) => void; onClear: () => void }) {
  return (
    <div className="mx-auto max-w-[1000px] px-5 pb-12 pt-8 sm:px-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#10212b] px-2.5 py-1 text-[9px] font-semibold text-[#91c5bf]"><History size={11} /> YOUR WORKSPACE</div>
          <h2 className="text-[24px] font-semibold tracking-[-0.7px] text-[#e2eff1]">Analysis History</h2>
          <p className="mt-1.5 text-[11px] text-[#8ba3ab]">Pick up where you left off with recent problem analyses.</p>
        </div>
        {history.length > 0 && <button onClick={onClear} className="rounded-lg border border-white/[0.1] bg-[#0c1722] px-3 py-2 text-[10px] font-medium text-[#9bb0b6] hover:text-[#ffac9b]">Clear history</button>}
      </div>
      {history.length === 0 ? (
        <div className="mt-7 rounded-[14px] border border-dashed border-white/[0.12] bg-[#0c1722] px-6 py-16 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[#53d5c6]/15 bg-[#12313a] text-[#75dcd2]"><Clock3 size={20} /></div>
          <h3 className="mt-4 text-[13px] font-semibold text-[#d5e5e7]">Your next solution starts here</h3>
          <p className="mx-auto mt-1.5 max-w-[330px] text-[10px] leading-[1.65] text-[#8ba1a8]">Once you analyze a business problem, your recommendations will be saved here on this device.</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-2.5">
          {history.map((entry, index) => (
            <button key={`${entry.date}-${index}`} onClick={() => onReopen(entry)} className="group flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0d1925] p-4 text-left transition-colors hover:border-[#63d9cd]/30">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#142b35] text-[#7dcfc9]"><MessageSquareText size={16} /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-[#cfdee0]">{entry.problem}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[9px] text-[#8299a1]">
                  <span>{getDateLabel(entry.date)}</span><span>·</span><span>{entry.recommendations.length} recommendations</span>
                  <span className="hidden sm:inline">·</span>
                  <span className="hidden truncate sm:inline">{entry.recommendations.map((id) => getFramework(id)?.shortName).filter(Boolean).join(", ")}</span>
                </div>
              </div>
              <ArrowRight size={15} className="shrink-0 text-[#82999f] transition-transform group-hover:translate-x-0.5 group-hover:text-[#75d8d0]" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AboutPage() {
  return (
    <div className="mx-auto max-w-[950px] px-5 pb-12 pt-8 sm:px-8 lg:px-10">
      <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#53d5c6]/15 bg-[#102932] px-2.5 py-1 text-[9px] font-semibold text-[#7bded3]"><Sparkles size={11} /> BUILT FOR BETTER OPERATIONS</div>
      <h2 className="text-[24px] font-semibold tracking-[-0.7px] text-[#e2eff1]">About Operations Toolkit AI</h2>
      <p className="mt-2 max-w-[580px] text-[12px] leading-[1.7] text-[#8ba3ab]">A practical companion for turning everyday business challenges into clear, structured next steps.</p>
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <AboutCard icon={<Target size={17} />} title="A useful place to start" text="Describe a challenge in your own words and get a short list of frameworks matched to the language and themes in your problem." />
        <AboutCard icon={<BookOpen size={17} />} title="Practical frameworks" text={`Explore ${frameworks.length} established approaches, each with guidance on why and when it is useful and a step-by-step walkthrough.`} />
        <AboutCard icon={<Check size={17} />} title="Clear provider boundary" text="Framework recommendations run locally. AI diagnostics send the confirmed brief to Google Gemini; analysis history remains in browser storage." />
        <AboutCard icon={<Layers3 size={17} />} title="Designed to grow" text="The recommendation engine is separate from the interface, and diagnostic provider logic remains server-side with schema validation." />
      </div>
      <div className="mt-6 rounded-xl border border-white/[0.08] bg-[#0d1925] p-4 sm:p-5">
        <h3 className="text-[12px] font-semibold text-[#d7e6e8]">Built with intention</h3>
        <p className="mt-2 max-w-[700px] text-[10px] leading-[1.8] text-[#9aafb5]">Operations Toolkit AI is an analytical aid, not a substitute for domain expertise or decisions based on your own data. Use each framework to organize thinking, test assumptions, and involve the people closest to the work. AI outputs may be inaccurate and should be validated before action.</p>
      </div>
    </div>
  );
}

function AboutCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="rounded-xl border border-white/[0.08] bg-[#0d1925] p-4"><div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg border border-[#53d5c6]/15 bg-[#12313a] text-[#75dcd2]">{icon}</div><h3 className="text-[11px] font-semibold text-[#d4e4e6]">{title}</h3><p className="mt-1.5 text-[10px] leading-[1.7] text-[#91a7ae]">{text}</p></div>;
}

export default function Home() {
  const [activePage, setActivePage] = useState<PageName>("Home");
  const [problem, setProblem] = useState("");
  const [analysisContext, setAnalysisContext] = useState<AnalysisContext>(emptyAnalysisContext);
  const [analyzedProblem, setAnalyzedProblem] = useState("");
  const [activeProblemBrief, setActiveProblemBrief] = useState<ProblemBrief | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [storageWarning, setStorageWarning] = useState(false);
  const [selectedFramework, setSelectedFramework] = useState<Framework | null>(null);
  const [frameworkApplication, setFrameworkApplication] = useState<FrameworkApplication | null>(null);
  const [frameworkApplicationLoading, setFrameworkApplicationLoading] = useState(false);
  const [frameworkApplicationError, setFrameworkApplicationError] = useState("");
  const [frameworkApplicationStartedAt, setFrameworkApplicationStartedAt] = useState(0);
  const [frameworkApplicationElapsedMs, setFrameworkApplicationElapsedMs] = useState(0);
  const [fiveWhysOpen, setFiveWhysOpen] = useState(false);
  const [activeAnalysisDate, setActiveAnalysisDate] = useState("");
  const [diagnostic, setDiagnostic] = useState<OperationsDiagnostic | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticStage, setDiagnosticStage] = useState("");
  const [diagnosticStartedAt, setDiagnosticStartedAt] = useState(0);
  const [diagnosticElapsedMs, setDiagnosticElapsedMs] = useState(0);
  const [diagnosticError, setDiagnosticError] = useState("");
  const [lastAnalysisRequest, setLastAnalysisRequest] = useState<{
    brief: ProblemBrief;
    transcript?: { rawTranscript: string; cleanedTranscript: string };
    context: AnalysisContext;
  } | null>(null);
  const lastFrameworkRequest = useRef<{ framework: Framework; brief: ProblemBrief; date: string } | null>(null);
  const frameworkRequestId = useRef(0);
  const frameworkAbortController = useRef<AbortController | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void browserHistoryRepository.load()
      .then((saved) => {
        if (isCurrent) setHistory(saved);
      })
      .catch(() => {
        if (isCurrent) setStorageWarning(true);
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!diagnosticLoading || !diagnosticStartedAt) return;
    const updateElapsed = () => setDiagnosticElapsedMs(Date.now() - diagnosticStartedAt);
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(interval);
  }, [diagnosticLoading, diagnosticStartedAt]);

  useEffect(() => {
    if (!frameworkApplicationLoading || !frameworkApplicationStartedAt) return;
    const updateElapsed = () => setFrameworkApplicationElapsedMs(Date.now() - frameworkApplicationStartedAt);
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(interval);
  }, [frameworkApplicationLoading, frameworkApplicationStartedAt]);

  const saveHistory = (entries: AnalysisHistoryEntry[]) => {
    setHistory(entries);
    void browserHistoryRepository.save(entries).catch(() => setStorageWarning(true));
  };

  const runAnalysis = async (
    brief: ProblemBrief,
    transcript?: { rawTranscript: string; cleanedTranscript: string },
    context: AnalysisContext = analysisContext,
  ) => {
    const cleanedProblem = brief.problemStatement.trim();
    if (!cleanedProblem || loading || diagnosticLoading) return;
    setLastAnalysisRequest({ brief, transcript, context });
    setLoading(true);
    setDiagnostic(null);
    setDiagnosticError("");
    setFrameworkApplication(null);
    setSelectedFramework(null);
    setFrameworkApplicationError("");
    setDiagnosticLoading(true);
    setDiagnosticStage("Preparing a structured diagnostic request");
    const startedAt = Date.now();
    setDiagnosticStartedAt(startedAt);
    setDiagnosticElapsedMs(0);
    const analysisDate = new Date().toISOString();
    setActiveAnalysisDate(analysisDate);
    const nextRecommendations = analyzeProblem(brief);
    setRecommendations(nextRecommendations);
    setAnalyzedProblem(cleanedProblem);
    setActiveProblemBrief(brief);
    setLoading(false);
    setDiagnosticStage("Waiting for the Gemini diagnostic response");
    let nextDiagnostic: OperationsDiagnostic;
    try {
      const requestController = new AbortController();
      const requestTimeout = window.setTimeout(() => requestController.abort(), 60_000);
      let response: Response;
      try {
        response = await fetch("/api/diagnostic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: requestController.signal,
          body: JSON.stringify({
            problemBrief: brief,
            rawProblem: transcript?.rawTranscript ?? cleanedProblem,
            cleanedTranscript: transcript?.cleanedTranscript ?? cleanedProblem,
            businessFunction: context.businessFunction,
            objective: context.objective,
            timePeriod: context.timePeriod,
            availableMetrics: context.availableMetrics,
            constraints: context.constraints,
            selectedFrameworks: context.selectedFrameworks,
          }),
        });
      } finally {
        window.clearTimeout(requestTimeout);
      }
      if (!response.ok) {
        throw new Error("The Gemini diagnostic could not be completed.");
      }
      nextDiagnostic = await response.json() as OperationsDiagnostic;
    } catch (error) {
      setDiagnosticError(error instanceof DOMException && error.name === "AbortError"
        ? "The diagnostic request exceeded the client deadline. You can retry without losing the Problem Brief."
        : error instanceof Error ? error.message : "The Gemini diagnostic could not be completed.");
      setDiagnosticLoading(false);
      return;
    }
    setDiagnostic(nextDiagnostic);
    setDiagnosticLoading(false);
    const nextEntry: AnalysisHistoryEntry = {
      problem: cleanedProblem,
      date: analysisDate,
      recommendations: nextRecommendations.map(({ framework }) => framework.id),
      problemBrief: brief,
      diagnostic: nextDiagnostic,
    };
    saveHistory([nextEntry, ...history.filter((entry) => entry.problem !== cleanedProblem)].slice(0, 30));
  };

  const handleAnalyze = () => {
    const cleanedProblem = problem.trim();
    if (!cleanedProblem || loading || diagnosticLoading) return;
    void runAnalysis(problemBriefService.structure(cleanedProblem), undefined, analysisContext);
  };

  const handleVoiceConfirm = (brief: ProblemBrief, transcript?: { rawTranscript: string; cleanedTranscript: string }) => {
    setProblem(brief.problemStatement);
    void runAnalysis(brief, transcript);
  };

  const handleRetryDiagnostic = () => {
    if (!lastAnalysisRequest || diagnosticLoading) return;
    void runAnalysis(lastAnalysisRequest.brief, lastAnalysisRequest.transcript, lastAnalysisRequest.context);
  };

  const handleReopenHistory = (entry: AnalysisHistoryEntry) => {
    setProblem(entry.problem);
    setAnalyzedProblem(entry.problem);
    setActiveProblemBrief(entry.problemBrief ?? problemBriefService.structure(entry.problem));
    setActiveAnalysisDate(entry.date);
    setRecommendations(entry.recommendations.map((id) => {
      const framework = getFramework(id);
      return framework ? { framework, score: 1, matchReason: framework.description } : undefined;
    }).filter((item): item is Recommendation => Boolean(item)));
    setDiagnostic(entry.diagnostic ?? null);
    const savedApplication = entry.frameworkApplications?.at(-1) ?? null;
    setFrameworkApplication(savedApplication);
    setSelectedFramework(savedApplication ? getFramework(savedApplication.framework.id) ?? null : null);
    setDiagnosticLoading(false);
    setDiagnosticError("");
    setActivePage("Home");
  };

  const runFrameworkApplication = async (framework: Framework, brief: ProblemBrief, date: string) => {
    if (frameworkApplicationLoading) return;
    const requestId = ++frameworkRequestId.current;
    const controller = new AbortController();
    frameworkAbortController.current = controller;
    setSelectedFramework(framework);
    setFrameworkApplication(null);
    setFrameworkApplicationError("");
    setFrameworkApplicationLoading(true);
    const startedAt = Date.now();
    setFrameworkApplicationStartedAt(startedAt);
    setFrameworkApplicationElapsedMs(0);
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          problemBrief: brief,
          rawProblem: brief.problemStatement,
          cleanedTranscript: brief.problemStatement,
          businessFunction: analysisContext.businessFunction,
          objective: analysisContext.objective,
          timePeriod: analysisContext.timePeriod,
          availableMetrics: analysisContext.availableMetrics,
          constraints: analysisContext.constraints,
          frameworkId: framework.id,
          priorDiagnostic: diagnostic,
        }),
      });
      const payload = await response.json() as { error?: unknown; application?: unknown; providerMetadata?: unknown };
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "The framework analysis could not be completed.");
      }
      if (!isFrameworkApplication(payload.application)) {
        throw new Error("Gemini returned an incomplete framework analysis. Retry to request a validated result.");
      }
      const metadata = payload.providerMetadata;
      if (
        typeof metadata !== "object" || metadata === null
        || (metadata as Record<string, unknown>).provider !== "Google Gemini"
        || (metadata as Record<string, unknown>).requestStatus !== "success"
        || typeof (metadata as Record<string, unknown>).model !== "string"
      ) {
        throw new Error("The framework analysis did not include validated Gemini provider metadata.");
      }
      if (requestId !== frameworkRequestId.current) return;
      const completedApplication = { ...payload.application, providerMetadata: metadata } as FrameworkApplication;
      setFrameworkApplication(completedApplication);
      setActiveProblemBrief(brief);
      setAnalyzedProblem(brief.problemStatement);
      setProblem(brief.problemStatement);
      setActiveAnalysisDate(date);
      const updatedHistory = attachFrameworkApplication(history, date, completedApplication);
      if (updatedHistory) {
        saveHistory(updatedHistory.slice(0, 30));
      } else {
        const newEntry: AnalysisHistoryEntry = {
          problem: brief.problemStatement,
          date,
          recommendations: recommendations.map(({ framework: item }) => item.id),
          problemBrief: brief,
          ...(diagnostic ? { diagnostic } : {}),
          frameworkApplications: [completedApplication],
        };
        saveHistory([newEntry, ...history.filter((entry) => entry.problem !== brief.problemStatement)].slice(0, 30));
      }
    } catch (error) {
      if (requestId !== frameworkRequestId.current) return;
      setFrameworkApplicationError(error instanceof DOMException && error.name === "AbortError"
        ? "The framework request exceeded its 60-second deadline. Retry without losing the Problem Brief."
        : error instanceof Error ? error.message : "The framework analysis could not be completed.");
    } finally {
      window.clearTimeout(timeout);
      if (requestId === frameworkRequestId.current) {
        frameworkAbortController.current = null;
        setFrameworkApplicationLoading(false);
      }
    }
  };

  const handleApplyFramework = (framework: Framework) => {
    setSelectedFramework(framework);
    setFrameworkApplication(null);
    setFrameworkApplicationError("");
    const currentProblem = analyzedProblem.trim() || problem.trim();
    if (!currentProblem) {
      setFrameworkApplicationError("Enter a business problem before applying a framework.");
      return;
    }
    const brief = activeProblemBrief?.problemStatement === currentProblem
      ? activeProblemBrief
      : problemBriefService.structure(currentProblem);
    const existingEntry = history.find((entry) => entry.date === activeAnalysisDate && entry.problem === brief.problemStatement)
      ?? history.find((entry) => entry.problem === brief.problemStatement);
    const date = existingEntry?.date ?? new Date().toISOString();
    lastFrameworkRequest.current = { framework, brief, date };
    void runFrameworkApplication(framework, brief, date);
  };

  const handleRetryFrameworkApplication = () => {
    const request = lastFrameworkRequest.current;
    if (request && !frameworkApplicationLoading) void runFrameworkApplication(request.framework, request.brief, request.date);
  };

  const closeFrameworkApplication = () => {
    frameworkRequestId.current += 1;
    frameworkAbortController.current?.abort();
    frameworkAbortController.current = null;
    setFrameworkApplicationLoading(false);
    setSelectedFramework(null);
    setFrameworkApplication(null);
    setFrameworkApplicationError("");
  };

  const openFiveWhysWorkspace = () => {
    if (!activeProblemBrief) return;
    setSelectedFramework(null);
    setFiveWhysOpen(true);
  };

  const handleSaveFiveWhys = async (workspace: FiveWhysWorkspaceData) => {
    const updatedHistory = attachFiveWhysWorkspace(history, activeAnalysisDate, workspace);
    if (!updatedHistory) {
      throw new Error("The original analysis could not be found in local history.");
    }
    setHistory(updatedHistory);
    await browserHistoryRepository.save(updatedHistory);
  };

  const closeFiveWhys = () => {
    setFiveWhysOpen(false);
    setSelectedFramework(null);
  };

  const handleNavigate = (page: PageName) => {
    if (fiveWhysOpen) closeFiveWhys();
    setActivePage(page);
  };

  return (
    <div className="operations-app min-h-screen bg-[#191323] text-[#f3edf8]">
      <FloatingNavigation activePage={activePage} setActivePage={handleNavigate} />
      <main className="min-h-[calc(100vh-74px)]">
          {storageWarning && <p role="status" className="border-b border-[#eabf77]/20 bg-[#241f19] px-5 py-2.5 text-center text-[10px] text-[#e4c990] sm:px-8">Browser storage is unavailable. Analysis still works, but history won’t persist after you close this page.</p>}
          {fiveWhysOpen && activeProblemBrief ? (
            <FiveWhysWorkspace
              key={activeAnalysisDate}
              problemBrief={activeProblemBrief}
              savedWorkspace={history.find((entry) => entry.date === activeAnalysisDate)?.fiveWhys}
              onReturn={closeFiveWhys}
              onSave={handleSaveFiveWhys}
            />
          ) : (
            <>
              {activePage === "Home" && <HomePage problem={problem} setProblem={setProblem} context={analysisContext} setContext={setAnalysisContext} onAnalyze={handleAnalyze} onVoiceConfirm={handleVoiceConfirm} onRetry={handleRetryDiagnostic} loading={loading} recommendations={recommendations} analyzedProblem={analyzedProblem} onApply={handleApplyFramework} onNavigate={handleNavigate} diagnostic={diagnostic} diagnosticLoading={diagnosticLoading} diagnosticStage={diagnosticStage} diagnosticElapsedMs={diagnosticElapsedMs} diagnosticError={diagnosticError} />}
              {activePage === "Framework Library" && <LibraryPage onApply={handleApplyFramework} />}
              {activePage === "Analysis History" && <HistoryPage history={history} onReopen={handleReopenHistory} onClear={() => saveHistory([])} />}
              {activePage === "About" && <AboutPage />}
            </>
          )}
      </main>
      {selectedFramework && !fiveWhysOpen && (
        <FrameworkApplicationPanel
          key={selectedFramework.id}
          framework={selectedFramework}
          problemBrief={analyzedProblem.trim() || problem.trim()
            ? activeProblemBrief?.problemStatement === (analyzedProblem || problem)
              ? activeProblemBrief
              : problemBriefService.structure(analyzedProblem || problem)
            : null}
          application={frameworkApplication}
          loading={frameworkApplicationLoading}
          error={frameworkApplicationError}
          elapsedMs={frameworkApplicationElapsedMs}
          onClose={closeFrameworkApplication}
          onRetry={handleRetryFrameworkApplication}
          onDescribeProblem={() => {
            closeFrameworkApplication();
            setActivePage("Home");
            window.setTimeout(() => document.getElementById("business-problem")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
          }}
          onOpenFiveWhys={openFiveWhysWorkspace}
        />
      )}
    </div>
  );
}
