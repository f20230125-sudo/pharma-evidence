"""Build a versioned evidence corpus from the four pinned, official SPL files."""
from __future__ import annotations
import csv
import hashlib
import json
import pathlib
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from difflib import SequenceMatcher

ROOT = pathlib.Path(__file__).resolve().parents[1]
NS = {"s": "urn:hl7-org:v3"}
PRODUCTS = [
    {"id": "winrevair", "name": "WINREVAIR", "generic": "sotatercept-csrk", "area": "Pulmonary arterial hypertension", "setId": "21693ee2-cd23-4137-ac67-066bb3a4a9b7", "application": "BLA761363", "versions": [8, 13]},
    {"id": "keytruda", "name": "KEYTRUDA", "generic": "pembrolizumab", "area": "Oncology", "setId": "9333c79b-d487-4538-a9f0-71b91a02b287", "application": "BLA125514", "versions": [219, 228]},
]

def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()

def title_key(title: str) -> str:
    major = re.match(r"^\d+", title).group(0)
    return major + "-" + re.sub(r"[^a-z0-9]", "", re.sub(r"^\d+(?:\.\d+)*\s*", "", title).lower())

def parse(product: dict, version: int) -> dict:
    file = ROOT / "data/raw" / f"{product['id']}-v{version}.xml"
    raw = file.read_bytes()
    root = ET.fromstring(raw)
    assert root.find("s:setId", NS).get("root").lower() == product["setId"]
    assert int(root.find("s:versionNumber", NS).get("value")) == version
    apps = [x.get("extension") for x in root.findall(".//s:approval/s:id", NS)]
    assert product["application"] in apps, (product["id"], apps)
    history = json.loads((ROOT / "data/raw" / f"{product['id']}-history.json").read_text())["data"]["history"]
    published = next(x["published_date"] for x in history if int(x["spl_version"]) == version)
    url = f"https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid={product['setId']}&version={version}"
    doc_id = f"{product['id']}-v{version}"
    sections = []
    seen = set()
    for s in root.findall(".//s:section", NS):
        title_el, text_el = s.find("s:title", NS), s.find("s:text", NS)
        if title_el is None or text_el is None:
            continue
        title = clean(" ".join(title_el.itertext()))
        if not re.match(r"^\d+\s|^\d+\.\d+\s", title):
            continue
        text = clean(" ".join(text_el.itertext()))
        if not text:
            continue
        key = title_key(title)
        if key in seen:
            raise ValueError(f"Ambiguous section title: {key}")
        seen.add(key)
        section_id = f"{doc_id}:{key}"
        anchor = s.get("ID", "")
        # Keep sentence boundaries and short paragraphs; the model must never silently
        # truncate an entire section and pretend it has checked its later sentences.
        paragraphs = []
        for child in text_el:
            txt = clean(" ".join(child.itertext()))
            if txt:
                paragraphs.extend(re.split(r"(?<=[.!?])\s+(?=[A-Z])", txt))
        if not paragraphs:
            paragraphs = [text]
        chunks = []
        for para in paragraphs:
            words = para.split()
            for start in range(0, len(words), 110):
                segment = " ".join(words[start:start+140])
                if len(segment) >= 28:
                    chunks.append(segment)
        chunks = list(dict.fromkeys(chunks))
        sections.append({"id": section_id, "key": key, "title": title, "text": text, "anchor": anchor,
                         "url": url + ("#" + anchor if anchor else ""),
                         "hash": hashlib.sha256(text.encode()).hexdigest(),
                         "passages": [{"id": f"{section_id}:p{i+1}", "text": t} for i, t in enumerate(chunks)]})
    return {"id": doc_id, "product": product["id"], "version": version, "published": published,
            "effectiveDate": root.find("s:effectiveTime", NS).get("value"),
            "url": url, "downloadUrl": f"https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid={product['setId']}&type=zip&version={version}",
            "file": file.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw), "applicationVerified": True,
            "authority": "DailyMed manufacturer-submitted in-use labeling; not a verification of current FDA-approved text",
            "sections": sections}

