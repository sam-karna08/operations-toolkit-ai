import { GoogleGenAI } from "@google/genai";
import { frameworks, getFramework, type Framework } from "./frameworks";
import {
  isFrameworkApplication,
  isOperationsDiagnostic,
  type FrameworkApplication,
  type FrameworkVisualizationKind,
  type OperationsDiagnostic,
} from "./diagnostic";
import type { ProblemBrief } from "./problem-brief";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_DIAGNOSTIC_TIMEOUT_MS = 45_000;
const MAX_DIAGNOSTIC_TIMEOUT_MS = 55_000;

export type DiagnosticContext = {
  rawProblem?: string;
  cleanedTranscript?: string;
  businessFunction?: string;
  objective?: string;
  timePeriod?: string;
  availableMetrics?: string;
  constraints?: string;
  selectedFrameworks?: string[];
};
type GeminiResponse = {
  text?: string | null;
};
type GeminiRequest = Parameters<GoogleGenAI["models"]["generateContent"]>[0];
type GeminiClient = {
  models: {
    generateContent: (request: GeminiRequest) => Promise<GeminiResponse>;
  };
};
type ProviderAttempt = "initial" | "repair";
type ProviderFailurePhase =
  | "missing-key"
  | "timeout"
  | "network"
  | "quota"
  | "http"
  | "response-content"
  | "diagnostic-json"
  | "diagnostic-expansion"
  | "schema-validation";

export class DiagnosticProviderError extends Error {
  constructor(
    message: string,
    readonly attempt: ProviderAttempt,
    readonly phase: ProviderFailurePhase,
    readonly statusCode?: number,
    readonly causeName?: string,
    readonly upstreamStatus?: string,
    readonly upstreamMessage?: string,
  ) {
    super(message);
    this.name = "DiagnosticProviderError";
  }
}

function upstreamErrorDetails(error: unknown) {
  if (!(error instanceof Error)) return {};
  let payload: { error?: { status?: unknown; message?: unknown } };
  try {
    payload = JSON.parse(error.message) as { error?: { status?: unknown; message?: unknown } };
  } catch {
    return {};
  }
  const status = typeof payload.error?.status === "string" ? payload.error.status.slice(0, 80) : undefined;
  const apiKey = process.env.GEMINI_API_KEY;
  const upstreamMessage = typeof payload.error?.message === "string"
    ? (apiKey?.trim() ? payload.error.message.replaceAll(apiKey, "[REDACTED]") : payload.error.message)
      .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, "$1[REDACTED]")
      .replace(/\s+/g, " ")
      .slice(0, 300)
    : undefined;
  return {
    ...(status ? { upstreamStatus: status } : {}),
    ...(upstreamMessage ? { upstreamMessage } : {}),
  };
}

