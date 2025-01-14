import fs from "node:fs/promises";
import crypto from "node:crypto";
import { initialize, infer, MODEL_ID } from "../src/ai/nli.mjs";
import { analyzeDraft } from "../src/lib/engine.ts";
import { SCENARIOS } from "../src/lib/scenarios.ts";
const corpus = JSON.parse(await fs.readFile("public/data/corpus.json", "utf8"));
const bytes = await fs.readFile("data/evaluation/benchmark.json");
const fixture = JSON.parse(bytes);
const freeze = JSON.parse(
  await fs.readFile("data/evaluation/freeze.json", "utf8"),
);
if (crypto.createHash("sha256").update(bytes).digest("hex") !== freeze.sha256)
  throw Error("Frozen benchmark has changed");
await initialize(process.cwd() + "/public/models/");
async function scoreClaim(claim) {
  let best = null;
  let totalMs = 0;
  for (const e of claim.evidence.slice(0, 2)) {
    const r = await infer(e.text, claim.text);
    totalMs += r.elapsedMs;
    if (!best || r.scores.entailment > best.scores.entailment)
      best = { ...r, claimId: claim.id, evidenceId: e.id };
  }
  return best ? { ...best, elapsedMs: totalMs } : null;
}
const predictions = [];
for (const row of fixture.cases) {
  const claims = analyzeDraft(corpus, row.product, row.claim);
  const claim = claims[0];
  if (claims.length !== 1)
    throw Error("A benchmark case must be exactly one claim: " + row.id);
  const neural = await scoreClaim(claim);
  const rules = claim.issues.length === 0;
  const retrieved =
    !!claim.evidence[0] &&
    claim.evidence[0].score >= fixture.thresholds.retrievalScore;
  const supported =
    !!neural && neural.scores.entailment >= fixture.thresholds.entailment;
  predictions.push({
    ...row,
    topEvidence: claim.evidence.map((e) => e.id),
    retrievalHit: claim.evidence.some((e) => e.id === row.evidenceId),
    rulesSupported: rules,
    retrievalSupported: retrieved,
    neuralSupported: supported,
    combinedSupported: rules && supported,
    neural,
    issues: claim.issues,
  });
  if (predictions.length % 20 === 0)
    console.log("Evaluated", predictions.length, "/", fixture.cases.length);
}
function metric(rows, key) {
  const unsupported = rows.filter((r) => !r.supported),
    supported = rows.filter((r) => r.supported);
  const correct = rows.filter((r) => r.supported === r[key]).length;
  const accuracy = correct / rows.length;
  const n = rows.length;
  const z = 1.96;
  const denom = 1 + (z * z) / n;
  const center = (accuracy + (z * z) / (2 * n)) / denom;
  const half =
    (z * Math.sqrt((accuracy * (1 - accuracy)) / n + (z * z) / (4 * n * n))) /
    denom;
  return {
    n,
    correct,
    accuracy,
    accuracy95: [Math.max(0, center - half), Math.min(1, center + half)],
    unsupportedMisses: unsupported.filter((r) => r[key]).length,
    unsupportedCount: unsupported.length,
    falseFlags: supported.filter((r) => !r[key]).length,
    supportedCount: supported.length,
    evidenceRecall: rows.filter((r) => r.retrievalHit).length / n,
    meanMs: Math.round(
      rows.reduce((a, r) => a + (r.neural?.elapsedMs ?? 0), 0) / n,
    ),
  };
}
const held = predictions.filter((r) => r.split === "holdout");
const metrics = Object.fromEntries(
  ["rules", "retrieval", "neural", "combined"].map((k) => [
    k,
    metric(held, k + "Supported"),
  ]),
);
const artifact = {
  status: "completed",
  updated: new Date().toISOString(),
  model: MODEL_ID,
  modelRevision: "2a4f614a701367a02d51389039afc998faeda637",
  cases: predictions.length,
  development: freeze.development,
  holdout: freeze.holdout,
  benchmarkHash: freeze.sha256,
  thresholds: fixture.thresholds,
  metrics,
  developmentMetrics: Object.fromEntries(
    ["rules", "retrieval", "neural", "combined"].map((k) => [
      k,
      metric(
        predictions.filter((r) => r.split === "development"),
        k + "Supported",
      ),
    ]),
  ),
  limits: [
    "Authored, unadjudicated fixtures from two products; this is not a clinical or regulatory validation.",
    "Related paraphrases share a fact family and remain in the same split; cases are correlated. Wilson intervals treat cases as independent and may understate uncertainty.",
    "The benchmark includes deliberately obvious mutations and comparisons; it does not represent the prevalence or complexity of real promotional materials.",
    "The task is supported versus needs review. It does not assess legal compliance, full-document fair balance, or clinical decision making.",
    "BM25 retrieval uses the latest pinned source only; evidence outside this corpus is not considered.",
    "Selecting the highest entailment of two passages can miss a conflicting passage elsewhere in the source.",
    "Model probabilities are not calibrated confidence. The real model runs separately from explicit rules.",
    "No clinical expert reviewed the annotations; source-exact and authored paraphrase labels can be imperfect.",
    "US-source labeling does not establish suitability for UAE promotional use.",
    "Browser latency depends on the device; recorded timings use local Node CPU inference, not a hosted service.",
  ],
  failures: held
    .filter((r) => r.neuralSupported !== r.supported)
    .map((r) => ({
      id: r.id,
      claim: r.claim,
      expected: r.supported ? "supported" : "needs review",
      predicted: r.neuralSupported ? "supported" : "needs review",
    })),
};
await fs.writeFile(
  "public/data/evaluation.json",
  JSON.stringify(artifact, null, 2) + "\n",
);
await fs.writeFile(
  "data/evaluation/predictions.json",
  JSON.stringify(predictions, null, 2) + "\n",
);
const results = {};
for (const s of SCENARIOS) {
  for (const c of analyzeDraft(corpus, s.product, s.text, s.referenceVersion)) {
    const r = await scoreClaim(c);
    if (r) results[c.id] = { ...r, claimText: c.text };
  }
}
await fs.writeFile(
  "public/data/demo-inference.json",
  JSON.stringify(
    {
      model: MODEL_ID,
      generated: artifact.updated,
      sourceHashes: corpus.documents.map((d) => d.sha256),
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    status: artifact.status,
    cases: artifact.cases,
    holdout: artifact.holdout,
    metrics,
    neuralErrors: artifact.failures.length,
  }),
);
