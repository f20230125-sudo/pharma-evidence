import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
const revision = "2a4f614a701367a02d51389039afc998faeda637";
const repository = "Xenova/nli-deberta-v3-xsmall";
const files = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "added_tokens.json",
  "onnx/model_quantized.onnx",
];
const root = process.cwd();
const manifestPath = path.join(root, "data/model-manifest.json");
const previous = existsSync(manifestPath)
  ? JSON.parse(await readFile(manifestPath, "utf8"))
  : null;
if (!previous && !process.argv.includes("--bootstrap"))
  throw Error(
    "A pinned model manifest is required. Bootstrap once and review its hashes.",
  );
const rows = [];
for (const file of files) {
  const target = path.join(root, "public/models/deberta-2a4f614", file);
  await mkdir(path.dirname(target), { recursive: true });
  if (!existsSync(target)) {
    const response = await fetch(
      `https://huggingface.co/${repository}/resolve/${revision}/${file}`,
    );
    if (!response.ok)
      throw Error(`Model download failed (${response.status}): ${file}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = await readFile(target);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const expected = previous?.files.find((x) => x.file === file);
  if (previous && (!expected || expected.sha256 !== sha256))
    throw Error("Model hash mismatch: " + file);
  rows.push({ file, bytes: bytes.length, sha256 });
  console.log("Verified model asset:", file, bytes.length, "bytes");
}
if (!previous)
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        repository,
        revision,
        architecture: "DeBERTa-v3-xsmall natural language inference",
        quantization: "int8",
        license: "Apache-2.0 (upstream cross-encoder model)",
        files: rows,
      },
      null,
      2,
    ) + "\n",
  );
await mkdir(path.join(root, "public/ort"), { recursive: true });
for (const file of [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
]) {
  await copyFile(
    path.join(root, "node_modules/onnxruntime-web/dist", file),
    path.join(root, "public/ort", file),
  );
}
console.log(
  "Local inference assets ready. No external model requests are needed in the browser.",
);
await copyFile(
  path.join(root, "public/licenses/APACHE-2.0.txt"),
  path.join(root, "public/models/deberta-2a4f614/LICENSE.txt"),
);
