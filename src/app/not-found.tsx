import Link from "next/link";
export default function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">PHARMAEVIDENCE</p>
      <h1>This page isn’t in the record.</h1>
      <p>Return to the evidence-review workspace.</p>
      <Link className="button primary" href="/">
        Open the workspace
      </Link>
    </main>
  );
}
