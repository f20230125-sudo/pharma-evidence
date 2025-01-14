export type ProductId = "winrevair" | "keytruda";
export interface Passage {
  id: string;
  text: string;
}
export interface Section {
  id: string;
  key: string;
  title: string;
  text: string;
  anchor: string;
  url: string;
  hash: string;
  passages: Passage[];
}
export interface SourceDocument {
  id: string;
  product: ProductId;
  version: number;
  published: string;
  effectiveDate: string;
  url: string;
  downloadUrl: string;
  file: string;
  sha256: string;
  bytes: number;
  applicationVerified: boolean;
  authority: string;
  sections: Section[];
}
export interface Product {
  id: ProductId;
  name: string;
  generic: string;
  area: string;
  setId: string;
  application: string;
  versions: number[];
}
export interface Difference {
  key: string;
  title: string;
  kind: string;
  beforeId: string | null;
  afterId: string | null;
  before: string;
  after: string;
  beforeUrl: string;
  afterUrl: string;
  changes: { type: string; before: string; after: string }[];
}
export interface Corpus {
  snapshot: string;
  products: Product[];
  documents: SourceDocument[];
  changes: {
    product: ProductId;
    before: string;
    after: string;
    sections: Difference[];
  }[];
  scope: string;
  sourceCaveat: string;
}
export type IssueKind =
  | "unsupported"
  | "qualifier"
  | "numeric"
  | "population"
  | "stale"
  | "mismatch";
export interface Issue {
  kind: IssueKind;
  title: string;
  detail: string;
}
export interface Evidence {
  id: string;
  text: string;
  sectionId: string;
  sectionTitle: string;
  url: string;
  documentId: string;
  version: number;
  published: string;
  score: number;
}
export interface Claim {
  id: string;
  text: string;
  start: number;
  end: number;
  product: ProductId;
  issues: Issue[];
  evidence: Evidence[];
  status: "attention" | "candidate" | "insufficient";
}
export interface Scores {
  contradiction: number;
  entailment: number;
  neutral: number;
}
export interface NeuralResult {
  claimId: string;
  claimText?: string;
  label: "entailment" | "contradiction" | "neutral";
  scores: Scores;
  evidenceId: string;
  elapsedMs: number;
  model: string;
  error?: string;
}
export interface ReviewEvent {
  id: string;
  claimId: string;
  claimText: string;
  sourceVersion: string;
  evidenceId?: string;
  sectionId?: string;
  sourceHash?: string;
  action: "reviewed" | "reopened" | "note";
  note: string;
  at: string;
}
export interface Scenario {
  id: string;
  name: string;
  product: ProductId;
  channel: string;
  description: string;
  referenceVersion: number;
  text: string;
  dependencies: { title: string; sectionKey: string }[];
}
