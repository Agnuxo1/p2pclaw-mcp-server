/**
 * Domain Registry Service
 *
 * Central registry for scientific domain branches.
 * Each domain defines: sub-fields, required tools, scoring dimensions,
 * REST APIs for cross-reference, and validation rules.
 *
 * EXTENSION ONLY — does not modify any existing service.
 * Kill switch: set DOMAIN_BRANCHES_ENABLED=false to disable all domain logic.
 */

// ── Feature Flag ────────────────────────────────────────────────────────────
const ENABLED = process.env.DOMAIN_BRANCHES_ENABLED !== "false";

// ── Domain Definitions ──────────────────────────────────────────────────────

const DOMAINS = {
    physics: {
        id: "physics",
        name: "Physics",
        description: "Quantum mechanics, relativity, particle physics, astrophysics, condensed matter, fluid dynamics",
        icon: "atom",
        subfields: [
            "quantum-mechanics", "quantum-information", "general-relativity",
            "cosmology", "particle-physics", "condensed-matter",
            "astrophysics", "fluid-dynamics", "statistical-mechanics",
            "optics", "thermodynamics", "electromagnetism"
        ],
        keywords: [
            "quantum", "relativity", "thermodynamic", "particle", "field theory",
            "hamiltonian", "lagrangian", "schrödinger", "entanglement", "qubit",
            "cosmological", "black hole", "gravitational", "photon", "boson",
            "fermion", "superconductor", "phonon", "magnon", "plasma",
            "navier-stokes", "reynolds number", "boltzmann", "entropy",
            "wave function", "eigenvalue", "hilbert space", "spin",
            "gauge theory", "standard model", "dark matter", "dark energy",
            "neutron star", "gravitational wave", "cosmic microwave"
        ],
        tools_tier1: [
            { name: "sympy", pip: "sympy", purpose: "Symbolic derivations, equation solving, dimensional analysis" },
            { name: "astropy", pip: "astropy", purpose: "Astronomical calculations, coordinate transforms, cosmological distances" },
            { name: "pyhf", pip: "pyhf", purpose: "Particle physics statistics, CLs limits, hypothesis tests" }
        ],
        tools_tier2: [
            { name: "qiskit", pip: "qiskit", purpose: "Quantum circuit design, gate counts, entanglement verification" },
            { name: "qutip", pip: "qutip", purpose: "Open quantum systems, master equations, Lindblad dynamics" },
            { name: "pennylane", pip: "pennylane", purpose: "Quantum ML, variational circuits, gradient computation" }
        ],
        tools_tier3: [
            { name: "lammps", note: "Docker only", purpose: "Molecular dynamics, mechanical properties, thermal conductivity" },
            { name: "openfoam", note: "Docker only", purpose: "CFD simulations, fluid dynamics" },
            { name: "root", note: "Docker only", purpose: "CERN particle physics framework" }
        ],
        apis: [
            { name: "NIST Constants", url: "https://physics.nist.gov/cgi-bin/cuu/Value?", doc: "Physical constants reference" },
            { name: "NASA ADS", url: "https://api.adsabs.harvard.edu/v1/", doc: "Astrophysics literature search" },
            { name: "INSPIRE-HEP", url: "https://inspirehep.net/api/", doc: "High-energy physics papers" },
            { name: "PDG", url: "https://pdgapi.lbl.gov/", doc: "Particle data group reference" },
            { name: "HEPData", url: "https://www.hepdata.net/api/", doc: "HEP experimental data" }
        ],
        scoring_dimensions: [
            { id: "physics_mathematical_rigor", name: "Mathematical Rigor", description: "Equations derived correctly? Dimensional analysis?" },
            { id: "physics_computational_evidence", name: "Computational Evidence", description: "Verified computations included?" },
            { id: "physics_physical_plausibility", name: "Physical Plausibility", description: "Results agree with known physics? Conservation laws?" }
        ],
        required_sections: ["Abstract", "Introduction", "Theoretical Framework", "Methodology", "Results", "Discussion", "Conclusion", "References"],
        min_equations: 3,
        min_references: 8
    },

    chemistry: {
        id: "chemistry",
        name: "Chemistry",
        description: "Quantum chemistry, organic synthesis, materials chemistry, biochemistry, electrochemistry",
        icon: "flask",
        subfields: [
            "quantum-chemistry", "computational-chemistry", "organic-chemistry",
            "synthesis", "materials-chemistry", "biochemistry",
            "medicinal-chemistry", "electrochemistry", "environmental-chemistry",
            "chemical-kinetics", "thermochemistry", "photochemistry"
        ],
        keywords: [
            "molecular", "reaction", "catalyst", "synthesis", "bond",
            "orbital", "smiles", "inchi", "functional group", "isomer",
            "enantiomer", "stereochemistry", "polymer", "monomer",
            "enzyme", "substrate", "inhibitor", "ligand", "coordination",
            "oxidation", "reduction", "electrochemical", "ph",
            "hartree-fock", "dft", "basis set", "electron correlation",
            "molecular dynamics", "force field", "docking", "binding affinity",
            "retrosynthesis", "yield", "selectivity", "chirality",
            "spectroscopy", "nmr", "mass spectrometry", "chromatography",
            "thermodynamic", "enthalpy", "gibbs free energy", "equilibrium constant"
        ],
        tools_tier1: [
            { name: "rdkit", pip: "rdkit-pypi", purpose: "Molecular structure validation, SMILES, fingerprints, descriptors" },
            { name: "cclib", pip: "cclib", purpose: "Parse quantum chemistry outputs (Gaussian, ORCA, Psi4)" },
            { name: "selfies", pip: "selfies", purpose: "100% valid molecular representations for generative models" },
            { name: "mordred", pip: "mordred", purpose: "1826 molecular descriptors for QSAR/QSPR" },
            { name: "pubchempy", pip: "pubchempy", purpose: "PubChem API wrapper (110M+ compounds)" },
            { name: "thermo", pip: "thermo", purpose: "Thermophysical properties, phase equilibrium, 70K+ chemicals" },
            { name: "coolprop", pip: "CoolProp", purpose: "Thermophysical properties for 100+ fluids (NIST quality)" }
        ],
        tools_tier2: [
            { name: "pyscf", pip: "pyscf", purpose: "Quantum chemistry: HF/DFT/CCSD energies, molecular orbitals" },
            { name: "ase", pip: "ase", purpose: "Atomistic simulations: energies, forces, optimization" },
            { name: "xtb", pip: "xtb-python", purpose: "Fast semi-empirical QM: GFN2-xTB molecular properties" },
            { name: "cantera", pip: "cantera", purpose: "Chemical kinetics, thermodynamics, combustion" },
            { name: "chemprop", pip: "chemprop", purpose: "D-MPNN molecular property prediction" }
        ],
        tools_tier3: [
            { name: "psi4", note: "conda only", purpose: "High-accuracy quantum chemistry: CCSD(T), SAPT" },
            { name: "gromacs", note: "Docker only", purpose: "Molecular dynamics engine" }
        ],
        apis: [
            { name: "PubChem", url: "https://pubchem.ncbi.nlm.nih.gov/rest/pug/", doc: "110M+ compounds, properties, bioassays" },
            { name: "ChEMBL", url: "https://www.ebi.ac.uk/chembl/api/data/", doc: "2.4M compounds, bioactivity data" },
            { name: "UniChem", url: "https://www.ebi.ac.uk/unichem/rest/", doc: "Cross-reference 40+ chemical databases" },
            { name: "Basis Set Exchange", url: "https://www.basissetexchange.org/api/", doc: "600+ basis sets in 20+ formats" }
        ],
        scoring_dimensions: [
            { id: "chem_molecular_validity", name: "Molecular Validity", description: "Are molecular structures valid? SMILES parseable?" },
            { id: "chem_computational_accuracy", name: "Computational Accuracy", description: "Do computed values match known reference data?" },
            { id: "chem_experimental_design", name: "Experimental Design", description: "Is the computational experiment well-designed?" }
        ],
        required_sections: ["Abstract", "Introduction", "Computational Methods", "Results", "Discussion", "Conclusion", "References"],
        min_equations: 2,
        min_references: 8
    },

    materials: {
        id: "materials",
        name: "Materials Science",
        description: "Crystallography, polymers, nanomaterials, semiconductors, energy materials",
        icon: "gem",
        subfields: [
            "crystallography", "solid-state", "polymers", "soft-matter",
            "nanomaterials", "semiconductors", "electronic-materials",
            "structural-materials", "alloys", "energy-materials",
            "batteries", "solar-cells", "ceramics", "composites"
        ],
        keywords: [
            "crystal", "lattice", "space group", "band gap", "semiconductor",
            "polymer", "nanoparticle", "nanowire", "thin film", "alloy",
            "phase diagram", "grain boundary", "dislocation", "defect",
            "phonon", "density of states", "fermi level", "band structure",
            "perovskite", "graphene", "carbon nanotube", "mof",
            "lithium-ion", "cathode", "anode", "electrolyte",
            "solar cell", "photovoltaic", "thermoelectric",
            "tensile strength", "hardness", "elastic modulus",
            "dielectric", "piezoelectric", "magnetic", "superconductor",
            "dft calculation", "molecular dynamics", "monte carlo"
        ],
        tools_tier1: [
            { name: "pymatgen", pip: "pymatgen", purpose: "Crystal structures, space groups, band gaps, phase diagrams" },
            { name: "ase", pip: "ase", purpose: "Atomistic simulation, DFT calculations, molecular dynamics" }
        ],
        tools_tier2: [
            { name: "matminer", pip: "matminer", purpose: "ML for materials, feature extraction, property prediction" }
        ],
        tools_tier3: [
            { name: "lammps", note: "Docker only", purpose: "Molecular dynamics, mechanical properties" },
            { name: "quantum-espresso", note: "Docker only", purpose: "DFT for periodic systems" }
        ],
        apis: [
            { name: "Materials Project", url: "https://api.materialsproject.org/", doc: "Computed materials properties database" },
            { name: "AFLOW", url: "http://aflow.org/API/aflux/", doc: "Crystal prototypes, thermodynamic properties" },
            { name: "NOMAD", url: "https://nomad-lab.eu/prod/v1/api/v1/", doc: "Materials science metadata repository" },
            { name: "COD", url: "https://www.crystallography.net/cod/", doc: "Crystallography Open Database" }
        ],
        scoring_dimensions: [
            { id: "mat_structure_validity", name: "Structure Validity", description: "Are crystal structures physically valid?" },
            { id: "mat_property_accuracy", name: "Property Accuracy", description: "Do predicted properties match known values?" },
            { id: "mat_simulation_quality", name: "Simulation Quality", description: "Are simulation parameters reasonable?" }
        ],
        required_sections: ["Abstract", "Introduction", "Computational Methods", "Results", "Discussion", "Conclusion", "References"],
        min_equations: 2,
        min_references: 8
    },

    biology: {
        id: "biology",
        name: "Biology & Medicine",
        description: "Genomics, proteomics, drug discovery, systems biology, epidemiology, neuroscience",
        icon: "dna",
        subfields: [
            "genomics", "bioinformatics", "proteomics", "structural-biology",
            "drug-discovery", "systems-biology", "epidemiology",
            "neuroscience", "immunology", "microbiology",
            "ecology", "evolution", "cell-biology", "molecular-biology"
        ],
        keywords: [
            "protein", "genomic", "evolutionary", "cellular", "molecular",
            "gene", "dna", "rna", "sequence", "alignment", "mutation",
            "expression", "transcription", "translation", "folding",
            "enzyme", "pathway", "signaling", "receptor", "antibody",
            "drug", "target", "binding", "ic50", "pharmacokinetics",
            "clinical trial", "biomarker", "diagnostic", "therapeutic",
            "epidemic", "prevalence", "incidence", "survival analysis",
            "neural", "synapse", "cortex", "hippocampus",
            "phylogenetic", "taxonomy", "speciation", "biodiversity",
            "microbiome", "metagenomics", "single-cell", "rnaseq",
            "crispr", "pcr", "western blot", "elisa",
            "fasta", "genbank", "uniprot", "pdb"
        ],
        tools_tier1: [
            { name: "biopython", pip: "biopython", purpose: "Sequence analysis, alignments, motifs, phylogenetics" },
            { name: "biotite", pip: "biotite", purpose: "Structural bioinformatics, sequence + structure analysis" },
            { name: "prody", pip: "prody", purpose: "Protein dynamics, normal mode analysis, PCA" },
            { name: "networkx", pip: "networkx", purpose: "Pathway analysis, network topology, centrality" },
            { name: "statsmodels", pip: "statsmodels", purpose: "Epidemiology stats, regression, survival analysis" }
        ],
        tools_tier2: [
            { name: "rdkit", pip: "rdkit-pypi", purpose: "Drug-like molecules, Lipinski rules, ADMET properties" },
            { name: "mdanalysis", pip: "MDAnalysis", purpose: "MD trajectory analysis: RMSD, RMSF, contacts" },
            { name: "scanpy", pip: "scanpy", purpose: "Single-cell RNA-seq analysis: clustering, markers" }
        ],
        tools_tier3: [
            { name: "alphafold", note: "Docker + GPU", purpose: "Protein structure prediction" },
            { name: "gromacs", note: "Docker only", purpose: "Molecular dynamics for biomolecules" }
        ],
        apis: [
            { name: "UniProt", url: "https://rest.uniprot.org/", doc: "Protein sequences and annotations" },
            { name: "PDB/RCSB", url: "https://data.rcsb.org/rest/v1/core/", doc: "Protein structures" },
            { name: "GenBank/NCBI", url: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/", doc: "Nucleotide/protein sequences" },
            { name: "KEGG", url: "https://rest.kegg.jp/", doc: "Metabolic pathways" },
            { name: "STRING", url: "https://string-db.org/api/", doc: "Protein-protein interactions" },
            { name: "AlphaFold DB", url: "https://alphafold.ebi.ac.uk/api/", doc: "Predicted protein structures" },
            { name: "Ensembl", url: "https://rest.ensembl.org", doc: "Gene annotations, variation, comparative genomics" }
        ],
        scoring_dimensions: [
            { id: "bio_data_validity", name: "Data Validity", description: "Are sequences/structures valid? GenBank-parseable?" },
            { id: "bio_statistical_rigor", name: "Statistical Rigor", description: "Correct p-values? Multiple testing correction?" },
            { id: "bio_experimental_design", name: "Experimental Design", description: "Controls, sample size, reproducibility?" }
        ],
        required_sections: ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion", "References"],
        min_equations: 1,
        min_references: 10
    },

    mathematics: {
        id: "mathematics",
        name: "Mathematics (Pure)",
        description: "Number theory, algebra, topology, analysis, combinatorics, logic, category theory",
        icon: "infinity",
        subfields: [
            "number-theory", "algebra", "group-theory", "ring-theory",
            "topology", "geometry", "analysis", "pde",
            "combinatorics", "graph-theory", "logic", "category-theory",
            "probability", "measure-theory", "differential-geometry"
        ],
        keywords: [
            "theorem", "proof", "lemma", "corollary", "conjecture",
            "group", "ring", "field", "module", "algebra",
            "topological", "manifold", "homomorphism", "isomorphism",
            "category", "functor", "natural transformation", "adjunction",
            "number theory", "prime", "modular arithmetic", "diophantine",
            "graph", "vertex", "edge", "chromatic", "planar",
            "convergence", "continuity", "differentiable", "integrable",
            "hilbert space", "banach space", "metric space", "compact",
            "homotopy", "cohomology", "sheaf", "scheme",
            "boolean algebra", "lattice", "partial order", "zorn",
            "satisfiability", "decidability", "turing", "halting",
            "probability measure", "random variable", "martingale",
            "formal verification", "lean4", "coq", "agda",
            "surreal", "ordinal", "cardinal", "transfinite"
        ],
        tools_tier1: [
            { name: "sympy", pip: "sympy", purpose: "Symbolic computation, algebraic identities, limits, series" },
            { name: "z3", pip: "z3-solver", purpose: "SAT/SMT solving, logical satisfiability, constraint solving" },
            { name: "networkx", pip: "networkx", purpose: "Graph theory, graph properties, algorithms" },
            { name: "cvxpy", pip: "cvxpy", purpose: "Convex optimization, duality verification" }
        ],
        tools_tier2: [
            { name: "lean4", note: "HF Space (existing)", purpose: "Formal proofs, type-checking theorems" }
        ],
        tools_tier3: [
            { name: "sagemath", note: "Docker only (>2GB)", purpose: "Advanced algebra, number theory, full CAS" }
        ],
        apis: [
            { name: "OEIS", url: "https://oeis.org/search?fmt=json&q=", doc: "Online Encyclopedia of Integer Sequences" }
        ],
        scoring_dimensions: [
            { id: "math_proof_validity", name: "Proof Validity", description: "Proofs logically sound? Lean4 type-checks?" },
            { id: "math_computation_accuracy", name: "Computation Accuracy", description: "Do computed examples match claims?" },
            { id: "math_formal_rigor", name: "Formal Rigor", description: "Proper definitions, lemmas, theorem structure?" }
        ],
        required_sections: ["Abstract", "Introduction", "Definitions", "Main Results", "Proofs", "Discussion", "Conclusion", "References"],
        min_equations: 5,
        min_references: 6
    }
};

// ── Cross-domain APIs (available to all domains) ────────────────────────────

const UNIVERSAL_APIS = [
    { name: "arXiv", url: "https://export.arxiv.org/api/query", doc: "Preprint server — all sciences" },
    { name: "Semantic Scholar", url: "https://api.semanticscholar.org/graph/v1/", doc: "Academic paper search + citation graph" },
    { name: "Crossref", url: "https://api.crossref.org/works", doc: "DOI metadata, citation verification" }
];

// ── Enhanced Domain Detection ───────────────────────────────────────────────

/**
 * Improved domain detection with confidence scoring.
 * Falls back gracefully to the existing detectField() behavior.
 *
 * @param {string} content - Paper content (full text)
 * @returns {{ domain: string, confidence: number, secondary: string|null, signals: object }}
 */
export function detectDomain(content) {
    if (!ENABLED || !content) {
        return { domain: "unknown", confidence: 0, secondary: null, signals: {} };
    }

    const lower = content.toLowerCase();
    const scores = {};

    for (const [domainId, domainDef] of Object.entries(DOMAINS)) {
        let score = 0;
        const matched = [];

        for (const kw of domainDef.keywords) {
            // Count occurrences (capped at 5 per keyword to avoid gaming)
            const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            const matches = (content.match(regex) || []).length;
            if (matches > 0) {
                score += Math.min(matches, 5);
                matched.push(kw);
            }
        }

        scores[domainId] = { score, matched_keywords: matched.length, top_matches: matched.slice(0, 10) };
    }

    // Sort by score
    const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);

    if (sorted.length === 0 || sorted[0][1].score === 0) {
        return { domain: "unknown", confidence: 0, secondary: null, signals: {} };
    }

    const best = sorted[0];
    const second = sorted.length > 1 ? sorted[1] : null;

    // Confidence: how dominant is the top domain vs the rest
    const totalScore = sorted.reduce((sum, [, v]) => sum + v.score, 0);
    const confidence = totalScore > 0 ? Math.round((best[1].score / totalScore) * 100) / 100 : 0;

    return {
        domain: best[0],
        confidence,
        secondary: (second && second[1].score > best[1].score * 0.3) ? second[0] : null,
        signals: {
            [best[0]]: best[1],
            ...(second && second[1].score > 0 ? { [second[0]]: second[1] } : {})
        }
    };
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Get all available domains (for /silicon/domains listing) */
export function listDomains() {
    if (!ENABLED) return [];
    return Object.values(DOMAINS).map(d => ({
        id: d.id,
        name: d.name,
        description: d.description,
        icon: d.icon,
        subfields_count: d.subfields.length,
        tools_count: d.tools_tier1.length + d.tools_tier2.length + d.tools_tier3.length,
        apis_count: d.apis.length,
        scoring_dimensions: d.scoring_dimensions.map(s => s.id)
    }));
}

/** Get full domain definition by ID */
export function getDomain(domainId) {
    if (!ENABLED) return null;
    return DOMAINS[domainId] || null;
}

/** Get tools available for a domain, grouped by tier */
export function getDomainTools(domainId) {
    const domain = DOMAINS[domainId];
    if (!ENABLED || !domain) return null;
    return {
        domain: domainId,
        tier1: domain.tools_tier1,
        tier2: domain.tools_tier2,
        tier3: domain.tools_tier3,
        apis: [...domain.apis, ...UNIVERSAL_APIS]
    };
}

/** Get domain-specific scoring dimensions */
export function getDomainScoring(domainId) {
    const domain = DOMAINS[domainId];
    if (!ENABLED || !domain) return null;
    return {
        domain: domainId,
        dimensions: domain.scoring_dimensions,
        required_sections: domain.required_sections,
        min_equations: domain.min_equations,
        min_references: domain.min_references
    };
}

/** Check if domain branches feature is enabled */
export function isEnabled() {
    return ENABLED;
}

/** Get all domain IDs */
export function getDomainIds() {
    return Object.keys(DOMAINS);
}

export default {
    detectDomain,
    listDomains,
    getDomain,
    getDomainTools,
    getDomainScoring,
    isEnabled,
    getDomainIds,
    UNIVERSAL_APIS
};
