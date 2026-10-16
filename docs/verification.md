# Verification record

Local verification, 16 October 2026:

- ESLint and TypeScript passed; production Next.js build passed.
- 11 unit tests passed for source byte hashes and passage membership, product/version isolation, decimal-safe claim offsets, qualifier/dose checks, cache/benchmark lineage, reopening idempotence and spreadsheet export injection.
- 14 browser tests passed, including actual same-origin WebAssembly model inference, source links, local review persistence, source-triggered reopening, downloads, all five views at 320/390/768px and WCAG 2 A/AA scans of all views.
- All eight Excel dashboard formulas were recalculated in Excel 16 via a dedicated hidden COM instance and reconciled to the source/benchmark tables. The instance and workbook were closed afterwards.
- Production dependencies: `npm audit --omit=dev` returned zero advisories. The development-only Next ESLint glob chain reports five related high-severity advisories rooted in unpatched `braces@3.0.3`; it does not process user content at runtime. No forced Next downgrade was applied.
- Model evaluation completed all 120 authored cases. The fixed 48-case holdout and the model's numeric failure are published in the app and in the case-level artifact. No holdout tuning was performed.
- The first public AI smoke test caught Chromium `ERR_CACHE_WRITE_FAILURE` during duplicate large-model fetches. The loader now coalesces reads, bypasses the HTTP cache, verifies each model asset in the browser and supports an in-memory fallback. The targeted real-browser regression passed locally in 2.6 seconds with exactly one model-weights request.

Power BI deliverable: normalized CSV tables, measures and model instructions. No Power BI Desktop validation is claimed. Model results are not clinical/regulatory adjudication.