function timeoutFromEnvironment() {
  const configured = Number(process.env.GEMINI_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_DIAGNOSTIC_TIMEOUT_MS;
  return Math.min(Math.floor(configured), MAX_DIAGNOSTIC_TIMEOUT_MS);
}

function frameworkCatalog(financial: boolean) {
  const relevantFinanceFrameworks = /^(?:Pareto Analysis|Fishbone Diagram|Bottleneck Analysis|DMAIC|Process Mapping|Value Chain Analysis|Root Cause Analysis)$/;
  return frameworks
    .filter(({ name }) => !financial || relevantFinanceFrameworks.test(name))
    .map(({ name, category, description }) => ({
      name,
      category,
      purpose: description.slice(0, 35),
    }));
}

export const diagnosticJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["problem", "context", "frameworksApplied", "causalFactors", "investigationPriorities", "recommendedActions", "executiveSummary"],
  properties: {
    problem: { type: "string", maxLength: 280 },
    context: {
      type: "object", additionalProperties: false, required: ["timePeriod", "processInvolved"],
      properties: {
        timePeriod: { type: "string", maxLength: 80 },
        processInvolved: { type: "string", maxLength: 100 },
        stakeholders: { type: "array", maxItems: 3, items: { type: "string", maxLength: 40 } },
      },
    },
    frameworksApplied: {
      type: "array", minItems: 1, maxItems: 2,
      items: {
        type: "object", additionalProperties: false, required: ["name", "reasonSelected", "keyInsight"],
        properties: {
          name: { type: "string", maxLength: 50 }, reasonSelected: { type: "string", maxLength: 90 },
          keyInsight: { type: "string", maxLength: 100 },
          relevantFindings: { type: "array", maxItems: 1, items: { type: "string", maxLength: 70 } },
        },
      },
    },
    causalFactors: {
      type: "array", minItems: 1, maxItems: 3,
      items: {
        type: "object", additionalProperties: false, required: ["title", "description", "priority", "confidence", "evidence", "validationRequired"],
        properties: {
          title: { type: "string", maxLength: 50 }, description: { type: "string", maxLength: 100 },
          priority: { type: "string", enum: ["High", "Medium", "Low"] },
          confidence: { type: "string", enum: ["High", "Moderate", "Low"] },
          evidence: { type: "array", minItems: 1, maxItems: 1, items: { type: "string", maxLength: 120 } },
          validationRequired: { type: "array", minItems: 1, maxItems: 1, items: { type: "string", maxLength: 120 } },
        },
      },
    },
    investigationPriorities: {
      type: "array", minItems: 3, maxItems: 3,
      items: {
        type: "object", additionalProperties: false, required: ["order", "test", "link", "data", "owner"],
        properties: {
          order: { type: "number" }, test: { type: "string", maxLength: 90 },
          link: { type: "string", maxLength: 100 },
          data: { type: "string", maxLength: 100 }, owner: { type: "string", maxLength: 50 },
        },
      },
    },
    recommendedActions: {
      type: "array", minItems: 3, maxItems: 3,
      items: {
        type: "object", additionalProperties: false, required: ["do", "why", "impact", "data", "owner"],
        properties: {
          do: { type: "string", maxLength: 90 }, why: { type: "string", maxLength: 90 },
          impact: { type: "string", maxLength: 90 }, data: { type: "string", maxLength: 100 },
          owner: { type: "string", maxLength: 50 },
        },
      },
    },
    executiveSummary: { type: "string", maxLength: 320 },
  },
} as const;

export const frameworkApplicationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "whyFit", "methodApplied", "limitations", "resultSummary", "confirmedFacts", "hypotheses",
    "missingEvidence", "uncertainties", "investigationPriorities", "recommendedActions", "visualization",
  ],
  properties: {
    whyFit: { type: "string", maxLength: 180 },
    methodApplied: { type: "string", maxLength: 240 },
    limitations: { type: "string", maxLength: 180 },
    resultSummary: { type: "string", maxLength: 280 },
    confirmedFacts: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", maxLength: 140 } },
    hypotheses: {
      type: "array", minItems: 1, maxItems: 5,
      items: {
        type: "object", additionalProperties: false,
        required: ["category", "title", "mechanism", "evidenceRequired", "confidence"],
        properties: {
          category: { type: "string", maxLength: 45 },
          title: { type: "string", maxLength: 80 },
          mechanism: { type: "string", maxLength: 160 },
          evidenceRequired: { type: "string", maxLength: 150 },
          confidence: { type: "string", enum: ["High", "Moderate", "Low"] },
        },
      },
    },
    missingEvidence: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", maxLength: 140 } },
    uncertainties: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", maxLength: 140 } },
    investigationPriorities: {
      type: "array", minItems: 3, maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        required: ["order", "action", "rationale", "evidenceRequired", "owner"],
        properties: {
          order: { type: "number" },
          action: { type: "string", maxLength: 120 },
          rationale: { type: "string", maxLength: 140 },
          evidenceRequired: { type: "string", maxLength: 140 },
          owner: { type: "string", maxLength: 50 },
        },
      },
    },
    recommendedActions: {
      type: "array", minItems: 3, maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        required: ["action", "rationale", "evidenceRequired", "owner", "kpi"],
        properties: {
          action: { type: "string", maxLength: 120 },
          rationale: { type: "string", maxLength: 140 },
          evidenceRequired: { type: "string", maxLength: 140 },
          owner: { type: "string", maxLength: 50 },
          kpi: { type: "string", maxLength: 100 },
        },
      },
    },
    visualization: {
      type: "object", additionalProperties: false, required: ["groups", "chain"],
      properties: {
        groups: {
          type: "array", minItems: 1, maxItems: 8,
          items: {
            type: "object", additionalProperties: false, required: ["label", "items"],
            properties: {
              label: { type: "string", maxLength: 50 },
              items: {
                type: "array",
                items: {
                  type: "object", additionalProperties: false, required: ["label", "detail", "status"],
                  properties: {
                    label: { type: "string", maxLength: 70 },
                    detail: { type: "string", maxLength: 120 },
                    status: { type: "string", enum: ["SUPPORTED", "HYPOTHESIS", "VALIDATION REQUIRED"] },
                  },
                },
              },
            },
          },
        },
        chain: { type: "array", maxItems: 6, items: { type: "string", maxLength: 140 } },
      },
    },
  },
} as const;

