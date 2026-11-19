# Operations Toolkit AI

A responsive Next.js and TypeScript toolkit for turning business problems into structured next steps. Framework recommendations use a local rules engine; the optional AI Operations Diagnostic uses Google's Gemini API.

## Run locally

Requirements: Node.js 18.17 or later and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The development server supports hot reload; edit `app/page.tsx` or the supporting files and refresh the preview.

To enable AI diagnostics, copy `.env.example` to `.env.local` and set your Google AI Studio key there:

```dotenv
GEMINI_API_KEY=your-Google-AI-Studio-key
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_TIMEOUT_MS=45000
```

Keep `.env.local` private and never add the key to browser code, a `NEXT_PUBLIC_` variable, or source control. Restart `npm run dev` after changing environment variables.

## Production preview

```bash
npm install
npm run build
npm start
```

Then open [http://localhost:3000](http://localhost:3000). Run `npm run typecheck` to check TypeScript without building.

## What’s included

- A problem-analysis homepage with example prompts and ranked framework recommendations.
- A “Think aloud” voice flow with on-device Whisper transcription, recording controls, a directly editable cleaned transcript, access to the original raw transcript, and a reviewable Problem Brief.
- A searchable, category-filtered library of 19 business and operations frameworks.
- A one-shot AI Operations Diagnostic that applies relevant frameworks internally, separates supported facts from hypotheses, and produces visual findings, validation priorities, actions, and an executive summary.
- Framework-specific, interactive step-by-step guides personalized with the submitted problem.
- Local analysis history stored in browser local storage.
- Responsive workspace navigation for Home, Framework Library, Analysis History, and About.

## Set up local Whisper and try “Think aloud”

The first setup requires downloading the quantized Whisper Small model files (about 300 MB). These model assets are served by the app from `public/models`; the app disables remote model loading. Install the Hugging Face download utility and fetch only the ONNX quantized weights and tokenizer/config files:

```bash
python -m pip install --user huggingface_hub
hf download onnx-community/whisper-small \
  --include "added_tokens.json" "config.json" "generation_config.json" "merges.txt" "normalizer.json" \
  "preprocessor_config.json" "quantize_config.json" "special_tokens_map.json" "tokenizer.json" "tokenizer_config.json" "vocab.json" \
  "onnx/encoder_model_q4.onnx" "onnx/decoder_model_merged_q4.onnx" \
  --local-dir public/models/onnx-community/whisper-small
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), select **Think aloud**, choose **Start recording**, and allow microphone access. Speak naturally, pause/resume as needed, then choose **Stop & transcribe**. The app runs Whisper Small in the browser using WebGPU when available and ONNX Runtime WebAssembly otherwise. The first transcription loads the local model into browser cache and may take time; inference speed and memory use depend on the device. If the model files are missing or incompatible, transcription reports a setup/runtime error rather than using a browser speech service.

Edit the cleaned transcript directly; the model’s raw transcript remains available under **View raw transcript**. Choose **Build Problem Brief** to review/edit the brief and then **Confirm & continue** to get framework recommendations. **Apply framework** uses the confirmed brief with the tailored guide.

Audio is decoded and transcribed on the user’s device and is not uploaded to a speech-recognition service. Model files are downloaded separately by the developer using the command above; after they are present, app inference does not contact Hugging Face or another model host. `npm run dev`, `npm run build`, and `npm start` copy the installed Transformers.js/ONNX runtime files into same-origin `public` assets; generated `public/models`, `public/ort`, and `public/vendor` assets are git-ignored. Microphone capture requires localhost or HTTPS. If microphone access is unavailable, use **Type your problem** instead.

## AI Operations Diagnostic

The **Run AI Diagnostic** action sends the confirmed Problem Brief and available transcript context through the server-only `/api/diagnostic` route to Gemini using the official `@google/genai` SDK. The default model is `gemini-3.5-flash-lite`, verified in Google's [Gemini model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) and the API model list; Google recommends it for low-latency, cost-effective workloads. Override it with `GEMINI_MODEL`. `GEMINI_TIMEOUT_MS` configures the request deadline (default 45 seconds, capped at 55 seconds to fit the route's hosting limit). Structured JSON is constrained by the diagnostic schema and validated server-side; one bounded repair request is made only if the first response is malformed. The SDK is configured for a single attempt, with no implicit retries.

Successful validated responses are labeled **GEMINI AI**. If the key is missing, the model/API request fails, or the output does not validate, the workspace instead shows **DEMO / FALLBACK** with an actionable notice; fallback content is never labeled as Gemini analysis. The UI distinguishes supported facts, hypotheses, and validation requirements, and analysis history stores results locally with the original Problem Brief.

The diagnostic problem and brief are sent to Google's Gemini API. Usage limits and pricing depend on the model, account tier, and current Google AI Studio terms; review Google's [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) and [usage dashboard](https://aistudio.google.com/usage) before using it. The key is read only by server-side code. The browser does not receive it.

## Extending the app

The deterministic recommendation logic lives in `lib/analyzer.ts`, separately from the React interface. Framework definitions and step content are maintained in `lib/frameworks.ts`. Transcription is isolated in `lib/transcription-service.ts`; it loads the local Whisper model and returns the untouched model transcript. `lib/voice-transcript-pipeline.ts` passes that text to the separate conservative cleanup layer. History is accessed through the `HistoryRepository` interface in `lib/history.ts`, with browser local storage as the current implementation.
