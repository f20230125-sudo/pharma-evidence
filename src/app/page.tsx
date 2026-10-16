import Workspace from "@/components/Workspace";
import corpus from "../../public/data/corpus.json";
import evaluation from "../../public/data/evaluation.json";
import demo from "../../public/data/demo-inference.json";
import model from "../../data/model-manifest.json";
import fda from "../../data/fda-crosscheck.json";
import type { Corpus, NeuralResult } from "@/lib/types";
export default function Home() {
  if (corpus.documents.some((d) => !demo.sourceHashes.includes(d.sha256)))
    throw Error(
      "Recorded demo sources do not match this corpus. Regenerate the demo inference.",
    );
  return (
    <Workspace
      corpus={corpus as Corpus}
      evaluation={evaluation}
      demo={{ ...demo, results: demo.results as Record<string, NeuralResult> }}
      model={model}
      fda={fda}
    />
  );
}