export function buildGeminiPrompt(brief: ProblemBrief, context: DiagnosticContext) {
  const problem = context.cleanedTranscript || context.rawProblem || brief.problemStatement;
  const short = (value: string) => value.slice(0, 180);
  const briefContext = {
    suspectedCauses: short(brief.possibleCauses),
    stakeholders: short(brief.stakeholders),
    outcome: short(brief.desiredOutcome),
    unknowns: short(brief.importantUnknowns),
  };
  const optionalContext = {
    businessFunction: context.businessFunction?.slice(0, 100),
    objective: context.objective?.slice(0, 180),
    timePeriod: context.timePeriod?.slice(0, 100),
    availableMetrics: context.availableMetrics?.slice(0, 250),
    constraints: context.constraints?.slice(0, 180),
  };
  const selectedFrameworks = context.selectedFrameworks?.slice(0, 3).map((name) => name.slice(0, 60));
  const isFinancialPlanning = /\b(?:FP&A|EBITDA|working capital|operating cash flow|price[- ]volume[- ]mix|PVM|budget|forecast|margin)\b/i.test(problem);
  const domainGuidance = isFinancialPlanning
    ? "For FP&A cases, consider price-volume-mix (PVM) and realized margin; budget-versus-actual rate/volume cost variance and forecast-assumption back-testing; working-capital movements and the EBITDA-to-cash bridge. If the user requests these related analyses but only three priorities are allowed, combine cost variance with forecast back-testing, and working capital with cash reconciliation rather than silently omitting requested areas. Connect revenue, EBITDA, and cash outcomes without assuming the cause."
    : "Choose operational analysis lenses from the problem's actual process, service, quality, capacity, supply, or customer context; do not force finance frameworks.";
  return `Act as a senior operations and performance consultant. Return only structured JSON with specific, decision-ready analysis.
Evidence rules: SUPPORTED is stated by the user. HYPOTHESIS is a plausible mechanism, never a proven cause. VALIDATION REQUIRED is the exact data/test needed to confirm or reject it. Causal-factor evidence may cite only supplied facts; never present a requested dataset as already observed. Never invent facts, root causes, owners, baselines, or savings. Quantify impact only when directly supported by supplied figures; otherwise describe the expected direction qualitatively.
Explain causal mechanisms: connect each symptom to the operational or financial outcome it can produce. Use supplied numbers accurately. Avoid generic advice, repeated framework descriptions, and filler.
${domainGuidance}
Return exactly 3 ordered investigation priorities and 3 practical corrective actions. Each priority: test (specific), link (causal/business value), data (evidence), owner (function). Each corrective action: do, why, impact, data, owner. Use concise phrases of 6–10 words per field. Recommend reversible pilots or monitoring until a cause is confirmed; never assert price, credit, staffing, or production changes without supporting evidence. Executive summary: one substantive 40–45 word management paragraph covering central issue, plausible causes, immediate investigations, and the explicit next management step; end with a complete sentence.
PROBLEM: ${problem}
BRIEF: ${JSON.stringify(briefContext)}
OPTIONAL USER CONTEXT: ${JSON.stringify(optionalContext)}
FRAMEWORKS: ${JSON.stringify(frameworkCatalog(isFinancialPlanning))}
${selectedFrameworks?.length ? `USER-SELECTED FRAMEWORKS: ${JSON.stringify(selectedFrameworks)}. Use these as the requested analytical lens, but note limits where evidence is insufficient.` : ""}`;
}

