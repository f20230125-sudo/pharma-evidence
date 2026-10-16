import type { Scenario } from "./types";
export const SCENARIOS: Scenario[] = [
  {
    id: "winrevair-launch",
    name: "WINREVAIR · product overview",
    product: "winrevair",
    channel: "HCP product sheet",
    description:
      "A fictional draft with eligibility, dose and source-version issues.",
    referenceVersion: 13,
    text: "WINREVAIR improves exercise capacity in patients with pulmonary arterial hypertension.\nWINREVAIR is indicated for adults with pulmonary arterial hypertension (PAH, WHO Group 1) to improve exercise capacity.\nThe starting dose of WINREVAIR is 0.7 mg/kg.\nWINREVAIR has no contraindications.\nWINREVAIR may increase hemoglobin.\nWINREVAIR is administered once every 3 weeks by subcutaneous injection.",
    dependencies: [
      { title: "PAH indication", sectionKey: "1-indicationsandusage" },
      { title: "Starting dose", sectionKey: "2-recommendedstartingdosage" },
      { title: "Contraindications", sectionKey: "4-contraindications" },
      { title: "Hemoglobin monitoring", sectionKey: "5-erythrocytosis" },
    ],
  },
  {
    id: "keytruda-oncology",
    name: "KEYTRUDA · oncology briefing",
    product: "keytruda",
    channel: "Field-team briefing",
    description:
      "A fictional draft with broad indications and a formulation mismatch.",
    referenceVersion: 228,
    text: "KEYTRUDA is indicated for the treatment of all cancers.\nKEYTRUDA is indicated for patients with unresectable or metastatic melanoma.\nKEYTRUDA alone is a first-line treatment for non-small cell lung cancer.\nKEYTRUDA is administered by subcutaneous injection.\nKEYTRUDA can cause immune-mediated adverse reactions.\nKEYTRUDA is superior to all other cancer treatments.",
    dependencies: [
      { title: "NSCLC briefing", sectionKey: "1-nonsmallcelllungcancer" },
      { title: "Melanoma indication", sectionKey: "1-melanoma" },
      {
        title: "Safety summary",
        sectionKey: "5-severeandfatalimmunemediatedadversereactions",
      },
    ],
  },
];
