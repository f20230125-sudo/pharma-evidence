# PharmaEvidence in Power BI

These are reproducible model instructions and source files, not a claim that a PBIX was opened and validated.

1. Download `source_versions.csv` and `section_changes.csv` from the app's Review analytics page (or use `data/marts/`).
2. Export `PharmaEvidence-review-events.csv` from the app. It contains your browser-local events; there is no fabricated enterprise history.
3. Import these CSVs as **SourceVersions**, **SectionChanges** and **ReviewEvents**. Set `timestamp` to Date/Time/Timezone, source version to text and version to whole number. Use UTF-8.
4. Relate `SourceVersions[id]` (one) to `ReviewEvents[source_version]` (many), single direction. `SectionChanges` is a comparison fact table at product/section grain; do not join it directly to events and multiply records. Add a separate product dimension if cross-filtering is needed.
5. Use the measures in `measures.dax`. Build a source-change bar chart, source-version table, review-event timeline and a table of reopened claims. Always label these as the current local demonstration's records.

Each CSV is a single-purpose table. Row counts reconcile to `data/manifest.json` and `public/data/corpus.json`. A source publication date is not a monitoring SLA. A marked review is not legal approval. Never infer sales uplift, reviewer productivity or clinical safety from these counts.

For the latest decision per claim, use Power Query to sort events by timestamp and retain the last non-note action per `(claim_id, source_version)` in a separate table. Do not use total reviewed-event count as the number of currently reviewed claims.