export function buildRepairPrompt(invalidJson: string) {
  return `Return corrected JSON only. Match this schema exactly:
${JSON.stringify(diagnosticJsonSchema)}
INVALID JSON:
${invalidJson.slice(0, 10000)}`;
}

function extractJson(content: string) {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new DiagnosticProviderError("Gemini returned no JSON object.", "initial", "diagnostic-json");
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new DiagnosticProviderError("Gemini returned invalid diagnostic JSON.", "initial", "diagnostic-json");
  }
}

function expandCompactDiagnostic(compact: Record<string, unknown>, brief: ProblemBrief): OperationsDiagnostic {
  const context = compact.context as { timePeriod?: string; processInvolved?: string; stakeholders?: string[] };
  const factors = ((compact.causalFactors ?? []) as Array<Partial<OperationsDiagnostic["causalFactors"][number]>>)
    .map((factor) => ({
      ...factor,
      evidence: factor.evidence ?? [],
      validationRequired: factor.validationRequired ?? [],
    })) as OperationsDiagnostic["causalFactors"];
  const frameworksApplied = (compact.frameworksApplied as Array<Record<string, unknown>> ?? []).map((item) => ({
    ...(item as OperationsDiagnostic["frameworksApplied"][number]),
    relevantFindings: (item as OperationsDiagnostic["frameworksApplied"][number]).relevantFindings ?? [],
  }));
  const safeContext = (value: string | undefined, fallback: string) =>
    !value || value.trim().toLocaleLowerCase() === "unknown" ? fallback : value;
  const priorities = (compact.investigationPriorities ?? []) as Array<Record<string, unknown>>;
  const actions = (compact.recommendedActions ?? []) as Array<Record<string, unknown>>;
  const supportedFacts = brief.knownFacts
    .split(/\n/)
    .map((item) => item.replace(/^[•*-]\s*/, "").trim())
    .filter((item) => item && !/^(?:unknown|not specified in the input\.?)$/i.test(item))
    .slice(0, 2);
  if (!supportedFacts.length && brief.problemStatement.trim()) supportedFacts.push(brief.problemStatement);
  const validationEvidence = Array.from(new Set([
    ...factors.flatMap((factor) => factor.validationRequired ?? []),
    ...priorities.map((item) => String(item.data ?? "")).filter(Boolean),
  ]));
  const evidenceItems: OperationsDiagnostic["evidenceItems"] = [
    ...supportedFacts.map((statement) => ({ statement, status: "SUPPORTED" as const, source: "user" })),
    ...factors.map((factor) => ({ statement: factor.description, status: "HYPOTHESIS" as const, source: "ai_inference", relatedFactor: factor.title })),
    ...validationEvidence.map((statement) => ({ statement, status: "VALIDATION REQUIRED" as const, source: "required_data" })),
  ];
  const nodes = [
    { id: "problem", label: String(compact.problem), kind: "problem" as const, description: "Confirmed problem" },
    ...factors.map((factor, index) => ({ id: `factor-${index}`, label: factor.title, kind: "factor" as const, description: factor.description })),
    { id: "outcome", label: "Operational impact", kind: "outcome" as const, description: "Observed impact" },
  ];
  return {
    mode: "GEMINI AI",
    problemBrief: brief,
    operationalContext: {
      problem: String(compact.problem),
      timePeriod: safeContext(context.timePeriod, "Time period not specified in the input."),
      processInvolved: safeContext(context.processInvolved, "Process detail not specified in the input."),
      potentialContributingAreas: factors.map((factor) => factor.title),
      stakeholders: context.stakeholders ?? brief.stakeholders.split(",").map((item) => item.trim()).filter(Boolean),
    },
    frameworksApplied,
    causalFactors: factors,
    visualNodes: nodes,
    visualRelationships: [
      ...factors.map((_, index) => ({ from: `factor-${index}`, to: "problem", label: "may contribute to" })),
      { from: "problem", to: "outcome", label: "leads to" },
    ],
    evidenceItems,
    hypotheses: factors.map((factor) => factor.description),
    validationRequirements: factors.flatMap((factor) => factor.validationRequired ?? []),
    investigationPriorities: priorities.map((item) => ({
      order: Number(item.order),
      action: String(item.test ?? ""),
      reason: String(item.link ?? ""),
      whyItMatters: String(item.link ?? ""),
      evidenceRequired: String(item.data ?? ""),
      owner: String(item.owner ?? ""),
    })),
    recommendedActions: actions.map((item) => ({
      action: String(item.do ?? ""),
      reason: String(item.why ?? ""),
      expectedImpact: String(item.impact ?? ""),
      evidenceRequired: String(item.data ?? ""),
      owner: String(item.owner ?? ""),
    })),
    executiveSummary: String(compact.executiveSummary),
  };
}

