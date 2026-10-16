"use client";
import {
  useState,
  useMemo,
  useSyncExternalStore,
  useRef,
  useEffect,
} from "react";
import {
  FileCheck2,
  Layers3,
  GitCompareArrows,
  ChartNoAxesCombined,
  BookOpen,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Check,
  CheckCheck,
  CheckCircle2,
  CircleAlert,
  ArrowDownToLine,
  Plus,
  Search,
  ShieldCheck,
  Clock3,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  LoaderCircle,
  X,
  RotateCcw,
  History,
  Database,
  LockKeyhole,
  Link2,
  FileText,
  Braces,
  Download,
} from "lucide-react";
import type {
  Corpus,
  Claim,
  NeuralResult,
  ReviewEvent,
  ProductId,
} from "@/lib/types";
import { analyzeDraft, currentDocument, safeCsv } from "@/lib/engine";
import { SCENARIOS } from "@/lib/scenarios";
import {
  subscribe,
  snapshot,
  EMPTY,
  readEvents,
  writeEvents,
  download,
} from "@/lib/store";

type View = "review" | "changes" | "sources" | "analytics" | "method";
interface Metric {
  n: number;
  correct: number;
  accuracy: number;
  unsupportedMisses: number;
  unsupportedCount: number;
  falseFlags: number;
  supportedCount: number;
  evidenceRecall: number;
  meanMs: number;
}
interface Evaluation {
  status: string;
  model: string;
  cases: number;
  holdout: number;
  development: number;
  updated: string;
  metrics: Record<string, Metric>;
  limits: string[];
  failures: {
    id: string;
    claim: string;
    expected: string;
    predicted: string;
  }[];
}
interface Demo {
  model: string;
  results: Record<string, NeuralResult>;
  generated: string;
}
interface Model {
  repository: string;
  revision: string;
  architecture: string;
  quantization: string;
  files: { file: string; bytes: number; sha256: string }[];
}
interface Fda {
  product: string;
  application: string;
  labelUrl: string;
  submissionDate: string;
  sha256: string;
  pages: number;
  note: string;
}
type Props = {
  corpus: Corpus;
  evaluation: Evaluation;
  demo: Demo;
  model: Model;
  fda: Fda[];
};
const nav = [
  { id: "review", label: "Review workbench", icon: FileCheck2 },
  { id: "changes", label: "Source changes", icon: GitCompareArrows },
  { id: "sources", label: "Evidence library", icon: Layers3 },
  { id: "analytics", label: "Review analytics", icon: ChartNoAxesCombined },
  { id: "method", label: "Method & evaluation", icon: BookOpen },
] as const;
const issueLabels = {
  unsupported: "Unsubstantiated assertion",
  qualifier: "Missing qualifier",
  numeric: "Numeric mismatch",
  population: "Population mismatch",
  stale: "Source needs review",
  mismatch: "Reference mismatch",
};
const pct = (n: number) => (100 * n).toFixed(0) + "%";
function SourceLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="source-link">
      {children}
      <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  );
}
function Stat({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string | number;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className={"stat " + (accent ? "accent" : "")}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </div>
  );
}
function Badge({
  kind,
  children,
}: {
  kind: "attention" | "good" | "neutral" | "ai";
  children: React.ReactNode;
}) {
  return (
    <span className={"badge " + kind}>
      {kind === "attention" ? (
        <CircleAlert size={12} />
      ) : kind === "good" ? (
        <CheckCircle2 size={12} />
      ) : kind === "ai" ? (
        <Sparkles size={12} />
      ) : (
        <Clock3 size={12} />
      )}{" "}
      {children}
    </span>
  );
}
function versionDate(s: string) {
  return s.replace(",", "");
}

