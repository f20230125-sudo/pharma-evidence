"""Author source-linked challenge cases before running any model.

These fixtures are not expert-adjudicated medical/regulatory ground truth.
Related variants are kept in the same split. Never tune on the held-out results.
"""
import hashlib
import json
import pathlib

ROOT=pathlib.Path(__file__).resolve().parents[1]
corpus=json.loads((ROOT/'public/data/corpus.json').read_text(encoding='utf8'))
# product, stable section key, source passage index, authored supported paraphrase,
# and two source-conflicting/unsupported mutations.
families=[
('winrevair','1-indicationsandusage',0,
 'WINREVAIR is indicated for adults with PAH, Group 1 pulmonary hypertension, to improve exercise capacity and WHO functional class and reduce the risk of clinical worsening events including hospitalization for PAH, lung transplantation and death.',
 'WINREVAIR is indicated for children of every age with all forms of pulmonary hypertension.',
 'WINREVAIR is indicated for adults with WHO Group 5 pulmonary hypertension.'),
('keytruda','1-melanoma',0,
 'KEYTRUDA is indicated to treat unresectable or metastatic melanoma.',
 'KEYTRUDA is indicated only for fully resected, nonmetastatic melanoma.',
 'KEYTRUDA cures every form of melanoma.'),
('winrevair','2-recommendedstartingdosage',0,
 'WINREVAIR is administered by subcutaneous injection once every three weeks according to body weight.',
 'WINREVAIR is administered by oral tablet every day.',
 'WINREVAIR is administered once every 2 weeks by intravenous injection.'),
('keytruda','1-malignantpleuralmesothelioma',0,
 'KEYTRUDA with pemetrexed and platinum chemotherapy is indicated as first-line treatment for adults with unresectable advanced or metastatic malignant pleural mesothelioma.',
 'KEYTRUDA alone is indicated for all children with resectable malignant pleural mesothelioma.',
 'KEYTRUDA is indicated for mesothelioma without any requirement for combination chemotherapy or disease setting.'),
('winrevair','2-recommendedstartingdosage',1,
 'The starting dose of WINREVAIR is 0.3 mg/kg.',
 'The starting dose of WINREVAIR is 0.7 mg/kg.',
 'The starting dose of WINREVAIR is 3 mg/kg.'),
('keytruda','1-classicalhodgkinlymphoma',0,
 'KEYTRUDA is indicated to treat adults with relapsed or refractory classical Hodgkin lymphoma.',
 'KEYTRUDA is indicated only for newly diagnosed adults with classical Hodgkin lymphoma who have never received treatment.',
 'KEYTRUDA cures all forms of lymphoma in every patient.'),
('winrevair','2-recommendedtargetdosage',0,
 'After acceptable Hgb and platelet counts are verified, the WINREVAIR target dose is increased to 0.7 mg/kg.',
 'After acceptable Hgb and platelet counts are verified, the WINREVAIR target dose is increased to 7 mg/kg.',
 'WINREVAIR should be increased to 0.7 mg/kg without checking Hgb or platelets.'),
('keytruda','1-primarymediastinallargebcelllymphoma',0,
 'KEYTRUDA is indicated for adult and pediatric patients with refractory PMBCL, or relapse after at least two prior treatment lines.',
 'KEYTRUDA is indicated for every newly diagnosed PMBCL patient before any prior treatment.',
 'KEYTRUDA is indicated for PMBCL only in adults and is never indicated in pediatric patients.'),
('winrevair','4-hypersensitivity',0,
 'WINREVAIR is contraindicated in patients with serious hypersensitivity to sotatercept-csrk or its excipients.',
 'WINREVAIR has no contraindications.',
 'WINREVAIR is recommended for patients with anaphylaxis to sotatercept-csrk.'),
('keytruda','1-merkelcellcarcinoma',0,
 'KEYTRUDA is indicated for adults and children with recurrent locally advanced or metastatic Merkel cell carcinoma.',
 'KEYTRUDA is not indicated for any patients with metastatic Merkel cell carcinoma.',
 'KEYTRUDA cures every patient with Merkel cell carcinoma.'),
('winrevair','5-erythrocytosis',0,
 'WINREVAIR can increase hemoglobin.',
 'WINREVAIR can never increase hemoglobin.',
 'WINREVAIR always lowers hemoglobin and eliminates thromboembolic risk.'),
('keytruda','1-renalcellcarcinoma',0,
 'KEYTRUDA in combination with axitinib is indicated as first-line treatment for adults with advanced RCC.',
 'KEYTRUDA alone is indicated as first-line treatment for all children with localized renal cell carcinoma.',
 'KEYTRUDA in combination with axitinib guarantees a cure for advanced renal cell carcinoma.'),
('winrevair','5-severethrombocytopenia',0,
 'WINREVAIR may lower platelet counts.',
 'WINREVAIR never decreases platelet count.',
 'WINREVAIR always increases platelet counts and prevents bleeding.'),
('keytruda','1-endometrialcarcinoma',0,
 'KEYTRUDA with carboplatin and paclitaxel, followed by single-agent KEYTRUDA, is indicated for adults with primary advanced or recurrent endometrial carcinoma.',
 'KEYTRUDA alone is indicated for all children with early localized endometrial carcinoma.',
 'KEYTRUDA with carboplatin and paclitaxel is guaranteed to cure recurrent endometrial carcinoma.'),
('winrevair','5-seriousbleeding',0,
 'WINREVAIR increases bleeding risk.',
 'WINREVAIR does not increase the risk of bleeding.',
 'WINREVAIR eliminates bleeding risk in all patients.'),
('keytruda','1-triplenegativebreastcancer',0,
 'KEYTRUDA with chemotherapy is indicated before surgery for high-risk early-stage TNBC, then continued alone as adjuvant therapy after surgery.',
 'KEYTRUDA is indicated for all breast cancer types without chemotherapy or surgery.',
 'KEYTRUDA alone cures all low-risk hormone-receptor-positive breast cancers.'),
('winrevair','8-pediatricuse',0,
 'WINREVAIR safety and effectiveness are not established in patients younger than 18 years.',
 'WINREVAIR safety and effectiveness are established for all children younger than 18 years.',
 'WINREVAIR is proven safe and effective in newborn infants.'),
('keytruda','5-severeandfatalimmunemediatedadversereactions',0,
 'KEYTRUDA binds to PD-1 or PD-L1 pathways as described for its drug class and may induce immune-mediated adverse reactions.',
 'KEYTRUDA has zero risk of immune-mediated adverse reactions.',
 'KEYTRUDA never affects the PD-1 or PD-L1 pathway.'),
('winrevair','5-hypersensitivity',0,
 'Serious hypersensitivity reactions have been reported in patients treated with WINREVAIR.',
 'Serious hypersensitivity reactions have never been reported with WINREVAIR.',
 'WINREVAIR has no risk of hypersensitivity reactions.'),
('keytruda','1-nonsmallcelllungcancer',0,
 'KEYTRUDA with pemetrexed and platinum chemotherapy is indicated as first-line treatment for metastatic nonsquamous NSCLC without EGFR or ALK genomic tumor aberrations.',
 'KEYTRUDA alone is indicated as first-line treatment for all non-small cell lung cancer patients regardless of biomarkers or disease setting.',
 'KEYTRUDA with pemetrexed and platinum chemotherapy is indicated for every child with EGFR-positive early-stage NSCLC.'),
]
holdout={1,3,6,8,11,13,16,18}
cases=[]
for i,(product,key,index,paraphrase,negative1,negative2) in enumerate(families):
 d=max((d for d in corpus['documents'] if d['product']==product),key=lambda d:d['version'])
 section=next(s for s in d['sections'] if s['key']==key)
 passage=section['passages'][index]
 base=passage['text']
 variants=[('source-exact',base,True),('paraphrase',paraphrase,True),('mutation-1',negative1,False),('mutation-2',negative2,False),
           ('unsupported-comparison',base.rstrip('. ')+' and is superior to all alternative medicines.',False),
           ('unsupported-guarantee',base.rstrip('. ')+' and guarantees a complete cure without any adverse reactions.',False)]
 for j,(kind,text,supported) in enumerate(variants):
  cases.append({'id':f'PE-{i+1:02d}-{j+1}','family':f'F{i+1:02d}','split':'holdout' if i in holdout else 'development','product':product,'claim':text,'supported':supported,'kind':kind,'evidenceId':passage['id'],'sectionId':section['id'],'sourceHash':d['sha256'],'annotation':'Authored against the linked passage. No independent clinical/regulatory adjudication.'})
out=ROOT/'data/evaluation';out.mkdir(parents=True,exist_ok=True)
payload={'version':1,'cases':cases,'thresholds':{'entailment':.8,'retrievalScore':8},'splitsFrozenBeforeInference':True,'splitUnit':'Underlying fact family; 72 development and 48 holdout cases','annotationAuthority':'Portfolio-author fixtures, not expert-validated labels.'}
raw=(json.dumps(payload,indent=2,ensure_ascii=False)+'\n').encode()
target=out/'benchmark.json'
if target.exists() and target.read_bytes()!=raw:
 raise SystemExit('Refusing to change an existing frozen benchmark. Version it explicitly.')
target.write_bytes(raw)
manifest={'file':'data/evaluation/benchmark.json','sha256':hashlib.sha256(raw).hexdigest(),'cases':len(cases),'development':sum(c['split']=='development' for c in cases),'holdout':sum(c['split']=='holdout' for c in cases)}
(out/'freeze.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