def diff_sections(before: dict, after: dict) -> list[dict]:
    old = {s["key"]: s for s in before["sections"]}
    new = {s["key"]: s for s in after["sections"]}
    rows = []
    for key in sorted(old.keys() | new.keys()):
        a, b = old.get(key), new.get(key)
        if a and b and a["hash"] == b["hash"]:
            kind = "unchanged"
        elif a and b:
            # Ignore presentation-only numeric formatting and cross-reference changes
            # for the substance flag, but preserve their exact text in the diff.
            def norm(t):
                t = re.sub(r"\[\s*(?:see|See).*?\]", "", t)
                t = re.sub(r"(?<=\d)\.0(?=\D|$)", "", t)
                return re.sub(r"\W", "", t).lower()
            kind = "reference-only" if norm(a["text"]) == norm(b["text"]) else "modified"
        else:
            kind = "added" if b else "removed"
        tokens_a, tokens_b = (a or {}).get("text", "").split(), (b or {}).get("text", "").split()
        changes = []
        for tag, i, j, k, l in SequenceMatcher(None, tokens_a, tokens_b, autojunk=False).get_opcodes():
            changes.append({"type": tag, "before": " ".join(tokens_a[i:j]), "after": " ".join(tokens_b[k:l])})
        rows.append({"key": key, "title": (b or a)["title"], "kind": kind, "beforeId": (a or {}).get("id"),
                     "afterId": (b or {}).get("id"), "before": (a or {}).get("text", ""), "after": (b or {}).get("text", ""),
                     "changes": changes, "beforeUrl": (a or before)["url"], "afterUrl": (b or after)["url"]})
    return rows

def main():
    docs = [parse(p, v) for p in PRODUCTS for v in p["versions"]]
    changes = [{"product": p["id"], "before": f"{p['id']}-v{p['versions'][0]}", "after": f"{p['id']}-v{p['versions'][1]}",
                "sections": diff_sections(next(d for d in docs if d["id"] == f"{p['id']}-v{p['versions'][0]}"),
                                          next(d for d in docs if d["id"] == f"{p['id']}-v{p['versions'][1]}"))} for p in PRODUCTS]
    out = ROOT / "public/data"
    out.mkdir(parents=True, exist_ok=True)
    corpus = {"snapshot": "2026-10-16", "products": PRODUCTS, "documents": docs, "changes": changes,
              "scope": "US labeling. Two MSD products. Educational portfolio prototype; human review required.",
              "sourceCaveat": "DailyMed in-use labeling may differ from FDA-approved labeling. BLA identity is reconciled; label-text approval equivalence is not asserted."}
    (out / "corpus.json").write_text(json.dumps(corpus, ensure_ascii=False, separators=(",", ":"))+'\n', encoding="utf-8")
    manifest = {"snapshot": corpus["snapshot"], "files": [{k: v for k, v in d.items() if k != "sections"} for d in docs]}
    (ROOT / "data/manifest.json").write_text(json.dumps(manifest, indent=2)+'\n', encoding="utf-8")
    # Export normalized, analysis-ready tables with a common lineage key.
    marts = ROOT / "data/marts"
    marts.mkdir(parents=True, exist_ok=True)
    for name, rows in [("source_versions", [{k:v for k,v in d.items() if k not in ["sections"]} for d in docs]),
                       ("section_changes", [{"product": c["product"], **{k:v for k,v in s.items() if k not in ["changes","before","after"]}} for c in changes for s in c["sections"]])]:
        with (marts / f"{name}.csv").open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
    import duckdb
    warehouse = ROOT / "data/warehouse"; warehouse.mkdir(exist_ok=True)
    con = duckdb.connect(str(warehouse / "evidence.duckdb"))
    for name in ["source_versions", "section_changes"]:
        path = str(marts / f"{name}.csv").replace("'", "''")
        con.execute(f"CREATE OR REPLACE TABLE {name} AS SELECT * FROM read_csv_auto('{path}')")
    assert con.execute("select count(*) from source_versions").fetchone()[0] == 4
    con.close()
    print(json.dumps({"documents": len(docs), "sections": sum(len(d["sections"]) for d in docs),
                      "passages": sum(len(s["passages"]) for d in docs for s in d["sections"]),
                      "changes": {c["product"]: {k: sum(s["kind"] == k for s in c["sections"]) for k in ["added","modified","removed","unchanged","reference-only"]} for c in changes}}))

if __name__ == "__main__":
    main()
