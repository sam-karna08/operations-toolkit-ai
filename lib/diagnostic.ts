import { analyzeProblem } from "./analyzer";
import type { ProblemBrief } from "./problem-brief";

export type DiagnosticMode = "GEMINI AI" | "LOCAL AI" | "DEMO / FALLBACK";
export type DiagnosticPriority = "High" | "Medium" | "Low";
export type DiagnosticConfidence = "High" | "Moderate" | "Low";

export type OperationalContext = {
  problem: string;
  timePeriod: string;
  processInvolved: string;
  potentialContributingAreas: string[];
  stakeholders: string[];
};

export type CausalFactor = {
  title: string;
  description: string;
  priority: DiagnosticPriority;
  confidence: DiagnosticConfidence;
  evidence: string[];
  validationRequired: string[];
};

export type AppliedFramework = {
  name: string;
  reasonSelected: string;
  keyInsight: string;
  relevantFindings: string[];
};

export type EvidenceItem = {
  statement: string;
  status: "SUPPORTED" | "HYPOTHESIS" | "VALIDATION REQUIRED";
  source: string;
  relatedFactor?: string;
};

export type VisualNode = {
  id: string;
  label: string;
  kind: "problem" | "factor" | "contributor" | "outcome" | "validation";
  description?: string;
};

export type VisualRelationship = {
  from: string;
  to: string;
  label: string;
};

export type InvestigationPriority = {
  order: number;
  action: string;
  reason: string;
  whyItMatters?: string;
  evidenceRequired?: string;
  owner?: string;
};

export type RecommendedAction = {
  action: string;
  reason: string;
  expectedImpact: string;
  evidenceRequired: string;
  owner: string;
};

export type DiagnosticProviderMetadata = {
  provider: "Google Gemini";
  model: string;
  deployment: "local-development" | "preview" | "production" | "unknown";
  modelConfigSource: "GEMINI_MODEL" | "default";
  requestStatus: "success" | "fallback";
  elapsedMs: number;
};

export type FrameworkVisualizationKind =
  | "fishbone"
  | "five-whys"
  | "sipoc"
  | "process-map"
  | "pareto"
  | "swot"
  | "flow"
  | "matrix";

export type FrameworkVisualizationGroup = {
  label: string;
  items: Array<{
    label: string;
    detail: string;
    status: "SUPPORTED" | "HYPOTHESIS" | "VALIDATION REQUIRED";
  }>;
};

export type FrameworkApplication = {
  framework: { id: string; name: string };
  problem: string;
  whyFit: string;
  methodApplied: string;
  limitations: string;
  resultSummary: string;
  confirmedFacts: string[];
  hypotheses: Array<{
    category: string;
    title: string;
    mechanism: string;
    evidenceRequired: string;
    confidence: DiagnosticConfidence;
  }>;
  missingEvidence: string[];
  uncertainties: string[];
  investigationPriorities: Array<{
    order: number;
    action: string;
    rationale: string;
    evidenceRequired: string;
    owner: string;
  }>;
  recommendedActions: Array<{
    action: string;
    rationale: string;
    evidenceRequired: string;
    owner: string;
    kpi: string;
  }>;
  visualization: {
    kind: FrameworkVisualizationKind;
    groups: FrameworkVisualizationGroup[];
    chain: string[];
  };
  providerMetadata?: DiagnosticProviderMetadata;
};

export type OperationsDiagnostic = {
  mode: DiagnosticMode;
  notice?: string;
  providerMetadata?: DiagnosticProviderMetadata;
  problemBrief: ProblemBrief;
  operationalContext: OperationalContext;
  frameworksApplied: AppliedFramework[];
  causalFactors: CausalFactor[];
  visualNodes: VisualNode[];
  visualRelationships: VisualRelationship[];
  evidenceItems: EvidenceItem[];
  hypotheses: string[];
  validationRequirements: string[];
  investigationPriorities: InvestigationPriority[];
  recommendedActions: RecommendedAction[];
  executiveSummary: string;
};

const unknown = "Unknown";