function visualizationKind(frameworkId: string): FrameworkVisualizationKind {
  if (frameworkId === "fishbone") return "fishbone";
  if (frameworkId === "five-whys") return "five-whys";
  if (frameworkId === "sipoc") return "sipoc";
  if (frameworkId === "pareto" || frameworkId === "inventory-abc") return "pareto";
  if (frameworkId === "swot") return "swot";
  if (frameworkId === "process-mapping" || frameworkId === "scor") return "process-map";
  if (frameworkId === "pestel" || frameworkId === "porters-five-forces" || frameworkId === "bcg-matrix") return "matrix";
  if (["dmaic", "pdca", "value-chain", "bottleneck-analysis", "toc"].includes(frameworkId)) return "process-map";
  return "flow";
}

export function buildFrameworkApplicationPrompt(
  brief: ProblemBrief,
  framework: Framework,
  context: DiagnosticContext = {},
  priorDiagnostic?: OperationsDiagnostic,
) {
  const optionalContext = {
    businessFunction: context.businessFunction?.slice(0, 100),
    objective: context.objective?.slice(0, 160),
    timePeriod: context.timePeriod?.slice(0, 80),
    availableMetrics: context.availableMetrics?.slice(0, 220),
    constraints: context.constraints?.slice(0, 140),
  };
  const priorEvidence = priorDiagnostic ? {
    facts: priorDiagnostic.evidenceItems.filter((item) => item.status === "SUPPORTED").slice(0, 3).map((item) => item.statement),
    hypotheses: priorDiagnostic.causalFactors.slice(0, 4).map(({ title, description, validationRequired }) => ({ title, description, validationRequired: validationRequired.slice(0, 1) })),
  } : undefined;
  const supportingText = (value: string) => value.slice(0, 400);
  const briefContext = {
    businessContext: supportingText(brief.businessContext),
    observableSymptoms: supportingText(brief.observableSymptoms),
    knownFacts: supportingText(brief.knownFacts),
    possibleCauses: supportingText(brief.possibleCauses),
    stakeholders: supportingText(brief.stakeholders),
    desiredOutcome: supportingText(brief.desiredOutcome),
    importantUnknowns: supportingText(brief.importantUnknowns),
    assumptions: supportingText(brief.assumptions),
  };
  const visualizationGuidance = framework.id === "fishbone"
    ? "Groups must be cause categories; group items are testable hypotheses, never confirmed causes."
    : framework.id === "five-whys"
      ? "Build a cautious causal chain. Include the problem in chain[0], then at most five why-levels. Keep unsupported links explicitly hypothetical."
      : framework.id === "sipoc"
        ? "Use five groups in this order: Suppliers, Inputs, Process, Outputs, Customers. Keep process steps high-level and grounded in the brief."
        : framework.id === "pareto" || framework.id === "inventory-abc"
          ? "Rank only supplied categories or state that ranking is unavailable. Do not invent counts, percentages, values, chart bars, or cumulative contributions; use VALIDATION REQUIRED where numeric input is absent."
          : framework.id === "swot"
            ? "Use four groups: Strengths, Weaknesses, Opportunities, Threats. Mark external or internal items as hypotheses unless the user supplied supporting facts."
            : framework.id === "pestel"
              ? "Use six groups: Political, Economic, Social, Technological, Environmental, Legal. Keep unsupported environmental factors as hypotheses and identify current external evidence needed."
              : framework.id === "porters-five-forces"
                ? "Use five groups: Competitive rivalry, New entrants, Substitutes, Buyer power, Supplier power. Do not invent competitors, shares, or bargaining facts."
                : framework.id === "bcg-matrix"
                  ? "Use four groups: Stars, Cash cows, Question marks, Dogs. Do not assign products to a quadrant without supplied relative-market-share and market-growth data; show the required inputs."
            : framework.id === "process-mapping" || framework.id === "scor"
                ? "Groups represent ordered stages, decisions, or handoffs from the user's process. Identify waits only when stated or mark them as hypotheses."
                : ["dmaic", "pdca", "value-chain", "bottleneck-analysis", "toc"].includes(framework.id)
                  ? "Use ordered, named phases or stages from this method and map each to the user's problem. Do not assert an unobserved constraint or improvement."
                  : "Use groups that match the selected method and this specific business problem. Avoid generic filler.";
  return `Apply the selected analytical method to the actual user problem. Return only structured JSON.
Method: ${framework.name} (${framework.category}). Purpose: ${framework.description}
Fit guidance: ${framework.why} Best used when: ${framework.when}
Method-specific visualization: ${visualizationGuidance}
Evidence integrity: confirmedFacts must repeat only user-supplied facts. All inferred causes stay HYPOTHESIS, with a specific evidence test. Do not invent data, root causes, percentages, impacts, owners, or completed work. If numerical evidence is missing, show that explicitly and do not draw quantitative conclusions.
Explain how the method transforms this specific problem, the result that follows from current information, limits, missing evidence, uncertainty, exactly 3 ranked investigations, and exactly 3 practical next actions. Keep language concrete and concise. Provide a function-level owner and a measurable KPI for each action; if no baseline exists, name a measurement to establish rather than an invented target.
The problem description below is complete and authoritative; supporting brief fields may summarize it.
PROBLEM: ${context.cleanedTranscript || context.rawProblem || brief.problemStatement}
CONFIRMED PROBLEM BRIEF: ${JSON.stringify(briefContext)}
OPTIONAL USER CONTEXT: ${JSON.stringify(optionalContext)}
${priorEvidence ? `PRIOR VALIDATED DIAGNOSTIC EVIDENCE: ${JSON.stringify(priorEvidence)}` : ""}
For visualization groups, include meaningful nodes only, with no more than 8 nodes per group. Node status must be SUPPORTED only when directly stated; use HYPOTHESIS or VALIDATION REQUIRED otherwise.`;
}

