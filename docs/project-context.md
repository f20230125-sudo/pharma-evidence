# Why this project

The MSD internship email described Commercial Operations Data & AI, agents and programming; the analytics role also mentioned data harmonization, Excel and Power BI. PharmaEvidence demonstrates a separate workflow from the existing Rx Market Pulse, Trial Pipeline Benchmark, Field Force Planner and Footnote projects.

Merck/MSD's [22 April 2026 Google Cloud announcement](https://www.merck.com/news/merck-and-google-cloud-partner-to-accelerate-agentic-ai-enterprise-transformation/) explicitly includes agents across commercial functions. [Veeva's 26R2 notes](https://rn.veevavault.help/en/gr/whats-new-in-26r2/) describe a claims-identification agent; [its claims-management overview](https://www.veeva.com/products/veeva-promomats/claims-management/) describes evidence anchors and traceability. These establish industry relevance, not that the specific Dubai internship team owns this workflow.

Sources:

- [DailyMed version-history API](https://dailymed.nlm.nih.gov/dailymed/webservices-help/v2/spls_setid_history_api.cfm)
- [DailyMed single-SPL API](https://dailymed.nlm.nih.gov/dailymed/webservices-help/v2/spls_setid_api.cfm)
- [FDA labeling-source disclaimer](https://nctr-crs.fda.gov/fdalabel/ui/disclaimer)
- [FDA educational promotion case studies](https://www.fda.gov/drugs/office-prescription-drug-promotion/educational-case-studies). These provide external context; this prototype does not claim to have scored or reproduced their expert judgments.

The implementation deliberately uses a small real corpus, measurable baseline checks and a real local model rather than assuming access to company CRM or patient records. No commercial uplift, regulatory certification or reduced review-time claim is made.

The original 120-case plan anticipated an approximately 80/40 split. Keeping complete six-case fact families together produces 72/48 instead; this split was frozen before inference. The preferred Gemini provider was replaced by a real local NLI model so the deployed AI works without external credentials or the quota-limited Claude subscription. It is a neural evidence comparison tool, not an LLM agent.
