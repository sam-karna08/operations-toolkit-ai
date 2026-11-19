const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const typescript = require("typescript");

require.extensions[".ts"] = (loadedModule, fileName) => {
  const source = fs.readFileSync(fileName, "utf8");
  const compiled = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2020 },
  });
  loadedModule._compile(compiled.outputText, fileName);
};

const { buildFallbackDiagnostic, isOperationsDiagnostic } = require("../lib/diagnostic.ts");
const {
  buildGeminiPrompt,
  buildRepairPrompt,
  diagnosticJsonSchema,
  frameworkApplicationJsonSchema,
  buildFrameworkApplicationPrompt,
  buildFrameworkRepairPrompt,
  parseFrameworkApplication,
  parseGeminiDiagnostic,
  requestGeminiFrameworkApplication,
  requestGeminiDiagnostic,
  DiagnosticProviderError,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_DIAGNOSTIC_TIMEOUT_MS,
} = require("../lib/gemini-provider.ts");
const { isFrameworkApplication } = require("../lib/diagnostic.ts");
const { getFramework } = require("../lib/frameworks.ts");
const { attachFrameworkApplication, browserHistoryRepository } = require("../lib/history.ts");

const brief = {
  problemStatement: "Invoice processing delays have increased.",
  businessContext: "Finance operations process supplier invoices.",
  observableSymptoms: "• Average processing time increased from 2 days to nearly 5 days.",
  knownFacts: "• Payment delays and vendor follow-ups have increased.",
  possibleCauses: "• Incomplete invoice information\n• Multiple approval stages\n• Manual data entry",
  stakeholders: "• Finance operations\n• Vendors\n• Business teams",
  desiredOutcome: "Identify the main bottlenecks and improve processing.",
  importantUnknowns: "• Which factor contributes most?",
  assumptions: "Unknown",
};

function diagnosticJson() {
  return JSON.stringify({
    problem: brief.problemStatement,
    context: { timePeriod: "three months", processInvolved: "Invoice processing", stakeholders: ["Finance operations", "Vendors"] },
    frameworksApplied: [{ name: "Bottleneck Analysis", reasonSelected: "Find the limiting stage.", keyInsight: "Stage timing is needed.", relevantFindings: ["Measure each stage."] }, { name: "Process Mapping", reasonSelected: "Expose handoffs.", keyInsight: "Map invoice flow.", relevantFindings: ["Map approval waits."] }],
    causalFactors: [
      { title: "Incomplete information", description: "Missing fields may create rework.", priority: "High", confidence: "Moderate", evidence: ["User mentioned incomplete information."], validationRequired: ["Count rejected invoices."] },
      { title: "Approval waits", description: "Multiple approvals may add queue time.", priority: "High", confidence: "Low", evidence: ["User mentioned approval stages."], validationRequired: ["Measure approval wait time."] },
      { title: "Manual entry", description: "Manual work may slow throughput.", priority: "Medium", confidence: "Low", evidence: ["User mentioned manual entry."], validationRequired: ["Measure entry time."] },
    ],
    investigationPriorities: [
      { order: 1, test: "Measure stage wait and touch time.", link: "Separates approval waits from processing work.", data: "Invoice event timestamps by stage.", owner: "Finance operations" },
      { order: 2, test: "Quantify invoice rejection and rework.", link: "Rework may extend cycle time.", data: "Rejected invoices and missing-field reasons.", owner: "Accounts payable" },
      { order: 3, test: "Compare response and entry delays.", link: "Identifies delay outside approval queues.", data: "Business response logs and entry timestamps.", owner: "Process owner" },
    ],
    recommendedActions: [
      { do: "Pilot a completeness check at invoice intake.", why: "Prevent avoidable clarification loops.", impact: "May reduce rework if missing fields are material.", data: "Pilot rejection and cycle-time comparison.", owner: "Accounts payable" },
      { do: "Remove only redundant approval handoffs.", why: "Address measured queue time without weakening controls.", impact: "Could shorten waiting if duplicate reviews are confirmed.", data: "Control-owner review and before/after approval time.", owner: "Finance controller" },
      { do: "Set response-time escalation for stalled invoices.", why: "Surface waits for business-team input.", impact: "Could reduce idle time where responses are a driver.", data: "Response-time aging before and after pilot.", owner: "Business process owner" },
    ],
    executiveSummary: "Invoice cycle time has lengthened and vendor/payment disruption is reported, but no leading cause is established. Approval queues, incomplete submissions, manual entry, and business-team waits are competing hypotheses. First separate touch time from queue time, quantify rework, and trace response delays; then pilot controls only against the measured constraint and compare cycle-time evidence before scaling.",
  });
}

