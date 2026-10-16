import { initialize, infer } from "./nli.mjs";
let busy = false;
self.onmessage = async ({ data }) => {
  if (busy) {
    self.postMessage({
      type: "error",
      message: "A review is already running.",
    });
    return;
  }
  busy = true;
  try {
    self.postMessage({
      type: "loading",
      message:
        "Loading the local model. First use downloads about 96 MB; later runs use the browser cache.",
    });
    await initialize(new URL("/models/", self.location.origin).href, (p) => {
      if (p.status === "progress" && p.file?.includes("onnx"))
        self.postMessage({
          type: "progress",
          progress: Math.round(p.progress ?? 0),
        });
    });
    const claims = data.claims;
    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];
      self.postMessage({
        type: "reviewing",
        current: i + 1,
        total: claims.length,
      });
      let best = null;
      for (const evidence of claim.evidence.slice(0, 2)) {
        const result = await infer(evidence.text, claim.text);
        const row = { ...result, claimId: claim.id, evidenceId: evidence.id };
        // Retrieval offers evidence candidates. Any strong entailment can be useful;
        // probabilities remain model scores, never calibrated confidence or approval.
        if (!best || row.scores.entailment > best.scores.entailment) best = row;
      }
      if (best) self.postMessage({ type: "result", result: best });
    }
    self.postMessage({ type: "done" });
  } catch (e) {
    self.postMessage({
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  } finally {
    busy = false;
  }
};
