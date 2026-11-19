const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const typescript = require("typescript");

require.extensions[".ts"] = (loadedModule, fileName) => {
  const source = fs.readFileSync(fileName, "utf8");
  const compiled = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2020 },
  });
  loadedModule._compile(compiled.outputText, fileName);
};

const { problemBriefService } = require("../lib/problem-brief-service.ts");
const { MAX_PROBLEM_WORDS, countProblemWords, problemWordLimitMessage } = require("../lib/problem-limits.ts");

const manufacturingProblem = "A manufacturing company reports revenue 8% above budget, yet EBITDA is 15% below forecast and operating cash flow has turned negative. Investigate price-volume-mix, cost variances, working capital, and forecast assumptions. Identify the three highest-priority investigations and recommend evidence-based corrective actions.";

test("preserves an unrecognized but meaningful business problem", () => {
  const brief = problemBriefService.structure(manufacturingProblem);
  assert.notEqual(brief.problemStatement, "Unknown");
  assert.match(brief.problemStatement, /revenue 8% above budget/i);
  assert.match(brief.problemStatement, /EBITDA is 15% below forecast/i);
  assert.match(brief.problemStatement, /cash flow has turned negative/i);
  assert.match(brief.observableSymptoms, /revenue 8% above budget/i);
});

test("captures the requested diagnostic outcome and targeted missing FP&A evidence", () => {
  const brief = problemBriefService.structure(manufacturingProblem);
  assert.match(brief.desiredOutcome, /Investigate price-volume-mix.*cost variances.*working capital.*forecast assumptions/i);
  assert.match(brief.importantUnknowns, /Price-volume-mix bridge by product/i);
  assert.match(brief.importantUnknowns, /Budget-versus-actual cost variance/i);
  assert.match(brief.importantUnknowns, /receivables, inventory, and payables/i);
  assert.match(brief.stakeholders, /Manufacturing/);
});

test("describes missing analysis data rather than replacing the problem with Unknown", () => {
  const brief = problemBriefService.structure("A service team is missing customer response targets.");
  assert.match(brief.problemStatement, /service team.*missing customer response targets/i);
  assert.match(brief.importantUnknowns, /Baseline by period and breakdown/i);
  assert.match(brief.businessContext, /Time period and operating conditions are not specified/i);
  assert.doesNotMatch(brief.problemStatement, /\bUnknown\b/);
});

test("counts the 2,000-word boundary and reports over-limit descriptions", () => {
  const allowed = Array.from({ length: MAX_PROBLEM_WORDS }, (_, index) => `word${index}`).join(" ");
  assert.equal(countProblemWords(allowed), 2_000);
  assert.equal(countProblemWords(`${allowed} extra`), 2_001);
  assert.equal(countProblemWords(" \n\t "), 0);
  assert.match(problemWordLimitMessage(2_001), /2,001 words.*maximum is 2,000 words/i);
});

test("preserves the complete long description in the structured Problem Brief", () => {
  const fullDescription = Array.from({ length: MAX_PROBLEM_WORDS }, (_, index) => `detail${index}`).join(" ");
  const problemBrief = problemBriefService.structure(fullDescription);
  assert.equal(problemBrief.problemStatement, fullDescription);
  assert.match(problemBrief.problemStatement, /detail1999$/);
});