function frameworkApplicationJson() {
  return JSON.stringify({
    whyFit: "A cause map fits because the problem has several plausible contributors.",
    methodApplied: "Grouped the stated possible causes into evidence-testable branches.",
    limitations: "No branch can be ranked without event-level operational data.",
    resultSummary: "Approval waits and incomplete submissions are hypotheses, not established causes.",
    confirmedFacts: ["Invoice cycle time rose from two days to nearly five days."],
    hypotheses: [{
      category: "Process",
      title: "Approval queues add elapsed time",
      mechanism: "Sequential reviews may leave invoices waiting between approvers.",
      evidenceRequired: "Invoice event timestamps for submission and each approval.",
      confidence: "Moderate",
    }],
    missingEvidence: ["Stage-level timestamps and invoice exception reasons."],
    uncertainties: ["The relative contribution of review waits is unknown."],
    investigationPriorities: [
      { order: 1, action: "Separate touch time from queue time.", rationale: "Locate the largest elapsed-time component.", evidenceRequired: "Submission, approval, and posting timestamps.", owner: "Accounts payable" },
      { order: 2, action: "Count incomplete submissions and rework.", rationale: "Test whether missing details create repeated cycles.", evidenceRequired: "Exception codes and resubmission logs.", owner: "Invoice operations" },
      { order: 3, action: "Measure business-team response waits.", rationale: "Check delays outside the finance queue.", evidenceRequired: "Request and response timestamps.", owner: "Business process owner" },
    ],
    recommendedActions: [
      { action: "Pilot a required-field check at intake.", rationale: "Prevent avoidable clarification loops.", evidenceRequired: "Exception and resubmission rates.", owner: "Accounts payable", kpi: "Incomplete invoice rate" },
      { action: "Review approval steps against control needs.", rationale: "Target only redundant waits without weakening controls.", evidenceRequired: "Control map and stage waiting time.", owner: "Finance controller", kpi: "Approval queue time" },
      { action: "Set an escalation rule for aged requests.", rationale: "Make business-team waits visible to owners.", evidenceRequired: "Response-time aging and escalation log.", owner: "Business operations", kpi: "Request response time" },
    ],
    visualization: {
      groups: [
        { label: "People", items: [{ label: "Business-team responses", detail: "Response delays are mentioned as possible; compare request timestamps.", status: "HYPOTHESIS" }] },
        { label: "Process", items: [{ label: "Approval queues", detail: "Measure each wait between submission and posting.", status: "HYPOTHESIS" }] },
      ],
      chain: [],
    },
  });
}

function mockClient(responses, onRequest = () => {}) {
  return {
    models: {
      generateContent: async (request) => {
        onRequest(request);
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return response;
      },
    },
  };
}

test("fallback remains clearly separate from Gemini AI", () => {
  assert.equal(buildFallbackDiagnostic(brief).mode, "DEMO / FALLBACK");
});