function bulletValues(value: string) {
  return value
    .split(/\n/)
    .map((item) => item.replace(/^[•*-]\s*/, "").trim())
    .filter((item) => item && !/^(?:unknown|not specified in the input\.?)$/i.test(item));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function contextTime(transcript: string) {
  const match = transcript.match(/\b(?:over|during|for)\s+(?:the\s+)?(?:last|past|previous)\s+[^,.!?]+/i);
  return match ? match[0].replace(/^(?:over|during|for)\s+/i, "").trim() : unknown;
}

function factorFromCause(cause: string, problem: string, index: number): CausalFactor {
  const title = cause.replace(/[.!?]+$/, "");
  const normalized = title.toLowerCase();
  const isApproval = normalized.includes("approval");
  const isResponse = normalized.includes("response");
  const evidence = isApproval
    ? ["The Problem Brief mentions approval stages or approval-process complexity."]
    : isResponse
      ? ["The Problem Brief mentions response time as a possible contributor."]
      : ["The Problem Brief identifies this as a possible cause, not an established fact."];
  const validation = isApproval
    ? ["Measure time spent at each approval stage and check for duplicate reviews."]
    : isResponse
      ? ["Compare current response time with historical performance."]
      : [`Compare ${title.toLowerCase()} with complaint categories over the stated period.`];
  return {
    title,
    description: `${title} may be contributing to the stated problem.`,
    priority: index < 2 ? "High" : "Medium",
    confidence: index === 0 ? "Moderate" : "Low",
    evidence,
    validationRequired: validation,
  };
}

function preliminaryEvidenceRequests(brief: ProblemBrief) {
  const requests = brief.importantUnknowns
    .split(/\n|(?<=[.!?])\s+(?=[A-Z])/)
    .map((item) => item.replace(/^[•*-]\s*/, "").trim())
    .filter((item) => item && !/^(?:unknown|not specified in the input\.?)$/i.test(item));
  if (requests.length) return requests;
  if (/\b(?:EBITDA|working capital|cash flow|price[- ]volume[- ]mix|PVM|budget|forecast|margin)\b/i.test(`${brief.problemStatement} ${brief.knownFacts}`)) {
    return [
      "Build price-volume-mix and realized-margin bridges by product and period.",
      "Reconcile actual-versus-budget cost variances by category and production volume.",
      "Trace receivables, inventory, and payables changes to operating cash flow.",
    ];
  }
  return [
    `Establish a dated baseline for ${brief.problemStatement.toLocaleLowerCase()}`,
    "Segment the baseline by process step, product, customer, or location as relevant.",
    "Compare the affected period with a prior stable period and record exceptions.",
  ];
}

export function buildFallbackDiagnostic(problemBrief: ProblemBrief, notice?: string): OperationsDiagnostic {
  const causes = bulletValues(problemBrief.possibleCauses);
  const problem = !problemBrief.problemStatement || /^(?:unknown|not specified in the input\.?)$/i.test(problemBrief.problemStatement.trim())
    ? "the stated operational issue"
    : problemBrief.problemStatement.replace(/[.!?]+$/, "");
  const factors = causes.length
    ? causes.map((cause, index) => factorFromCause(cause, problem, index))
    : [{
      title: "Cause not established",
      description: "The reported outcome is clear, but the input does not establish its cause.",
      priority: "High" as const,
      confidence: "Low" as const,
      evidence: [problemBrief.knownFacts],
      validationRequired: preliminaryEvidenceRequests(problemBrief).slice(0, 1),
    }];
  const recommendations = analyzeProblem(problemBrief);
  const frameworksApplied = recommendations.slice(0, 5).map(({ framework, matchReason }) => ({
    name: framework.name,
    reasonSelected: matchReason,
    keyInsight: framework.description,
    relevantFindings: framework.steps.slice(0, 2).map((step) => step.replaceAll("{{problem}}", problem)),
  }));
  const nodes: VisualNode[] = [
    { id: "problem", label: problemBrief.problemStatement, kind: "problem", description: "Confirmed problem statement" },
    ...factors.map((factor, index) => ({ id: `factor-${index}`, label: factor.title, kind: "factor" as const })),
    { id: "outcome", label: "Operational impact", kind: "outcome", description: "Observed or stated impact" },
  ];
  const relationships = [
    ...factors.map((factor, index) => ({ from: `factor-${index}`, to: "problem", label: "may contribute to" })),
    { from: "problem", to: "outcome", label: "creates" },
  ];
  const validationRequirements = factors.flatMap((factor) => factor.validationRequired);
  const targetedRequests = causes.length
    ? factors.map((factor) => factor.validationRequired[0])
    : preliminaryEvidenceRequests(problemBrief);
  const investigationPriorities = targetedRequests.slice(0, 3).map((request, index) => ({
    order: index + 1,
    action: `Complete this diagnostic: ${request}`,
    reason: causes.length ? `Test whether ${factors[index]?.title.toLowerCase()} contributes to the problem.` : "The input reports an outcome but does not identify its driver.",
    whyItMatters: "This distinguishes the actual driver from unverified explanations before corrective changes.",
    evidenceRequired: request,
  }));
  const evidenceItems: EvidenceItem[] = [
    { statement: problemBrief.problemStatement, status: "SUPPORTED", source: "user" },
    ...factors.map((factor) => ({ statement: factor.description, status: "HYPOTHESIS" as const, source: "ai_inference", relatedFactor: factor.title })),
    ...unique(targetedRequests).map((statement) => ({ statement, status: "VALIDATION REQUIRED" as const, source: "required_data" })),
  ];
  return {
    mode: "DEMO / FALLBACK",
    ...(notice ? { notice } : {}),
    problemBrief,
    operationalContext: {
      problem: problemBrief.problemStatement,
      timePeriod: contextTime(`${problemBrief.businessContext} ${problemBrief.knownFacts}`),
      processInvolved: problemBrief.businessContext === unknown ? unknown : problemBrief.businessContext,
      potentialContributingAreas: causes.length ? causes : [unknown],
      stakeholders: bulletValues(problemBrief.stakeholders),
    },
    frameworksApplied,
    causalFactors: factors,
    visualNodes: nodes,
    visualRelationships: relationships,
    evidenceItems,
    hypotheses: factors.map((factor) => factor.description),
    validationRequirements: unique(targetedRequests),
    investigationPriorities,
    recommendedActions: targetedRequests.slice(0, 3).map((request, index) => ({
      action: causes.length
        ? `Pilot a control that tests ${factors[index % factors.length].title.toLocaleLowerCase()}.`
        : `Run a time-bounded diagnostic: ${request}`,
      reason: causes.length
        ? `Do not scale a process change until ${factors[index % factors.length].title.toLocaleLowerCase()} is supported by data.`
        : "No root cause is established; use this analysis to target a reversible test.",
      expectedImpact: "Identify the driver and focus corrective effort; no savings estimate is supported yet.",
      evidenceRequired: request,
      owner: /\b(?:EBITDA|working capital|cash flow|price[- ]volume[- ]mix|PVM|budget|forecast|margin)\b/i.test(problem)
        ? "FP&A / Finance"
        : "Relevant process owner",
    })),
    executiveSummary: causes.length
      ? `The reported issue is ${problem}. The input names ${causes.map((factor) => factor.toLocaleLowerCase()).join(", ")} as possible contributors, not confirmed causes. Validate the highest-impact areas with the listed evidence before changing controls or scaling a remedy. No quantified impact is asserted because the baseline is not established.`
      : `The reported issue is ${problem}. Its cause is not established by the supplied information, so avoid treating any explanation as fact. Prioritize the requested evidence checks, then run a reversible corrective pilot against the measured driver. No quantified impact is asserted because no savings baseline is provided.`,
  };
}

export function isOperationsDiagnostic(value: unknown): value is OperationsDiagnostic {
  if (typeof value !== "object" || value === null) return false;
  const diagnostic = value as Record<string, unknown>;
  const isStringArray = (items: unknown) => Array.isArray(items) && items.every((item) => typeof item === "string");
  const isBrief = (brief: unknown) =>
    typeof brief === "object" &&
    brief !== null &&
    ["problemStatement", "businessContext", "observableSymptoms", "knownFacts", "possibleCauses", "stakeholders", "desiredOutcome", "importantUnknowns", "assumptions"]
      .every((key) => typeof (brief as Record<string, unknown>)[key] === "string");
  const isNonEmptyString = (item: unknown) => typeof item === "string" && item.trim().length > 0;
  const isFactor = (factor: unknown) => {
    if (typeof factor !== "object" || factor === null) return false;
    const item = factor as Record<string, unknown>;
    return typeof item.title === "string" && typeof item.description === "string"
      && ["High", "Medium", "Low"].includes(String(item.priority))
      && ["High", "Moderate", "Low"].includes(String(item.confidence))
      && isStringArray(item.evidence) && item.evidence.length > 0
      && isStringArray(item.validationRequired) && item.validationRequired.length > 0;
  };
  const isFramework = (framework: unknown) => {
    if (typeof framework !== "object" || framework === null) return false;
    const item = framework as Record<string, unknown>;
    return typeof item.name === "string" && typeof item.reasonSelected === "string"
      && typeof item.keyInsight === "string" && isStringArray(item.relevantFindings);
  };
  const isEvidence = (item: unknown) => {
    if (typeof item !== "object" || item === null) return false;
    const evidence = item as Record<string, unknown>;
    return typeof evidence.statement === "string"
      && ["SUPPORTED", "HYPOTHESIS", "VALIDATION REQUIRED"].includes(String(evidence.status))
      && typeof evidence.source === "string";
  };
  const isPrioritizedRecommendation = (item: unknown) => {
    if (typeof item !== "object" || item === null) return false;
    const priority = item as Record<string, unknown>;
    return typeof priority.order === "number"
      && ["action", "reason", "whyItMatters", "evidenceRequired", "owner"].every(
        (key) => typeof priority[key] === "string" && (priority[key] as string).trim().length > 0,
      );
  };
  const isRecommendedAction = (item: unknown) => {
    if (typeof item !== "object" || item === null) return false;
    const action = item as Record<string, unknown>;
    return ["action", "reason", "expectedImpact", "evidenceRequired", "owner"].every(
      (key) => typeof action[key] === "string" && (action[key] as string).trim().length > 0,
    );
  };
  const hasBasicPriority = (item: unknown) =>
    typeof item === "object" && item !== null
    && typeof (item as Record<string, unknown>).order === "number"
    && typeof (item as Record<string, unknown>).action === "string"
    && typeof (item as Record<string, unknown>).reason === "string";
  const hasBasicAction = (item: unknown) =>
    typeof item === "object" && item !== null
    && ["action", "reason", "expectedImpact", "evidenceRequired", "owner"].every(
      (key) => typeof (item as Record<string, unknown>)[key] === "string",
    );
  const aiGenerated = diagnostic.mode === "GEMINI AI" || diagnostic.mode === "LOCAL AI";
  return (
    (aiGenerated || diagnostic.mode === "DEMO / FALLBACK") &&
    isBrief(diagnostic.problemBrief) &&
    typeof diagnostic.operationalContext === "object" &&
    diagnostic.operationalContext !== null &&
    ["problem", "timePeriod", "processInvolved"].every(
      (key) => isNonEmptyString((diagnostic.operationalContext as Record<string, unknown>)[key]),
    ) &&
    isStringArray((diagnostic.operationalContext as Record<string, unknown>).potentialContributingAreas) &&
    isStringArray((diagnostic.operationalContext as Record<string, unknown>).stakeholders) &&
    Array.isArray(diagnostic.frameworksApplied) &&
    diagnostic.frameworksApplied.every(isFramework) &&
    Array.isArray(diagnostic.causalFactors) &&
    diagnostic.causalFactors.every(isFactor) &&
    Array.isArray(diagnostic.visualNodes) &&
    diagnostic.visualNodes.every((node) => typeof node === "object" && node !== null && typeof (node as Record<string, unknown>).id === "string" && typeof (node as Record<string, unknown>).label === "string") &&
    Array.isArray(diagnostic.visualRelationships) &&
    diagnostic.visualRelationships.every((relationship) => typeof relationship === "object" && relationship !== null && typeof (relationship as Record<string, unknown>).from === "string" && typeof (relationship as Record<string, unknown>).to === "string" && typeof (relationship as Record<string, unknown>).label === "string") &&
    Array.isArray(diagnostic.evidenceItems) &&
    diagnostic.evidenceItems.length > 0 &&
    diagnostic.evidenceItems.every(isEvidence) &&
    Array.isArray(diagnostic.hypotheses) &&
    isStringArray(diagnostic.hypotheses) &&
    Array.isArray(diagnostic.validationRequirements) &&
    isStringArray(diagnostic.validationRequirements) &&
    Array.isArray(diagnostic.investigationPriorities) &&
    (aiGenerated
      ? diagnostic.investigationPriorities.length === 3 && diagnostic.investigationPriorities.every(isPrioritizedRecommendation)
      : diagnostic.investigationPriorities.every(hasBasicPriority)) &&
    Array.isArray(diagnostic.recommendedActions) &&
    (aiGenerated
      ? diagnostic.recommendedActions.length === 3 && diagnostic.recommendedActions.every(isRecommendedAction)
      : diagnostic.recommendedActions.every(hasBasicAction)) &&
    typeof diagnostic.executiveSummary === "string" &&
    (!aiGenerated || (
      diagnostic.executiveSummary.trim().length >= 80
      && /[.!?]["']?$/.test(diagnostic.executiveSummary.trim())
    ))
  );
}

export function isFrameworkApplication(value: unknown): value is FrameworkApplication {
  if (typeof value !== "object" || value === null) return false;
  const application = value as Record<string, unknown>;
  const isNonEmptyString = (item: unknown) => typeof item === "string" && item.trim().length > 0;
  const isStringArray = (items: unknown, min = 0, max = 8) =>
    Array.isArray(items) && items.length >= min && items.length <= max
      && items.every((item) => typeof item === "string" && item.trim().length > 0);
  const framework = application.framework as Record<string, unknown> | null;
  const visualization = application.visualization as Record<string, unknown> | null;
  const isHypothesis = (value: unknown) => {
    if (typeof value !== "object" || value === null) return false;
    const hypothesis = value as Record<string, unknown>;
    return ["category", "title", "mechanism", "evidenceRequired"].every((key) =>
      isNonEmptyString(hypothesis[key]),
    ) && ["High", "Moderate", "Low"].includes(String(hypothesis.confidence));
  };
  const isPriority = (value: unknown) =>
    typeof value === "object" && value !== null
      && typeof (value as Record<string, unknown>).order === "number"
      && ["action", "rationale", "evidenceRequired", "owner"].every((key) =>
        isNonEmptyString((value as Record<string, unknown>)[key]),
      );
  const isAction = (value: unknown) =>
    typeof value === "object" && value !== null
      && ["action", "rationale", "evidenceRequired", "owner", "kpi"].every((key) =>
        isNonEmptyString((value as Record<string, unknown>)[key]),
      );
  const validGroups = (groups: unknown) =>
    Array.isArray(groups) && groups.length > 0 && groups.length <= 8
      && groups.every((group) => {
        if (typeof group !== "object" || group === null) return false;
        const record = group as Record<string, unknown>;
        return isNonEmptyString(record.label)
          && Array.isArray(record.items) && record.items.length <= 8
          && record.items.every((item) => {
            if (typeof item !== "object" || item === null) return false;
            const node = item as Record<string, unknown>;
            return isNonEmptyString(node.label) && isNonEmptyString(node.detail)
              && ["SUPPORTED", "HYPOTHESIS", "VALIDATION REQUIRED"].includes(String(node.status));
          });
      });
  const kinds: FrameworkVisualizationKind[] = [
    "fishbone", "five-whys", "sipoc", "process-map", "pareto", "swot", "flow", "matrix",
  ];
  if (!framework || !visualization) return false;
  return isNonEmptyString(framework.id)
    && isNonEmptyString(framework.name)
    && isNonEmptyString(application.problem)
    && isNonEmptyString(application.whyFit)
    && isNonEmptyString(application.methodApplied)
    && isNonEmptyString(application.limitations)
    && isNonEmptyString(application.resultSummary)
    && isStringArray(application.confirmedFacts, 1, 8)
    && Array.isArray(application.hypotheses) && application.hypotheses.length > 0
    && application.hypotheses.length <= 5 && application.hypotheses.every(isHypothesis)
    && isStringArray(application.missingEvidence, 1, 8)
    && isStringArray(application.uncertainties, 1, 8)
    && Array.isArray(application.investigationPriorities)
    && application.investigationPriorities.length === 3
    && application.investigationPriorities.every(isPriority)
    && Array.isArray(application.recommendedActions)
    && application.recommendedActions.length === 3
    && application.recommendedActions.every(isAction)
    && kinds.includes(visualization.kind as FrameworkVisualizationKind)
    && validGroups(visualization.groups)
    && isStringArray(visualization.chain, 0, 6);
}
