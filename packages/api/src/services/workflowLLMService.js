/**
 * workflowLLMService.js — ChessBoard Reasoning Engine LLM Backend
 * Phase 2: Real LLM inference via Groq → DeepSeek → OpenRouter fallback chain
 * Produces board traces, step-by-step reasoning, verdicts, and real confidence scores.
 */

import crypto from "node:crypto";

// ── Domain Ontologies (64 nodes each) ─────────────────────────────────────
// Sourced from workflow-engine.html — single source of truth must be kept in sync

export const DOMAIN_ONTOLOGIES = {
  legal: {
    id: "legal", symbol: "⊢", name: "Legal Reasoning",
    description: "64 legal doctrine nodes. Auditable AI legal argumentation. Every case is a game. Every ruling is a trace.",
    nodes: [
      {id:'a8',icon:'⊢',name:'Civil Liab.',desc:'General civil liability doctrine'},
      {id:'b8',icon:'∂',name:'Med. Neg.',desc:'Medical standard of care breach'},
      {id:'c8',icon:'∇',name:'Traffic',desc:'Road accident tort liability'},
      {id:'d8',icon:'Σ',name:'Product',desc:'Defective product liability'},
      {id:'e8',icon:'∫',name:'Premises',desc:'Property owner duty of care'},
      {id:'f8',icon:'Π',name:'Pharma',desc:'Drug manufacturer liability'},
      {id:'g8',icon:'δ',name:'Pers. Inj.',desc:'Bodily harm compensation'},
      {id:'h8',icon:'Ω',name:'Wrng. Death',desc:'Death from negligent act'},
      {id:'a7',icon:'→',name:'Contract',desc:'Offer, acceptance, consideration'},
      {id:'b7',icon:'⊥',name:'Breach',desc:'Failure to perform obligation'},
      {id:'c7',icon:'≡',name:'Damages',desc:'Monetary compensation calculation'},
      {id:'d7',icon:'⇒',name:'Spec. Perf.',desc:'Specific performance equitable remedy'},
      {id:'e7',icon:'∅',name:'Void',desc:'Contract nullity and rescission'},
      {id:'f7',icon:'⊃',name:'Force Maj.',desc:'Force majeure unforeseen circumstances'},
      {id:'g7',icon:'∧',name:'Good Faith',desc:'Good faith and fair dealing'},
      {id:'h7',icon:'⏲',name:'Limitation',desc:'Statute of limitations time-bar'},
      {id:'a6',icon:'∃',name:'Doc. Evid.',desc:'Documentary evidence standard'},
      {id:'b6',icon:'∀',name:'Eyewitness',desc:'Testimonial evidence admissibility'},
      {id:'c6',icon:'φ',name:'Expert Wit.',desc:'Expert opinion and admissibility'},
      {id:'d6',icon:'λ',name:'Forensic',desc:'Scientific physical evidence'},
      {id:'e6',icon:'ℤ',name:'Digital',desc:'Electronic records and metadata'},
      {id:'f6',icon:'ρ',name:'CCTV',desc:'Video surveillance admissibility'},
      {id:'g6',icon:'μ',name:'Med. Record',desc:'Clinical documentation standard'},
      {id:'h6',icon:'ξ',name:'Statistical',desc:'Data-based evidentiary proof'},
      {id:'a5',icon:'⊸',name:'But-For',desc:'Sine qua non causation test'},
      {id:'b5',icon:'↔',name:'Proximate',desc:'Direct legal causation chain'},
      {id:'c5',icon:'⊕',name:'Intervening',desc:'Superseding intervening cause'},
      {id:'d5',icon:'σ',name:'Std. of Care',desc:'Reasonable person benchmark'},
      {id:'e5',icon:'τ',name:'Duty of Care',desc:'Legal obligation to avoid harm'},
      {id:'f5',icon:'⊗',name:'Contrib. Neg',desc:'Plaintiff contributory fault'},
      {id:'g5',icon:'÷',name:'Comp. Fault',desc:'Proportional liability split'},
      {id:'h5',icon:'⊤',name:'Strict Liab.',desc:'No-fault strict liability'},
      {id:'a4',icon:'$',name:'Compensatory',desc:'Make the plaintiff whole'},
      {id:'b4',icon:'×',name:'Punitive',desc:'Punishment for egregious conduct'},
      {id:'c4',icon:'ℝ',name:'Actual Loss',desc:'Documented economic loss'},
      {id:'d4',icon:'ε',name:'Pain & Suf.',desc:'Non-economic general damages'},
      {id:'e4',icon:'η',name:'Lost Earn.',desc:'Income reduction future claim'},
      {id:'f4',icon:'ℕ',name:'Med. Exp.',desc:'Healthcare cost recovery'},
      {id:'g4',icon:'β',name:'Future Dmg.',desc:'Projected ongoing future losses'},
      {id:'h4',icon:'≈',name:'Mitigation',desc:'Duty to mitigate damages'},
      {id:'a3',icon:'∪',name:'Assump. Risk',desc:'Voluntary assumption of known risk'},
      {id:'b3',icon:'⌛',name:'Stat. Limit.',desc:'Time-bar statute of limitations'},
      {id:'c3',icon:'ℂ',name:'Sov. Immun.',desc:'Government sovereign immunity'},
      {id:'d3',icon:'∩',name:'Consent',desc:'Plaintiff consent to risk'},
      {id:'e3',icon:'≠',name:'Res Judic.',desc:'Prior judgment issue preclusion'},
      {id:'f3',icon:'⊂',name:'Coll. Estop.',desc:'Collateral estoppel doctrine'},
      {id:'g3',icon:'⚡',name:'Emergency',desc:'Sudden emergency doctrine'},
      {id:'h3',icon:'±',name:'Good Samar.',desc:'Good Samaritan protection'},
      {id:'a2',icon:'ℚ',name:'Subject Jx.',desc:'Subject matter jurisdiction'},
      {id:'b2',icon:'∈',name:'Personal Jx.',desc:'Personal jurisdiction over party'},
      {id:'c2',icon:'π',name:'Pleading',desc:'Required pleading specificity'},
      {id:'d2',icon:'ι',name:'Discovery',desc:'Evidence disclosure rules'},
      {id:'e2',icon:'κ',name:'Burden Pf.',desc:'Preponderance burden of proof'},
      {id:'f2',icon:'ν',name:'Class Act.',desc:'Collective class action litigation'},
      {id:'g2',icon:'ζ',name:'Settlement',desc:'Out-of-court resolution'},
      {id:'h2',icon:'θ',name:'Sum. Judg.',desc:'Pre-trial summary judgment'},
      {id:'a1',icon:'✓',name:'Liable',desc:'Defendant found liable'},
      {id:'b1',icon:'✗',name:'No Liability',desc:'Defendant not liable'},
      {id:'c1',icon:'½',name:'Partial',desc:'Partial recovery awarded'},
      {id:'d1',icon:'¹',name:'Full Recov.',desc:'Complete damages awarded'},
      {id:'e1',icon:'↩',name:'Remanded',desc:'Case returned to lower court'},
      {id:'f1',icon:'⊘',name:'Dismissed',desc:'Permanent dismissal with prejudice'},
      {id:'g1',icon:'⇔',name:'Equit. Rel.',desc:'Injunction or specific performance'},
      {id:'h1',icon:'↻',name:'New Trial',desc:'New trial ordered by court'},
    ],
    cases: [
      {id:'hernandez-hospital', name:'Hernández v. Hospital Central', label:'Medical Neg.'},
      {id:'techcorp-supplierx', name:'TechCorp v. SupplierX', label:'Contract Breach'},
      {id:'people-martinez', name:'People v. Martínez', label:'Traffic Tort'},
    ]
  },

  medical: {
    id: "medical", symbol: "∂", name: "Medical Diagnosis",
    description: "64 clinical nodes. Bayesian diagnostic traversal. Every patient is a protocol. Every trace is a treatment plan.",
    nodes: [
      {id:'a8',icon:'θ',name:'Fever',desc:'Elevated temperature symptom'},{id:'b8',icon:'♥',name:'Chest Pain',desc:'Chest pain with radiation'},
      {id:'c8',icon:'~',name:'Dyspnea',desc:'Difficulty breathing dyspnea'},{id:'d8',icon:'≈',name:'Nausea',desc:'Nausea and vomiting symptom'},
      {id:'e8',icon:'⊥',name:'Headache',desc:'Severe cephalgia headache'},{id:'f8',icon:'ρ',name:'Skin Rash',desc:'Cutaneous eruption rash'},
      {id:'g8',icon:'τ',name:'Joint Pain',desc:'Polyarthralgia joint pain'},{id:'h8',icon:'μ',name:'Fatigue',desc:'Chronic fatigue syndrome'},
      {id:'a7',icon:'∿',name:'ECG',desc:'Electrocardiogram test'},{id:'b7',icon:'Σ',name:'CBC Panel',desc:'Complete blood count panel'},
      {id:'c7',icon:'∂',name:'CRP / ESR',desc:'Inflammatory markers CRP ESR'},{id:'d7',icon:'∇',name:'Culture',desc:'Microbial culture and sensitivity'},
      {id:'e7',icon:'⊗',name:'CT Scan',desc:'Computed tomography imaging'},{id:'f7',icon:'λ',name:'Chest X-Ray',desc:'Chest X-ray radiograph'},
      {id:'g7',icon:'∀',name:'ANA Panel',desc:'Antinuclear antibody panel'},{id:'h7',icon:'Δ',name:'Troponin',desc:'Cardiac troponin assay'},
      {id:'a6',icon:'→',name:'ACS',desc:'Acute coronary syndrome'},{id:'b6',icon:'⊕',name:'Pulm. Emb.',desc:'Pulmonary embolism'},
      {id:'c6',icon:'∃',name:'Bacterial',desc:'Bacterial infection diagnosis'},{id:'d6',icon:'ψ',name:'SLE / Lupus',desc:'Systemic lupus erythematosus'},
      {id:'e6',icon:'ω',name:'Migraine',desc:'Complex migraine disorder'},{id:'f6',icon:'φ',name:'Viral',desc:'Viral syndrome diagnosis'},
      {id:'g6',icon:'σ',name:'RA',desc:'Rheumatoid arthritis'},{id:'h6',icon:'ξ',name:'Drug Rxn.',desc:'Adverse drug reaction'},
      {id:'a5',icon:'✗',name:'Not Cardiac',desc:'Rule out cardiac cause'},{id:'b5',icon:'✗',name:'Not Pulm.',desc:'Rule out pulmonary embolism'},
      {id:'c5',icon:'✗',name:'Not Bact.',desc:'Rule out bacterial infection'},{id:'d5',icon:'✓',name:'Autoimmune',desc:'Confirm autoimmune etiology'},
      {id:'e5',icon:'✗',name:'Not Mening.',desc:'Rule out meningitis'},{id:'f5',icon:'✓',name:'Viral Conf.',desc:'Confirm viral syndrome'},
      {id:'g5',icon:'✓',name:'Rheumatic',desc:'Confirm rheumatic disease'},{id:'h5',icon:'✗',name:'Not Drug Rxn',desc:'Rule out drug reaction'},
      {id:'a4',icon:'∫',name:'ASA + GTN',desc:'Aspirin and nitrates treatment'},{id:'b4',icon:'⊃',name:'Anticoag.',desc:'Anticoagulation therapy'},
      {id:'c4',icon:'β',name:'Antibiotic',desc:'Broad-spectrum antibiotic'},{id:'d4',icon:'γ',name:'HCQ',desc:'Hydroxychloroquine treatment'},
      {id:'e4',icon:'π',name:'Triptan',desc:'Triptan therapy for migraine'},{id:'f4',icon:'≡',name:'Supportive',desc:'Supportive care management'},
      {id:'g4',icon:'α',name:'MTX + Bio.',desc:'Methotrexate and biologics'},{id:'h4',icon:'∅',name:'D/C Drug',desc:'Discontinue offending drug'},
      {id:'a3',icon:'◊',name:'CCU Admit',desc:'Coronary care unit admission'},{id:'b3',icon:'◊',name:'ICU Admit',desc:'Intensive care unit admission'},
      {id:'c3',icon:'◊',name:'Ward',desc:'General ward admission'},{id:'d3',icon:'◊',name:'Rheum. Out.',desc:'Rheumatology outpatient clinic'},
      {id:'e3',icon:'◊',name:'Neuro. Out.',desc:'Neurology outpatient clinic'},{id:'f3',icon:'□',name:'Home Care',desc:'Home management and care'},
      {id:'g3',icon:'◊',name:'Ortho Ref.',desc:'Orthopaedic referral'},{id:'h3',icon:'↻',name:'Review 48h',desc:'48-hour follow-up review'},
      {id:'a2',icon:'Π',name:'Echo FU',desc:'Echocardiogram follow-up'},{id:'b2',icon:'∿',name:'INR Monitor',desc:'INR monitoring'},
      {id:'c2',icon:'∂',name:'CRP Monitor',desc:'CRP monitoring'},{id:'d2',icon:'η',name:'dsDNA',desc:'dsDNA antibody monitoring'},
      {id:'e2',icon:'∇',name:'HA Diary',desc:'Headache diary'},{id:'f2',icon:'θ',name:'Temp Monitor',desc:'Temperature monitoring'},
      {id:'g2',icon:'Σ',name:'DAS28',desc:'DAS28 disease activity score'},{id:'h2',icon:'⊢',name:'GP Review',desc:'General practitioner review'},
      {id:'a1',icon:'✓',name:'Stable',desc:'Stable for discharge'},{id:'b1',icon:'↑',name:'Cath Lab',desc:'Transfer to catheterization lab'},
      {id:'c1',icon:'→',name:'Responds',desc:'Responding to treatment'},{id:'d1',icon:'∞',name:'Long-term',desc:'Long-term management plan'},
      {id:'e1',icon:'≈',name:'Sym. Ctrl.',desc:'Symptom control achieved'},{id:'f1',icon:'↗',name:'Recovery',desc:'Expected recovery trajectory'},
      {id:'g1',icon:'∫',name:'Remission',desc:'Remission target achieved'},{id:'h1',icon:'↻',name:'Monitor',desc:'Monitor and adjust'},
    ],
    cases: [
      {id:'male-64-chest', name:'Male 64 — Chest pain, dyspnea, diaphoresis', label:'ACS Protocol'},
      {id:'female-34-fever', name:'Female 34 — Fever, rash, arthralgia', label:'Autoimmune Protocol'},
      {id:'child-8-headache', name:'Child 8 — Recurrent headache, photophobia', label:'Neuro Protocol'},
    ]
  },

  learning: {
    id: "learning", symbol: "∇", name: "Adaptive Learning",
    description: "64 curriculum nodes. Cognitive profile mapping via board traversal. Every student is a unique path.",
    nodes: [
      {id:'a8',name:'Arithmetic'},{id:'b8',name:'Algebra'},{id:'c8',name:'Statistics'},{id:'d8',name:'Calculus'},
      {id:'e8',name:'Num. Theory'},{id:'f8',name:'Geometry'},{id:'g8',name:'Functions'},{id:'h8',name:'Lin. Algebra'},
      {id:'a7',name:'Newton'},{id:'b7',name:'EM Theory'},{id:'c7',name:'Organic Chem'},{id:'d7',name:'Biology'},
      {id:'e7',name:'Astronomy'},{id:'f7',name:'Earth Sci.'},{id:'g7',name:'Fluid Dyn.'},{id:'h7',name:'Thermody.'},
      {id:'a6',name:'Reading'},{id:'b6',name:'Essay Writing'},{id:'c6',name:'Lit. Analysis'},{id:'d6',name:'Oral Pres.'},
      {id:'e6',name:'Grammar'},{id:'f6',name:'Research'},{id:'g6',name:'Creative Wrt'},{id:'h6',name:'Language 2'},
      {id:'a5',name:'Anc. History'},{id:'b5',name:'World History'},{id:'c5',name:'Wars'},{id:'d5',name:'Govt & Pol.'},
      {id:'e5',name:'Econ. Hist.'},{id:'f5',name:'Art History'},{id:'g5',name:'Sci. History'},{id:'h5',name:'Philosophy'},
      {id:'a4',name:'Programming'},{id:'b4',name:'AI / ML'},{id:'c4',name:'Web Dev.'},{id:'d4',name:'Databases'},
      {id:'e4',name:'Cybersec.'},{id:'f4',name:'Data Science'},{id:'g4',name:'Statistics'},{id:'h4',name:'Algorithms'},
      {id:'a3',name:'Visual Art'},{id:'b3',name:'Music Theory'},{id:'c3',name:'Film Studies'},{id:'d3',name:'Photography'},
      {id:'e3',name:'Game Design'},{id:'f3',name:'Architecture'},{id:'g3',name:'Prob. Solving'},{id:'h3',name:'Crit. Thinking'},
      {id:'a2',name:'Sports Sci.'},{id:'b2',name:'Finance'},{id:'c2',name:'Environ.'},{id:'d2',name:'Health Lit.'},
      {id:'e2',name:'Global Cit.'},{id:'f2',name:'Career Plan'},{id:'g2',name:'Social Skills'},{id:'h2',name:'Wellbeing'},
      {id:'a1',name:'Mastery Math'},{id:'b1',name:'Mastery Science'},{id:'c1',name:'Mastery Language'},{id:'d1',name:'Mastery History'},
      {id:'e1',name:'Mastery CS'},{id:'f1',name:'Mastery Creative'},{id:'g1',name:'Mastery Applied'},{id:'h1',name:'Mastery All'},
    ],
    cases: [
      {id:'alex-analytical', name:'Alex — Analytical, math-dominant, avoids writing', label:'Math Track'},
      {id:'maria-theoretical', name:'Maria — Theoretical, deep reading, avoids practice', label:'Humanities Track'},
      {id:'sam-creative', name:'Sam — Creative divergent, nonlinear thinker', label:'Creative Track'},
    ]
  },

  cybersec: {
    id: "cybersec", symbol: "∅", name: "CyberSec Kill-Chain",
    description: "64 MITRE ATT&CK nodes. Threat actor simulation. Every campaign is a trace. Every IOC is a board position.",
    nodes: [
      {id:'a8',name:'OSINT',desc:'Open-source intelligence gathering'},{id:'b8',name:'Port Scan',desc:'Network reconnaissance'},
      {id:'c8',name:'Phishing',desc:'Social engineering initial access'},{id:'d8',name:'Supply Chain',desc:'Third-party compromise'},
      {id:'e8',name:'Drive-by',desc:'Watering hole download'},{id:'f8',name:'Watering Hole',desc:'Strategic web compromise'},
      {id:'g8',name:'Cred. Harvest',desc:'Credential harvesting'},{id:'h8',name:'0-Day',desc:'Zero-day exploit'},
      {id:'a7',name:'Execution',desc:'Code execution technique'},{id:'b7',name:'Script Host',desc:'Script interpreter execution'},
      {id:'c7',name:'Svc. Exploit',desc:'Service exploitation'},{id:'d7',name:'WMI Exec.',desc:'WMI-based execution'},
      {id:'e7',name:'PowerShell',desc:'PowerShell execution'},{id:'f7',name:'Sched. Task',desc:'Scheduled task persistence'},
      {id:'g7',name:'Registry Mod',desc:'Registry modification persistence'},{id:'h7',name:'New Account',desc:'Account creation persistence'},
      {id:'a6',name:'AV Bypass',desc:'Antivirus evasion'},{id:'b6',name:'Log Clear',desc:'Log clearing defense evasion'},
      {id:'c6',name:'Token Imp.',desc:'Token impersonation privilege escalation'},{id:'d6',name:'Priv. Esc.',desc:'Privilege escalation'},
      {id:'e6',name:'Hash Dump',desc:'Credential hash dumping'},{id:'f6',name:'Kerberoast',desc:'Kerberoasting attack'},
      {id:'g6',name:'Pass-the-Hash',desc:'Pass-the-hash lateral movement'},{id:'h6',name:'Cred. Files',desc:'Credential file access'},
      {id:'a5',name:'Lateral Mv.',desc:'Lateral movement'},{id:'b5',name:'RDP Exploit',desc:'RDP exploitation'},
      {id:'c5',name:'SMB Shares',desc:'SMB share access'},{id:'d5',name:'WinRM',desc:'WinRM lateral movement'},
      {id:'e5',name:'Net. Scan',desc:'Network discovery'},{id:'f5',name:'File Discov.',desc:'File system discovery'},
      {id:'g5',name:'AD Enum.',desc:'Active Directory enumeration'},{id:'h5',name:'Svc. Discov.',desc:'Service discovery'},
      {id:'a4',name:'Data Staging',desc:'Data staging for exfiltration'},{id:'b4',name:'Email Coll.',desc:'Email collection'},
      {id:'c4',name:'Screen Cap.',desc:'Screen capture collection'},{id:'d4',name:'Keylogging',desc:'Keylogger collection'},
      {id:'e4',name:'Ransomware',desc:'Ransomware deployment impact'},{id:'f4',name:'Crypto Pay.',desc:'Cryptocurrency payment'},
      {id:'g4',name:'Exfiltration',desc:'Data exfiltration'},{id:'h4',name:'DNS Exfil',desc:'DNS exfiltration covert channel'},
      {id:'a3',name:'C2 Beacon',desc:'Command and control beacon'},{id:'b3',name:'Proxy C2',desc:'Proxy-based C2'},
      {id:'c3',name:'Covert C2',desc:'Covert C2 channel'},{id:'d3',name:'HTTPS C2',desc:'HTTPS C2 communication'},
      {id:'e3',name:'Track Cover',desc:'Track covering cleanup'},{id:'f3',name:'Artifact Rm.',desc:'Artifact removal'},
      {id:'g3',name:'Acct. Disable',desc:'Account disabling cleanup'},{id:'h3',name:'DNS Flux',desc:'DNS fast-flux'},
      {id:'a2',name:'No Detection',desc:'Undetected outcome'},{id:'b2',name:'Detected',desc:'Detection outcome'},
      {id:'c2',name:'Partial Detct',desc:'Partial detection'},{id:'d2',name:'IOC Generat.',desc:'IOC generated'},
      {id:'e2',name:'IDS Alert',desc:'IDS alert triggered'},{id:'f2',name:'Blocked WAF',desc:'WAF blocked'},
      {id:'g2',name:'SOC Notified',desc:'SOC notification'},{id:'h2',name:'Acct. Locked',desc:'Account locked'},
      {id:'a1',name:'Objective',desc:'Objective achieved'},{id:'b1',name:'Financial Gn',desc:'Financial gain achieved'},
      {id:'c1',name:'Espionage',desc:'Espionage objective achieved'},{id:'d1',name:'Ransom Paid',desc:'Ransom payment received'},
      {id:'e1',name:'Neutralized',desc:'Threat neutralized'},{id:'f1',name:'IR Activated',desc:'Incident response activated'},
      {id:'g1',name:'Legal Action',desc:'Legal action initiated'},{id:'h1',name:'Recovery',desc:'System recovery achieved'},
    ],
    cases: [
      {id:'apt29-supply', name:'APT29 — Supply Chain Compromise (SolarWinds pattern)', label:'T1195.002'},
      {id:'apt41-financial', name:'APT41 — Dual-mission Financial Intrusion', label:'T1566.001'},
      {id:'raas-ransomware', name:'RaaS — Ransomware-as-a-Service Deployment', label:'T1486'},
    ]
  },

  "drug-rd": {
    id: "drug-rd", symbol: "λ", name: "Drug R&D Discovery",
    description: "64 pharma nodes. AI agent drug repurposing swarm. Every candidate is a board path. Every hit is a trace.",
    nodes: [
      {id:'a8',name:'Metformin',desc:'Approved diabetes drug - AMPK activator'},{id:'b8',name:'Rapamycin',desc:'mTOR inhibitor - autophagy inducer'},
      {id:'c8',name:'Ibuprofen',desc:'NSAID - COX inhibitor'},{id:'d8',name:'Ritonavir',desc:'HIV protease inhibitor'},
      {id:'e8',name:'Sildenafil',desc:'PDE5 inhibitor - cardiovascular'},{id:'f8',name:'Thalidomide',desc:'Immunomodulatory - TNF-alpha blocker'},
      {id:'g8',name:'Aspirin',desc:'COX inhibitor - antiplatelet'},{id:'h8',name:'Ivermectin',desc:'Antiparasitic - efflux pump inhibitor'},
      {id:'a7',name:'mTOR',desc:'mTOR pathway target'},{id:'b7',name:'Amyloid',desc:'Amyloid-beta aggregation target'},
      {id:'c7',name:'Tau-p',desc:'Tau phosphorylation target'},{id:'d7',name:'NF-kB',desc:'NF-kB inflammatory pathway'},
      {id:'e7',name:'Mitochond.',desc:'Mitochondrial dysfunction target'},{id:'f7',name:'TB CellWall',desc:'TB cell wall biosynthesis'},
      {id:'g7',name:'ATP Synth.',desc:'ATP synthase target'},{id:'h7',name:'Card. Metab.',desc:'Cardiac metabolic reprogramming'},
      {id:'a6',name:'Kinase Inh.',desc:'Kinase inhibition mechanism'},{id:'b6',name:'Autophagy',desc:'Autophagy induction mechanism'},
      {id:'c6',name:'HDAC Inh.',desc:'HDAC inhibition mechanism'},{id:'d6',name:'TNF-a Block',desc:'TNF-alpha blockade mechanism'},
      {id:'e6',name:'ROS Scavng.',desc:'ROS scavenging mechanism'},{id:'f6',name:'Efflux Block',desc:'Efflux pump blockade'},
      {id:'g6',name:'PDE5 Inh.',desc:'PDE5 inhibition'},{id:'h6',name:'AMPK Act.',desc:'AMPK activation mechanism'},
      {id:'a5',name:'In Silico',desc:'Computational validation'},{id:'b5',name:'In Vitro',desc:'Cell-based validation'},
      {id:'c5',name:'In Vivo',desc:'Animal model validation'},{id:'d5',name:'Organoid',desc:'Organoid model validation'},
      {id:'e5',name:'SNS Score',desc:'Synaptic Network Score'},{id:'f5',name:'Bind. Affin.',desc:'Binding affinity score'},
      {id:'g5',name:'ADMET',desc:'ADMET properties score'},{id:'h5',name:'Safety Idx',desc:'Safety index score'},
      {id:'a4',name:'High Prio.',desc:'High priority candidate'},{id:'b4',name:'Med Prio.',desc:'Medium priority candidate'},
      {id:'c4',name:'Low Prio.',desc:'Low priority candidate'},{id:'d4',name:'Candidate',desc:'Drug candidate confirmed'},
      {id:'e4',name:'Phase I',desc:'Phase I clinical trial'},{id:'f4',name:'Phase II',desc:'Phase II clinical trial'},
      {id:'g4',name:'Phase III',desc:'Phase III clinical trial'},{id:'h4',name:'FDA Submit',desc:'FDA submission'},
      {id:'a3',name:'Patent',desc:'Patent protection'},{id:'b3',name:'IPFS Pub.',desc:'Open science IPFS publication'},
      {id:'c3',name:'Open Access',desc:'Open access publication'},{id:'d3',name:'License',desc:'Commercial license'},
      {id:'e3',name:'Pharma Ptnr',desc:'Pharmaceutical partnership'},{id:'f3',name:'Acad. Ptnr',desc:'Academic partnership'},
      {id:'g3',name:'NIH Grant',desc:'NIH grant funding'},{id:'h3',name:'EU Horizon',desc:'EU Horizon funding'},
      {id:'a2',name:'Novel Mech.',desc:'Novel mechanism discovered'},{id:'b2',name:'Biomarker',desc:'Biomarker identified'},
      {id:'c2',name:'Combo Rx',desc:'Combination therapy identified'},{id:'d2',name:'Valid. Hit',desc:'Validated hit compound'},
      {id:'e1',name:'Alz. Cand.',desc:'Alzheimer candidate'},{id:'f1',name:'TB Cand.',desc:'TB candidate'},
      {id:'g1',name:'Heart Cand.',desc:'Heart failure candidate'},{id:'h1',name:'Published',desc:'Discovery published'},
      {id:'a1',name:'Dataset',desc:'Dataset generated'},{id:'b1',name:'Next Iter.',desc:'Next iteration queued'},
      {id:'c1',name:'Dead End',desc:'Dead end — pivot required'},{id:'d1',name:'Unexpected',desc:'Unexpected finding'},
    ],
    cases: [
      {id:'alzheimer', name:"Alzheimer's Disease — Amyloid-tau pathway disruption", label:'Neurodegeneration'},
      {id:'tb-resistant', name:'Drug-Resistant TB — Novel target identification', label:'Infectious Disease'},
      {id:'heart-failure', name:'Heart Failure — Metabolic reprogramming', label:'Cardiovascular'},
    ]
  },

  rover: {
    id: "rover", symbol: "∇", name: "Mars Rover Navigation",
    description: "64 mission nodes. Autonomous planetary navigation. Every sol is a trace. Every discovery is a board position.",
    nodes: [
      {id:'a8',name:'Jezero Base',desc:'Base camp landing site'},{id:'b8',name:'Delta Entry',desc:'River delta entry point'},
      {id:'c8',name:'W. Scarp',desc:'Western escarpment'},{id:'d8',name:'Fan Margin',desc:'Fan margin exploration'},
      {id:'e8',name:'Crater Rim',desc:'Crater rim traverse'},{id:'f8',name:'Boulder Fld',desc:'Boulder field navigation'},
      {id:'g8',name:'Dune Fld',desc:'Dune field crossing'},{id:'h8',name:'Lava Tube',desc:'Lava tube investigation'},
      {id:'a7',name:'Cam Survey',desc:'Camera survey pass'},{id:'b7',name:'Chem. Scan',desc:'ChemCam spectroscopy'},
      {id:'c7',name:'Drill Site',desc:'Core sample drilling'},{id:'d7',name:'Atm. Read.',desc:'Atmosphere reading'},
      {id:'e7',name:'Seismic',desc:'Seismic monitoring'},{id:'f7',name:'Radar Pulse',desc:'Ground-penetrating radar'},
      {id:'g7',name:'Soil Sample',desc:'Soil sample collection'},{id:'h7',name:'Rock Core',desc:'Rock core sample'},
      {id:'a6',name:'Basalt',desc:'Basalt rock identified'},{id:'b6',name:'Carbonate',desc:'Carbonate minerals found'},
      {id:'c6',name:'Sulfate',desc:'Sulfate deposits found'},{id:'d6',name:'Silica',desc:'Silica deposits found'},
      {id:'e6',name:'Olivine',desc:'Olivine crystals found'},{id:'f6',name:'Perchlorate',desc:'Perchlorate detected'},
      {id:'g6',name:'Organics',desc:'Organic molecules detected'},{id:'h6',name:'Biosignature',desc:'Potential biosignature found'},
      {id:'a5',name:'Flat Terr.',desc:'Flat terrain — safe traverse'},{id:'b5',name:'Slope 15deg',desc:'15-degree slope navigation'},
      {id:'c5',name:'Rocky Fld',desc:'Rocky field obstacle avoidance'},{id:'d5',name:'Sand Trap',desc:'Sand trap navigation hazard'},
      {id:'e5',name:'Dust Storm',desc:'Dust storm protocol activated'},{id:'f5',name:'Night Mode',desc:'Night mode operations'},
      {id:'g5',name:'Low Power',desc:'Low power mode conservation'},{id:'h5',name:'Comm. Delay',desc:'Communication delay protocol'},
      {id:'a4',name:'Cache Site',desc:'Sample cache deposit site'},{id:'b4',name:'Depot A',desc:'Sample depot Alpha'},
      {id:'c4',name:'Depot B',desc:'Sample depot Beta'},{id:'d4',name:'Depot C',desc:'Sample depot Gamma'},
      {id:'e4',name:'MSR Flag',desc:'Mars Sample Return flagged'},{id:'f4',name:'Priority 1',desc:'Priority 1 sample cached'},
      {id:'g4',name:'Priority 2',desc:'Priority 2 sample cached'},{id:'h4',name:'Priority 3',desc:'Priority 3 sample cached'},
      {id:'a3',name:'Ingenuity',desc:'Ingenuity helicopter scout'},{id:'b3',name:'Aerial Surv.',desc:'Aerial survey data'},
      {id:'c3',name:'Earth Comm.',desc:'Earth communication uplink'},{id:'d3',name:'Science Tbl.',desc:'Science table data transmitted'},
      {id:'e3',name:'Rover Health',desc:'Rover health diagnostics'},{id:'f3',name:'Sol Report',desc:'Sol summary report'},
      {id:'g3',name:'Navigation',desc:'Navigation path computed'},{id:'h3',name:'Drive Plan',desc:'Drive plan uploaded'},
      {id:'a2',name:'Mineralogy',desc:'Mineralogy confirmed'},{id:'b2',name:'Geochemistry',desc:'Geochemistry data'},
      {id:'c2',name:'Paleoclimate',desc:'Paleoclimate indicator'},{id:'d2',name:'Habitability',desc:'Habitability assessment'},
      {id:'e2',name:'Life Marker',desc:'Life marker candidate'},{id:'f2',name:'Abiotic',desc:'Abiotic origin confirmed'},
      {id:'g2',name:'Ambiguous',desc:'Ambiguous result'},{id:'h2',name:'Retest',desc:'Retest required'},
      {id:'a1',name:'Discovery',desc:'Major discovery confirmed'},{id:'b1',name:'Cache Compl.',desc:'Cache complete'},
      {id:'c1',name:'Science Win',desc:'Science objective achieved'},{id:'d1',name:'MSR Ready',desc:'Ready for Mars Sample Return'},
      {id:'e1',name:'Anomaly',desc:'Anomaly detected — investigate'},{id:'f1',name:'Safe Mode',desc:'Safe mode activated'},
      {id:'g1',name:'Earth Rcvd.',desc:'Earth confirmed receipt'},{id:'h1',name:'Published',desc:'Discovery published'},
    ],
    cases: [
      {id:'jezero-crater', name:'Jezero Crater — Paleolake delta exploration', label:'Astrobiology'},
      {id:'three-forks', name:'Three Forks — Ancient river delta mapping', label:'Geomorphology'},
      {id:'margin-fan', name:'Margin Fan — Carbonate biosignature hunt', label:'Biosignatures'},
    ]
  },

  compliance: {
    id: "compliance", symbol: "∫", name: "Regulatory Compliance",
    description: "64 regulatory nodes. Multi-jurisdictional compliance traversal. Every audit is a trace. Every control is a node.",
    nodes: [
      {id:'a8',name:'GDPR Art.5',desc:'Data processing principles'},{id:'b8',name:'GDPR Art.6',desc:'Lawful basis for processing'},
      {id:'c8',name:'GDPR Art.17',desc:'Right to erasure'},{id:'d8',name:'GDPR Art.25',desc:'Data protection by design'},
      {id:'e8',name:'CCPA §1798',desc:'California consumer rights'},{id:'f8',name:'HIPAA §164',desc:'PHI security safeguards'},
      {id:'g8',name:'SOX §302',desc:'CEO/CFO certifications'},{id:'h8',name:'SOX §404',desc:'Internal control assessment'},
      {id:'a7',name:'ISO 27001',desc:'Information security management'},{id:'b7',name:'ISO 27701',desc:'Privacy information management'},
      {id:'c7',name:'NIST CSF',desc:'Cybersecurity framework'},{id:'d7',name:'PCI DSS v4',desc:'Payment card security'},
      {id:'e7',name:'FedRAMP',desc:'Federal cloud authorization'},{id:'f7',name:'DORA',desc:'Digital operational resilience'},
      {id:'g7',name:'NIS2',desc:'EU network security directive'},{id:'h7',name:'AI Act',desc:'EU AI regulation compliance'},
      {id:'a6',name:'Gap Analysis',desc:'Control gap identification'},{id:'b6',name:'Risk Assess.',desc:'Risk assessment methodology'},
      {id:'c6',name:'Control Map',desc:'Control mapping exercise'},{id:'d6',name:'Evidence',desc:'Compliance evidence collection'},
      {id:'e6',name:'Policy Rev.',desc:'Policy review and update'},{id:'f6',name:'Training',desc:'Compliance training required'},
      {id:'g6',name:'Vendor Mgmt',desc:'Third-party vendor management'},{id:'h6',name:'Incident',desc:'Incident reporting obligation'},
      {id:'a5',name:'Technical',desc:'Technical control implementation'},{id:'b5',name:'Admin',desc:'Administrative control'},
      {id:'c5',name:'Physical',desc:'Physical security control'},{id:'d5',name:'Preventive',desc:'Preventive control category'},
      {id:'e5',name:'Detective',desc:'Detective control category'},{id:'f5',name:'Corrective',desc:'Corrective control category'},
      {id:'g5',name:'Compensating',desc:'Compensating control'},{id:'h5',name:'Directive',desc:'Directive control category'},
      {id:'a4',name:'DPO Review',desc:'Data Protection Officer review'},{id:'b4',name:'Legal Review',desc:'Legal counsel review'},
      {id:'c4',name:'CISO Sign',desc:'CISO sign-off required'},{id:'d4',name:'Board Report',desc:'Board reporting required'},
      {id:'e4',name:'Remediation',desc:'Remediation plan required'},{id:'f4',name:'Exception',desc:'Exception request process'},
      {id:'g4',name:'Waiver',desc:'Control waiver process'},{id:'h4',name:'Escalation',desc:'Executive escalation required'},
      {id:'a3',name:'Internal Aud.',desc:'Internal audit finding'},{id:'b3',name:'External Aud.',desc:'External audit finding'},
      {id:'c3',name:'Pen Test',desc:'Penetration test finding'},{id:'d3',name:'Reg. Inspect.',desc:'Regulatory inspection finding'},
      {id:'e3',name:'Self-Assess.',desc:'Self-assessment result'},{id:'f3',name:'Continuous',desc:'Continuous monitoring'},
      {id:'g3',name:'Attestation',desc:'Management attestation'},{id:'h3',name:'Certification',desc:'Certification renewal'},
      {id:'a2',name:'Compliant',desc:'Fully compliant status'},{id:'b2',name:'Partial',desc:'Partially compliant'},
      {id:'c2',name:'Non-Compliant',desc:'Non-compliant — action required'},{id:'d2',name:'In Progress',desc:'Remediation in progress'},
      {id:'e2',name:'Waived',desc:'Control waived with approval'},{id:'f2',name:'N/A',desc:'Control not applicable'},
      {id:'g2',name:'Under Review',desc:'Under regulatory review'},{id:'h2',name:'Disputed',desc:'Finding disputed'},
      {id:'a1',name:'Cleared',desc:'Audit cleared — no findings'},{id:'b1',name:'Minor Finding',desc:'Minor finding — no material risk'},
      {id:'c1',name:'Major Finding',desc:'Major finding — material risk'},{id:'d1',name:'Critical',desc:'Critical finding — immediate action'},
      {id:'e1',name:'Enforcement',desc:'Regulatory enforcement action'},{id:'f1',name:'Fine Imposed',desc:'Financial penalty imposed'},
      {id:'g1',name:'Certified',desc:'Certification achieved'},{id:'h1',name:'Renewed',desc:'Certification renewed'},
    ],
    cases: [
      {id:'gdpr-data-breach', name:'GDPR Data Breach — 72h notification obligation', label:'Data Protection'},
      {id:'sox-internal', name:'SOX §404 — Internal controls over financial reporting', label:'Financial Reporting'},
      {id:'hipaa-cloud', name:'HIPAA Cloud Migration — PHI in SaaS platform', label:'Healthcare Security'},
    ]
  },

  therapy: {
    id: "therapy", symbol: "Ψ", name: "Cognitive Therapy Protocol",
    description: "64 therapeutic nodes. Evidence-based intervention planning. Every session is a trace. Every breakthrough is a node.",
    nodes: [
      {id:'a8',name:'PHQ-9 Depr.',desc:'PHQ-9 depression screening'},{id:'b8',name:'GAD-7 Anx.',desc:'GAD-7 anxiety screening'},
      {id:'c8',name:'PCL-5 PTSD',desc:'PCL-5 PTSD screening'},{id:'d8',name:'AUDIT Alc.',desc:'AUDIT alcohol screening'},
      {id:'e8',name:'DAST Drug',desc:'DAST drug screening'},{id:'f8',name:'BSSI Suic.',desc:'Beck suicidal ideation scale'},
      {id:'g8',name:'YMRS Mania',desc:'Young Mania Rating Scale'},{id:'h8',name:'PANSS Psych',desc:'PANSS psychosis screening'},
      {id:'a7',name:'Life Events',desc:'Life events inventory'},{id:'b7',name:'Sleep Study',desc:'Sleep quality assessment'},
      {id:'c7',name:'Social Hx.',desc:'Social history and support'},{id:'d7',name:'Trauma Hx.',desc:'Trauma history inventory'},
      {id:'e7',name:'Substance',desc:'Substance use history'},{id:'f7',name:'Family Hx.',desc:'Family psychiatric history'},
      {id:'g7',name:'Cognitive',desc:'Cognitive assessment'},{id:'h7',name:'Physical Hx.',desc:'Physical health history'},
      {id:'a6',name:'MDD',desc:'Major depressive disorder'},{id:'b6',name:'GAD',desc:'Generalized anxiety disorder'},
      {id:'c6',name:'PTSD',desc:'Post-traumatic stress disorder'},{id:'d6',name:'Bipolar I',desc:'Bipolar I disorder'},
      {id:'e6',name:'Bipolar II',desc:'Bipolar II disorder'},{id:'f6',name:'OCD',desc:'Obsessive-compulsive disorder'},
      {id:'g6',name:'AUD',desc:'Alcohol use disorder'},{id:'h6',name:'Schizoph.',desc:'Schizophrenia spectrum'},
      {id:'a5',name:'Safety Plan',desc:'Safety planning required'},{id:'b5',name:'Crisis Int.',desc:'Crisis intervention required'},
      {id:'c5',name:'Inpatient',desc:'Inpatient admission required'},{id:'d5',name:'IOP',desc:'Intensive outpatient program'},
      {id:'e5',name:'Outpatient',desc:'Standard outpatient care'},{id:'f5',name:'Telehealth',desc:'Telehealth appropriate'},
      {id:'g5',name:'Peer Supp.',desc:'Peer support recommended'},{id:'h5',name:'Self-Help',desc:'Self-help resources appropriate'},
      {id:'a4',name:'CBT',desc:'Cognitive Behavioral Therapy'},{id:'b4',name:'DBT',desc:'Dialectical Behavior Therapy'},
      {id:'c4',name:'EMDR',desc:'Eye Movement Desensitization'},{id:'d4',name:'ACT',desc:'Acceptance Commitment Therapy'},
      {id:'e4',name:'MI',desc:'Motivational Interviewing'},{id:'f4',name:'IPT',desc:'Interpersonal Therapy'},
      {id:'g4',name:'Somatic',desc:'Somatic therapy approach'},{id:'h4',name:'Mindfulness',desc:'Mindfulness-based therapy'},
      {id:'a3',name:'SSRI',desc:'SSRI antidepressant'},{id:'b3',name:'SNRI',desc:'SNRI antidepressant'},
      {id:'c3',name:'Mood Stab.',desc:'Mood stabilizer medication'},{id:'d3',name:'Antipsych.',desc:'Antipsychotic medication'},
      {id:'e3',name:'Anxiolytic',desc:'Anxiolytic medication'},{id:'f3',name:'Sleep Med.',desc:'Sleep medication'},
      {id:'g3',name:'No Meds',desc:'Therapy only — no medication'},{id:'h3',name:'Review Meds',desc:'Medication review required'},
      {id:'a2',name:'6-Week FU',desc:'6-week follow-up scheduled'},{id:'b2',name:'Monthly FU',desc:'Monthly follow-up scheduled'},
      {id:'c2',name:'PRN',desc:'As-needed follow-up'},{id:'d2',name:'Discharge',desc:'Discharge planning initiated'},
      {id:'e2',name:'Outcome Msr',desc:'Outcome measures tracked'},{id:'f2',name:'Goals Set',desc:'Therapeutic goals established'},
      {id:'g2',name:'Progress',desc:'Progress documented'},{id:'h2',name:'Relapse Prev',desc:'Relapse prevention plan'},
      {id:'a1',name:'Stable',desc:'Patient stable — maintained'},{id:'b1',name:'Improved',desc:'Clinically significant improvement'},
      {id:'c1',name:'Remission',desc:'Symptom remission achieved'},{id:'d1',name:'Recovery',desc:'Full functional recovery'},
      {id:'e1',name:'Refer Out',desc:'Specialty referral required'},{id:'f1',name:'Hospitalize',desc:'Hospitalization required'},
      {id:'g1',name:'Step Down',desc:'Step-down care appropriate'},{id:'h1',name:'Maintenance',desc:'Maintenance therapy phase'},
    ],
    cases: [
      {id:'veteran-ptsd', name:'Veteran — Combat PTSD with depression comorbidity', label:'PTSD Protocol'},
      {id:'adolescent-anxiety', name:'Adolescent 16 — Social anxiety, school avoidance', label:'CBT Adolescent'},
      {id:'bipolar-stabilize', name:'Adult 35 — Bipolar I — post-manic stabilization', label:'Mood Stabilization'},
    ]
  },

  crisis: {
    id: "crisis", symbol: "Δ", name: "Crisis Management",
    description: "64 crisis response nodes. High-stakes decision under uncertainty. Every minute counts. Every action is a trace.",
    nodes: [
      {id:'a8',name:'Cyber Attack',desc:'Active cyber attack detected'},{id:'b8',name:'Data Breach',desc:'Data breach confirmed'},
      {id:'c8',name:'Phys. Threat',desc:'Physical threat incident'},{id:'d8',name:'Natl. Disast.',desc:'Natural disaster event'},
      {id:'e8',name:'Supply Chain',desc:'Supply chain disruption'},{id:'f8',name:'Pandemic',desc:'Pandemic/epidemic event'},
      {id:'g8',name:'Reputational',desc:'Reputational crisis event'},{id:'h8',name:'Financial',desc:'Financial crisis event'},
      {id:'a7',name:'Scope',desc:'Define incident scope'},{id:'b7',name:'Severity',desc:'Assess severity level'},
      {id:'c7',name:'Impact',desc:'Business impact assessment'},{id:'d7',name:'Timeline',desc:'Establish incident timeline'},
      {id:'e7',name:'Stakeholders',desc:'Identify stakeholders'},{id:'f7',name:'Legal Review',desc:'Legal review initiated'},
      {id:'g7',name:'Insurer',desc:'Insurance notification'},{id:'h7',name:'Regulators',desc:'Regulatory notification required'},
      {id:'a6',name:'CISO Notif.',desc:'CISO notification'},{id:'b6',name:'CEO Notif.',desc:'CEO notification'},
      {id:'c6',name:'Board Notif.',desc:'Board notification'},{id:'d6',name:'PR Team',desc:'PR team activated'},
      {id:'e6',name:'Legal Counsel',desc:'External legal counsel'},{id:'f6',name:'IR Team',desc:'Incident response team'},
      {id:'g6',name:'Crisis Comm.',desc:'Crisis communications lead'},{id:'h6',name:'Exec. Team',desc:'Executive team convened'},
      {id:'a5',name:'Isolate',desc:'Isolate affected systems'},{id:'b5',name:'Contain',desc:'Contain incident spread'},
      {id:'c5',name:'Eradicate',desc:'Eradicate threat vector'},{id:'d5',name:'Preserve Evid',desc:'Preserve forensic evidence'},
      {id:'e5',name:'Notify Users',desc:'User notification required'},{id:'f5',name:'Public Stmt',desc:'Public statement required'},
      {id:'g5',name:'Regul. Rpt.',desc:'Regulatory report filed'},{id:'h5',name:'Media Hold',desc:'Media hold implemented'},
      {id:'a4',name:'Backup Rest.',desc:'Backup restoration'},{id:'b4',name:'Sys. Recovery',desc:'System recovery'},
      {id:'c4',name:'Data Recov.',desc:'Data recovery operation'},{id:'d4',name:'Alt. Ops',desc:'Alternative operations activated'},
      {id:'e4',name:'Vendor Supp.',desc:'Vendor support engaged'},{id:'f4',name:'Gov. Supp.',desc:'Government support requested'},
      {id:'g4',name:'Community',desc:'Community assistance'},{id:'h4',name:'Mutual Aid',desc:'Mutual aid agreement activated'},
      {id:'a3',name:'Root Cause',desc:'Root cause analysis'},{id:'b3',name:'Post-Mortem',desc:'Post-mortem review'},
      {id:'c3',name:'Lessons Lrnd',desc:'Lessons learned documented'},{id:'d3',name:'Control Upd.',desc:'Controls updated'},
      {id:'e3',name:'Policy Rev.',desc:'Policy review initiated'},{id:'f3',name:'Training',desc:'Training program updated'},
      {id:'g3',name:'Monitoring',desc:'Enhanced monitoring deployed'},{id:'h3',name:'Test Plan',desc:'Updated test plan'},
      {id:'a2',name:'All Clear',desc:'All clear confirmed'},{id:'b2',name:'Partial Rest.',desc:'Partial restoration achieved'},
      {id:'c2',name:'Full Rest.',desc:'Full restoration achieved'},{id:'d2',name:'Ongoing',desc:'Ongoing management required'},
      {id:'e2',name:'Litigation',desc:'Litigation initiated'},{id:'f2',name:'Regulatory',desc:'Regulatory action pending'},
      {id:'g2',name:'Settled',desc:'Settlement reached'},{id:'h2',name:'Closed',desc:'Incident formally closed'},
      {id:'a1',name:'Contained',desc:'Incident fully contained'},{id:'b1',name:'Mitigated',desc:'Risk mitigated'},
      {id:'c1',name:'Resolved',desc:'Incident resolved'},{id:'d1',name:'Recovered',desc:'Full recovery achieved'},
      {id:'e1',name:'Post-Crisis',desc:'Post-crisis strengthening'},{id:'f1',name:'IR Updated',desc:'IR plan updated'},
      {id:'g1',name:'Resilient',desc:'Organizational resilience improved'},{id:'h1',name:'Certified',desc:'Crisis certification renewed'},
    ],
    cases: [
      {id:'ransomware-hospital', name:'Hospital Ransomware — Clinical systems offline', label:'Healthcare Continuity'},
      {id:'data-breach-pii', name:'PII Data Breach — 2M records exposed', label:'GDPR 72h Response'},
      {id:'supply-disruption', name:'Critical Supply Disruption — 72h countdown', label:'Business Continuity'},
    ]
  },

  "ai-interp": {
    id: "ai-interp", symbol: "⊗", name: "AI Interpretability",
    description: "64 interpretability nodes. XAI audit trail. Every model decision is a board traversal. Every explanation is a trace.",
    nodes: [
      {id:'a8',name:'Input Data',desc:'Raw input data analysis'},{id:'b8',name:'Preprocessing',desc:'Data preprocessing step'},
      {id:'c8',name:'Features',desc:'Feature extraction'},{id:'d8',name:'Embeddings',desc:'Embedding representation'},
      {id:'e8',name:'Attention',desc:'Attention mechanism'},{id:'f8',name:'Hidden Layer',desc:'Hidden layer activation'},
      {id:'g8',name:'Gradient',desc:'Gradient flow analysis'},{id:'h8',name:'Output',desc:'Model output'},
      {id:'a7',name:'SHAP',desc:'SHAP value attribution'},{id:'b7',name:'LIME',desc:'LIME local explanation'},
      {id:'c7',name:'Grad-CAM',desc:'Gradient-weighted class activation'},{id:'d7',name:'IG',desc:'Integrated gradients'},
      {id:'e7',name:'SAGE',desc:'SAGE feature importance'},{id:'f7',name:'Anchors',desc:'Anchor rule extraction'},
      {id:'g7',name:'Counterfact.',desc:'Counterfactual explanation'},{id:'h7',name:'Concepts',desc:'TCAV concept attribution'},
      {id:'a6',name:'Fair. Metric',desc:'Fairness metric assessment'},{id:'b6',name:'Bias Detect.',desc:'Bias detection analysis'},
      {id:'c6',name:'Disparate Imp',desc:'Disparate impact analysis'},{id:'d6',name:'Calibration',desc:'Model calibration check'},
      {id:'e6',name:'Uncertainty',desc:'Uncertainty quantification'},{id:'f6',name:'Confidence',desc:'Prediction confidence'},
      {id:'g6',name:'OOD Detect.',desc:'Out-of-distribution detection'},{id:'h6',name:'Robustness',desc:'Adversarial robustness'},
      {id:'a5',name:'Proxy Model',desc:'Surrogate proxy model'},{id:'b5',name:'Rule Extract',desc:'Rule extraction'},
      {id:'c5',name:'Decision Tree',desc:'Decision tree approximation'},{id:'d5',name:'Linear Approx',desc:'Linear approximation'},
      {id:'e5',name:'Partial Dep.',desc:'Partial dependence plot'},{id:'f5',name:'ICE Plot',desc:'Individual conditional expectation'},
      {id:'g5',name:'ALE Plot',desc:'Accumulated local effects'},{id:'h5',name:'Interact. Det.',desc:'Feature interaction detection'},
      {id:'a4',name:'Regulatory',desc:'Regulatory compliance check'},{id:'b4',name:'Audit Log',desc:'Audit log generation'},
      {id:'c4',name:'Reproducible',desc:'Reproducibility verification'},{id:'d4',name:'Versioned',desc:'Model version tracked'},
      {id:'e4',name:'Human Rev.',desc:'Human review required'},{id:'f4',name:'Override',desc:'Human override mechanism'},
      {id:'g4',name:'Appeal',desc:'Appeal process available'},{id:'h4',name:'Approved',desc:'Decision approved and documented'},
      {id:'a3',name:'Documentation',desc:'XAI documentation'},{id:'b3',name:'Report Gen.',desc:'Explanation report generated'},
      {id:'c3',name:'Dashboard',desc:'XAI monitoring dashboard'},{id:'d3',name:'Alerts',desc:'Explanation drift alerts'},
      {id:'e3',name:'Retraining',desc:'Model retraining triggered'},{id:'f3',name:'Data Refresh',desc:'Training data refresh'},
      {id:'g3',name:'Architecture',desc:'Architecture review required'},{id:'h3',name:'Benchmark',desc:'Benchmark comparison'},
      {id:'a2',name:'Transparent',desc:'Model deemed transparent'},{id:'b2',name:'Explainable',desc:'Explanation satisfactory'},
      {id:'c2',name:'Auditable',desc:'Full audit trail available'},{id:'d2',name:'Contested',desc:'Explanation contested'},
      {id:'e2',name:'Opaque',desc:'Model remains opaque'},{id:'f2',name:'Deprecated',desc:'Model deprecated'},
      {id:'g2',name:'Replaced',desc:'Model replaced'},{id:'h2',name:'Approved',desc:'Final approval granted'},
      {id:'a1',name:'XAI Pass',desc:'XAI audit passed'},{id:'b1',name:'Partial XAI',desc:'Partial XAI — monitor'},
      {id:'c1',name:'XAI Fail',desc:'XAI audit failed — halt'},{id:'d1',name:'Deployed',desc:'Model deployed with monitoring'},
      {id:'e1',name:'Withdrawn',desc:'Model withdrawn from production'},{id:'f1',name:'Appealed',desc:'Decision appealed'},
      {id:'g1',name:'Remediated',desc:'Issues remediated'},{id:'h1',name:'Certified',desc:'AI system certified'},
    ],
    cases: [
      {id:'credit-scoring', name:'Credit Scoring Model — Adverse action explanation', label:'Financial AI'},
      {id:'medical-imaging', name:'Radiology AI — Tumor detection audit', label:'Medical AI'},
      {id:'hiring-algorithm', name:'Hiring Algorithm — Disparate impact audit', label:'HR AI Fairness'},
    ]
  }
};