test("Gemini request uses structured output and returns validated, labeled analysis", async () => {
  const requests = [];
  const result = await requestGeminiDiagnostic(brief, {
    rawProblem: "Raw invoice problem",
    cleanedTranscript: "Edited invoice problem",
  }, {
    client: mockClient([{ text: diagnosticJson() }], (request) => requests.push(request)),
  });

  assert.equal(result.mode, "GEMINI AI");
  assert.equal(result.investigationPriorities.length, 3);
  assert.equal(result.recommendedActions.length, 3);
  assert.ok(result.executiveSummary.length >= 80);
  assert.ok(result.investigationPriorities.every((item) => item.owner && item.evidenceRequired));
  assert.ok(result.recommendedActions.every((item) => item.owner && item.evidenceRequired && item.expectedImpact));
  assert.ok(result.evidenceItems.some((item) => item.status === "SUPPORTED"));
  assert.ok(result.evidenceItems.some((item) => item.status === "HYPOTHESIS"));
  assert.ok(result.evidenceItems.some((item) => item.status === "VALIDATION REQUIRED"));
  assert.equal(requests[0].model, DEFAULT_GEMINI_MODEL);
  assert.equal(requests[0].config.responseMimeType, "application/json");
  assert.equal(requests[0].config.responseSchema, diagnosticJsonSchema);
  assert.equal(requests[0].config.temperature, 0.2);
  assert.equal(requests[0].config.maxOutputTokens, 1200);
  assert.deepEqual(requests[0].config.httpOptions.retryOptions, { attempts: 1 });
  assert.ok(requests[0].config.abortSignal instanceof AbortSignal);
  assert.match(requests[0].contents, /Edited invoice problem/);
  assert.match(requests[0].contents, /FRAMEWORKS/);
  assert.match(requests[0].contents, /exactly 3 ordered investigation priorities/);
  assert.match(requests[0].contents, /Never invent facts, root causes, owners, baselines, or savings/);
  assert.match(requests[0].contents, /Causal-factor evidence may cite only supplied facts/);
  assert.equal(DEFAULT_DIAGNOSTIC_TIMEOUT_MS, 45_000);
  assert.equal("thinking" in result, false);
});

test("normalizes concise priority fields into the existing UI contract", () => {
  const result = parseGeminiDiagnostic(diagnosticJson(), brief);
  assert.equal(result.mode, "GEMINI AI");
  assert.deepEqual(
    result.investigationPriorities.map((item) => item.reason),
    result.investigationPriorities.map((item) => item.whyItMatters),
  );
});

test("adapts finance diagnostic context without forcing finance guidance on other cases", () => {
  const financePrompt = buildGeminiPrompt(brief, {
    cleanedTranscript: "FP&A reports EBITDA below forecast and operating cash flow is negative.",
  });
  assert.match(financePrompt, /price-volume-mix/i);
  assert.match(financePrompt, /working-capital movements/i);
  assert.match(financePrompt, /forecast-assumption back-testing/i);
  assert.match(financePrompt, /combine cost variance with forecast back-testing/i);
  assert.match(financePrompt, /working capital with cash reconciliation/i);

  const servicePrompt = buildGeminiPrompt(brief, {
    cleanedTranscript: "Customers are waiting too long for support responses.",
  });
  assert.match(servicePrompt, /do not force finance frameworks/i);
});

test("passes optional context and the selected analytical method into the prompt", () => {
  const prompt = buildGeminiPrompt(brief, {
    businessFunction: "Finance",
    objective: "Explain the EBITDA and cash variance",
    timePeriod: "Last quarter",
    availableMetrics: "Revenue +8%; EBITDA -15%",
    constraints: "Do not change financial controls",
    selectedFrameworks: ["Variance analysis"],
  });
  assert.match(prompt, /"businessFunction":"Finance"/);
  assert.match(prompt, /"objective":"Explain the EBITDA and cash variance"/);
  assert.match(prompt, /"timePeriod":"Last quarter"/);
  assert.match(prompt, /"availableMetrics":"Revenue \+8%; EBITDA -15%"/);
  assert.match(prompt, /"constraints":"Do not change financial controls"/);
  assert.match(prompt, /USER-SELECTED FRAMEWORKS: \["Variance analysis"\]/);
});

test("applies Fishbone to the submitted problem using validated Gemini structured output", async () => {
  assert.equal(
    frameworkApplicationJsonSchema.properties.visualization.properties.groups.items.properties.items.maxItems,
    undefined,
  );
  const requests = [];
  const application = await requestGeminiFrameworkApplication(
    brief,
    "fishbone",
    { businessFunction: "Finance operations", objective: "Reduce invoice cycle time" },
    undefined,
    { client: mockClient([{ text: frameworkApplicationJson() }], (request) => requests.push(request)) },
  );
  assert.equal(application.framework.id, "fishbone");
  assert.equal(application.visualization.kind, "fishbone");
  assert.equal(application.problem, brief.problemStatement);
  assert.deepEqual(application.confirmedFacts, ["Average processing time increased from 2 days to nearly 5 days.", "Payment delays and vendor follow-ups have increased."]);
  assert.equal(application.investigationPriorities.length, 3);
  assert.equal(application.recommendedActions.length, 3);
  assert.equal(isFrameworkApplication(application), true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].config.responseSchema, frameworkApplicationJsonSchema);
  assert.equal(requests[0].config.responseMimeType, "application/json");
  assert.equal(requests[0].config.maxOutputTokens, 1800);
  assert.deepEqual(requests[0].config.httpOptions.retryOptions, { attempts: 1 });
  assert.match(requests[0].contents, /Fishbone Diagram/);
  assert.match(requests[0].contents, /Invoice processing delays have increased/);
  assert.match(requests[0].contents, /Do not invent data, root causes, percentages/);
  assert.equal("thinking" in application, false);
});

