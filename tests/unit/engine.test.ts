import { describe, it, expect } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
import corpusRaw from "../../public/data/corpus.json";
import {
  analyzeDraft,
  splitClaims,
  currentDocument,
  safeCsv,
  reopenChanged,
  retrieve,
} from "../../src/lib/engine";
import type { Corpus, ReviewEvent } from "../../src/lib/types";
const corpus = corpusRaw as Corpus;
describe("source and review invariants", () => {
  it("every pinned source matches its bytes and every passage is a verbatim span of its section", () => {
    for (const d of corpus.documents) {
      expect(
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(d.file))
          .digest("hex"),
      ).toBe(d.sha256);
      for (const s of d.sections) {
        for (const p of s.passages) expect(s.text).toContain(p.text);
      }
    }
  });
  it("split offsets recover exact input, preserving decimal doses", () => {
    const text =
      "  The starting dose of WINREVAIR is 0.3 mg/kg.\nWINREVAIR may increase hemoglobin.";
    const rows = splitClaims(text);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(text.slice(r.start, r.end)).toBe(r.text);
  });
  it("unknown or excessively broad requests do not escape the source corpus", () => {
    expect(() => currentDocument(corpus, "unknown" as never)).toThrow();
    expect(() => splitClaims("x".repeat(16001))).toThrow();
    expect(retrieve(corpus, "winrevair", "ethereum blockchain mining")).toEqual(
      [],
    );
  });
  it("changing the product cannot retrieve evidence from its competitor or historical version", () => {
    for (const product of ["winrevair", "keytruda"] as const) {
      const result = retrieve(
        corpus,
        product,
        "The starting dose and recommended administration of treatment",
      );
      for (const e of result)
        expect(e.documentId).toBe(currentDocument(corpus, product).id);
    }
  });
  it("flags a swapped starting dose while preserving the correct dosing evidence", () => {
    const [c] = analyzeDraft(
      corpus,
      "winrevair",
      "The starting dose of WINREVAIR is 0.7 mg/kg.",
    );
    expect(c.issues.some((i) => i.kind === "numeric")).toBe(true);
    expect(
      c.evidence.some((e) => e.sectionTitle.includes("Starting Dosage")),
    ).toBe(true);
  });
  it("keeps a rule pass separate from a supported claim verdict", () => {
    const [c] = analyzeDraft(
      corpus,
      "winrevair",
      "WINREVAIR may increase hemoglobin.",
    );
    expect(c.issues).toEqual([]);
    expect(c.status).toBe("candidate");
  });
  it("labels an old source as stale without claiming the content must be wrong", () => {
    const [c] = analyzeDraft(
      corpus,
      "winrevair",
      "WINREVAIR may increase hemoglobin.",
      8,
    );
    expect(c.issues.find((i) => i.kind === "stale")?.detail).toContain(
      "age alone does not prove",
    );
  });
  it("matches renumbered erythrocytosis to the same chapter/title instead of a false new section", () => {
    const c = corpus.changes.find((c) => c.product === "winrevair")!;
    const s = c.sections.find((s) => s.key === "5-erythrocytosis")!;
    expect(s.beforeId).toBeTruthy();
    expect(s.afterId).toBeTruthy();
    expect(s.kind).not.toBe("added");
  });
  it("reopens only a reviewed claim linked to changed evidence, idempotently", () => {
    const claims = analyzeDraft(
      corpus,
      "winrevair",
      "WINREVAIR may increase hemoglobin.\nWINREVAIR may decrease platelet count.",
    );
    const c = claims[0];
    const events: ReviewEvent[] = [
      {
        id: "a",
        claimId: c.id,
        claimText: c.text,
        sourceVersion: "winrevair-v8",
        action: "reviewed",
        note: "checked",
        at: "2026-01-01",
      },
    ];
    const keys = new Set([c.evidence[0].sectionId]);
    const next = reopenChanged(
      events,
      claims,
      keys,
      "winrevair-v13",
      "2026-10-16",
    );
    expect(next).toHaveLength(2);
    expect(next[1].action).toBe("reopened");
    expect(
      reopenChanged(next, claims, keys, "winrevair-v13", "2026-10-16"),
    ).toHaveLength(2);
  });
  it("neutralizes spreadsheet formulas, quotes and embedded delimiters in user exports", () => {
    const csv = safeCsv([['=WEBSERVICE("bad")', " @SUM(A1)", "normal, text"]]);
    expect(csv).toContain("'=WEBSERVICE");
    expect(csv).toContain("' @SUM");
    expect(csv).toContain('"normal, text"');
  });
  it("locks complete fact families and verifies the benchmark hash", () => {
    const b = fs.readFileSync("data/evaluation/benchmark.json");
    const fixture = JSON.parse(b.toString());
    const frozen = JSON.parse(
      fs.readFileSync("data/evaluation/freeze.json", "utf8"),
    );
    expect(crypto.createHash("sha256").update(b).digest("hex")).toBe(
      frozen.sha256,
    );
    const groups = new Map<string, Set<string>>();
    for (const c of fixture.cases) {
      if (!groups.has(c.family)) groups.set(c.family, new Set());
      groups.get(c.family)!.add(c.split);
    }
    for (const s of groups.values()) expect(s.size).toBe(1);
    expect(fixture.cases.length).toBe(120);
  });
});