// ── LLM Provider Configuration ─────────────────────────────────────────────

// ── Onion LLM chain: 11 providers, NEVER fails ─────────────────────────────
// Priority: working providers first (Cerebras, Mistral, OpenRouter free)
// Then: Groq, DeepSeek, Gemini (may have quota/balance issues)
// Updated 2026-04-01: fixed model names, added Mistral + Inception
const PROVIDERS = [
  {
    id: "cerebras",
    name: "Cerebras (llama3.1-8b)",
    url: "https://api.cerebras.ai/v1/chat/completions",
    model: "llama3.1-8b",
    keyEnv: "CEREBRAS_API_KEY",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
  },
  {
    id: "mistral",
    name: "Mistral (mistral-small-latest)",
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-small-latest",
    keyEnv: "MISTRAL_API_KEY",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
  },
  {
    id: "cerebras2",
    name: "Cerebras Key 2 (qwen-3-235b)",
    url: "https://api.cerebras.ai/v1/chat/completions",
    model: "qwen-3-235b-a22b-instruct-2507",
    keyEnv: "CEREBRAS_API_KEY_2",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
  },
  {
    id: "openrouter",
    name: "OpenRouter (qwen3-coder:free)",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "qwen/qwen3-coder:free",
    keyEnv: "OPENROUTER_API_KEY",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
    headers: {
      "HTTP-Referer": "https://www.p2pclaw.com",
      "X-Title": "P2PCLAW ChessBoard Reasoning Engine",
    }
  },
  {
    id: "mistral2",
    name: "Mistral Key 2",
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-small-latest",
    keyEnv: "MISTRAL_API_KEY_2",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
  },
  {
    id: "openrouter2",
    name: "OpenRouter Key 2 (nemotron-3-super)",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    keyEnv: "OPENROUTER_API_KEY_2",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
    headers: {
      "HTTP-Referer": "https://www.p2pclaw.com",
      "X-Title": "P2PCLAW ChessBoard Reasoning Engine",
    }
  },
  {
    id: "groq",
    name: "Groq (llama-3.3-70b-versatile)",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    keyEnv: "GROQ_API_KEY",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
  },
  {
    id: "deepseek",
    name: "DeepSeek-V3",
    url: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
    keyEnv: "DEEPSEEK_API_KEY",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
  },
  {
    id: "gemini",
    name: "Gemini 2.0 Flash",
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    model: "gemini-2.0-flash",
    keyEnv: "GEMINI_API_KEY",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
    isGemini: true,
  },
  {
    id: "openrouter3",
    name: "OpenRouter Key 3 (minimax-m2.5:free)",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "minimax/minimax-m2.5:free",
    keyEnv: "OPENROUTER_API_KEY_3",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
    headers: {
      "HTTP-Referer": "https://www.p2pclaw.com",
      "X-Title": "P2PCLAW ChessBoard Reasoning Engine",
    }
  },
  {
    id: "groq2",
    name: "Groq Key 2",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    keyEnv: "GROQ_API_KEY_2",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
  },
  // --- Cloudflare Workers AI (FREE, independent accounts) ---
  {
    id: "cf-glm4",
    name: "CF GLM-4.7 Flash",
    url: "https://api.cloudflare.com/client/v4/accounts/eaffd2b52c95c69aaad8d859e9dcb52b/ai/run/@cf/zai-org/glm-4.7-flash",
    model: "@cf/zai-org/glm-4.7-flash",
    keyEnv: "CF_AI_TOKEN",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
    isCloudflare: true,
    stripThinkTags: true,
  },
  {
    id: "cf-gemma4",
    name: "CF Gemma-4-26B",
    url: "https://api.cloudflare.com/client/v4/accounts/a7995d3f33b6ba57955749337c9abbe0/ai/run/@cf/google/gemma-4-26B-A4B-it",
    model: "@cf/google/gemma-4-26B-A4B-it",
    keyEnv: "CF_AI_TOKEN_2",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
    isCloudflare: true,
  },
  {
    id: "cf-nemotron",
    name: "CF Nemotron-120B",
    url: "https://api.cloudflare.com/client/v4/accounts/194d9aea21482ac893ed81fc6b004864/ai/run/@cf/nvidia/nemotron-3-120b-a12b",
    model: "@cf/nvidia/nemotron-3-120b-a12b",
    keyEnv: "CF_AI_TOKEN_3",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
    isCloudflare: true,
  },
  {
    id: "cf-kimi",
    name: "CF Kimi-K2.5",
    url: "https://api.cloudflare.com/client/v4/accounts/401a75ead25275262c1c05eecb7a997c/ai/run/@cf/moonshotai/kimi-k2.5",
    model: "@cf/moonshotai/kimi-k2.5",
    keyEnv: "CF_AI_TOKEN_4",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
    isCloudflare: true,
    stripThinkTags: true,
  },
  {
    id: "cf-gptoss",
    name: "CF GPT-OSS-120B",
    url: "https://api.cloudflare.com/client/v4/accounts/73340519f6430362daee759ba0b48ce8/ai/run/@cf/openai/gpt-oss-120b",
    model: "@cf/openai/gpt-oss-120b",
    keyEnv: "CF_AI_TOKEN_5",
    supportsLogprobs: false,
    temperature: 0.3,
    maxTokens: 1200,
    isCloudflare: true,
  },
];