test("repairs one invalid framework response without resending the problem context", async () => {
  const requests = [];
  const result = await requestGeminiFrameworkApplication(
    brief,
    "sipoc",
    {},
    undefined,
    { client: mockClient([{ text: "{invalid" }, { text: frameworkApplicationJson() }], (request) => requests.push(request)) },
  );
  assert.equal(result.visualization.kind, "sipoc");
  assert.equal(requests.length, 2);
  assert.match(requests[1].contents, /INVALID JSON:\s*\{invalid/);
  assert.doesNotMatch(requests[1].contents, /CONFIRMED PROBLEM BRIEF|PROBLEM:/);
  assert.equal(requests[1].config.maxOutputTokens, 1000);
  assert.match(buildFrameworkRepairPrompt("{broken"), /Match this schema exactly/);
});

test("selects framework-specific visual structures and rejects an invalid application", () => {
  assert.equal(parseFrameworkApplication(frameworkApplicationJson(), brief, getFramework("fishbone")).visualization.kind, "fishbone");
  assert.equal(parseFrameworkApplication(frameworkApplicationJson(), brief, getFramework("sipoc")).visualization.kind, "sipoc");
  assert.equal(parseFrameworkApplication(frameworkApplicationJson(), brief, getFramework("five-whys")).visualization.kind, "five-whys");
  const incomplete = JSON.parse(frameworkApplicationJson());
  incomplete.recommendedActions.pop();
  assert.throws(
    () => parseFrameworkApplication(JSON.stringify(incomplete), brief, getFramework("fishbone")),
    (error) => error instanceof DiagnosticProviderError && error.phase === "schema-validation",
  );
});

test("persists applied frameworks additively without invalidating older history entries", async () => {
  const application = parseFrameworkApplication(frameworkApplicationJson(), brief, getFramework("fishbone"));
  const existing = { problem: brief.problemStatement, date: "2026-10-28T00:00:00.000Z", recommendations: ["fishbone"] };
  const appended = attachFrameworkApplication([existing], existing.date, application);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].frameworkApplications[0].framework.id, "fishbone");
  assert.equal(existing.frameworkApplications, undefined);

  const previousWindow = global.window;
  let persisted = JSON.stringify([existing, { ...existing, date: "2026-10-27T00:00:00.000Z" }]);
  global.window = { localStorage: { getItem: () => persisted, setItem: (_key, value) => { persisted = value; } } };
  try {
    const oldEntries = await browserHistoryRepository.load();
    assert.equal(oldEntries.length, 2);
    await browserHistoryRepository.save(appended);
    const restored = await browserHistoryRepository.load();
    assert.equal(restored[0].frameworkApplications[0].framework.id, "fishbone");
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
});

test("repairs invalid initial JSON exactly once with a compact repair request", async () => {
  const requests = [];
  const result = await requestGeminiDiagnostic(brief, {}, {
    client: mockClient([{ text: "{invalid" }, { text: diagnosticJson() }], (request) => requests.push(request)),
  });
  assert.equal(result.mode, "GEMINI AI");
  assert.equal(requests.length, 2);
  assert.match(requests[1].contents, /INVALID JSON:\s*\{invalid/);
  assert.doesNotMatch(requests[1].contents, /PROBLEM:/);
  assert.equal(requests[1].config.maxOutputTokens, 1000);
});

test("reports a missing API key without attempting generation", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(
      requestGeminiDiagnostic(brief, {}),
      (error) => error instanceof DiagnosticProviderError
        && error.phase === "missing-key"
        && /GEMINI_API_KEY/.test(error.message),
    );
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("classifies quota, network, and timeout failures", async () => {
  const rateLimit = Object.assign(new Error("rate limited"), { status: 429 });
  await assert.rejects(
    requestGeminiDiagnostic(brief, {}, { client: mockClient([rateLimit]) }),
    (error) => error instanceof DiagnosticProviderError
      && error.phase === "quota" && error.statusCode === 429,
  );

  const exhaustedQuota = Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 403 });
  await assert.rejects(
    requestGeminiDiagnostic(brief, {}, { client: mockClient([exhaustedQuota]) }),
    (error) => error instanceof DiagnosticProviderError && error.phase === "quota",
  );

  await assert.rejects(
    requestGeminiDiagnostic(brief, {}, { client: mockClient([new TypeError("fetch failed")]) }),
    (error) => error instanceof DiagnosticProviderError && error.phase === "network",
  );

  await assert.rejects(
    requestGeminiDiagnostic(brief, {}, {
      timeoutMs: 1,
      client: {
        models: {
          generateContent: async ({ config }) => new Promise((_resolve, reject) => {
            config.abortSignal.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            }, { once: true });
          }),
        },
      },
    }),
    (error) => error instanceof DiagnosticProviderError && error.phase === "timeout",
  );
});

