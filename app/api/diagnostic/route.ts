import { NextResponse } from "next/server";
import {
  buildFallbackDiagnostic,
  isOperationsDiagnostic,
  type DiagnosticProviderMetadata,
} from "@/lib/diagnostic";
import {
  DEFAULT_GEMINI_MODEL,
  DiagnosticProviderError,
  requestGeminiFrameworkApplication,
  requestGeminiDiagnostic,
  type DiagnosticContext,
} from "@/lib/gemini-provider";
import { isProblemBrief } from "@/lib/problem-brief";
import { getFramework } from "@/lib/frameworks";

export const maxDuration = 60;

function runtimeMetadata(requestStatus: DiagnosticProviderMetadata["requestStatus"], elapsedMs: number): DiagnosticProviderMetadata {
  const vercelEnvironment = process.env.VERCEL_ENV;
  const deployment = vercelEnvironment === "production" || vercelEnvironment === "preview"
    ? vercelEnvironment
    : process.env.NODE_ENV === "development"
      ? "local-development"
      : "unknown";
  return {
    provider: "Google Gemini",
    model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    deployment,
    modelConfigSource: process.env.GEMINI_MODEL?.trim() ? "GEMINI_MODEL" : "default",
    requestStatus,
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  };
}

function providerNotice(error: DiagnosticProviderError) {
  if (error.phase === "missing-key") return error.message;
  if (error.phase === "timeout") return "Gemini took too long to respond. Try again; no result was generated.";
  if (error.phase === "network") return "Could not reach Gemini. Check your internet connection and try again.";
  if (error.phase === "quota") {
    return "Gemini rate limit or quota reached. Check Google AI Studio usage and quota, then try again.";
  }
  if (error.phase === "http") {
    if (error.statusCode === 400 || error.statusCode === 404) {
      return "Gemini rejected the model or request. Check GEMINI_MODEL and the current Gemini API model list.";
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return "Gemini rejected the API key. Check GEMINI_API_KEY in .env.local and its API access.";
    }
    if (error.statusCode === 429) {
      return "Gemini rate limit or quota reached. Check Google AI Studio usage and quota, then try again.";
    }
    if (error.statusCode === 504 && error.upstreamStatus === "DEADLINE_EXCEEDED") {
      return "Google Gemini exceeded its processing deadline. Use the faster Flash-Lite model and try again.";
    }
    if (error.statusCode && error.statusCode >= 500) {
      return "Gemini is temporarily unavailable. Try again shortly.";
    }
    return "Gemini rejected the request. Check your model configuration and API access.";
  }
  if (error.phase === "response-content" || error.phase === "diagnostic-json" || error.phase === "schema-validation") {
    return "Gemini returned a response that did not match the diagnostic format. Try again.";
  }
  return "Gemini could not complete the diagnostic. Check the server logs for the failure category.";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    problemBrief?: unknown;
    rawProblem?: unknown;
    cleanedTranscript?: unknown;
    businessFunction?: unknown;
    objective?: unknown;
    timePeriod?: unknown;
    availableMetrics?: unknown;
    constraints?: unknown;
    selectedFrameworks?: unknown;
    frameworkId?: unknown;
    priorDiagnostic?: unknown;
  } | null;
  if (!body || !isProblemBrief(body.problemBrief)) {
    return NextResponse.json({ error: "A valid Problem Brief is required." }, { status: 400 });
  }

  const context: DiagnosticContext = {
    rawProblem: typeof body.rawProblem === "string" ? body.rawProblem : undefined,
    cleanedTranscript: typeof body.cleanedTranscript === "string" ? body.cleanedTranscript : undefined,
    businessFunction: typeof body.businessFunction === "string" ? body.businessFunction : undefined,
    objective: typeof body.objective === "string" ? body.objective : undefined,
    timePeriod: typeof body.timePeriod === "string" ? body.timePeriod : undefined,
    availableMetrics: typeof body.availableMetrics === "string" ? body.availableMetrics : undefined,
    constraints: typeof body.constraints === "string" ? body.constraints : undefined,
    selectedFrameworks: Array.isArray(body.selectedFrameworks)
      ? body.selectedFrameworks.filter((item): item is string => typeof item === "string").slice(0, 3)
      : undefined,
  };

  const startedAt = Date.now();
  if (body.frameworkId !== undefined) {
    if (typeof body.frameworkId !== "string" || !getFramework(body.frameworkId)) {
      return NextResponse.json({ error: "Select a framework from the Operations Toolkit library." }, { status: 400 });
    }
    try {
      const application = await requestGeminiFrameworkApplication(
        body.problemBrief,
        body.frameworkId,
        context,
        isOperationsDiagnostic(body.priorDiagnostic) ? body.priorDiagnostic : undefined,
      );
      const providerMetadata = runtimeMetadata("success", Date.now() - startedAt);
      application.providerMetadata = providerMetadata;
      return NextResponse.json({ application, providerMetadata });
    } catch (error) {
      if (error instanceof DiagnosticProviderError) {
        console.error("[diagnostic] Gemini framework application failed.", {
          attempt: error.attempt,
          phase: error.phase,
          ...(error.statusCode ? { statusCode: error.statusCode } : {}),
          ...(error.upstreamStatus ? { upstreamStatus: error.upstreamStatus } : {}),
          ...(error.upstreamMessage ? { upstreamMessage: error.upstreamMessage } : {}),
        });
      } else {
        console.error("[diagnostic] Unexpected Gemini framework application failure.", {
          name: error instanceof Error ? error.name : "UnknownError",
        });
      }
      const providerError = error instanceof DiagnosticProviderError
        ? error
        : new DiagnosticProviderError("Gemini could not complete the framework application.", "initial", "network");
      const status = providerError.phase === "timeout" ? 504
        : providerError.phase === "quota" ? 429
          : providerError.phase === "missing-key" ? 503
            : 502;
      return NextResponse.json({
        error: providerNotice(providerError),
        providerMetadata: runtimeMetadata("fallback", Date.now() - startedAt),
      }, { status });
    }
  }

  try {
    const diagnostic = await requestGeminiDiagnostic(body.problemBrief, context);
    diagnostic.providerMetadata = runtimeMetadata("success", Date.now() - startedAt);
    return NextResponse.json(diagnostic);
  } catch (error) {
    if (error instanceof DiagnosticProviderError) {
      console.error("[diagnostic] Gemini provider failed.", {
        attempt: error.attempt,
        phase: error.phase,
        ...(error.statusCode ? { statusCode: error.statusCode } : {}),
        ...(error.upstreamStatus ? { upstreamStatus: error.upstreamStatus } : {}),
        ...(error.upstreamMessage ? { upstreamMessage: error.upstreamMessage } : {}),
      });
    } else {
      console.error("[diagnostic] Unexpected Gemini provider failure.", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
    }
    const diagnostic = buildFallbackDiagnostic(
      body.problemBrief,
      error instanceof DiagnosticProviderError
        ? providerNotice(error)
        : "Gemini could not complete the diagnostic. Check the server logs for the failure category.",
    );
    diagnostic.providerMetadata = runtimeMetadata("fallback", Date.now() - startedAt);
    return NextResponse.json(diagnostic, { status: 200 });
  }
}