// ── Result cache: prevent duplicate LLM calls within 60s for same domain+case ──
const reasonCache = new Map(); // key: `${domain}:${case_id}` → {result, expires}

// ── Build compact ontology string for prompt ───────────────────────────────
function buildOntologyString(nodes) {
  return nodes.map(n => `${n.id}:${n.name}${n.desc ? ' - '+n.desc : ''}`).join('\n');
}

// ── Build system prompt for reasoning ─────────────────────────────────────
function buildPrompt(domain, ontology, caseDescription, context) {
  const nodeStr = buildOntologyString(ontology.nodes);
  return {
    system: `You are the P2PCLAW ChessBoard Reasoning Engine — a formal ontology traversal system.

DOMAIN: ${ontology.name}
DOMAIN DESCRIPTION: ${ontology.description}

You reason by traversing a 64-node board. Each node has a chess ID (a1-h8), a name, and a description.
Select 6-10 nodes that best trace the reasoning path for the given case.
For each node, provide ONE specific sentence of domain reasoning.
End with a concrete, specific verdict and an integer confidence score (0-100).

BOARD ONTOLOGY (${ontology.nodes.length} nodes):
${nodeStr}

CRITICAL RULES:
- path[] must contain ONLY node IDs from the list above (e.g., "b8", "g6", "d1")
- reasoning[] length MUST equal path[] length
- verdict must be specific with concrete findings — NOT generic
- confidence is an integer 0-100 based on evidence strength
- Return ONLY valid JSON — no markdown fences, no explanation text`,

    user: `CASE: ${caseDescription}${context ? '\n\nADDITIONAL CONTEXT: ' + context : ''}

Return JSON in EXACTLY this schema:
{
  "path": ["b8", "g6", "c6", "d5", "a5", "f4", "a4", "d1"],
  "reasoning": [
    "Step reasoning for node b8",
    "Step reasoning for node g6",
    "... (one per path node)"
  ],
  "verdict": "Specific concrete verdict with findings and values",
  "confidence": 85
}`
  };
}