test("preserves sanitized Gemini upstream 504 details and classifies invalid models", async () => {
  const deadlineError = Object.assign(new Error(JSON.stringify({
    error: {
      code: 504,
      message: "Deadline expired before operation could complete.",
      status: "DEADLINE_EXCEEDED",
    },
  })), { status: 504 });
  await assert.rejects(
    requestGeminiDiagnostic(brief, {}, { client: mockClient([deadlineError]) }),
    (error) => error instanceof DiagnosticProviderError
      && error.phase === "http"
      && error.statusCode === 504
      && error.upstreamStatus === "DEADLINE_EXCEEDED"
      && error.upstreamMessage === "Deadline expired before operation could complete.",
  );

  const invalidModel = Object.assign(new Error(JSON.stringify({
    error: { code: 404, message: "Model not found.", status: "NOT_FOUND" },
  })), { status: 404 });
  await assert.rejects(
    requestGeminiDiagnostic(brief, {}, { model: "not-a-model", client: mockClient([invalidModel]) }),
    (error) => error instanceof DiagnosticProviderError
      && error.phase === "http"
      && error.statusCode === 404
      && error.upstreamStatus === "NOT_FOUND",
  );
});

test("invalid Gemini JSON is rejected and repair prompts remain JSON-only", () => {
  assert.throws(() => parseGeminiDiagnostic("not json", brief));
  assert.match(buildRepairPrompt("not json"), /corrected JSON only/);
});

test("rejects incomplete AI analysis instead of labeling it Gemini AI", () => {
  const compact = JSON.parse(diagnosticJson());
  compact.recommendedActions.pop();
  assert.throws(
    () => parseGeminiDiagnostic(JSON.stringify(compact), brief),
    (error) => error instanceof DiagnosticProviderError && error.phase === "schema-validation",
  );
  const incompleteSummary = JSON.parse(diagnosticJson());
  incompleteSummary.executiveSummary = "The reported issue may reflect margin pressure";
  assert.throws(
    () => parseGeminiDiagnostic(JSON.stringify(incompleteSummary), brief),
    (error) => error instanceof DiagnosticProviderError && error.phase === "schema-validation",
  );
  assert.equal(isOperationsDiagnostic(buildFallbackDiagnostic(brief)), true);
});

test("diagnostic route uses Gemini and provides safe actionable failure messages", () => {
  const route = fs.readFileSync(path.resolve(__dirname, "../app/api/diagnostic/route.ts"), "utf8");
  assert.doesNotMatch(route, /OLLAMA|Ollama/);
  assert.match(route, /requestGeminiDiagnostic/);
  assert.match(route, /requestGeminiFrameworkApplication/);
  assert.match(route, /frameworkId/);
  assert.match(route, /GEMINI_API_KEY/);
  assert.match(route, /Gemini rate limit or quota reached/);
  assert.match(route, /Gemini rejected the API key/);
  assert.match(route, /Google Gemini exceeded its processing deadline/);
  assert.match(route, /upstreamMessage: error\.upstreamMessage/);
  assert.match(route, /runtimeMetadata\("success"/);
  assert.match(route, /runtimeMetadata\("fallback"/);
  assert.match(route, /modelConfigSource/);
  assert.doesNotMatch(route, /process\.env\.[A-Z_]+[,}]/);
});