export function buildFrameworkRepairPrompt(invalidJson: string) {
  return `Return corrected JSON only. Match this schema exactly:
${JSON.stringify(frameworkApplicationJsonSchema)}
INVALID JSON:
${invalidJson.slice(0, 9000)}`;
}

export function parseFrameworkApplication(
  content: string,
  brief: ProblemBrief,
  framework: Framework,
): FrameworkApplication {
  const compact = extractJson(content);
  const visual = compact.visualization as FrameworkApplication["visualization"];
  const sourceFacts = [brief.observableSymptoms, brief.knownFacts]
    .flatMap((value) => value.split(/\n/))
    .map((item) => item.replace(/^[•*-]\s*/, "").trim())
    .filter((item) => item && !/^(?:unknown|not specified in the input\.?)$/i.test(item))
    .slice(0, 8);
  const application: FrameworkApplication = {
    framework: { id: framework.id, name: framework.name },
    problem: brief.problemStatement,
    whyFit: String(compact.whyFit ?? ""),
    methodApplied: String(compact.methodApplied ?? ""),
    limitations: String(compact.limitations ?? ""),
    resultSummary: String(compact.resultSummary ?? ""),
    confirmedFacts: sourceFacts.length ? sourceFacts : [brief.problemStatement],
    hypotheses: (compact.hypotheses ?? []) as FrameworkApplication["hypotheses"],
    missingEvidence: (compact.missingEvidence ?? []) as string[],
    uncertainties: (compact.uncertainties ?? []) as string[],
    investigationPriorities: (compact.investigationPriorities ?? []) as FrameworkApplication["investigationPriorities"],
    recommendedActions: (compact.recommendedActions ?? []) as FrameworkApplication["recommendedActions"],
    visualization: {
      kind: visualizationKind(framework.id),
      groups: visual?.groups ?? [],
      chain: visual?.chain ?? [],
    },
  };
  if (!isFrameworkApplication(application)) {
    throw new DiagnosticProviderError("Framework application failed schema validation.", "initial", "schema-validation");
  }
  return application;
}

