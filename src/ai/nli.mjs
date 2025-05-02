import {
  AutoTokenizer,
  AutoModelForSequenceClassification,
  env,
} from "@huggingface/transformers";
import { browserModelCache } from "./browser-cache.mjs";
let tokenizer, model;
export const MODEL_ID = "Xenova/nli-deberta-v3-xsmall@2a4f614 (int8)";
const LOCAL_ID = "deberta-2a4f614";
export async function initialize(base, progress = () => {}) {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  const browser =
    typeof self !== "undefined" && typeof self.postMessage === "function";
  env.localModelPath = browser ? "/models/" : base;
  if (browser) {
    env.useCustomCache = true;
    env.customCache = await browserModelCache(progress);
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.wasm.wasmPaths = {
      mjs: new URL("/ort/ort-wasm-simd-threaded.mjs", self.location.origin)
        .href,
      wasm: new URL("/ort/ort-wasm-simd-threaded.wasm", self.location.origin)
        .href,
    };
  }
  if (!tokenizer)
    tokenizer = await AutoTokenizer.from_pretrained(LOCAL_ID, {
      local_files_only: true,
      progress_callback: progress,
    });
  if (!model)
    model = await AutoModelForSequenceClassification.from_pretrained(LOCAL_ID, {
      local_files_only: true,
      dtype: "q8",
      device: browser ? "wasm" : "cpu",
      progress_callback: progress,
    });
}
export async function infer(premise, hypothesis) {
  if (!model || !tokenizer) throw Error("The local model is not loaded.");
  const started = performance.now();
  const inputs = tokenizer(premise, {
    text_pair: hypothesis,
    truncation: false,
    padding: false,
  });
  if (inputs.input_ids.dims[1] > 512)
    throw Error(
      "This evidence/claim pair exceeds the model context. Shorten the claim; the passage has not been checked.",
    );
  const { logits } = await model(inputs);
  const values = Array.from(logits.data, Number);
  const max = Math.max(...values);
  const exp = values.map((v) => Math.exp(v - max));
  const total = exp.reduce((a, b) => a + b, 0);
  const p = exp.map((x) => x / total);
  const scores = { contradiction: p[0], entailment: p[1], neutral: p[2] };
  const label = Object.keys(scores).sort((a, b) => scores[b] - scores[a])[0];
  return {
    label,
    scores,
    elapsedMs: Math.round(performance.now() - started),
    model: MODEL_ID,
  };
}