export default function Workspace({
  corpus,
  evaluation,
  demo,
  model,
  fda,
}: Props) {
  const [view, setView] = useState<View>("review");
  const [menu, setMenu] = useState(false);
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const [product, setProduct] = useState<ProductId>(scenario.product);
  const [draft, setDraft] = useState(scenario.text);
  const [reviewedDraft, setReviewedDraft] = useState(scenario.text);
  const [reference, setReference] = useState<number | undefined>(
    scenario.referenceVersion,
  );
  const [showEditor, setShowEditor] = useState(false);
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState<"all" | "attention" | "reviewed">("all");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [neural, setNeural] = useState<Record<string, NeuralResult>>({});
  const [aiState, setAiState] = useState<
    "idle" | "loading" | "running" | "done" | "error"
  >("idle");
  const [aiMessage, setAiMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const worker = useRef<Worker | null>(null);
  const job = useRef(0);
  const eventsRaw = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const events = useMemo(() => readEvents(eventsRaw), [eventsRaw]);
  const claims = useMemo(
    () => analyzeDraft(corpus, product, reviewedDraft, reference),
    [corpus, product, reviewedDraft, reference],
  );
  const current = currentDocument(corpus, product);
  const latestAction = (c: Claim) =>
    [...events]
      .reverse()
      .find(
        (e) =>
          e.claimId === c.id &&
          e.claimText === c.text &&
          e.action !== "note" &&
          e.sourceVersion === current.id,
      );
  const reviewed = (c: Claim) => latestAction(c)?.action === "reviewed";
  const attention = claims.filter((c) => c.issues.length).length;
  const completed = claims.filter(reviewed).length;
  const visible = claims.filter(
    (c) =>
      (filter === "all" ||
        (filter === "attention" && c.issues.length) ||
        (filter === "reviewed" && reviewed(c))) &&
      c.text.toLowerCase().includes(query.toLowerCase()),
  );
  const active = visible[Math.min(selected, visible.length - 1)];
  const [selectedEvidence, setSelectedEvidence] = useState(0);
  const evidence =
    active?.evidence[Math.min(selectedEvidence, active.evidence.length - 1)];
  const cached = active ? demo.results[active.id] : undefined;
  const cachedValid =
    cached &&
    cached.claimText === active?.text &&
    active?.evidence.some((e) => e.id === cached.evidenceId)
      ? cached
      : undefined;
  const result = active ? (neural[active.id] ?? cachedValid) : undefined;
  const resultEvidence = active?.evidence.find(
    (e) => e.id === result?.evidenceId,
  );
  const isRecorded = !!result && !!cachedValid && !neural[active?.id ?? ""];
  useEffect(() => {
    const onHash = () => {
      const h = location.hash.slice(1);
      if (nav.some((n) => n.id === h)) setView(h as View);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName ?? "",
        )
      ) {
        const input = document.querySelector<HTMLInputElement>(
          'input[aria-label="Find a claim"]',
        );
        if (input) {
          e.preventDefault();
          input.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  useEffect(() => () => worker.current?.terminate(), []);
  function navigate(v: View) {
    setView(v);
    setMenu(false);
    location.hash = v;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 4500);
  }
  function chooseScenario(id: string) {
    const s = SCENARIOS.find((x) => x.id === id)!;
    cancelAI();
    setScenarioId(id);
    setProduct(s.product);
    setDraft(s.text);
    setReviewedDraft(s.text);
    setReference(s.referenceVersion);
    setSelected(0);
    setSelectedEvidence(0);
    setNeural({});
    setError("");
    setFilter("all");
    setQuery("");
    setNote("");
  }
  function newReview() {
    cancelAI();
    setDraft("");
    setShowEditor(true);
    navigate("review");
    setTimeout(() => document.getElementById("draft-content")?.focus(), 0);
  }
  function cancelAI() {
    job.current++;
    worker.current?.terminate();
    worker.current = null;
    setAiState("idle");
    setProgress(0);
  }
  function runRules() {
    try {
      analyzeDraft(corpus, product, draft, reference);
      if (!draft.trim())
        throw Error("Add at least one factual claim to review.");
      cancelAI();
      setReviewedDraft(draft);
      setNeural({});
      setSelected(0);
      setSelectedEvidence(0);
      setError("");
      setShowEditor(false);
      notify("Draft checked against the current pinned source.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft could not be checked.");
    }
  }
  function runAI() {
    if (aiState === "loading" || aiState === "running") return;
    const id = ++job.current;
    setAiState("loading");
    setProgress(0);
    setAiMessage("Preparing local neural inference…");
    if (!worker.current)
      worker.current = new Worker("/ai/worker.js", { type: "module" });
    worker.current.onmessage = ({ data }) => {
      if (job.current !== id) return;
      if (data.type === "loading") setAiMessage(data.message);
      if (data.type === "progress") {
        setProgress(data.progress);
        setAiMessage(`Loading model weights · ${data.progress}%`);
      }
      if (data.type === "reviewing") {
        setAiState("running");
        setProgress(Math.round(((data.current - 1) / data.total) * 100));
        setAiMessage(
          `Comparing claim ${data.current} of ${data.total} with its evidence…`,
        );
      }
      if (data.type === "result")
        setNeural((prev) => ({ ...prev, [data.result.claimId]: data.result }));
      if (data.type === "done") {
        setAiState("done");
        setProgress(100);
        setAiMessage(
          "Local AI review complete. Model scores are separate from rule checks.",
        );
        notify("AI review complete. Your draft stayed on this device.");
      }
      if (data.type === "error") {
        setAiState("error");
        setAiMessage(data.message);
      }
    };
    worker.current.onerror = () => {
      setAiState("error");
      setAiMessage(
        "Local inference could not start. Try a current desktop browser, or continue with evidence and rule checks.",
      );
    };
    worker.current.postMessage({
      claims: claims.map((c) => ({
        id: c.id,
        text: c.text,
        evidence: c.evidence.slice(0, 2),
      })),
    });
  }
  function saveReview(action: ReviewEvent["action"]) {
    if (!active) return;
    if (action === "note" && !note.trim()) {
      notify("Write a note before saving it.");
      return;
    }
    const event: ReviewEvent = {
      id: crypto.randomUUID(),
      claimId: active.id,
      claimText: active.text,
      sourceVersion: current.id,
      evidenceId: evidence?.id,
      sectionId: evidence?.sectionId,
      sourceHash: current.sha256,
      action,
      note: note.trim().slice(0, 1000),
      at: new Date().toISOString(),
    };
    if (writeEvents([...events, event])) {
      setNote("");
      notify(
        action === "reviewed"
          ? "Review recorded on this device."
          : "Review history updated.",
      );
    } else
      notify("Browser storage is unavailable. Export the record to keep it.");
  }
  function exportReview() {
    const rows: (string | number)[][] = [
      [
        "claim_id",
        "product",
        "claim",
        "source_version",
        "rule_findings",
        "review_status",
        "evidence_id",
        "source_url",
        "nli_label",
        "entailment_score",
        "nli_origin",
        "reviewer_note",
      ],
    ];
    for (const c of claims) {
      const latest = latestAction(c);
      const cached = demo.results[c.id];
      const n =
        neural[c.id] ??
        (cached?.claimText === c.text &&
        c.evidence.some((e) => e.id === cached.evidenceId)
          ? cached
          : undefined);
      rows.push([
        c.id,
        product,
        c.text,
        current.id,
        c.issues.map((x) => x.title).join("; "),
        latest?.action ?? "unreviewed",
        c.evidence[0]?.id ?? "",
        c.evidence[0]?.url ?? "",
        n?.label ?? "not run",
        n?.scores.entailment ?? "",
        neural[c.id] ? "on-device" : n ? "recorded run" : "",
        [...events]
          .reverse()
          .find(
            (e) =>
              e.claimId === c.id &&
              e.claimText === c.text &&
              e.sourceVersion === current.id &&
              e.note,
          )?.note ?? "",
      ]);
    }
    download(`PharmaEvidence-${product}-review.csv`, safeCsv(rows));
    notify("Review CSV exported.");
  }
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to workspace
      </a>
      <aside
        className={"sidebar " + (menu ? "open" : "")}
        aria-label="Workspace navigation"
      >
        <a href="#review" className="brand" onClick={() => navigate("review")}>
          <span className="brand-mark">
            <FileCheck2 size={22} />
          </span>
          <span>
            pharma<span className="brand-light">evidence</span>
            <small>THE EVIDENCE STANDARD</small>
          </span>
        </a>
        <div className="workspace-select">
          <span className="workspace-avatar">U</span>
          <span>
            <b>Uzair’s workspace</b>
            <small>Portfolio demonstration</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {nav.map((n) => (
            <a
              href={"#" + n.id}
              key={n.id}
              className={view === n.id ? "active" : ""}
              aria-current={view === n.id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate(n.id);
              }}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.id === "changes" && <span className="nav-count">2</span>}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="online-dot" />
          <b>Evidence, never assumption.</b>
          <p>Every finding links back to a real, versioned source.</p>
          <button onClick={() => navigate("method")}>
            See how it works <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="local-chip">
            <LockKeyhole size={14} /> On-device AI
          </div>
          <p>Built by Mohammad Uzair Khan</p>
          <a
            href="https://github.com/f20230125-sudo/pharma-evidence"
            target="_blank"
            rel="noreferrer"
          >
            Explore the project <ArrowUpRight size={13} />
          </a>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-overlay"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button menu-toggle"
              onClick={() => setMenu(!menu)}
              aria-label={menu ? "Close navigation" : "Open navigation"}
            >
              {menu ? (
                <PanelLeftClose size={20} />
              ) : (
                <PanelLeftOpen size={20} />
              )}
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <b>{nav.find((n) => n.id === view)?.label}</b>
          </div>
          <div className="top-meta">
            <span className="source-fresh">
              <span /> Pinned 16 Oct 2026
            </span>
            <span className="profile">UK</span>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {view === "review" && (
            <>
              <section className="intro">
                <div>
                  <p className="eyebrow">
                    <span /> COMMERCIAL EVIDENCE WORKBENCH
                  </p>
                  <h1>
                    Every claim.
                    <br />
                    <em>Backed by evidence.</em>
                  </h1>
                  <p className="intro-copy">
                    Find the gaps between what a draft says
                    <br className="desktop-break" /> and what its sources
                    actually support.
                  </p>
                </div>
                <div className="intro-actions">
                  <button className="button primary" onClick={newReview}>
                    <Plus size={16} /> New review
                  </button>
                  <button className="button quiet" onClick={exportReview}>
                    <ArrowDownToLine size={15} /> Export review
                  </button>
                </div>
              </section>
              <div className="stats">
                <Stat
                  label="Claims in this draft"
                  value={claims.length.toString().padStart(2, "0")}
                  note="Each traced to source evidence"
                />
                <Stat
                  label="Need a closer look"
                  value={attention.toString().padStart(2, "0")}
                  note="Flagged by explicit rule checks"
                  accent
                />
                <Stat
                  label="Current source"
                  value={"v" + current.version}
                  note={
                    current.product.toUpperCase() +
                    " · " +
                    versionDate(current.published)
                  }
                />
                <Stat
                  label="Reviewed on this device"
                  value={completed.toString().padStart(2, "0")}
                  note="Human decisions, saved locally"
                />
              </div>
              <div className="draft-bar">
                <div className="draft-title">
                  <span className="document-icon">
                    <FileText size={19} />
                  </span>
                  <div>
                    <label className="eyebrow" htmlFor="scenario">
                      EXAMPLE DRAFT · FICTIONAL CONTENT
                    </label>
                    <select
                      id="scenario"
                      value={scenarioId}
                      onChange={(e) => chooseScenario(e.target.value)}
                    >
                      {SCENARIOS.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="draft-actions">
                  <button
                    className="button small"
                    onClick={() => setShowEditor(!showEditor)}
                  >
                    <Braces size={14} />
                    {showEditor ? "Close editor" : "Edit / paste draft"}
                  </button>
                  <button
                    className="button primary small"
                    onClick={runAI}
                    disabled={aiState === "loading" || aiState === "running"}
                  >
                    {aiState === "loading" || aiState === "running" ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}{" "}
                    {aiState === "loading"
                      ? "Loading local AI…"
                      : aiState === "running"
                        ? "Reviewing draft…"
                        : "Run local AI"}
                  </button>
                </div>
              </div>
              {aiState !== "idle" && (
                <div
                  className={
                    "draft-ai-status " + (aiState === "error" ? "error" : "")
                  }
                  role="status"
                >
                  <Sparkles size={15} />
                  <span>{aiMessage}</span>
                  {(aiState === "running" || aiState === "loading") && (
                    <button className="inline-link" onClick={cancelAI}>
                      Cancel
                    </button>
                  )}
                </div>
              )}
              {showEditor && (
                <section className="draft-editor" aria-label="Draft editor">
                  <div className="editor-fields">
                    <label>
                      Product
                      <select
                        value={product}
                        onChange={(e) => {
                          cancelAI();
                          setProduct(e.target.value as ProductId);
                          setReference(undefined);
                          setNeural({});
                        }}
                      >
                        {corpus.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Draft cites
                      <select
                        value={reference ?? ""}
                        onChange={(e) =>
                          setReference(
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                      >
                        <option value="">No version specified</option>
                        {corpus.documents
                          .filter((d) => d.product === product)
                          .map((d) => (
                            <option value={d.version} key={d.id}>
                              v{d.version} · {d.published}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <label htmlFor="draft-content">
                    Draft content{" "}
                    <span className="muted">
                      One claim per line · up to 18 claims
                    </span>
                  </label>
                  <textarea
                    id="draft-content"
                    rows={7}
                    value={draft}
                    maxLength={16000}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <div className="editor-footer">
                    <p>
                      <LockKeyhole size={13} /> Content remains in your browser.
                      Use fictional content.
                    </p>
                    <button className="button primary" onClick={runRules}>
                      Check draft <ArrowRight size={15} />
                    </button>
                  </div>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                </section>
              )}
              <section
                className="review-board"
                aria-label="Claim review workbench"
              >
                <div className="claim-column">
                  <div className="column-header">
                    <h2>
                      Claim review <span>{claims.length}</span>
                    </h2>
                    <div className="segmented" aria-label="Filter claims">
                      {(["all", "attention", "reviewed"] as const).map((f) => (
                        <button
                          key={f}
                          aria-pressed={filter === f}
                          onClick={() => {
                            setFilter(f);
                            setSelected(0);
                            setSelectedEvidence(0);
                          }}
                        >
                          {f === "all"
                            ? "All claims"
                            : f === "attention"
                              ? "Needs review"
                              : "Reviewed"}
                        </button>
                      ))}
                    </div>
                    <label className="searchbox">
                      <Search size={15} />
                      <input
                        placeholder="Find a claim…"
                        aria-label="Find a claim"
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setSelected(0);
                        }}
                      />
                      <kbd>/</kbd>
                    </label>
                  </div>
                  <div className="claim-list">
                    {visible.map((c, i) => (
                      <button
                        className={
                          "claim-card " +
                          (active?.id === c.id ? "selected" : "")
                        }
                        key={c.id}
                        onClick={() => {
                          setSelected(i);
                          setSelectedEvidence(0);
                          setNote("");
                          if (window.innerWidth <= 650)
                            requestAnimationFrame(() => {
                              const inspector =
                                document.getElementById("evidence-inspector");
                              inspector?.focus({ preventScroll: true });
                              inspector?.scrollIntoView({ block: "start" });
                            });
                        }}
                        aria-pressed={active?.id === c.id}
                      >
                        <div className="claim-card-top">
                          <span className="claim-number">
                            CLAIM{" "}
                            {String(claims.indexOf(c) + 1).padStart(2, "0")}
                          </span>
                          {reviewed(c) ? (
                            <span className="reviewed-check">
                              <CheckCheck size={13} /> Reviewed
                            </span>
                          ) : (
                            <span
                              className={
                                "status-dot " +
                                (c.issues.length ? "attention" : "good")
                              }
                            />
                          )}
                        </div>
                        <p>{c.text}</p>
                        <div className="claim-card-bottom">
                          <Badge kind={c.issues.length ? "attention" : "good"}>
                            {c.issues.length
                              ? issueLabels[c.issues[0].kind]
                              : "Evidence candidate"}
                          </Badge>
                          <ChevronRight size={15} />
                        </div>
                      </button>
                    ))}
                    {!visible.length && (
                      <div className="empty-state">
                        <Search size={25} />
                        <h3>No claims here.</h3>
                        <p>Change the filter or search to see more.</p>
                      </div>
                    )}
                  </div>
                  <div className="column-foot">
                    <ShieldCheck size={14} /> Evidence findings support human
                    review.
                  </div>
                </div>
                <div
                  className="evidence-column"
                  id="evidence-inspector"
                  tabIndex={-1}
                >
                  {active ? (
                    <>
                      <div className="evidence-heading">
                        <div>
                          <p className="eyebrow">EVIDENCE INSPECTOR</p>
                          <h2>Look beyond the claim.</h2>
                        </div>
                        <span className="pill">{product.toUpperCase()}</span>
                      </div>
                      {active.issues.map((issue) => (
                        <div className="finding" key={issue.kind}>
                          <CircleAlert size={17} />
                          <div>
                            <h3>{issue.title}</h3>
                            <p>{issue.detail}</p>
                          </div>
                        </div>
                      ))}
                      {!active.issues.length && (
                        <div className="finding clear">
                          <CheckCircle2 size={17} />
                          <div>
                            <h3>A source candidate was found</h3>
                            <p>
                              No configured rule fired. This does not establish
                              that the full claim is supported; inspect the
                              passage and model result.
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="source-heading">
                        <span>
                          <Link2 size={14} /> Source evidence
                        </span>
                        <span>{active.evidence.length} passages retrieved</span>
                      </div>
                      {evidence ? (
                        <>
                          <div className="evidence-paper">
                            <div className="paper-meta">
                              <span>
                                <FileText size={14} /> PRESCRIBING INFORMATION
                              </span>
                              <span>v{evidence.version}</span>
                            </div>
                            <h3>{evidence.sectionTitle}</h3>
                            <blockquote>{evidence.text}</blockquote>
                            <div className="paper-footer">
                              <span>Published {evidence.published}</span>
                              <SourceLink href={evidence.url}>
                                Open exact source
                              </SourceLink>
                            </div>
                          </div>
                          <div
                            className="evidence-pages"
                            aria-label="Evidence passages"
                          >
                            {active.evidence.map((e, i) => (
                              <button
                                key={e.id}
                                onClick={() => setSelectedEvidence(i)}
                                aria-pressed={e.id === evidence.id}
                              >
                                {i + 1}
                              </button>
                            ))}
                            <span>
                              Retrieved by BM25 · not a support verdict
                            </span>
                          </div>
                        </>
                      ) : (
                        <p className="empty-state">
                          No relevant evidence found in this corpus.
                        </p>
                      )}
                      <section
                        className="neural-panel"
                        aria-label="Neural evidence check"
                      >
                        <div className="neural-title">
                          <span>
                            <Sparkles size={16} /> Neural evidence check
                          </span>
                          <span className="tiny-label">DeBERTa · INT8</span>
                        </div>
                        {result ? (
                          <>
                            <div className="neural-result">
                              <strong>
                                {result.label === "entailment"
                                  ? "Passage supports the wording"
                                  : result.label === "contradiction"
                                    ? "Passage conflicts with the wording"
                                    : "Support is not established"}
                              </strong>
                              <Badge kind="ai">
                                {isRecorded
                                  ? "Recorded AI run"
                                  : "Ran on this device"}
                              </Badge>
                            </div>
                            <div className="score-bars">
                              {(
                                [
                                  "entailment",
                                  "contradiction",
                                  "neutral",
                                ] as const
                              ).map((s) => (
                                <div key={s}>
                                  <span>
                                    {s === "entailment"
                                      ? "Support"
                                      : s === "contradiction"
                                        ? "Conflict"
                                        : "Uncertain"}
                                  </span>
                                  <div>
                                    <i
                                      style={{ width: pct(result.scores[s]) }}
                                      className={s}
                                    />
                                  </div>
                                  <b>{pct(result.scores[s])}</b>
                                </div>
                              ))}
                            </div>
                            <p className="neural-caption">
                              Model probabilities, not calibrated confidence.
                              Rules and human review remain separate.{" "}
                              {resultEvidence && (
                                <>
                                  Compared with{" "}
                                  <button
                                    className="inline-link"
                                    onClick={() =>
                                      setSelectedEvidence(
                                        active.evidence.findIndex(
                                          (e) => e.id === result.evidenceId,
                                        ),
                                      )
                                    }
                                  >
                                    {resultEvidence.sectionTitle}
                                  </button>
                                  .
                                </>
                              )}
                            </p>
                          </>
                        ) : (
                          <p className="neural-caption">
                            Run a real local neural model to compare wording
                            with retrieved evidence. No external inference
                            service.
                          </p>
                        )}
                        <div className="neural-actions">
                          <button
                            className="button small"
                            disabled={
                              aiState === "loading" ||
                              aiState === "running" ||
                              !claims.length
                            }
                            onClick={runAI}
                          >
                            {aiState === "loading" || aiState === "running" ? (
                              <LoaderCircle size={14} className="spin" />
                            ) : (
                              <Sparkles size={14} />
                            )}
                            Run AI on this device
                          </button>
                          {(aiState === "loading" || aiState === "running") && (
                            <button
                              className="icon-button"
                              aria-label="Cancel AI review"
                              onClick={cancelAI}
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>
                        {aiState !== "idle" && (
                          <div
                            className={
                              "ai-progress " +
                              (aiState === "error" ? "error" : "")
                            }
                            role="status"
                          >
                            <p>{aiMessage}</p>
                            {aiState !== "error" && (
                              <progress
                                value={progress}
                                max={100}
                                aria-label="AI review progress"
                              />
                            )}
                          </div>
                        )}
                        <p className="download-note">
                          <LockKeyhole size={11} /> First run loads ~96 MB of
                          model files. Cached on this browser.
                        </p>
                      </section>
                      <section className="review-decision">
                        <div>
                          <h3>Your review</h3>
                          <span>Saved on this device</span>
                        </div>
                        <label className="sr-only" htmlFor="review-note">
                          Reviewer note
                        </label>
                        <textarea
                          id="review-note"
                          placeholder="Add context or explain your decision…"
                          rows={2}
                          maxLength={1000}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                        <div className="decision-actions">
                          <button
                            className="button quiet small"
                            onClick={() => saveReview("note")}
                          >
                            Save note
                          </button>
                          <button
                            className="button primary small"
                            onClick={() =>
                              saveReview(
                                reviewed(active) ? "reopened" : "reviewed",
                              )
                            }
                          >
                            {reviewed(active) ? (
                              <RotateCcw size={14} />
                            ) : (
                              <Check size={14} />
                            )}{" "}
                            {reviewed(active)
                              ? "Reopen review"
                              : "Mark reviewed"}
                          </button>
                        </div>
                        <p className="tiny muted">
                          A review record is not approval to publish.
                        </p>
                      </section>
                    </>
                  ) : (
                    <div className="empty-state">
                      <FileCheck2 size={34} />
                      <h2>Choose a claim to inspect.</h2>
                      <p>Evidence and review notes appear here.</p>
                    </div>
                  )}
                </div>
              </section>
              <div className="below-board">
                <span>
                  <ShieldCheck size={14} /> Public US labeling. Fictional
                  drafts. Human review required.
                </span>
                <button
                  className="inline-link"
                  onClick={() => navigate("method")}
                >
                  Understand the limits <ArrowRight size={13} />
                </button>
              </div>
            </>
          )}
          {view === "changes" && (
            <Changes
              corpus={corpus}
              product={product}
              setProduct={setProduct}
              events={events}
              notify={notify}
            />
          )}
          {view === "sources" && (
            <Sources corpus={corpus} model={model} fda={fda} />
          )}
          {view === "analytics" && (
            <Analytics
              claims={claims}
              events={events}
              corpus={corpus}
              exportReview={exportReview}
            />
          )}
          {view === "method" && (
            <Method evaluation={evaluation} model={model} />
          )}
          <footer className="page-footer">
            <span>
              PharmaEvidence <span className="footer-dot">·</span> An
              independent portfolio project
            </span>
            <SourceLink href="https://github.com/f20230125-sudo/pharma-evidence">
              Source & reproducibility
            </SourceLink>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function ViewIntro({
  eyebrow,
  title,
  copy,
  children,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="intro compact">
      <div>
        <p className="eyebrow">
          <span /> {eyebrow}
        </p>
        <h1>{title}</h1>
        <p className="intro-copy">{copy}</p>
      </div>
      {children}
    </section>
  );
}
function Changes({
  corpus,
  product,
  setProduct,
  events,
  notify,
}: {
  corpus: Corpus;
  product: ProductId;
  setProduct: (p: ProductId) => void;
  events: ReviewEvent[];
  notify: (s: string) => void;
}) {
  const comparison = corpus.changes.find((c) => c.product === product)!;
  const [all, setAll] = useState(false);
  const [chosen, setChosen] = useState("");
  const changes = comparison.sections.filter(
    (s) => all || !["unchanged", "reference-only"].includes(s.kind),
  );
  const preferred = changes.find(
    (s) =>
      s.key ===
      (product === "winrevair" ? "4-hypersensitivity" : "1-ovariancancer"),
  );
  const selected =
    changes.find((s) => s.key === chosen) ?? preferred ?? changes[0];
  const before = corpus.documents.find((d) => d.id === comparison.before)!;
  const after = corpus.documents.find((d) => d.id === comparison.after)!;
  const deps = SCENARIOS.filter((s) => s.product === product).flatMap((s) =>
    s.dependencies.map((d) => ({ ...d, asset: s.name })),
  );
  const impacted = deps.filter((d) =>
    comparison.sections.some(
      (s) =>
        s.key === d.sectionKey &&
        !["unchanged", "reference-only"].includes(s.kind),
    ),
  );
  function reopen() {
    const now = new Date().toISOString();
    const keys = new Set(
      comparison.sections
        .filter((s) => !["unchanged", "reference-only"].includes(s.kind))
        .flatMap((s) => [s.beforeId, s.afterId])
        .filter(Boolean),
    );
    const reopen: ReviewEvent[] = [];
    for (const scenario of SCENARIOS.filter((s) => s.product === product)) {
      for (const claim of analyzeDraft(
        corpus,
        product,
        scenario.text,
        scenario.referenceVersion,
      )) {
        const last = [...events]
          .reverse()
          .find((e) => e.claimId === claim.id && e.action !== "note");
        if (
          last?.action === "reviewed" &&
          last.sourceVersion !== after.id &&
          !!last.sectionId &&
          keys.has(last.sectionId)
        ) {
          reopen.push({
            id: crypto.randomUUID(),
            claimId: claim.id,
            claimText: claim.text,
            sourceVersion: after.id,
            sourceHash: after.sha256,
            sectionId: last.sectionId,
            action: "reopened",
            at: now,
            note: `Evidence changed between v${before.version} and v${after.version}; another review is required.`,
          });
        }
      }
    }
    if (!reopen.length) {
      notify(
        "No completed example-claim reviews depend on these changed sections.",
      );
      return;
    }
    if (writeEvents([...events, ...reopen]))
      notify(`Reopened ${reopen.length} reviews linked to changed evidence.`);
    else notify("Browser storage is unavailable.");
  }
  function loadHistoricalExample() {
    if (product !== "winrevair") {
      notify(
        "The historical review walkthrough uses WINREVAIR. Select it first.",
      );
      return;
    }
    const claim = analyzeDraft(
      corpus,
      "winrevair",
      "WINREVAIR has no contraindications.",
    )[0];
    const section = before.sections.find(
      (s) => s.key === "4-contraindications",
    );
    if (!section) {
      notify("The expected historical section is unavailable.");
      return;
    }
    const last = [...events]
      .reverse()
      .find((e) => e.claimId === claim.id && e.action !== "note");
    if (last?.action === "reviewed" && last.sourceVersion === before.id) {
      notify("The historical example is already loaded.");
      return;
    }
    const event: ReviewEvent = {
      id: crypto.randomUUID(),
      claimId: claim.id,
      claimText: claim.text,
      sourceVersion: before.id,
      evidenceId: section.passages[0]?.id,
      sectionId: section.id,
      sourceHash: before.sha256,
      action: "reviewed",
      note: "Fictional historical review loaded for the change-impact walkthrough. Not a real approval.",
      at: new Date().toISOString(),
    };
    if (writeEvents([...events, event]))
      notify("Historical v8 example loaded. Now reopen the affected review.");
    else notify("Browser storage is unavailable.");
  }
  return (
    <>
      <ViewIntro
        eyebrow="SOURCE CHANGE INTELLIGENCE"
        title="When evidence moves, know what follows."
        copy="Compare genuine label versions. Follow the change to the content that depends on it."
      />
      <div className="change-controls">
        <label>
          Product
          <select
            value={product}
            onChange={(e) => {
              setProduct(e.target.value as ProductId);
              setChosen("");
            }}
          >
            {corpus.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="version-flow">
          <span>
            <small>PREVIOUS SOURCE</small>
            <b>v{before.version}</b> {before.published}
          </span>
          <ArrowRight size={20} />
          <span>
            <small>CURRENT SNAPSHOT</small>
            <b>v{after.version}</b> {after.published}
          </span>
        </div>
      </div>
      <div className="stats three">
        <Stat
          label="Substantively changed"
          value={
            changes.filter(
              (s) => s.kind !== "unchanged" && s.kind !== "reference-only",
            ).length
          }
          note="Added, modified or removed sections"
          accent
        />
        <Stat
          label="Unchanged sections"
          value={
            comparison.sections.filter((s) => s.kind === "unchanged").length
          }
          note="Matched by section title within chapter"
        />
        <Stat
          label="Dependent content items"
          value={impacted.length}
          note="Authored demonstration dependencies"
        />
      </div>
      <div className="change-board">
        <div className="change-list">
          <div className="column-header">
            <h2>Label sections</h2>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={all}
                onChange={(e) => setAll(e.target.checked)}
              />{" "}
              Include unchanged
            </label>
          </div>
          {changes.map((s) => (
            <button
              key={s.key}
              onClick={() => setChosen(s.key)}
              className={
                "change-item " + (selected?.key === s.key ? "selected" : "")
              }
            >
              <span className={"change-mark " + s.kind}>
                {s.kind === "added"
                  ? "+"
                  : s.kind === "removed"
                    ? "−"
                    : s.kind === "unchanged"
                      ? "="
                      : "~"}
              </span>
              <span>
                <b>{s.title}</b>
                <small>{s.kind.replace("-", " ")}</small>
              </span>
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
        <div className="diff-panel">
          {selected && (
            <>
              <div className="evidence-heading">
                <div>
                  <p className="eyebrow">SECTION COMPARISON</p>
                  <h2>{selected.title}</h2>
                </div>
                <Badge
                  kind={selected.kind === "unchanged" ? "good" : "attention"}
                >
                  {selected.kind.replace("-", " ")}
                </Badge>
              </div>
              <div className="diff-legend">
                <span>
                  <i className="removed" /> Removed text
                </span>
                <span>
                  <i className="added" /> Added text
                </span>
              </div>
              <div className="diff-text">
                {selected.changes.map((c, i) => (
                  <span key={i}>
                    {c.type === "equal" ? (
                      c.after + " "
                    ) : (
                      <>
                        {c.before && <del>{c.before} </del>}
                        {c.after && <ins>{c.after} </ins>}
                      </>
                    )}
                  </span>
                ))}
              </div>
              <div className="diff-links">
                <SourceLink href={selected.beforeUrl}>
                  Previous source · v{before.version}
                </SourceLink>
                <SourceLink href={selected.afterUrl}>
                  Current source · v{after.version}
                </SourceLink>
              </div>
              <div className="impact-note">
                <Link2 size={17} />
                <div>
                  <h3>Follow the dependency</h3>
                  <p>
                    {impacted.filter((d) => d.sectionKey === selected.key)
                      .length
                      ? impacted
                          .filter((d) => d.sectionKey === selected.key)
                          .map((d) => d.asset + " / " + d.title)
                          .join("; ")
                      : "No authored content item is directly linked to this section. Other sections can still affect a real asset."}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <section className="panel impact-table">
        <div className="panel-title">
          <div>
            <p className="eyebrow">CONTENT DEPENDENCIES</p>
            <h2>What needs another look?</h2>
          </div>
          <div className="draft-actions">
            {product === "winrevair" && (
              <button className="button small" onClick={loadHistoricalExample}>
                <History size={14} /> Load historical review example
              </button>
            )}
            <button className="button primary small" onClick={reopen}>
              <RotateCcw size={14} /> Reopen affected reviews
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">
              Authored example content linked to changed source sections
            </caption>
            <thead>
              <tr>
                <th>Content item</th>
                <th>Evidence dependency</th>
                <th>Change</th>
                <th>Next step</th>
              </tr>
            </thead>
            <tbody>
              {impacted.map((d) => (
                <tr key={d.title}>
                  <td>{d.asset}</td>
                  <td>{d.title}</td>
                  <td>
                    {
                      comparison.sections.find((s) => s.key === d.sectionKey)
                        ?.kind
                    }
                  </td>
                  <td>
                    <Badge kind="attention">Re-review evidence</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panel-note">
          Load the fictional historical review example to walk through a
          source-triggered reopening. Dependencies are authored examples, not
          MSD’s asset inventory. Changed text does not by itself establish a
          regulatory or clinical impact.
        </p>
      </section>
    </>
  );
}

function Sources({
  corpus,
  model,
  fda,
}: Pick<Props, "corpus" | "model" | "fda">) {
  const [search, setSearch] = useState("");
  return (
    <>
      <ViewIntro
        eyebrow="PINNED & TRACEABLE"
        title="A source you can follow."
        copy="Four genuine documents. Two products. A complete chain from finding to reference."
      />
      <div className="notice">
        <Database size={19} />
        <p>
          <b>Identity verified. Authority kept explicit.</b> Product application
          numbers match the SPL records and Drugs@FDA. DailyMed contains
          manufacturer-submitted in-use labeling; full equivalence to
          FDA-approved label text is not asserted.
        </p>
      </div>
      <label className="searchbox library-search">
        <Search size={17} />
        <input
          aria-label="Search evidence library"
          placeholder="Search product, indication or label section…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="source-grid">
        {corpus.documents
          .filter(
            (d) =>
              d.product.toLowerCase().includes(search.toLowerCase()) ||
              d.sections.some((s) =>
                s.title.toLowerCase().includes(search.toLowerCase()),
              ),
          )
          .map((d) => (
            <article className="source-card" key={d.id}>
              <div className="source-card-top">
                <span className="document-icon">
                  <FileText size={24} />
                </span>
                <Badge
                  kind={
                    d.version ===
                    Math.max(
                      ...corpus.products.find((p) => p.id === d.product)!
                        .versions,
                    )
                      ? "good"
                      : "neutral"
                  }
                >
                  {d.version ===
                  Math.max(
                    ...corpus.products.find((p) => p.id === d.product)!
                      .versions,
                  )
                    ? "Current snapshot"
                    : "Historical version"}
                </Badge>
              </div>
              <h2>{d.product.toUpperCase()}</h2>
              <p>
                Prescribing information <span>·</span> v{d.version}
              </p>
              <dl>
                <div>
                  <dt>Published</dt>
                  <dd>{d.published}</dd>
                </div>
                <div>
                  <dt>Structured sections</dt>
                  <dd>{d.sections.length}</dd>
                </div>
                <div>
                  <dt>Application</dt>
                  <dd>
                    {
                      corpus.products.find((p) => p.id === d.product)
                        ?.application
                    }
                  </dd>
                </div>
              </dl>
              <details>
                <summary>SHA-256 & source provenance</summary>
                <p className="hash">{d.sha256}</p>
                <p className="tiny">
                  Original XML: {d.file}
                  <br />
                  Effective date: {d.effectiveDate}
                  <br />
                  {d.authority}
                </p>
              </details>
              <div className="source-card-actions">
                <SourceLink href={d.url}>Inspect version</SourceLink>
                <SourceLink href={d.downloadUrl}>
                  Official XML archive
                </SourceLink>
              </div>
              {fda.find((f) => f.product === d.product) && (
                <div className="fda-link">
                  <SourceLink
                    href={fda.find((f) => f.product === d.product)!.labelUrl}
                  >
                    FDA reference label PDF
                  </SourceLink>
                  <small>
                    Separate reference; not automatically equivalent
                  </small>
                </div>
              )}
            </article>
          ))}
      </div>
      <section className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">MODEL PROVENANCE</p>
            <h2>Real inference. Inspectable weights.</h2>
          </div>
          <Badge kind="ai">Runs on your device</Badge>
        </div>
        <p className="prose">
          A pretrained natural-language-inference model compares a source
          passage with a claim. It has not been clinically validated. Model
          files and the runtime are served from this site; the draft is not sent
          to an external AI provider.
        </p>
        <dl className="model-spec">
          <div>
            <dt>Model</dt>
            <dd>{model.repository}</dd>
          </div>
          <div>
            <dt>Architecture</dt>
            <dd>DeBERTa-v3-xsmall · INT8</dd>
          </div>
          <div>
            <dt>Pinned revision</dt>
            <dd className="hash">{model.revision}</dd>
          </div>
          <div>
            <dt>Model files</dt>
            <dd>
              {(model.files.reduce((a, f) => a + f.bytes, 0) / 1e6).toFixed(1)}{" "}
              MB · browser cached
            </dd>
          </div>
        </dl>
        <SourceLink
          href={
            "https://huggingface.co/" +
            model.repository +
            "/tree/" +
            model.revision
          }
        >
          Inspect the pinned model
        </SourceLink>
      </section>
    </>
  );
}

function Analytics({
  claims,
  events,
  corpus,
  exportReview,
}: {
  claims: Claim[];
  events: ReviewEvent[];
  corpus: Corpus;
  exportReview: () => void;
}) {
  const findings = Object.entries(issueLabels).map(([key, label]) => ({
    key,
    label,
    count: claims.filter((c) => c.issues.some((i) => i.kind === key)).length,
  }));
  const total = claims.filter((c) => c.issues.length).length;
  const reviewCount = claims.filter(
    (c) =>
      [...events]
        .reverse()
        .find(
          (e) =>
            e.claimId === c.id &&
            e.claimText === c.text &&
            e.sourceVersion === currentDocument(corpus, c.product).id &&
            e.action !== "note",
        )?.action === "reviewed",
  ).length;
  function exportEvents() {
    download(
      "PharmaEvidence-review-events.csv",
      safeCsv([
        [
          "event_id",
          "claim_id",
          "source_version",
          "evidence_id",
          "section_id",
          "source_sha256",
          "action",
          "timestamp",
          "note",
        ],
        ...events.map((e) => [
          e.id,
          e.claimId,
          e.sourceVersion,
          e.evidenceId ?? "",
          e.sectionId ?? "",
          e.sourceHash ?? "",
          e.action,
          e.at,
          e.note,
        ]),
      ]),
    );
  }
  return (
    <>
      <ViewIntro
        eyebrow="FROM REVIEW TO OPERATIONS"
        title="See the work behind the evidence."
        copy="A live view of this draft and the decisions recorded in your browser."
      >
        <button className="button" onClick={exportReview}>
          <Download size={15} /> Export current review
        </button>
      </ViewIntro>
      <div className="stats">
        <Stat
          label="Current draft"
          value={claims.length}
          note="Claims checked by explicit rules"
        />
        <Stat
          label="With findings"
          value={total}
          note="Some claims have multiple issue types"
          accent
        />
        <Stat
          label="Reviewed"
          value={reviewCount}
          note="Latest human decision per claim"
        />
        <Stat
          label="Recorded events"
          value={events.length}
          note="Append-only browser-local history"
        />
      </div>
      <div className="analytics-grid">
        <section className="panel">
          <div className="panel-title">
            <h2>Where the draft needs attention</h2>
          </div>
          <div className="bar-chart">
            {findings.map((f) => (
              <div key={f.key}>
                <span>{f.label}</span>
                <div>
                  <i
                    style={{ width: pct(f.count / Math.max(claims.length, 1)) }}
                  />
                </div>
                <b>{f.count}</b>
              </div>
            ))}
          </div>
          <p className="panel-note">
            Counts describe the currently loaded draft, not business-wide
            performance.
          </p>
        </section>
        <section className="panel source-health">
          <p className="eyebrow">SOURCE COVERAGE</p>
          <h2>
            Two products.
            <br />
            <em>Four genuine versions.</em>
          </h2>
          <div className="coverage">
            <Database size={21} />
            <span>
              <b>
                {corpus.documents.reduce((a, d) => a + d.sections.length, 0)}
              </b>{" "}
              structured sections
            </span>
          </div>
          <div className="coverage">
            <Link2 size={21} />
            <span>
              <b>
                {corpus.documents
                  .reduce(
                    (a, d) =>
                      a + d.sections.reduce((n, s) => n + s.passages.length, 0),
                    0,
                  )
                  .toLocaleString()}
              </b>{" "}
              evidence passages
            </span>
          </div>
          <p className="panel-note">
            Snapshot: {corpus.snapshot}. Source freshness is relative to this
            pinned snapshot; this is not a live regulatory monitor.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>Review history</h2>
          <button className="button small" onClick={exportEvents}>
            <ArrowDownToLine size={14} /> Export history
          </button>
        </div>
        {events.length ? (
          <ol className="timeline">
            {[...events]
              .reverse()
              .slice(0, 30)
              .map((e) => (
                <li key={e.id}>
                  <span
                    className={
                      "timeline-icon " + (e.action === "reviewed" ? "good" : "")
                    }
                  >
                    <History size={15} />
                  </span>
                  <div>
                    <b>
                      {e.action === "reviewed"
                        ? "Marked reviewed"
                        : e.action === "reopened"
                          ? "Review reopened"
                          : "Note added"}
                    </b>
                    <p>{e.claimText}</p>
                    {e.note && <blockquote>{e.note}</blockquote>}
                    <small>
                      {new Date(e.at).toLocaleString()} · {e.sourceVersion}
                    </small>
                  </div>
                </li>
              ))}
          </ol>
        ) : (
          <div className="empty-state">
            <History size={30} />
            <h3>Your decisions will appear here.</h3>
            <p>Mark a claim reviewed or save a note in the workbench.</p>
          </div>
        )}
        <p className="panel-note">
          Stored on this device only. No shared identities, legal sign-off or
          multi-user audit certification.
        </p>
      </section>
      <section className="export-strip">
        <div>
          <p className="eyebrow">ANALYSIS-READY DATA</p>
          <h2>Take the evidence with you.</h2>
          <p>
            Normalized source and change tables, Excel workbook and a documented
            Power BI model.
          </p>
        </div>
        <div>
          <a
            className="button"
            href="/downloads/PharmaEvidence-Source-Tracker.xlsx"
            download
          >
            <ArrowDownToLine size={16} /> Excel source tracker
          </a>
          <a
            className="button quiet"
            href="/downloads/section_changes.csv"
            download
          >
            Source change CSV <ArrowDownToLine size={14} />
          </a>
        </div>
      </section>
    </>
  );
}

function Method({ evaluation, model }: Pick<Props, "evaluation" | "model">) {
  const systems = Object.entries(evaluation.metrics);
  return (
    <>
      <ViewIntro
        eyebrow="SHOW THE WORK, INCLUDING THE FAILURES"
        title="Evidence for the evidence tool."
        copy="A fixed, authored benchmark. Real neural inference. Clear limits on what the results mean."
      />
      <div className="notice">
        <ShieldCheck size={19} />
        <p>
          <b>Reviewer assistance, not an approval engine.</b> This prototype has
          no affiliation with MSD or Veeva. US-source examples do not establish
          suitability for UAE promotional use. Benchmark annotations are
          authored, not clinically adjudicated.
        </p>
      </div>
      <div className="stats three">
        <Stat
          label="Authored claims"
          value={evaluation.cases}
          note="Related fact families stay in one split"
        />
        <Stat
          label="Locked holdout"
          value={evaluation.holdout}
          note="Not used to choose thresholds"
        />
        <Stat
          label="Model"
          value="INT8"
          note="Pinned DeBERTa-v3-xsmall weights"
        />
      </div>
      <section className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">
              HELD-OUT RESULTS · {evaluation.status.toUpperCase()}
            </p>
            <h2>A baseline earns its place.</h2>
          </div>
          <a className="button small" href="/data/evaluation.json" download>
            <ArrowDownToLine size={14} /> Evaluation JSON
          </a>
        </div>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">
              Held-out evaluation of rules, retrieval and neural review
            </caption>
            <thead>
              <tr>
                <th>System</th>
                <th>Cases</th>
                <th>Binary accuracy</th>
                <th>Unsupported missed</th>
                <th>Supported flagged</th>
              </tr>
            </thead>
            <tbody>
              {systems.map(([name, m]) => (
                <tr key={name}>
                  <th>
                    {name === "rules"
                      ? "Explicit rules"
                      : name === "retrieval"
                        ? "Retrieval overlap"
                        : name === "neural"
                          ? "Neural NLI"
                          : "Rules + neural"}
                  </th>
                  <td>{m.n}</td>
                  <td>{pct(m.accuracy)}</td>
                  <td>
                    {m.unsupportedMisses} / {m.unsupportedCount}
                  </td>
                  <td>
                    {m.falseFlags} / {m.supportedCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panel-note">
          Binary task: supported versus needs review. A rule pass is not proof
          of support. Retrieval overlap is a deliberately limited baseline. NLI
          scores are not calibrated confidence. The combined system flags a case
          if either rules or the neural threshold requests review.
        </p>
      </section>
      <div className="method-grid">
        <section className="panel">
          <p className="eyebrow">01 / RETRIEVE</p>
          <h2>Find the relevant passage.</h2>
          <p>
            BM25 retrieves short, source-bound passages from the selected
            product’s current snapshot. No cross-product pooling or invented
            citations.
          </p>
        </section>
        <section className="panel">
          <p className="eyebrow">02 / COMPARE</p>
          <h2>Separate rules from inference.</h2>
          <p>
            Explicit checks flag selected eligibility, number, route and version
            issues. A real neural model separately compares the claim with its
            top two evidence candidates.
          </p>
        </section>
        <section className="panel">
          <p className="eyebrow">03 / REVIEW</p>
          <h2>Keep the human decision.</h2>
          <p>
            Inspect sources, add a note and record a review. There is no
            automatic publishing approval. Source changes can reopen affected
            reviews.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>Where the model gets it wrong</h2>
        </div>
        {evaluation.failures.length ? (
          evaluation.failures.slice(0, 5).map((f) => (
            <div className="failure-example" key={f.id}>
              <span className="tiny-label">{f.id}</span>
              <p>{f.claim}</p>
              <small>
                Expected: {f.expected} · Predicted: {f.predicted}
              </small>
            </div>
          ))
        ) : (
          <p>
            No binary holdout errors in this authored set. This does not
            establish general clinical or regulatory accuracy.
          </p>
        )}
        <p className="panel-note">
          Full case-level predictions, frozen split and source IDs are available
          in the repository.
        </p>
      </section>
      <section className="panel">
        <h2>What these measurements do not establish</h2>
        <ul className="limits">
          {evaluation.limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="hash tiny">Model revision: {model.revision}</p>
        <p className="tiny muted">
          Evaluation recorded: {evaluation.updated}. {evaluation.development}{" "}
          development cases; {evaluation.holdout} held-out cases.
        </p>
      </section>
    </>
  );
}