export function parseGeminiDiagnostic(content: string, problemBrief: ProblemBrief): OperationsDiagnostic {
  const compact = extractJson(content);
  let diagnostic: OperationsDiagnostic;
  try {
    diagnostic = expandCompactDiagnostic(compact, problemBrief);
  } catch {
    throw new DiagnosticProviderError("Could not expand the compact diagnostic.", "initial", "diagnostic-expansion");
  }
  if (!isOperationsDiagnostic(diagnostic)) {
    throw new DiagnosticProviderError("Gemini diagnostic failed schema validation.", "initial", "schema-validation");
  }
  return diagnostic;
}

export async function requestGeminiFrameworkApplication(
  brief: ProblemBrief,
  frameworkId: string,
  context: DiagnosticContext = {},
  priorDiagnostic?: OperationsDiagnostic,
  options: {
    client?: GeminiClient;
    model?: string;
    timeoutMs?: number;
  } = {},
) {
  const framework = getFramework(frameworkId);
  if (!framework) {
    throw new DiagnosticProviderError("The selected framework is not in the framework library.", "initial", "schema-validation");
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!options.client && !apiKey?.trim()) {
    throw new DiagnosticProviderError(
      "Set GEMINI_API_KEY in .env.local to enable Gemini framework application.",
      "initial",
      "missing-key",
    );
  }
  const client: GeminiClient = options.client ?? new GoogleGenAI({ apiKey: apiKey!.trim() });
  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  const timeoutMs = Math.min(options.timeoutMs ?? timeoutFromEnvironment(), MAX_DIAGNOSTIC_TIMEOUT_MS);
  const deadline = Date.now() + timeoutMs;
  const call = async (content: string, attempt: ProviderAttempt) => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new DiagnosticProviderError("Gemini framework application request timed out.", attempt, "timeout");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingMs);
    try {
      let response: GeminiResponse;
      try {
        response = await client.models.generateContent({
          model,
          contents: content,
          config: {
            systemInstruction: "Apply the requested business framework to the supplied evidence. Return structured JSON only; do not reveal private reasoning.",
            responseMimeType: "application/json",
            responseSchema: frameworkApplicationJsonSchema,
            temperature: 0.2,
            maxOutputTokens: attempt === "repair" ? 1000 : 1800,
            abortSignal: controller.signal,
            httpOptions: {
              timeout: remainingMs,
              retryOptions: { attempts: 1 },
            },
          },
        });
      } catch (error) {
        const statusCode = typeof error === "object" && error !== null && "status" in error
          && typeof error.status === "number" ? error.status : undefined;
        const causeName = error instanceof Error ? error.name : undefined;
        const message = error instanceof Error ? error.message : "";
        const details = upstreamErrorDetails(error);
        const timedOut = controller.signal.aborted || /timeout|timed out|abort/i.test(`${causeName ?? ""} ${message}`);
        const quotaExceeded = /quota|resource[_ ]exhausted|rate.?limit|billing/i.test(message);
        const phase = timedOut ? "timeout" : quotaExceeded ? "quota" : statusCode ? "http" : "network";
        throw new DiagnosticProviderError(
          timedOut ? "Gemini framework application request timed out."
            : quotaExceeded ? "Gemini API quota or rate limit was reached."
              : statusCode ? "Gemini rejected the framework application request."
                : "Could not connect to the Gemini API.",
          attempt,
          phase,
          statusCode,
          causeName,
          details.upstreamStatus,
          details.upstreamMessage,
        );
      }
      if (typeof response.text !== "string" || !response.text.trim()) {
        throw new DiagnosticProviderError("Gemini returned no framework application.", attempt, "response-content");
      }
      return response.text;
    } finally {
      clearTimeout(timeout);
    }
  };
  const prompt = buildFrameworkApplicationPrompt(brief, framework, context, priorDiagnostic);
  const initial = await call(prompt, "initial");
  try {
    return parseFrameworkApplication(initial, brief, framework);
  } catch (error) {
    const initialError = error instanceof DiagnosticProviderError
      ? error
      : new DiagnosticProviderError("Could not parse the framework application.", "initial", "diagnostic-json");
    const repaired = await call(buildFrameworkRepairPrompt(initial), "repair");
    try {
      return parseFrameworkApplication(repaired, brief, framework);
    } catch (repairError) {
      const finalError = repairError instanceof DiagnosticProviderError
        ? repairError
        : new DiagnosticProviderError("Could not parse the repaired framework application.", "repair", "diagnostic-json");
      throw new DiagnosticProviderError(finalError.message || initialError.message, "repair", finalError.phase);
    }
  }
}

