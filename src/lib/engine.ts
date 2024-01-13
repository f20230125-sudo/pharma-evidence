import type {
  Claim,
  Corpus,
  Evidence,
  Issue,
  ProductId,
  ReviewEvent,
} from "./types.ts";

const STOP = new Set(
  "a an the is are for of and or to in with by as at on from this that it its has have was were be been can may than".split(
    " ",
  ),
);
export function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (x) => !STOP.has(x),
  );
}
export function currentDocument(corpus: Corpus, product: ProductId) {
  const docs = corpus.documents
    .filter((d) => d.product === product)
    .sort((a, b) => b.version - a.version);
  if (!docs.length) throw Error("Unknown product");
  return docs[0];
}
export function retrieve(
  corpus: Corpus,
  product: ProductId,
  text: string,
  limit = 3,
): Evidence[] {
  const doc = currentDocument(corpus, product);
  const candidates = doc.sections.flatMap((s) =>
    s.passages.map((p) => ({
      id: p.id,
      text: p.text,
      sectionId: s.id,
      sectionTitle: s.title,
      url: s.url,
      documentId: doc.id,
      version: doc.version,
      published: doc.published,
      score: 0,
    })),
  );
  const query = [
    ...new Set(
      tokenize(text).filter(
        (t) => !["winrevair", "keytruda", "treatment", "patients"].includes(t),
      ),
    ),
  ];
  if (!query.length) return [];
  const dfs = new Map(
    query.map((t) => [
      t,
      candidates.filter((c) => tokenize(c.text).includes(t)).length,
    ]),
  );
  const avg =
    candidates.reduce((s, c) => s + tokenize(c.text).length, 0) /
    candidates.length;
  for (const c of candidates) {
    const tokens = tokenize(c.text);
    let hits = 0;
    for (const t of query) {
      const tf = tokens.filter((x) => x === t).length;
      if (!tf) continue;
      hits++;
      const df = dfs.get(t) ?? 0;
      const idf = Math.log(1 + (candidates.length - df + 0.5) / (df + 0.5));
      c.score +=
        (idf * (tf * 2.2)) / (tf + 1.2 * (0.25 + (0.75 * tokens.length) / avg));
    }
    if (hits < Math.min(2, query.length)) c.score = 0;
    // Prefer the prescribing-information section relevant to the explicit claim.
    if (
      /indicat|treat|adults|children/i.test(text) &&
      /^1\b|^1\./.test(c.sectionTitle)
    )
      c.score *= 1.25;
    if (/starting dose/i.test(text) && /Starting Dosage/.test(c.sectionTitle))
      c.score *= 1.6;
    if (/target dose/i.test(text) && /Target Dosage/.test(c.sectionTitle))
      c.score *= 1.6;
    if (
      /contraindicat|hypersensitiv/i.test(text) &&
      /^4\b|^4\./.test(c.sectionTitle)
    )
      c.score *= 1.3;
  }
  return candidates
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
export function splitClaims(
  text: string,
): { text: string; start: number; end: number }[] {
  if (text.length > 16000)
    throw Error("Keep the draft below 16,000 characters.");
  const rows: { text: string; start: number; end: number }[] = [];
  // Decimal points and abbreviated medical units must not split a factual claim.
  const regex = /[^\n]+/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text))) {
    const line = m[0];
    const pieces = line.split(/(?<=[.!?])\s+(?=[A-Z])/);
    let cursor = m.index;
    for (const piece of pieces) {
      const trim = piece.replace(/^\s*(?:[-•]|\d+[.)])\s*/, "").trim();
      const start = text.indexOf(trim, cursor);
      cursor += piece.length + 1;
      if (trim.length < 12) continue;
      if (trim.length > 900)
        throw Error(
          "Split long paragraphs into claims of at most 900 characters.",
        );
      rows.push({ text: trim, start, end: start + trim.length });
    }
  }
  if (rows.length > 18) throw Error("Review up to 18 claims at a time.");
  return rows;
}
export function checkRules(
  text: string,
  product: ProductId,
  evidence: Evidence[],
  referenceVersion: number | undefined,
  currentVersion: number,
): Issue[] {
  const issues: Issue[] = [];
  const add = (kind: Issue["kind"], title: string, detail: string) => {
    if (!issues.some((i) => i.kind === kind))
      issues.push({ kind, title, detail });
  };
  if (
    /\b(cures?|guarantee[sd]?|zero risk|no (?:side effects|risk|adverse)|completely safe|risk.free|superior|safest|better than|100% effective)\b/i.test(
      text,
    )
  )
    add(
      "unsupported",
      "Unsubstantiated assertion",
      "An absolute, comparative or curative assertion needs specific supporting evidence. A matching word or source citation is insufficient.",
    );
  if (product === "winrevair") {
    if (
      /\b(children|pediatric|adolescents|all ages|every age)\b/i.test(text) &&
      !/not|unestablished|not established|unknown/i.test(text)
    )
      add(
        "population",
        "Population extends beyond this reference",
        "The indication passage describes adults with PAH, WHO Group 1. A pediatric benefit claim is not established by this source.",
      );
    if (
      /(?:treat|indicat|improv|reduce).*?(?:pulmonary|PAH)|(?:pulmonary|PAH).*?(?:treat|improv)/i.test(
        text,
      ) &&
      !issues.some((x) => x.kind === "population")
    ) {
      const missing = [];
      if (!/adult/i.test(text)) missing.push("adult population");
      if (!/group\s*1|group\s*I\b/i.test(text)) missing.push("WHO Group 1");
      if (missing.length)
        add(
          "qualifier",
          "Eligibility qualifiers need review",
          `The draft does not state ${missing.join(" and ")}. Check the full context before broadening the referenced indication.`,
        );
    }
    const start = text.match(
      /starting dose.{0,45}?(\d+(?:\.\d+)?)\s*mg\s*\/\s*kg/i,
    );
    const target = text.match(
      /target dose.{0,45}?(\d+(?:\.\d+)?)\s*mg\s*\/\s*kg/i,
    );
    if (
      (start && Number(start[1]) !== 0.3) ||
      (target && Number(target[1]) !== 0.7)
    )
      add(
        "numeric",
        "Dose differs from the source",
        "The selected reference states a starting dose of 0.3 mg/kg and a target dose of 0.7 mg/kg, subject to its monitoring and escalation conditions.",
      );
    if (
      /once (?:a |every )?week\b|every (?:1|2|4) weeks|daily|every day/i.test(
        text,
      ) &&
      /dose|administer|injection|winrevair/i.test(text)
    )
      add(
        "numeric",
        "Dosing interval needs review",
        "The reference describes administration once every 3 weeks. Check the full dosing instructions.",
      );
    if (
      /\boral(?:ly)?\b|\bintravenous(?:ly)?\b/i.test(text) &&
      !/not |neither/i.test(text)
    )
      add(
        "mismatch",
        "Administration route differs",
        "The selected WINREVAIR labeling specifies subcutaneous injection.",
      );
    if (
      /no contraindications|contraindications.{0,12}none|no known contraindications/i.test(
        text,
      )
    )
      add(
        "stale",
        "Contraindications changed",
        "The historical label states “None.” The current source includes serious hypersensitivity. The reference is no longer current for this claim.",
      );
  }
  if (product === "keytruda") {
    if (
      /all (?:cancers|cancer patients|tumou?rs)|any cancer|every cancer/i.test(
        text,
      )
    )
      add(
        "population",
        "Indication is overgeneralized",
        "KEYTRUDA labeling specifies distinct indications and eligibility conditions; it does not establish use in every cancer.",
      );
    if (
      /first.line|first line/i.test(text) &&
      /NSCLC|non.small.cell/i.test(text) &&
      /single.agent|alone|monotherapy/i.test(text)
    ) {
      const missing = [];
      if (!/PD.L1|TPS/i.test(text)) missing.push("PD-L1/TPS criteria");
      if (!/EGFR|ALK/i.test(text)) missing.push("EGFR/ALK criteria");
      if (!/metastatic|stage III/i.test(text)) missing.push("disease setting");
      if (missing.length)
        add(
          "qualifier",
          "Treatment conditions omitted",
          `The single-agent first-line NSCLC indication requires more context: ${missing.join(", ")}. Review the complete indication.`,
        );
    }
    if (/\b(oral|subcutaneous)\b/i.test(text) && !/not |neither/i.test(text))
      add(
        "mismatch",
        "Formulation or route differs",
        "This corpus covers intravenous KEYTRUDA, not other pembrolizumab formulations or combinations.",
      );
  }
  if (referenceVersion !== undefined && referenceVersion !== currentVersion)
    add(
      "stale",
      "Reference version is older",
      "This draft cites an older source version. Inspect the source changes; age alone does not prove the claim is incorrect.",
    );
  if (!evidence.length)
    add(
      "unsupported",
      "No relevant passage retrieved",
      "No sufficiently overlapping passage was found in the pinned two-product corpus. Broader evidence may exist outside this dataset.",
    );
  return issues;
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
export function analyzeDraft(
  corpus: Corpus,
  product: ProductId,
  text: string,
  referenceVersion?: number,
): Claim[] {
  const current = currentDocument(corpus, product);
  return splitClaims(text).map((c) => {
    const evidence = retrieve(corpus, product, c.text);
    const issues = checkRules(
      c.text,
      product,
      evidence,
      referenceVersion,
      current.version,
    );
    return {
      ...c,
      id: `${product}-${hash(c.text)}`,
      product,
      evidence,
      issues,
      status: issues.length
        ? "attention"
        : evidence.length
          ? "candidate"
          : "insufficient",
    };
  });
}
export function affectedClaims(
  claims: Claim[],
  changedSectionIds: Set<string>,
): Claim[] {
  return claims.filter((c) =>
    c.evidence.some((e) => changedSectionIds.has(e.sectionId)),
  );
}
export function reopenChanged(
  events: ReviewEvent[],
  claims: Claim[],
  changedSectionIds: Set<string>,
  version: string,
  at: string,
): ReviewEvent[] {
  const affected = affectedClaims(claims, changedSectionIds);
  const next = [...events];
  for (const c of affected) {
    const last = [...events]
      .reverse()
      .find((e) => e.claimId === c.id && e.action !== "note");
    if (last?.action === "reviewed" && last.sourceVersion !== version) {
      next.push({
        id: `reopen-${c.id}-${version}`,
        claimId: c.id,
        claimText: c.text,
        sourceVersion: version,
        action: "reopened",
        note: "Source evidence changed. Previous review requires another look.",
        at,
      });
    }
  }
  return next;
}
export function safeCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((v) => {
          let s = String(v);
          if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
          return '"' + s.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
}