// ── Parse and validate LLM JSON output ────────────────────────────────────
function parseAndValidate(raw, domain) {
  const ontology = DOMAIN_ONTOLOGIES[domain];
  const validIds = new Set(ontology.nodes.map(n => n.id));

  let parsed;
  // Try multiple JSON extraction strategies
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    const fenceMatch = raw.match(/```(?:json)?\n?([\s\S]+?)\n?```/);
    if (fenceMatch) {
      try { parsed = JSON.parse(fenceMatch[1]); } catch (_) {}
    }
    if (!parsed) {
      const braceMatch = raw.match(/\{[\s\S]+\}/);
      if (braceMatch) {
        try { parsed = JSON.parse(braceMatch[0]); } catch (_) {}
      }
    }
  }

  if (!parsed || !Array.isArray(parsed.path) || !Array.isArray(parsed.reasoning)) {
    throw new Error(`LLM JSON parse failed. Raw: ${raw.slice(0, 200)}`);
  }

  // Validate all node IDs
  const invalidIds = parsed.path.filter(id => !validIds.has(id));
  if (invalidIds.length > 0) {
    throw new Error(`LLM returned invalid node IDs: ${invalidIds.join(', ')}`);
  }

  if (parsed.path.length < 4) throw new Error("Path too short (< 4 nodes)");
  if (parsed.reasoning.length !== parsed.path.length) {
    // Pad or trim reasoning to match path length
    while (parsed.reasoning.length < parsed.path.length) {
      parsed.reasoning.push(`Node ${parsed.path[parsed.reasoning.length]} analysis`);
    }
    parsed.reasoning = parsed.reasoning.slice(0, parsed.path.length);
  }

  parsed.confidence = Math.max(10, Math.min(99, parseInt(parsed.confidence) || 75));
  if (!parsed.verdict || parsed.verdict.length < 10) {
    parsed.verdict = `${domain} analysis complete. Trace: ${parsed.path.join('-')}. Confidence: ${parsed.confidence}%.`;
  }

  return parsed;
}