export async function requestGeminiDiagnostic(
  brief: ProblemBrief,
  context: DiagnosticContext,
  options: {
    client?: GeminiClient;
    model?: string;
    repair?: boolean;
    invalidContent?: string;
    timeoutMs?: number;
  } = {},
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!options.client && !apiKey?.trim()) {
    throw new DiagnosticProviderError(
      "Set GEMINI_API_KEY in .env.local to enable Gemini diagnostics.",
      "initial",
      "missing-key",
    );
  }
  const client: GeminiClient = options.client ?? new GoogleGenAI({ apiKey: apiKey!.trim() });
  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  const timeoutMs = Math.min(options.timeoutMs ?? timeoutFromEnvironment(), MAX_DIAGNOSTIC_TIMEOUT_MS);
  const deadline = Date.now() + timeoutMs;
  const call = async (content: string, attempt: ProviderAttempt) => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new DiagnosticProviderError("Gemini diagnostic request timed out.", attempt, "timeout");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingMs);
    try {
      let response: GeminiResponse;
      try {
        response = await client.models.generateContent({
          model,
          contents: content,
          config: {
            systemInstruction: "Return concise diagnostic JSON only. Do not include private reasoning.",
            responseMimeType: "application/json",
            responseSchema: diagnosticJsonSchema,
            temperature: 0.2,
            maxOutputTokens: attempt === "repair" ? 1000 : 1200,
            abortSignal: controller.signal,
            httpOptions: {
              timeout: remainingMs,
              retryOptions: { attempts: 1 },
            },
          },
        });
      } catch (error) {
        const statusCode = typeof error === "object" && error !== null && "status" in error
          && typeof error.status === "number" ? error.status : undefined;
        const causeName = error instanceof Error ? error.name : undefined;
        const message = error instanceof Error ? error.message : "";
        const details = upstreamErrorDetails(error);
        const timedOut = controller.signal.aborted || /timeout|timed out|abort/i.test(`${causeName ?? ""} ${message}`);
        const quotaExceeded = /quota|resource[_ ]exhausted|rate.?limit|billing/i.test(message);
        const phase = timedOut ? "timeout" : quotaExceeded ? "quota" : statusCode ? "http" : "network";
        throw new DiagnosticProviderError(
          timedOut ? "Gemini diagnostic request timed out."
            : quotaExceeded ? "Gemini API quota or rate limit was reached."
              : statusCode ? "Gemini rejected the diagnostic request."
              : "Could not connect to the Gemini API.",
          attempt,
          phase,
          statusCode,
          causeName,
          details.upstreamStatus,
          details.upstreamMessage,
        );
      }
      if (typeof response.text !== "string" || !response.text.trim()) {
        throw new DiagnosticProviderError("Gemini returned no diagnostic text.", attempt, "response-content");
      }
      return response.text;
    } finally {
      clearTimeout(timeout);
    }
  };
  const initialContent = await call(
    options.repair && options.invalidContent ? buildRepairPrompt(options.invalidContent) : buildGeminiPrompt(brief, context),
    options.repair ? "repair" : "initial",
  );
  try {
    return parseGeminiDiagnostic(initialContent, brief);
  } catch (error) {
    if (options.repair) throw error;
    const parseError = error instanceof DiagnosticProviderError
      ? error
      : new DiagnosticProviderError("Could not parse the Gemini diagnostic.", "initial", "diagnostic-json");
    console.warn("[diagnostic] Structured output needs repair.", {
      attempt: parseError.attempt,
      phase: parseError.phase,
    });
    const repaired = await call(buildRepairPrompt(initialContent), "repair");
    try {
      return parseGeminiDiagnostic(repaired, brief);
    } catch (repairError) {
      const parseRepairError = repairError instanceof DiagnosticProviderError
        ? repairError
        : new DiagnosticProviderError("Could not parse the repaired diagnostic.", "repair", "diagnostic-json");
      throw new DiagnosticProviderError(parseRepairError.message, "repair", parseRepairError.phase);
    }
  }
}
