import manifest from "../../data/model-manifest.json" with { type: "json" };

// The library's local metadata probe otherwise opens the complete large model
// twice. Coalesce those reads, bypass the HTTP disk-cache write path, and keep
// only hash-verified same-origin assets in our explicit revisioned cache.
export async function browserModelCache(progress) {
  const origin = self.location.origin;
  const prefix = "/models/deberta-2a4f614/";
  let disk;
  try {
    disk = await caches.open("pharma-evidence-2a4f614-v1");
  } catch {
    /* private/storage-restricted mode */
  }
  const memory = new Map();
  const pending = new Map();
  const verified = new Set();
  function asset(request) {
    const url = new URL(String(request), origin);
    if (url.origin !== origin || !url.pathname.startsWith(prefix)) return null;
    const name = url.pathname.slice(prefix.length);
    const file = manifest.files.find((f) => f.file === name);
    return file ? { url: url.href, file } : null;
  }
  async function verify(bytes, file) {
    if (bytes.byteLength !== file.bytes)
      throw Error(
        "Incomplete model download: " + file.file + ". Try the review again.",
      );
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (n) => n.toString(16).padStart(2, "0"),
    ).join("");
    if (hash !== file.sha256)
      throw Error(
        "Model integrity check failed: " +
          file.file +
          ". Cached weights were rejected.",
      );
  }
  async function load(url, file) {
    if (memory.has(url)) return memory.get(url);
    const cached = await disk?.match(url);
    if (cached) {
      if (!verified.has(url)) {
        const bytes = await cached.clone().arrayBuffer();
        try {
          await verify(bytes, file);
        } catch (e) {
          await disk.delete(url);
          throw e;
        }
        verified.add(url);
      }
      return cached;
    }
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok)
      throw Error(
        "Model asset could not be loaded (" +
          response.status +
          "): " +
          file.file,
      );
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      progress({
        status: "progress",
        file: file.file,
        progress: Math.min(99, Math.round((loaded / file.bytes) * 100)),
      });
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    await verify(bytes, file);
    verified.add(url);
    const clean = new Response(bytes, {
      headers: {
        "Content-Type": file.file.endsWith(".json")
          ? "application/json"
          : "application/octet-stream",
        "Content-Length": String(bytes.length),
      },
    });
    let stored = false;
    if (disk) {
      try {
        await disk.put(url, clean.clone());
        stored = true;
      } catch {
        /* Continue in memory if persistence is blocked or full. */
      }
    }
    if (!stored) memory.set(url, clean.clone());
    progress({ status: "progress", file: file.file, progress: 100 });
    return clean;
  }
  return {
    async match(request) {
      const item = asset(request);
      if (!item) return undefined;
      if (!pending.has(item.url))
        pending.set(
          item.url,
          load(item.url, item.file).finally(() => pending.delete(item.url)),
        );
      return (await pending.get(item.url)).clone();
    },
    async put() {
      /* match() owns acquisition, verification and persistence. */
    },
  };
}