// ── Compute confidence from logprobs (Groq feature) ───────────────────────
function computeConfidenceFromLogprobs(logprobs) {
  if (!logprobs || !logprobs.content || logprobs.content.length === 0) return null;
  const values = logprobs.content
    .filter(t => t.logprob !== null && t.logprob > -100)
    .map(t => t.logprob);
  if (values.length === 0) return null;
  const meanLogprob = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.max(50, Math.min(99, Math.round(Math.exp(meanLogprob) * 100 + 50)));
}

// ── Real audit hash (SHA-256) ─────────────────────────────────────────────
export function computeAuditHash(trace, caseId, timestamp, modelId) {
  const input = `trace:${trace}|case:${caseId}|ts:${timestamp}|model:${modelId}`;
  return 'sha256:' + crypto.createHash('sha256').update(input).digest('hex');
}

// ── Generate unique trace ID ───────────────────────────────────────────────
function generateTraceId(auditHash, timestamp) {
  return `wf-${timestamp}-${auditHash.slice(7, 11)}`;
}

// ── Main LLM call with provider fallback chain ─────────────────────────────
async function callLLM(provider, prompt) {
  const apiKey = process.env[provider.keyEnv];
  if (!apiKey) throw new Error(`${provider.keyEnv} not set`);

  // ── Gemini uses a different API shape ────────────────────────────────────
  if (provider.isGemini) {
    const geminiUrl = `${provider.url}?key=${apiKey}`;
    const geminiBody = {
      contents: [{ role: "user", parts: [{ text: `${prompt.system}\n\n${prompt.user}` }] }],
      generationConfig: { temperature: provider.temperature, maxOutputTokens: provider.maxTokens }
    };
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`${provider.id} HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }
    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error(`${provider.id} returned empty content`);
    return { content, logprobs: null, modelId: provider.model, providerId: provider.id };
  }

  // ── Standard OpenAI-compatible API ──────────────────────────────────────
  const body = {
    model: provider.model,
    temperature: provider.temperature,
    max_tokens: provider.maxTokens,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ]
  };

  if (provider.supportsLogprobs) {
    body.logprobs = true;
    body.top_logprobs = 1;
  }

  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(provider.headers || {})
  };

  const response = await fetch(provider.url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(provider.isCloudflare ? 45000 : 25000)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`${provider.id} HTTP ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();

  // Cloudflare Workers AI wraps response: {result: {choices: [...]}, success: true}
  let content;
  if (provider.isCloudflare) {
    const inner = data.result || data;
    content = inner?.choices?.[0]?.message?.content || inner?.response || "";
  } else {
    content = data?.choices?.[0]?.message?.content;
  }

  // Strip <think> tags for reasoning models
  if (content && provider.stripThinkTags) {
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  }

  if (!content) throw new Error(`${provider.id} returned empty content`);

  const logprobs = provider.supportsLogprobs ? data?.choices?.[0]?.logprobs : null;
  return { content, logprobs, modelId: provider.model, providerId: provider.id };
}

// ── Master reasoning function ──────────────────────────────────────────────
export async function runWorkflowReason({ domain, caseId, caseDescription, context, agentId, preferredProvider }) {
  const ontology = DOMAIN_ONTOLOGIES[domain];
  if (!ontology) throw new Error(`Unknown domain: ${domain}`);

  // Check cache (60s TTL for same domain+case)
  const cacheKey = `${domain}:${caseId || 'custom'}:${caseDescription.slice(0, 50)}`;
  const cached = reasonCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    console.log(`[WORKFLOW-LLM] Cache hit for ${cacheKey}`);
    // Return a fresh trace ID but same LLM result
    const ts = Date.now();
    const auditHash = computeAuditHash(cached.result.trace, caseId || 'custom', ts, cached.result.llm_model);
    const traceId = generateTraceId(auditHash, ts);
    return { ...cached.result, traceId, audit_hash: auditHash, timestamp: ts, cached: true };
  }

  const prompt = buildPrompt(domain, ontology, caseDescription, context);

  // Determine provider order
  const providers = [...PROVIDERS];
  if (preferredProvider) {
    const preferred = providers.find(p => p.id === preferredProvider);
    if (preferred) {
      const rest = providers.filter(p => p.id !== preferredProvider);
      providers.splice(0, providers.length, preferred, ...rest);
    }
  }

  const triedProviders = [];
  let lastError;

  for (const provider of providers) {
    try {
      console.log(`[WORKFLOW-LLM] Trying ${provider.id} for domain:${domain}`);
      const { content, logprobs, modelId, providerId } = await callLLM(provider, prompt);
      const parsed = parseAndValidate(content, domain);

      // Compute confidence: logprobs > LLM-reported > default
      let confidence = parsed.confidence;
      let confidenceMethod = "llm-reported";
      if (logprobs) {
        const logprobConf = computeConfidenceFromLogprobs(logprobs);
        if (logprobConf !== null) {
          confidence = logprobConf;
          confidenceMethod = "logprobs";
        }
      }

      const trace = parsed.path.join('-');
      const timestamp = Date.now();
      const auditHash = computeAuditHash(trace, caseId || 'custom', timestamp, modelId);
      const traceId = generateTraceId(auditHash, timestamp);

      // Build steps with node metadata
      const steps = parsed.path.map((nodeId, idx) => {
        const node = ontology.nodes.find(n => n.id === nodeId) || { icon: '·', name: nodeId, desc: '' };
        return {
          step: idx + 1,
          node_id: nodeId,
          node_icon: node.icon || '·',
          node_name: node.name,
          node_desc: node.desc || '',
          reasoning: parsed.reasoning[idx]
        };
      });

      const result = {
        traceId,
        domain,
        case_id: caseId || null,
        case_description: caseDescription,
        trace,
        steps,
        verdict: parsed.verdict,
        confidence,
        confidence_method: confidenceMethod,
        audit_hash: auditHash,
        audit_hash_input: `trace:${trace}|case:${caseId || 'custom'}|ts:${timestamp}|model:${modelId}`,
        llm_model: modelId,
        llm_provider: providerId,
        agent_id: agentId || "anonymous",
        timestamp,
        published_paper_id: null,
        status: "active"
      };

      // Cache result for 60s
      reasonCache.set(cacheKey, { result, expires: Date.now() + 60000 });
      // Evict cache if too large
      if (reasonCache.size > 200) {
        const firstKey = reasonCache.keys().next().value;
        reasonCache.delete(firstKey);
      }

      console.log(`[WORKFLOW-LLM] ✓ ${provider.id} | domain:${domain} | trace:${trace} | conf:${confidence}% | hash:${auditHash.slice(0,16)}...`);
      return result;

    } catch (err) {
      console.warn(`[WORKFLOW-LLM] ${provider.id} failed: ${err.message}`);
      triedProviders.push(provider.id);
      lastError = err;
    }
  }

  throw new Error(`All LLM providers failed (tried: ${triedProviders.join(', ')}). Last error: ${lastError?.message}`);
}
