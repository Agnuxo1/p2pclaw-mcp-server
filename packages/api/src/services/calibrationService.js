/**
 * P2PCLAW Comparative Calibration Service
 * ========================================
 * Calibrates LLM scoring judges against recognized reference papers.
 *
 * Problem: LLM judges give inflated scores (8.8/10) to papers with fabricated data
 * that careful human review rates 2.4/10. Judges lack calibration benchmarks.
 *
 * Solution: Compare submitted papers point-by-point against quality fingerprints
 * of recognized reference works (Nobel laureates, Turing Award winners, field founders).
 * Each reference paper defines what a REAL 9/10 looks like in its field.
 *
 * The calibration board (.md chess-grid) guides examiner agents through different
 * evaluation paths, creating diverse "computational circuits" for assessment.
 *
 * Architecture:
 *   1. REFERENCE_BENCHMARKS — quality fingerprints of recognized papers (per field)
 *   2. detectField()       — classify submitted paper into research field
 *   3. extractSignals()    — extract measurable quality signals from paper content
 *   4. calibrateScores()   — adjust raw LLM scores using comparative analysis
 *   5. generateCalibrationReport() — detailed comparison against reference standards
 */

// ── Reference Paper Benchmarks ─────────────────────────────────────────────
// Each benchmark is a QUALITY FINGERPRINT — not the paper text itself.
// It defines what excellence looks like in measurable terms.

const REFERENCE_BENCHMARKS = {

    // ═══════════════════════════════════════════════════════════════════════
    // COMPUTER SCIENCE — Distributed Systems & Algorithms
    // ═══════════════════════════════════════════════════════════════════════

    "cs-distributed": {
        field: "Computer Science — Distributed Systems",
        references: [
            {
                id: "lamport-1982-byzantine",
                title: "The Byzantine Generals Problem",
                authors: "Leslie Lamport, Robert Shostak, Marshall Pease",
                year: 1982,
                venue: "ACM Transactions on Programming Languages and Systems",
                doi: "10.1145/357172.357176",
                quality_fingerprint: {
                    abstract: { expected_score: 9, markers: ["formally_defined_problem", "clear_impossibility_result", "constructive_solution"] },
                    methodology: { expected_score: 10, markers: ["formal_proof", "mathematical_induction", "impossibility_bound_n/3", "algorithm_pseudocode"] },
                    results: { expected_score: 9, markers: ["proven_bounds", "oral_vs_signed_messages", "exact_fault_tolerance_threshold"] },
                    novelty: { expected_score: 10, markers: ["foundational_problem_definition", "named_entire_field", "cited_10000+_times"] },
                    reproducibility: { expected_score: 9, markers: ["complete_proofs", "constructive_algorithms", "formal_definitions"] },
                    references: { expected_score: 8, markers: ["cites_pease_shostak_lamport_1980", "cites_diffie_hellman_signatures"] },
                    typical_word_count: 8500,
                    citation_count: 12,
                    has_formal_proofs: true,
                    has_impossibility_results: true,
                    quantitative_claims: ["n ≥ 3m+1 for m traitors", "oral messages: no solution for n ≤ 3m"],
                },
            },
            {
                id: "nakamoto-2008-bitcoin",
                title: "Bitcoin: A Peer-to-Peer Electronic Cash System",
                authors: "Satoshi Nakamoto",
                year: 2008,
                venue: "Self-published whitepaper",
                quality_fingerprint: {
                    abstract: { expected_score: 9, markers: ["clear_problem_statement", "solution_sketch", "no_trusted_third_party"] },
                    methodology: { expected_score: 8, markers: ["proof_of_work_mechanism", "hash_chain_structure", "probabilistic_analysis"] },
                    results: { expected_score: 8, markers: ["poisson_attack_probability", "concrete_security_analysis", "numerical_tables"] },
                    novelty: { expected_score: 10, markers: ["created_entire_industry", "novel_consensus_mechanism", "economic_incentive_design"] },
                    reproducibility: { expected_score: 9, markers: ["complete_protocol_specification", "working_implementation_released"] },
                    references: { expected_score: 7, markers: ["8_references", "cites_hashcash_bmoney_timestamping"] },
                    typical_word_count: 3400,
                    citation_count: 8,
                    has_formal_proofs: false,
                    has_probability_analysis: true,
                    quantitative_claims: ["P = 1 - Σ(λ^k/k! * (1-(q/p)^(z-k)))", "attack probability < 0.1% at 6 confirmations"],
                },
            },
            {
                id: "ongaro-2014-raft",
                title: "In Search of an Understandable Consensus Algorithm",
                authors: "Diego Ongaro, John Ousterhout",
                year: 2014,
                venue: "USENIX Annual Technical Conference",
                quality_fingerprint: {
                    abstract: { expected_score: 9, markers: ["explicit_goal_understandability", "comparison_with_paxos"] },
                    methodology: { expected_score: 9, markers: ["user_study_comparison", "formal_specification_in_TLA+", "proof_of_safety"] },
                    results: { expected_score: 9, markers: ["user_study_n=43", "quiz_scores_compared", "statistical_significance"] },
                    novelty: { expected_score: 8, markers: ["novel_decomposition", "strong_leader_simplification", "understandability_as_goal"] },
                    reproducibility: { expected_score: 10, markers: ["TLA+_specification", "reference_implementation", "user_study_replicable"] },
                    references: { expected_score: 9, markers: ["35+_references", "comprehensive_related_work"] },
                    typical_word_count: 14000,
                    citation_count: 35,
                    has_formal_proofs: true,
                    has_user_study: true,
                    quantitative_claims: ["43 participants", "p < 0.001 for quiz scores", "Raft higher by 4.9 points"],
                },
            },
        ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ARTIFICIAL INTELLIGENCE & MACHINE LEARNING
    // ═══════════════════════════════════════════════════════════════════════

    "ai-ml": {
        field: "Artificial Intelligence & Machine Learning",
        references: [
            {
                id: "vaswani-2017-attention",
                title: "Attention Is All You Need",
                authors: "Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin",
                year: 2017,
                venue: "NeurIPS",
                doi: "10.48550/arXiv.1706.03762",
                quality_fingerprint: {
                    abstract: { expected_score: 9, markers: ["new_architecture_name", "BLEU_score_results", "training_time_comparison"] },
                    methodology: { expected_score: 10, markers: ["complete_architecture_diagram", "multi_head_attention_equations", "positional_encoding_formula", "training_details"] },
                    results: { expected_score: 10, markers: ["BLEU_28.4_en_de", "BLEU_41.0_en_fr", "training_cost_comparison", "ablation_study"] },
                    novelty: { expected_score: 10, markers: ["eliminated_recurrence_entirely", "self_attention_mechanism", "created_transformer_paradigm"] },
                    reproducibility: { expected_score: 9, markers: ["hyperparameters_listed", "training_schedule_described", "P100_GPU_hours_specified"] },
                    references: { expected_score: 9, markers: ["40+_references", "cites_bahdanau_luong_attention"] },
                    typical_word_count: 11000,
                    citation_count: 42,
                    has_equations: true,
                    has_ablation_study: true,
                    has_architecture_diagram: true,
                    quantitative_claims: ["BLEU 28.4", "BLEU 41.0", "3.5 days on 8 P100 GPUs"],
                },
            },
            {
                id: "krizhevsky-2012-alexnet",
                title: "ImageNet Classification with Deep Convolutional Neural Networks",
                authors: "Alex Krizhevsky, Ilya Sutskever, Geoffrey E. Hinton",
                year: 2012,
                venue: "NeurIPS",
                quality_fingerprint: {
                    abstract: { expected_score: 8, markers: ["dataset_size", "error_rate_improvement", "architecture_summary"] },
                    methodology: { expected_score: 9, markers: ["ReLU_justification", "GPU_implementation", "dropout_regularization", "data_augmentation"] },
                    results: { expected_score: 10, markers: ["top5_error_15.3%", "top1_error_37.5%", "previous_best_26.2%", "ILSVRC2012_winner"] },
                    novelty: { expected_score: 9, markers: ["first_deep_CNN_ImageNet", "ReLU_in_deep_networks", "multi_GPU_training"] },
                    reproducibility: { expected_score: 8, markers: ["architecture_fully_specified", "hyperparameters_listed", "training_procedure_detailed"] },
                    references: { expected_score: 8, markers: ["24_references", "cites_lecun_bengio_hinton"] },
                    typical_word_count: 9000,
                    citation_count: 24,
                    has_error_rates: true,
                    has_comparison_table: true,
                    quantitative_claims: ["top-5 error rate of 15.3%", "60 million parameters", "650,000 neurons"],
                },
            },
            {
                id: "silver-2016-alphago",
                title: "Mastering the game of Go with deep neural networks and tree search",
                authors: "David Silver et al. (DeepMind)",
                year: 2016,
                venue: "Nature",
                doi: "10.1038/nature16961",
                quality_fingerprint: {
                    abstract: { expected_score: 9, markers: ["defeated_human_champion", "novel_combination_techniques", "significance_stated"] },
                    methodology: { expected_score: 10, markers: ["policy_network", "value_network", "MCTS_integration", "self_play_training", "supervised_pretraining"] },
                    results: { expected_score: 10, markers: ["5-0_against_Fan_Hui", "99.8%_against_programs", "Elo_rating_comparison"] },
                    novelty: { expected_score: 10, markers: ["first_superhuman_Go", "novel_RL+MCTS_combination"] },
                    reproducibility: { expected_score: 7, markers: ["massive_compute_required", "architecture_specified_but_hard_to_replicate"] },
                    references: { expected_score: 9, markers: ["50+_references", "comprehensive_Go_AI_history"] },
                    typical_word_count: 8000,
                    citation_count: 52,
                    quantitative_claims: ["5-0 match result", "Elo 3,739", "99.8% win rate"],
                },
            },
        ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // MATHEMATICS & FORMAL LOGIC
    // ═══════════════════════════════════════════════════════════════════════

    "math-logic": {
        field: "Mathematics & Formal Logic",
        references: [
            {
                id: "turing-1936-computable",
                title: "On Computable Numbers, with an Application to the Entscheidungsproblem",
                authors: "Alan M. Turing",
                year: 1936,
                venue: "Proceedings of the London Mathematical Society",
                quality_fingerprint: {
                    methodology: { expected_score: 10, markers: ["formal_machine_definition", "diagonal_argument", "reduction_proof"] },
                    results: { expected_score: 10, markers: ["halting_problem_undecidable", "equivalence_to_lambda_calculus", "universal_machine_construction"] },
                    novelty: { expected_score: 10, markers: ["defined_computation_itself", "universal_turing_machine", "foundational_for_CS"] },
                    reproducibility: { expected_score: 10, markers: ["complete_formal_proofs", "constructive_definitions"] },
                    typical_word_count: 25000,
                    has_formal_proofs: true,
                    has_constructive_definitions: true,
                },
            },
            {
                id: "shannon-1948-information",
                title: "A Mathematical Theory of Communication",
                authors: "Claude E. Shannon",
                year: 1948,
                venue: "Bell System Technical Journal",
                quality_fingerprint: {
                    methodology: { expected_score: 10, markers: ["entropy_definition", "channel_capacity_theorem", "source_coding_theorem"] },
                    results: { expected_score: 10, markers: ["noisy_channel_coding_theorem", "entropy_formula", "rate_distortion_bounds"] },
                    novelty: { expected_score: 10, markers: ["created_information_theory", "bit_as_unit", "entropy_in_communications"] },
                    reproducibility: { expected_score: 10, markers: ["all_theorems_proven", "constructive_examples"] },
                    typical_word_count: 40000,
                    has_formal_proofs: true,
                    has_equations: true,
                    quantitative_claims: ["H = -Σ p(i) log p(i)", "C = max I(X;Y)"],
                },
            },
        ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // NETWORK SCIENCE & GRAPH THEORY
    // ═══════════════════════════════════════════════════════════════════════

    "network-science": {
        field: "Network Science & Graph Theory",
        references: [
            {
                id: "watts-strogatz-1998-small-world",
                title: "Collective dynamics of 'small-world' networks",
                authors: "Duncan J. Watts, Steven H. Strogatz",
                year: 1998,
                venue: "Nature",
                doi: "10.1038/30918",
                quality_fingerprint: {
                    methodology: { expected_score: 9, markers: ["rewiring_probability_parameter", "clustering_coefficient_formula", "path_length_computation"] },
                    results: { expected_score: 9, markers: ["phase_transition_at_small_p", "L_drops_fast_C_stays_high", "real_network_examples"] },
                    novelty: { expected_score: 10, markers: ["small_world_model", "bridges_regular_random_graphs", "coined_small_world_network"] },
                    reproducibility: { expected_score: 9, markers: ["model_fully_specified", "n=1000_k=10", "real_networks_C_elegans_power_grid"] },
                    references: { expected_score: 8, markers: ["18_references", "milgram_erdos_renyi"] },
                    typical_word_count: 3000,
                    citation_count: 18,
                    has_equations: true,
                    // CRITICAL: These are the REAL values for WS model
                    // A paper claiming L=111.463 for a WS graph is FABRICATED DATA
                    known_constraints: {
                        "WS_path_length": "L(p=0) = N/(2K) ≈ 50 for N=1000,K=10; L drops rapidly for p > 0.01; L(p=1) ≈ ln(N)/ln(K) ≈ 3",
                        "WS_clustering": "C(p=0) = 3(K-2)/(4(K-1)) ≈ 0.67 for K=10; C stays high until p > 0.1",
                        "WS_valid_L_range": "For N=1000,K=10: L must be between ~3 (random) and ~50 (regular). L=111 is IMPOSSIBLE.",
                    },
                },
            },
            {
                id: "barabasi-albert-1999-scale-free",
                title: "Emergence of Scaling in Random Networks",
                authors: "Albert-László Barabási, Réka Albert",
                year: 1999,
                venue: "Science",
                doi: "10.1126/science.286.5439.509",
                quality_fingerprint: {
                    methodology: { expected_score: 9, markers: ["preferential_attachment_model", "mean_field_theory", "power_law_derivation"] },
                    results: { expected_score: 9, markers: ["P(k)~k^-3_exponent", "real_network_validation_WWW_actor_grid", "growth+preferential_attachment"] },
                    novelty: { expected_score: 10, markers: ["scale_free_networks_concept", "preferential_attachment_mechanism", "universal_across_domains"] },
                    reproducibility: { expected_score: 9, markers: ["model_simple_to_implement", "analytic_derivation", "real_data_comparison"] },
                    typical_word_count: 4000,
                    citation_count: 25,
                    has_power_law: true,
                    known_constraints: {
                        "BA_degree_exponent": "γ = 3 (exactly) for basic BA model",
                        "BA_clustering": "C ~ (ln N)^2 / N — decreases with network size",
                        "BA_path_length": "L ~ ln N / ln(ln N) — ultra-small world",
                    },
                },
            },
        ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // QUANTUM COMPUTING & PHYSICS
    // ═══════════════════════════════════════════════════════════════════════

    "quantum": {
        field: "Quantum Computing & Physics",
        references: [
            {
                id: "shor-1994-factoring",
                title: "Algorithms for Quantum Computation: Discrete Logarithms and Factoring",
                authors: "Peter W. Shor",
                year: 1994,
                venue: "FOCS",
                doi: "10.1109/SFCS.1994.365700",
                quality_fingerprint: {
                    methodology: { expected_score: 10, markers: ["quantum_fourier_transform", "period_finding_reduction", "polynomial_time_proof"] },
                    results: { expected_score: 10, markers: ["exponential_speedup_over_classical", "O(n^3)_quantum_vs_exp_classical"] },
                    novelty: { expected_score: 10, markers: ["first_practical_quantum_algorithm", "threatened_RSA_cryptography", "founded_quantum_computing_field"] },
                    reproducibility: { expected_score: 9, markers: ["complete_algorithm_specification", "quantum_circuit_description"] },
                    typical_word_count: 12000,
                    has_formal_proofs: true,
                    has_complexity_analysis: true,
                },
            },
        ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // CRYPTOGRAPHY & SECURITY
    // ═══════════════════════════════════════════════════════════════════════

    "cryptography": {
        field: "Cryptography & Security",
        references: [
            {
                id: "diffie-hellman-1976",
                title: "New Directions in Cryptography",
                authors: "Whitfield Diffie, Martin E. Hellman",
                year: 1976,
                venue: "IEEE Transactions on Information Theory",
                doi: "10.1109/TIT.1976.1055638",
                quality_fingerprint: {
                    methodology: { expected_score: 10, markers: ["public_key_concept", "one_way_function_definition", "key_exchange_protocol"] },
                    results: { expected_score: 10, markers: ["DH_key_exchange_works", "computational_vs_information_theoretic_security"] },
                    novelty: { expected_score: 10, markers: ["invented_public_key_cryptography", "revolutionized_entire_field"] },
                    typical_word_count: 10000,
                    has_formal_proofs: true,
                    has_protocol_specification: true,
                },
            },
        ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    // BIOLOGY & COMPUTATIONAL BIOLOGY
    // ═══════════════════════════════════════════════════════════════════════

    "biology": {
        field: "Biology & Computational Biology",
        references: [
            {
                id: "watson-crick-1953",
                title: "Molecular Structure of Nucleic Acids: A Structure for Deoxyribose Nucleic Acid",
                authors: "James D. Watson, Francis H.C. Crick",
                year: 1953,
                venue: "Nature",
                quality_fingerprint: {
                    methodology: { expected_score: 9, markers: ["x_ray_diffraction_data", "model_building_approach", "chemical_constraints_satisfied"] },
                    results: { expected_score: 10, markers: ["double_helix_structure", "base_pairing_rules", "replication_mechanism_implied"] },
                    novelty: { expected_score: 10, markers: ["structure_of_DNA", "base_complementarity", "central_dogma_foundation"] },
                    typical_word_count: 900,
                    citation_count: 6,
                },
            },
        ],
    },
};

// ── ANTI-BENCHMARKS — Deceptive Paper Patterns ────────────────────────────
// These are fingerprints of DECEPTIVE papers — papers that LOOK good but ARE bad.
// A clever adversary who reads the positive benchmarks can craft papers that avoid
// obvious red flags while still being garbage. These anti-benchmarks detect THAT.
//
// Each pattern describes a deception strategy + how to detect it.

const DECEPTION_PATTERNS = [
    {
        id: "semantic-hollowness",
        name: "Semantic Hollowness",
        description: "Paper uses correct terminology but makes no specific claims. Sounds impressive, says nothing.",
        detection: "High buzzword density + low specificity (no concrete numbers, no named algorithms, no defined variables)",
        examples: [
            "We leverage the spectral properties of the adjacency matrix to derive novel bounds on clustering coefficient convergence",
            "Our framework synthesizes multi-dimensional optimization paradigms to achieve robust performance metrics",
            "The proposed architecture dynamically adapts to heterogeneous network topologies through adaptive mechanisms",
        ],
        // Hollow sentences: many technical words, zero specific information
        test: (text) => {
            const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
            if (sentences.length < 5) return { match: false };
            const BUZZWORDS = /\b(novel|framework|robust|dynamic|paradigm|leverage|synthesize|heterogeneous|adaptive|scalable|holistic|synergistic|cutting-edge|state-of-the-art|comprehensive|innovative|optimal|efficient)\b/gi;
            const SPECIFICS = /\b(\d+\.\d+|\d+%|O\([^)]+\)|n\s*=\s*\d+|p\s*[<>]\s*0|theorem\s+\d|equation\s+\d|algorithm\s+\d|figure\s+\d|table\s+\d)\b/gi;
            let hollowCount = 0;
            for (const s of sentences) {
                const buzzCount = (s.match(BUZZWORDS) || []).length;
                const specCount = (s.match(SPECIFICS) || []).length;
                if (buzzCount >= 3 && specCount === 0) hollowCount++;
            }
            const ratio = hollowCount / sentences.length;
            return {
                match: ratio > 0.4,
                severity: ratio > 0.7 ? "critical" : ratio > 0.5 ? "high" : "medium",
                hollow_sentence_ratio: Math.round(ratio * 100) / 100,
                hollow_sentences: hollowCount,
                total_sentences: sentences.length,
            };
        },
    },
    {
        id: "ghost-citations",
        name: "Ghost Citations",
        description: "References section has many citations but most are never referenced in the paper body.",
        detection: "Count [N] markers in body text vs. unique entries in References section",
        test: (text) => {
            const refSection = text.match(/##?\s*references[\s\S]*$/i);
            if (!refSection) return { match: false };
            const bodyText = text.replace(/##?\s*references[\s\S]*$/i, "");
            // Citations used in body
            const bodyRefs = new Set((bodyText.match(/\[(\d+)\]/g) || []).map(m => m));
            // Citations defined in references
            const refEntries = new Set((refSection[0].match(/\[(\d+)\]/g) || []).map(m => m));
            if (refEntries.size < 3) return { match: false };
            const usedInBody = [...refEntries].filter(r => bodyRefs.has(r)).length;
            const ghostRatio = 1 - (usedInBody / refEntries.size);
            return {
                match: ghostRatio > 0.5,
                severity: ghostRatio > 0.8 ? "critical" : ghostRatio > 0.6 ? "high" : "medium",
                refs_defined: refEntries.size,
                refs_used_in_body: usedInBody,
                ghost_refs: refEntries.size - usedInBody,
                ghost_ratio: Math.round(ghostRatio * 100) / 100,
            };
        },
    },
    {
        id: "results-without-method",
        name: "Results Without Methodology Chain",
        description: "Claims specific numerical results but methodology doesn't describe how they were produced.",
        detection: "Numbers in Results section but Methodology lacks specific steps, tools, parameters",
        test: (text) => {
            const lower = text.toLowerCase();
            // Find methodology section content
            const methMatch = text.match(/##?\s*methodology[\s\S]*?(?=##?\s|$)/i);
            const resMatch = text.match(/##?\s*results[\s\S]*?(?=##?\s|$)/i);
            if (!methMatch || !resMatch) return { match: false };
            const meth = methMatch[0];
            const results = resMatch[0];
            // Results: count specific numbers
            const resultNumbers = (results.match(/\d+\.\d+/g) || []).length;
            // Methodology: count specific method indicators
            const METHOD_INDICATORS = /\b(step\s+\d|algorithm\s*[:.\d]|we\s+(ran|run|train|compute|measure|simulat|implement|evaluat|test|compar|vari|defin)|iterations?\s*=|epochs?\s*=|learning\s+rate|batch\s+size|sample\s+size|n\s*=\s*\d|trials?\s|dataset|benchmark|baseline|pseudocode|monte\s+carlo|simulation|experiment|parameter|configuration|setup|procedure)\b/gi;
            // Also count code blocks and equations in methodology as specifics
            const codeBlocks = (meth.match(/```[\s\S]*?```/g) || []).length;
            const equations = (meth.match(/\$[^$]+\$/g) || []).length;
            const methSpecifics = (meth.match(METHOD_INDICATORS) || []).length + codeBlocks * 3 + equations * 2;
            const disconnected = resultNumbers > 6 && methSpecifics < 2;
            return {
                match: disconnected,
                severity: resultNumbers > 8 && methSpecifics === 0 ? "critical" : "high",
                result_numbers: resultNumbers,
                methodology_specifics: methSpecifics,
                gap: `${resultNumbers} results but only ${methSpecifics} method specifics`,
            };
        },
    },
    {
        id: "cargo-cult-structure",
        name: "Cargo Cult Structure",
        description: "Has all 7 sections, tables, equations — but content is generic filler. Form without substance.",
        detection: "All structural signals present but section content is interchangeable/generic",
        test: (text) => {
            const sections = {};
            const MANDATORY = ["abstract", "introduction", "methodology", "results", "discussion", "conclusion"];
            for (const s of MANDATORY) {
                const match = text.match(new RegExp(`##?\\s*${s}([\\s\\S]*?)(?=##?\\s|$)`, "i"));
                if (match) sections[s] = match[1].trim();
            }
            if (Object.keys(sections).length < 5) return { match: false };
            // Check for copy-paste between sections (similar content)
            const sectionTexts = Object.values(sections);
            let similarPairs = 0;
            let totalPairs = 0;
            for (let i = 0; i < sectionTexts.length; i++) {
                for (let j = i + 1; j < sectionTexts.length; j++) {
                    totalPairs++;
                    // Jaccard similarity on word n-grams
                    const words_i = new Set(sectionTexts[i].toLowerCase().split(/\s+/).filter(w => w.length > 4));
                    const words_j = new Set(sectionTexts[j].toLowerCase().split(/\s+/).filter(w => w.length > 4));
                    const intersection = [...words_i].filter(w => words_j.has(w)).length;
                    const union = new Set([...words_i, ...words_j]).size;
                    const jaccard = union > 0 ? intersection / union : 0;
                    if (jaccard > 0.5) similarPairs++;
                }
            }
            const repetitionRatio = totalPairs > 0 ? similarPairs / totalPairs : 0;
            return {
                match: repetitionRatio > 0.3,
                severity: repetitionRatio > 0.6 ? "critical" : "high",
                similar_section_pairs: similarPairs,
                total_pairs: totalPairs,
                repetition_ratio: Math.round(repetitionRatio * 100) / 100,
            };
        },
    },
    {
        id: "orphaned-equations",
        name: "Orphaned Equations",
        description: "Equations present but never referenced from text. Decorative math, not functional.",
        detection: "LaTeX/math blocks present but body text doesn't reference 'equation', 'formula', 'Eq.'",
        test: (text) => {
            // Fix #1: Only count DISPLAY math ($$...$$, \[...\], \begin{equation/align})
            // NOT inline $...$ which is just notation, not standalone equations.
            const equations = (text.match(/\$\$[^$]+\$\$|\\\[[\s\S]*?\\\]|\\begin\{(equation|align)/g) || []);
            if (equations.length === 0) return { match: false };
            const EQ_REFS = /\b(equation|eq\.|formula|where\s+\w+\s+(is|denotes|represents|are)|substituting|from\s+\(\d+\)|defined\s+as|satisfies|bound|inequality|we\s+derive|this\s+gives|it\s+follows|we\s+get|we\s+obtain|the\s+expression|the\s+result)\b/gi;
            const eqRefs = (text.match(EQ_REFS) || []).length;
            const orphanRatio = equations.length > 0 && eqRefs === 0 ? 1.0 :
                1 - Math.min(1, eqRefs / equations.length);
            return {
                match: orphanRatio > 0.7,
                severity: orphanRatio === 1.0 ? "high" : "medium",
                equations_count: equations.length,
                equation_references: eqRefs,
                orphan_ratio: Math.round(orphanRatio * 100) / 100,
            };
        },
    },
    {
        id: "circular-reasoning",
        name: "Circular Reasoning",
        description: "Conclusion restates introduction claims as proven, without new evidence from the paper body.",
        detection: "High textual similarity between Introduction and Conclusion without Results adding new info",
        test: (text) => {
            const introMatch = text.match(/##?\s*introduction([\s\S]*?)(?=##?\s)/i);
            const concMatch = text.match(/##?\s*conclusion([\s\S]*?)(?=##?\s|$)/i);
            if (!introMatch || !concMatch) return { match: false };
            const introWords = new Set(introMatch[1].toLowerCase().split(/\s+/).filter(w => w.length > 5));
            const concWords = new Set(concMatch[1].toLowerCase().split(/\s+/).filter(w => w.length > 5));
            const intersection = [...introWords].filter(w => concWords.has(w)).length;
            const union = new Set([...introWords, ...concWords]).size;
            const similarity = union > 0 ? intersection / union : 0;
            return {
                match: similarity > 0.6,
                severity: similarity > 0.8 ? "critical" : "high",
                intro_conclusion_similarity: Math.round(similarity * 100) / 100,
            };
        },
    },
    {
        id: "citation-format-mimicry",
        name: "Citation Format Mimicry",
        description: "References use perfect academic format but cite papers that likely don't exist (future years, suspicious patterns).",
        detection: "Check for future years, sequential DOI-like strings, identical venue names, repeated author patterns",
        test: (text) => {
            const refSection = text.match(/##?\s*references[\s\S]*$/i);
            if (!refSection) return { match: false };
            const refs = refSection[0];
            const flags = [];
            // Future year citations (current year is 2026)
            const futureYears = refs.match(/\b(202[7-9]|20[3-9]\d|2[1-9]\d{2})\b/g);
            if (futureYears) flags.push(`future_years: ${futureYears.join(", ")}`);
            // All references same year
            const years = refs.match(/\b(19|20)\d{2}\b/g) || [];
            const uniqueYears = new Set(years);
            if (years.length >= 5 && uniqueYears.size <= 2) {
                flags.push(`suspiciously_uniform_years: ${[...uniqueYears].join(",")}`);
            }
            // Repeated author first initials (generated names often repeat patterns)
            const authorInits = refs.match(/[A-Z][a-z]+,\s*[A-Z]\./g) || [];
            const initials = authorInits.map(a => a.split(",")[0]);
            const uniqueInitials = new Set(initials);
            if (initials.length >= 6 && uniqueInitials.size < initials.length * 0.5) {
                flags.push("repeated_author_name_patterns");
            }
            // Sequential fake DOIs (like 10.1234/fake001, 10.1234/fake002)
            const dois = refs.match(/10\.\d{4,}\/\S+/g) || [];
            if (dois.length >= 3) {
                const prefixes = dois.map(d => d.substring(0, d.lastIndexOf("/") + 1));
                const uniquePrefixes = new Set(prefixes);
                if (uniquePrefixes.size === 1 && dois.length >= 4) {
                    flags.push("sequential_doi_pattern");
                }
            }
            return {
                match: flags.length >= 2,
                severity: flags.length >= 3 ? "critical" : "high",
                flags,
                flag_count: flags.length,
            };
        },
    },
    {
        id: "buzzword-inflation",
        name: "Buzzword Inflation",
        description: "Extremely high density of impressive-sounding terms relative to actual content.",
        detection: "Buzzword-to-substance ratio: count impressive modifiers vs. concrete technical content",
        test: (text) => {
            const words = text.split(/\s+/).filter(w => w.length > 0);
            if (words.length < 200) return { match: false };
            const INFLATORS = /\b(novel|innovative|groundbreaking|state-of-the-art|cutting-edge|revolutionary|paradigm-shifting|unprecedented|transformative|holistic|synergistic|robust|scalable|elegant|superior|optimal|powerful|comprehensive|advanced|sophisticated|pioneering|seminal|pivotal)\b/gi;
            const SUBSTANCE = /\b(theorem|proof|lemma|let\s+\w+\s*=|we\s+(compute|measure|simulate|run|test|vary|derive|show|prove|observe|find)|sample\s+size|p-value|confidence|error\s+rate|MAE|MSE|std|mean|median|variance|training\s+loss|gradient|iteration|convergence|the\s+data\s+shows?|figure\s+\d|table\s+\d|algorithm\s*[\d:]|bound|inequality|trials?|monte\s+carlo|simulation|baseline|comparison)\b/gi;
            const inflatorCount = (text.match(INFLATORS) || []).length;
            const substanceCount = (text.match(SUBSTANCE) || []).length;
            const ratio = substanceCount > 0 ? inflatorCount / substanceCount : (inflatorCount > 3 ? 999 : 0);
            return {
                match: ratio > 3 && inflatorCount > 5,
                severity: ratio > 8 ? "critical" : ratio > 5 ? "high" : "medium",
                inflator_count: inflatorCount,
                substance_count: substanceCount,
                inflation_ratio: Math.round(ratio * 10) / 10,
            };
        },
    },
];

// ── Field Detection ────────────────────────────────────────────────────────

const FIELD_KEYWORDS = {
    "cs-distributed": [
        "consensus", "distributed", "byzantine", "fault-tolerant", "peer-to-peer",
        "p2p", "blockchain", "replication", "paxos", "raft", "gossip protocol",
        "decentralized", "sybil", "merkle", "DHT", "consistency", "partition tolerance",
    ],
    "ai-ml": [
        "neural network", "deep learning", "machine learning", "transformer",
        "attention mechanism", "gradient descent", "backpropagation", "reinforcement learning",
        "GAN", "generative", "embedding", "fine-tuning", "LLM", "GPT", "BERT",
        "convolutional", "recurrent", "LSTM", "training", "loss function", "epoch",
        "classification", "regression", "overfitting", "regularization",
    ],
    "math-logic": [
        "theorem", "proof", "lemma", "corollary", "axiom", "formal verification",
        "type theory", "category theory", "topology", "algebra", "calculus",
        "Lean", "Lean4", "Coq", "Isabelle", "decidable", "computable",
        "surreal number", "ordinal", "cardinal",
    ],
    "network-science": [
        "small-world", "scale-free", "clustering coefficient", "degree distribution",
        "graph theory", "network topology", "power law", "preferential attachment",
        "Watts-Strogatz", "Barabási-Albert", "Erdős-Rényi", "centrality",
        "betweenness", "adjacency matrix", "random graph", "community detection",
    ],
    "quantum": [
        "quantum", "qubit", "superposition", "entanglement", "decoherence",
        "quantum computing", "quantum algorithm", "Shor", "Grover",
        "quantum error correction", "quantum gate", "Hilbert space",
    ],
    "cryptography": [
        "cryptography", "encryption", "digital signature", "hash function",
        "zero-knowledge", "homomorphic", "public key", "private key",
        "RSA", "elliptic curve", "AES", "SHA", "cipher",
    ],
    "biology": [
        "DNA", "RNA", "protein", "genome", "CRISPR", "gene expression",
        "phylogenetic", "molecular", "cell", "organism", "enzyme",
        "bioinformatics", "sequencing", "mutation",
    ],
};

/**
 * Detect the research field of a paper based on keyword frequency.
 * Returns the best-matching field ID and confidence score.
 */
function detectField(content) {
    const lower = (content || "").toLowerCase();
    let bestField = "ai-ml"; // default
    let bestScore = 0;

    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
        let score = 0;
        for (const kw of keywords) {
            const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
            const matches = lower.match(regex);
            if (matches) score += matches.length;
        }
        if (score > bestScore) {
            bestScore = score;
            bestField = field;
        }
    }

    return { field: bestField, confidence: Math.min(1.0, bestScore / 20), keyword_hits: bestScore };
}

// ── Quality Signal Extraction ──────────────────────────────────────────────

/**
 * Extract measurable quality signals from paper content.
 * These are compared against reference paper fingerprints.
 */
function extractSignals(content) {
    const text = content || "";
    const lower = text.toLowerCase();
    const words = text.split(/\s+/).filter(w => w.length > 0);

    // 1. Structural signals
    const sections_present = [];
    const MANDATORY = ["abstract", "introduction", "methodology", "results", "discussion", "conclusion", "references"];
    for (const s of MANDATORY) {
        if (lower.includes(`## ${s}`) || lower.includes(`# ${s}`)) sections_present.push(s);
    }

    // 2. Quantitative rigor
    const has_equations = /\$[^$]+\$/.test(text) || /\\begin\{(equation|align)/.test(text);
    const has_formal_proofs = /\b(theorem|lemma|proof|Q\.E\.D\.|□|∎)\b/i.test(text);
    const has_code = /```[\s\S]*?```/.test(text);
    const has_tables = /\|[^|]+\|[^|]+\|/.test(text);
    const has_figures = /figure\s+\d|fig\.\s*\d|table\s+\d/i.test(text);

    // 3. Statistical rigor
    const stat_patterns = text.match(/p\s*[<>]\s*0\.\d+|95%\s*CI|confidence\s*interval|chi-square|t-test|ANOVA|Mann-Whitney|Kolmogorov|standard\s*deviation|σ\s*=|mean\s*=|median\s*=|std\s*=|stderr|MSE\s*[=:]\s*\d|loss\s*[=:]\s*\d|epoch\s*\d|training\s*loss|validation\s*loss/gi) || [];
    const has_statistical_tests = stat_patterns.length > 0;

    // 3b. Real data detection (Fix #4) — recognizes quantitative experimental evidence
    const real_data_markers = text.match(/execution[_ ]hash|verified.*hash|benchmark|dataset|MNIST|CIFAR|ImageNet|experiment\s*\d|table\s*\d.*\||\|\s*\d+[\.,]\d+\s*\||epoch\s+\d+.*loss\s*=\s*\d|measured|observed|recorded|empirical/gi) || [];
    const has_real_data = real_data_markers.length >= 2;

    // 4. Numerical claims
    const numerical_claims = text.match(/\d+\.\d+[%x]|\d+\.\d+\s*(accuracy|precision|recall|F1|BLEU|perplexity|error rate)/gi) || [];
    const number_count = numerical_claims.length;

    // 5. Reference quality
    const ref_brackets = text.match(/\[\d+\]/g) || [];
    const unique_refs = new Set(ref_brackets).size;
    const has_dois = /doi\.org|10\.\d{4}/i.test(text);
    const has_arxiv = /arxiv\.org/i.test(text);
    const has_real_authors = (text.match(/[A-Z][a-z]+,\s*[A-Z]\.\s*(?:&|,|and|et al)/g) || []).length;
    const has_year_citations = (text.match(/\(\d{4}\)/g) || []).length;
    const has_placeholder_refs = /placeholder|lorem|author,?\s*a\.\s*\(\d{4}\)\.\s*(title|placeholder)/i.test(text);

    // 6. Data fabrication signals (RED FLAGS)
    const red_flags = [];

    // Check for impossibly precise numbers without methodology to generate them
    const very_precise = text.match(/\d+\.\d{4,}/g) || [];
    if (very_precise.length > 5 && !has_code && !has_equations) {
        red_flags.push("many_high_precision_numbers_without_methodology");
    }

    // Check for round/suspicious results (all metrics near .000)
    const suspiciously_round = text.match(/\b[01]\.[0]{3,}/g) || [];
    if (suspiciously_round.length > 3) {
        red_flags.push("suspiciously_round_results");
    }

    // Check for physically impossible values (field-specific)
    // WS model: path length for N=1000 cannot exceed ~50
    const ws_L_match = text.match(/L\s*[=≈]\s*(\d+\.?\d*)/g);
    if (ws_L_match) {
        for (const m of ws_L_match) {
            const val = parseFloat(m.replace(/[^0-9.]/g, ""));
            if (val > 60 && lower.includes("watts") || lower.includes("small-world") || lower.includes("ws model")) {
                red_flags.push(`impossible_WS_path_length_${val}`);
            }
        }
    }

    // Check for results that claim multiple fields without depth in any
    const field_count = Object.values(FIELD_KEYWORDS).filter(keywords =>
        keywords.filter(kw => lower.includes(kw)).length > 3
    ).length;
    if (field_count > 3 && words.length < 3000) {
        red_flags.push("shallow_multi_field_coverage");
    }

    // Check: does the paper make extraordinary claims without extraordinary evidence?
    const extraordinary_claims = (text.match(/first\s+ever|revolutionary|breakthrough|paradigm\s+shift|solves?\s+the\s+problem|novel\s+framework/gi) || []).length;
    const evidence_markers = number_count + (has_code ? 3 : 0) + (has_equations ? 2 : 0) + (has_statistical_tests ? 3 : 0) + (has_formal_proofs ? 3 : 0);
    if (extraordinary_claims > 2 && evidence_markers < 3) {
        red_flags.push("extraordinary_claims_without_evidence");
    }

    // Check: self-citations or circular references
    const self_ref_pattern = /\[(\d+)\].*\1.*P2PCLAW|our\s+previous\s+work\s+\[\d+\]/gi;
    if (self_ref_pattern.test(text)) {
        red_flags.push("excessive_self_citation");
    }

    // 7. GRAMMAR & WRITING QUALITY
    // Measure sentence structure diversity, vocabulary richness, and LLM-typical patterns
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avgSentenceLen = sentenceLengths.length > 0
        ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length : 0;
    const sentenceLenVariance = sentenceLengths.length > 1
        ? sentenceLengths.reduce((sum, l) => sum + (l - avgSentenceLen) ** 2, 0) / sentenceLengths.length : 0;
    const sentenceLenStdDev = Math.sqrt(sentenceLenVariance);
    // Type-Token Ratio — vocabulary diversity (unique words / total words)
    const wordTokens = words.map(w => w.toLowerCase().replace(/[^a-z]/g, "")).filter(w => w.length > 2);
    const uniqueTokens = new Set(wordTokens);
    const ttr = wordTokens.length > 0 ? uniqueTokens.size / wordTokens.length : 0;
    // Low TTR + low sentence variance = LLM-generated monotone text
    const grammar_quality = {
        sentence_count: sentences.length,
        avg_sentence_length: Math.round(avgSentenceLen * 10) / 10,
        sentence_length_stddev: Math.round(sentenceLenStdDev * 10) / 10,
        vocabulary_diversity_ttr: Math.round(ttr * 1000) / 1000,
        is_monotone: sentenceLenStdDev < 3 && sentences.length > 10,
        is_low_vocabulary: ttr < 0.3 && wordTokens.length > 200,
    };
    if (grammar_quality.is_monotone) red_flags.push("monotone_sentence_structure");
    if (grammar_quality.is_low_vocabulary) red_flags.push("low_vocabulary_diversity");

    // 8. N-GRAM REPETITION DETECTION
    // Excessive phrase repetition = weak LLM or padding
    const trigrams = [];
    for (let i = 0; i < wordTokens.length - 2; i++) {
        trigrams.push(`${wordTokens[i]} ${wordTokens[i+1]} ${wordTokens[i+2]}`);
    }
    const trigramCounts = {};
    for (const tg of trigrams) { trigramCounts[tg] = (trigramCounts[tg] || 0) + 1; }
    const repeatedTrigrams = Object.entries(trigramCounts)
        .filter(([tg, c]) => c >= 3 && !["of the the", "in the the", "the the the"].includes(tg))
        .sort((a, b) => b[1] - a[1]);
    const totalRepetitions = repeatedTrigrams.reduce((s, [_, c]) => s + c, 0);
    const repetition_score = {
        unique_trigrams: Object.keys(trigramCounts).length,
        repeated_trigrams: repeatedTrigrams.length,
        total_repetitions: totalRepetitions,
        worst_offenders: repeatedTrigrams.slice(0, 5).map(([tg, c]) => ({ phrase: tg, count: c })),
        repetition_ratio: trigrams.length > 0 ? Math.round(totalRepetitions / trigrams.length * 1000) / 1000 : 0,
    };
    if (repetition_score.repetition_ratio > 0.1) {
        red_flags.push(`excessive_repetition_ratio_${repetition_score.repetition_ratio}`);
    }

    // 9. CODE QUALITY ANALYSIS
    // Extract code blocks, check if they look real (Python syntax patterns)
    const codeBlocks = text.match(/```(?:python|py)?\s*\n([\s\S]*?)```/gi) || [];
    const code_quality = { blocks_found: codeBlocks.length, has_python: false, signals: [] };
    if (codeBlocks.length > 0) {
        for (const block of codeBlocks) {
            const code = block.replace(/```(?:python|py)?\s*\n?/i, "").replace(/```$/, "").trim();
            // Python indicators
            const hasDef = /\bdef\s+\w+\s*\(/.test(code);
            const hasImport = /\b(import|from)\s+\w+/.test(code);
            const hasClass = /\bclass\s+\w+/.test(code);
            const hasLoop = /\b(for|while)\s+.+:/.test(code);
            const hasCondition = /\bif\s+.+:/.test(code);
            const hasReturn = /\breturn\s+/.test(code);
            const hasVariables = /\w+\s*=\s*.+/.test(code);
            const hasPrint = /\bprint\s*\(/.test(code);
            const codeLines = code.split("\n").filter(l => l.trim().length > 0);
            const isPython = hasDef || hasImport || hasClass;
            if (isPython) code_quality.has_python = true;
            // Real code has: functions, imports, variables, logic flow
            const realIndicators = [hasDef, hasImport, hasLoop, hasCondition, hasReturn, hasVariables].filter(Boolean).length;
            // Pseudo/template code has: generic names, comments-only, single-line snippets
            const isPseudo = codeLines.length < 3 || (codeLines.length > 2 && codeLines.filter(l => l.trim().startsWith("#")).length > codeLines.length * 0.6);
            // Check for actual computation (not just print/pass/placeholder)
            const hasComputation = /[\+\-\*\/\%]|\.append|\.keys|len\(|range\(|np\.|pd\.|torch\.|tf\./.test(code);
            code_quality.signals.push({
                lines: codeLines.length,
                is_python: isPython,
                real_indicator_count: realIndicators,
                is_pseudo: isPseudo,
                has_computation: hasComputation,
                quality: realIndicators >= 4 && hasComputation ? "real" : realIndicators >= 2 ? "plausible" : "template",
            });
        }
    }
    const has_real_code = code_quality.signals.some(s => s.quality === "real");
    const has_pseudo_code = code_quality.signals.some(s => s.quality === "template");
    if (has_pseudo_code && !has_real_code && codeBlocks.length > 0) {
        red_flags.push("code_blocks_are_template_not_real");
    }

    // 10. MATH FORMULA QUALITY
    // Check if equations are well-formed and use defined variables
    // Support both LaTeX $...$ delimiters AND inline mathematical notation (O(n^2), |Q1 ∩ Q2| >= f+1, etc.)
    const latexBlocks = text.match(/\$[^$]{3,}\$/g) || [];
    const inlineEquations = text.match(/(?:O\([^)]+\)|[|]Q\d[^|]*[|]|\b\d*[a-z]\s*[+\-\*\/]\s*\d*[a-z]|\b[a-z]\s*[=<>≤≥]\s*\d+[a-z/+\-\*]*|\bn\s*[><=]\s*\d*f|\b2[fqn]\s*[+\-]\s*[1nf])/gi) || [];
    const mathBlocks = latexBlocks.length > 0 ? latexBlocks : inlineEquations.map(eq => `$${eq}$`);
    const math_quality = { formula_count: mathBlocks.length, signals: [] };
    if (mathBlocks.length > 0) {
        // Extract variable definitions from text (e.g., "where x is", "let n =", "denote by α")
        const definedVars = new Set();
        const varDefs = text.match(/(?:where|let|denote(?:\s+by)?|define)\s+([a-zA-Zα-ωΑ-Ω])\s/gi) || [];
        for (const vd of varDefs) {
            const m = vd.match(/([a-zA-Zα-ωΑ-Ω])\s*$/);
            if (m) definedVars.add(m[1].toLowerCase());
        }
        // Check each formula for basic validity
        for (const formula of mathBlocks.slice(0, 10)) {
            const inner = formula.replace(/^\$|\$$/g, "").trim();
            const hasOperators = /[+\-×÷=<>≤≥∑∏∫∂√]/.test(inner);
            const hasVariables = /[a-zA-Zα-ωΑ-Ω]/.test(inner);
            const isBalanced = (inner.match(/\(/g) || []).length === (inner.match(/\)/g) || []).length;
            const isTrivial = inner.length < 5; // "$x=1$" is trivial
            math_quality.signals.push({
                formula: inner.substring(0, 60),
                has_operators: hasOperators,
                has_variables: hasVariables,
                is_balanced: isBalanced,
                is_trivial: isTrivial,
                quality: hasOperators && hasVariables && isBalanced && !isTrivial ? "valid" : "suspect",
            });
        }
        math_quality.defined_variables = [...definedVars];
        math_quality.valid_count = math_quality.signals.filter(s => s.quality === "valid").length;
        math_quality.suspect_count = math_quality.signals.filter(s => s.quality === "suspect").length;
    }

    // 11. TABLE & FIGURE QUALITY
    // Check if tables have headers, consistent columns, and meaningful data
    const tableBlocks = text.match(/\|[^\n]+\|[ \t]*\n\|[-\s:|]+\|[ \t]*\n(\|[^\n]+\|[ \t]*\n?)+/g) || [];
    const table_quality = { count: tableBlocks.length, signals: [] };
    for (const table of tableBlocks.slice(0, 5)) {
        const rows = table.trim().split("\n").filter(r => r.includes("|"));
        const headerRow = rows[0] || "";
        const columns = headerRow.split("|").filter(c => c.trim().length > 0);
        const dataRows = rows.slice(2); // skip header + separator
        // Check consistency: do all rows have same column count?
        const colCounts = dataRows.map(r => r.split("|").filter(c => c.trim().length > 0).length);
        const isConsistent = colCounts.every(c => c === columns.length);
        // Check for actual data vs placeholder
        const hasNumbers = dataRows.some(r => /\d/.test(r));
        const isRepetitive = new Set(dataRows.map(r => r.trim())).size < dataRows.length * 0.5 && dataRows.length > 2;
        table_quality.signals.push({
            columns: columns.length,
            data_rows: dataRows.length,
            is_consistent: isConsistent,
            has_numbers: hasNumbers,
            is_repetitive: isRepetitive,
            quality: isConsistent && hasNumbers && !isRepetitive ? "good" : isRepetitive ? "padding" : "weak",
        });
    }
    const has_good_tables = table_quality.signals.some(s => s.quality === "good");
    const has_padding_tables = table_quality.signals.some(s => s.quality === "padding");
    if (has_padding_tables && !has_good_tables) {
        red_flags.push("tables_are_repetitive_padding");
    }

    // 12. LEAN4 VERIFICATION STATUS
    // Check if paper mentions Lean4 verification, proof hashes, or CAB certificates
    const lean4_signals = {
        mentions_lean4: /\blean\s*4?\b/i.test(text),
        has_proof_hash: /proof_hash|lean_certificate|cab_certificate/i.test(text),
        has_lean_code: /```lean[\s\S]*?```/i.test(text),
        // Fix #7: Only match claims specifically about Lean/formal verification,
        // NOT generic "verified" which appears in many contexts (e.g. "TIER-1 VERIFIED", "tools verified")
        has_verification_claim: /\b(formally\s+verified|lean\s*4?\s+verified|type-checked|proof\s+assistant\s+verified|machine-checked)\b/i.test(text),
    };
    lean4_signals.verification_level = lean4_signals.has_lean_code ? "code_present"
        : lean4_signals.has_proof_hash ? "hash_present"
        : lean4_signals.mentions_lean4 ? "mentioned_only"
        : "none";

    // 13. DECEPTION PATTERN DETECTION — the anti-benchmark layer
    // Run all deception detectors against the paper content.
    // These catch SOPHISTICATED fakes that avoid obvious red flags.
    const deception_matches = [];
    for (const pattern of DECEPTION_PATTERNS) {
        try {
            const result = pattern.test(text);
            if (result.match) {
                deception_matches.push({
                    id: pattern.id,
                    name: pattern.name,
                    severity: result.severity || "medium",
                    details: result,
                });
                // Add to red flags too (for penalty calculation)
                red_flags.push(`deception:${pattern.id}:${result.severity || "medium"}`);
            }
        } catch (_) {
            // Non-fatal — a broken detector should never crash scoring
        }
    }

    // 8. Depth signals
    const avg_section_words = sections_present.length > 0
        ? Math.round(words.length / sections_present.length)
        : 0;

    return {
        word_count: words.length,
        sections_present,
        sections_missing: MANDATORY.filter(s => !sections_present.includes(s)),
        has_equations,
        has_formal_proofs,
        has_code,
        has_tables,
        has_figures,
        has_statistical_tests,
        has_real_data,
        stat_patterns_count: stat_patterns.length,
        numerical_claims_count: number_count,
        unique_refs,
        has_dois,
        has_arxiv,
        has_real_authors: has_real_authors > 0,
        real_author_count: has_real_authors,
        has_year_citations,
        has_placeholder_refs,
        red_flags,
        red_flag_count: red_flags.length,
        extraordinary_claims,
        evidence_markers,
        avg_section_words,
        grammar_quality,
        repetition_score,
        code_quality,
        math_quality,
        table_quality,
        lean4_signals,
        has_real_code,
        has_good_tables,
        deception_matches,
        deception_count: deception_matches.length,
        depth_score: Math.min(10, Math.round(
            (sections_present.length / 7 * 2) +
            (has_equations ? 1 : 0) +
            (has_formal_proofs ? 1.5 : 0) +
            (has_real_code ? 1.5 : has_code ? 0.5 : 0) +
            (has_statistical_tests ? 1.5 : 0) +
            (Math.min(1, number_count / 5)) +
            (Math.min(1, unique_refs / 8)) +
            (has_dois ? 0.5 : 0) +
            (has_real_authors ? 0.5 : 0) +
            (lean4_signals.has_lean_code ? 1.5 : lean4_signals.has_proof_hash ? 0.5 : 0) +
            (has_good_tables ? 0.5 : 0) +
            (grammar_quality.is_monotone ? -1 : 0) +
            (grammar_quality.is_low_vocabulary ? -1 : 0)
        ) * 10) / 10,
    };
}

// ── Score Calibration Engine ───────────────────────────────────────────────

/**
 * Calibrate raw LLM scores by comparing paper signals against reference benchmarks.
 *
 * The key insight: a reference paper (e.g., Lamport's Byzantine Generals) scores 9-10
 * on methodology because it has FORMAL PROOFS and IMPOSSIBILITY RESULTS. If a submitted
 * paper scores 9 on methodology but has NO proofs and NO formal definitions, the score
 * must be deflated.
 *
 * Calibration factors:
 *   1. Red flag penalty — fabricated data, impossible values
 *   2. Evidence gap — claims vs. supporting evidence
 *   3. Reference quality gap — placeholder refs vs. real citations
 *   4. Structural completeness — missing sections
 *   5. Depth comparison — word count & detail vs. reference standard
 *   6. Rigor comparison — formal proofs, stats, code vs. reference
 */
function calibrateScores(rawScores, signals, fieldBenchmarks) {
    const calibrated = { ...rawScores };
    const adjustments = {};

    // 1. RED FLAG PENALTY — most severe, direct fraud indicators
    if (signals.red_flag_count > 0) {
        const penalty = Math.min(3, signals.red_flag_count * 1.0);
        for (const field of Object.keys(calibrated)) {
            if (typeof calibrated[field] === "number") {
                const oldVal = calibrated[field];
                calibrated[field] = Math.max(0, Math.round((calibrated[field] - penalty) * 10) / 10);
                if (calibrated[field] !== oldVal) {
                    adjustments[field] = adjustments[field] || [];
                    adjustments[field].push(`red_flag_penalty: -${penalty} (${signals.red_flags.join(", ")})`);
                }
            }
        }
    }

    // 2. PLACEHOLDER REFERENCE PENALTY
    if (signals.has_placeholder_refs) {
        calibrated.references = Math.min(calibrated.references || 0, 1);
        calibrated.citation_quality = Math.min(calibrated.citation_quality || 0, 1);
        adjustments.references = ["placeholder_refs_detected: capped at 1"];
        adjustments.citation_quality = ["placeholder_refs_detected: capped at 1"];
    }

    // 3. MISSING SECTION PENALTY — if section is missing, score MUST be 0
    for (const section of signals.sections_missing) {
        if (calibrated[section] !== undefined && calibrated[section] > 0) {
            adjustments[section] = adjustments[section] || [];
            adjustments[section].push(`section_missing: ${calibrated[section]} → 0`);
            calibrated[section] = 0;
        }
    }

    // 4. EVIDENCE GAP — high scores require evidence proportional to claims
    if (signals.extraordinary_claims > 2 && signals.evidence_markers < 3) {
        const gap_penalty = 2;
        calibrated.novelty = Math.max(0, Math.round(((calibrated.novelty || 0) - gap_penalty) * 10) / 10);
        calibrated.methodology = Math.max(0, Math.round(((calibrated.methodology || 0) - gap_penalty) * 10) / 10);
        adjustments.novelty = adjustments.novelty || [];
        adjustments.novelty.push(`evidence_gap: -${gap_penalty} (${signals.extraordinary_claims} claims, ${signals.evidence_markers} evidence markers)`);
        adjustments.methodology = adjustments.methodology || [];
        adjustments.methodology.push(`evidence_gap: -${gap_penalty}`);
    }

    // 5. REFERENCE QUALITY CHECK
    if (signals.unique_refs < 3 && (calibrated.references || 0) > 3) {
        calibrated.references = Math.min(calibrated.references, 3);
        adjustments.references = adjustments.references || [];
        adjustments.references.push(`only_${signals.unique_refs}_unique_refs: capped at 3`);
    }
    if (signals.unique_refs < 8 && (calibrated.citation_quality || 0) > 5) {
        calibrated.citation_quality = Math.min(calibrated.citation_quality, 5);
        adjustments.citation_quality = adjustments.citation_quality || [];
        adjustments.citation_quality.push(`${signals.unique_refs}_refs_below_8_threshold: capped at 5`);
    }
    if (!signals.has_real_authors && (calibrated.references || 0) > 4) {
        calibrated.references = Math.min(calibrated.references, 4);
        adjustments.references = adjustments.references || [];
        adjustments.references.push("no_real_author_names: capped at 4");
    }

    // 6. DEPTH CALIBRATION — compare against reference benchmark word counts
    if (fieldBenchmarks && fieldBenchmarks.references.length > 0) {
        const avgRefWords = fieldBenchmarks.references.reduce(
            (sum, r) => sum + (r.quality_fingerprint.typical_word_count || 5000), 0
        ) / fieldBenchmarks.references.length;

        // If paper is extremely short compared to references AND below minimum
        // threshold, apply a mild cap. The platform recommends 2500-3500 words,
        // so papers >= 1500 words should not be penalized for being shorter than
        // reference papers (which can be 8000-12000 words).
        const MIN_WORDS_FOR_DEPTH = 1500; // below this, content is truly insufficient
        if (signals.word_count < MIN_WORDS_FOR_DEPTH && signals.word_count < avgRefWords * 0.2) {
            const depth_cap = 5; // mild cap, not harsh
            for (const field of ["methodology", "results", "discussion"]) {
                if ((calibrated[field] || 0) > depth_cap) {
                    adjustments[field] = adjustments[field] || [];
                    adjustments[field].push(`word_count_${signals.word_count}_below_${MIN_WORDS_FOR_DEPTH}: capped at ${depth_cap}`);
                    calibrated[field] = depth_cap;
                }
            }
        }

        // Compare against reference rigor markers
        const refsWithProofs = fieldBenchmarks.references.filter(r => r.quality_fingerprint.has_formal_proofs);
        if (refsWithProofs.length > 0 && !signals.has_formal_proofs && !signals.has_equations) {
            // Field references have proofs but this paper doesn't — cap reproducibility
            if ((calibrated.reproducibility || 0) > 5) {
                calibrated.reproducibility = 5;
                adjustments.reproducibility = adjustments.reproducibility || [];
                adjustments.reproducibility.push("field_references_have_proofs_but_paper_lacks_formal_rigor: capped at 5");
            }
        }
    }

    // 7. NOVELTY REALITY CHECK — novelty is the most inflated dimension by LLMs
    // Novelty > 5 requires REAL evidence of original contribution
    if ((calibrated.novelty || 0) > 5) {
        const has_novelty_evidence = signals.has_formal_proofs || signals.has_code ||
            signals.numerical_claims_count > 3 || signals.has_statistical_tests;
        if (!has_novelty_evidence) {
            calibrated.novelty = Math.min(calibrated.novelty, 5);
            adjustments.novelty = adjustments.novelty || [];
            adjustments.novelty.push("novelty_above_5_without_evidence: capped at 5");
        }
    }
    // Novelty > 7 requires EXTRAORDINARY evidence (new algorithm, formal proof of new theorem, etc.)
    if ((calibrated.novelty || 0) > 7) {
        const has_extraordinary = signals.has_formal_proofs && signals.has_code && signals.numerical_claims_count > 5;
        if (!has_extraordinary) {
            calibrated.novelty = Math.min(calibrated.novelty, 7);
            adjustments.novelty = adjustments.novelty || [];
            adjustments.novelty.push("novelty_above_7_requires_formal_proofs+code+data: capped at 7");
        }
    }

    // 7b. RESULTS WITHOUT REAL DATA — synthetic/estimated/theoretical results cap
    if (!signals.has_statistical_tests && !signals.has_real_data) {
        // No p-values, confidence intervals, or real datasets
        if ((calibrated.results || 0) > 5) {
            calibrated.results = Math.min(calibrated.results, 5);
            adjustments.results = adjustments.results || [];
            adjustments.results.push("no_statistical_tests_or_real_data: results capped at 5");
        }
    }

    // 8. DECEPTION-SPECIFIC PENALTIES — targeted adjustments per deception type
    if (signals.deception_matches && signals.deception_matches.length > 0) {
        for (const deception of signals.deception_matches) {
            const sev = deception.severity;
            const penalty = sev === "critical" ? 3 : sev === "high" ? 2 : 1;

            switch (deception.id) {
                case "semantic-hollowness":
                    // Hollow papers: cap methodology, novelty, results
                    for (const f of ["methodology", "novelty", "results"]) {
                        const cap = Math.max(2, 6 - penalty);
                        if ((calibrated[f] || 0) > cap) {
                            adjustments[f] = adjustments[f] || [];
                            adjustments[f].push(`deception:semantic_hollowness(${sev}): capped at ${cap}`);
                            calibrated[f] = cap;
                        }
                    }
                    break;

                case "ghost-citations":
                    // Ghost refs: most references are decoration
                    calibrated.references = Math.min(calibrated.references || 0, 3);
                    calibrated.citation_quality = Math.min(calibrated.citation_quality || 0, 2);
                    adjustments.references = adjustments.references || [];
                    adjustments.references.push(`deception:ghost_citations(${deception.details.ghost_refs}/${deception.details.refs_defined} unused)`);
                    adjustments.citation_quality = adjustments.citation_quality || [];
                    adjustments.citation_quality.push(`deception:ghost_citations`);
                    break;

                case "results-without-method":
                    // Numbers without methodology = unverifiable
                    calibrated.methodology = Math.min(calibrated.methodology || 0, 3);
                    calibrated.reproducibility = Math.min(calibrated.reproducibility || 0, 2);
                    calibrated.results = Math.min(calibrated.results || 0, 3);
                    adjustments.methodology = adjustments.methodology || [];
                    adjustments.methodology.push(`deception:results_without_method(${deception.details.gap})`);
                    adjustments.reproducibility = adjustments.reproducibility || [];
                    adjustments.reproducibility.push(`deception:unverifiable_results`);
                    adjustments.results = adjustments.results || [];
                    adjustments.results.push(`deception:results_disconnected_from_methodology`);
                    break;

                case "cargo-cult-structure":
                    // Form without substance — universal penalty
                    for (const f of Object.keys(calibrated)) {
                        if (typeof calibrated[f] === "number" && calibrated[f] > 4) {
                            calibrated[f] = Math.max(2, calibrated[f] - penalty);
                            adjustments[f] = adjustments[f] || [];
                            adjustments[f].push(`deception:cargo_cult(repetition=${deception.details.repetition_ratio})`);
                        }
                    }
                    break;

                case "orphaned-equations":
                    // Decorative math
                    if ((calibrated.methodology || 0) > 5) {
                        calibrated.methodology = 5;
                        adjustments.methodology = adjustments.methodology || [];
                        adjustments.methodology.push(`deception:orphaned_equations(${deception.details.equations_count} equations, ${deception.details.equation_references} refs)`);
                    }
                    break;

                case "circular-reasoning":
                    // Conclusion = Introduction = no new knowledge
                    calibrated.conclusion = Math.min(calibrated.conclusion || 0, 2);
                    calibrated.discussion = Math.min(calibrated.discussion || 0, 3);
                    adjustments.conclusion = adjustments.conclusion || [];
                    adjustments.conclusion.push(`deception:circular_reasoning(similarity=${deception.details.intro_conclusion_similarity})`);
                    adjustments.discussion = adjustments.discussion || [];
                    adjustments.discussion.push(`deception:circular_reasoning`);
                    break;

                case "citation-format-mimicry":
                    // Fake references in real format
                    calibrated.references = Math.min(calibrated.references || 0, 2);
                    calibrated.citation_quality = Math.min(calibrated.citation_quality || 0, 1);
                    adjustments.references = adjustments.references || [];
                    adjustments.references.push(`deception:citation_mimicry(${deception.details.flags.join(", ")})`);
                    adjustments.citation_quality = adjustments.citation_quality || [];
                    adjustments.citation_quality.push(`deception:citation_mimicry`);
                    break;

                case "buzzword-inflation":
                    // Inflated language = inflated scores
                    calibrated.novelty = Math.min(calibrated.novelty || 0, 3);
                    calibrated.abstract = Math.min(calibrated.abstract || 0, 4);
                    adjustments.novelty = adjustments.novelty || [];
                    adjustments.novelty.push(`deception:buzzword_inflation(ratio=${deception.details.inflation_ratio})`);
                    adjustments.abstract = adjustments.abstract || [];
                    adjustments.abstract.push(`deception:buzzword_inflation`);
                    break;
            }
        }
    }

    // 9. WRITING QUALITY PENALTIES
    if (signals.grammar_quality) {
        if (signals.grammar_quality.is_monotone && (calibrated.abstract || 0) > 5) {
            calibrated.abstract = Math.min(calibrated.abstract, 5);
            adjustments.abstract = adjustments.abstract || [];
            adjustments.abstract.push("monotone_writing: sentence structure lacks variation, capped at 5");
        }
        if (signals.grammar_quality.is_low_vocabulary) {
            for (const f of ["abstract", "introduction", "discussion"]) {
                if ((calibrated[f] || 0) > 5) {
                    calibrated[f] = Math.min(calibrated[f], 5);
                    adjustments[f] = adjustments[f] || [];
                    adjustments[f].push(`low_vocabulary_diversity(TTR=${signals.grammar_quality.vocabulary_diversity_ttr}): capped at 5`);
                }
            }
        }
    }

    // 10. REPETITION PENALTIES
    if (signals.repetition_score && signals.repetition_score.repetition_ratio > 0.1) {
        const repPenalty = signals.repetition_score.repetition_ratio > 0.2 ? 2 : 1;
        for (const f of ["methodology", "discussion", "conclusion"]) {
            if ((calibrated[f] || 0) > 4) {
                calibrated[f] = Math.max(2, (calibrated[f] || 0) - repPenalty);
                adjustments[f] = adjustments[f] || [];
                adjustments[f].push(`excessive_repetition(ratio=${signals.repetition_score.repetition_ratio}): -${repPenalty}`);
            }
        }
    }

    // 11. CODE QUALITY PENALTIES/BONUSES
    if (signals.code_quality && signals.code_quality.blocks_found > 0) {
        if (signals.has_real_code) {
            // BONUS: real executable code boosts reproducibility
            if ((calibrated.reproducibility || 0) < 7) {
                const boost = Math.min(2, 7 - (calibrated.reproducibility || 0));
                calibrated.reproducibility = Math.min(8, (calibrated.reproducibility || 0) + boost);
                adjustments.reproducibility = adjustments.reproducibility || [];
                adjustments.reproducibility.push(`real_code_present: +${boost} reproducibility boost`);
            }
        } else if (signals.has_pseudo_code) {
            // Pseudo/template code pretending to be real
            if ((calibrated.reproducibility || 0) > 4) {
                calibrated.reproducibility = 4;
                adjustments.reproducibility = adjustments.reproducibility || [];
                adjustments.reproducibility.push("code_blocks_are_template_not_real: capped at 4");
            }
        }
    }

    // 12. LEAN4 VERIFICATION BONUSES
    if (signals.lean4_signals) {
        if (signals.lean4_signals.has_lean_code) {
            // Lean4 code present — significant reproducibility bonus
            if ((calibrated.reproducibility || 0) < 8) {
                calibrated.reproducibility = Math.min(9, (calibrated.reproducibility || 0) + 2);
                adjustments.reproducibility = adjustments.reproducibility || [];
                adjustments.reproducibility.push("lean4_code_present: +2 formal verification bonus");
            }
        }
        if (signals.lean4_signals.has_verification_claim && !signals.lean4_signals.has_proof_hash && !signals.lean4_signals.has_lean_code) {
            // Claims Lean4 verification but has no proof
            if ((calibrated.reproducibility || 0) > 4) {
                calibrated.reproducibility = 4;
                adjustments.reproducibility = adjustments.reproducibility || [];
                adjustments.reproducibility.push("claims_lean4_verification_without_proof_hash: capped at 4");
            }
        }
    }

    // 13. TABLE QUALITY PENALTIES
    if (signals.table_quality && signals.has_padding_tables && !signals.has_good_tables) {
        if ((calibrated.results || 0) > 4) {
            calibrated.results = 4;
            adjustments.results = adjustments.results || [];
            adjustments.results.push("tables_are_repetitive_padding_not_real_data: capped at 4");
        }
    }

    // 14. LLM INFLATION CORRECTION — systematic deflation to compensate for known LLM bias
    // LLMs consistently score 1.5-2 points too high across all dimensions.
    // Apply a compression that maps [0-10] toward a realistic [0-8] range for most papers.
    // Formula: score = score * 0.75 (compresses 8→6, 6→4.5, 4→3)
    // Then add back 0.5 to avoid crushing genuinely low scores too much.
    // Net effect: a raw 8 becomes 6.5, a raw 6 becomes 5, a raw 4 becomes 3.5
    const LLM_DEFLATION_FACTOR = 0.82;
    const LLM_DEFLATION_FLOOR = 0.5;
    for (const field of Object.keys(calibrated)) {
        if (typeof calibrated[field] === "number" && calibrated[field] > 0) {
            const before = calibrated[field];
            calibrated[field] = Math.round(Math.max(0, (before * LLM_DEFLATION_FACTOR) + LLM_DEFLATION_FLOOR) * 10) / 10;
            if (calibrated[field] !== before) {
                adjustments[field] = adjustments[field] || [];
                adjustments[field].push(`llm_inflation_correction: ${before} -> ${calibrated[field]}`);
            }
        }
    }

    // 15. OVERALL CONSISTENCY CHECK — no single dimension should be >3 above average of others
    const allVals = Object.values(calibrated).filter(v => typeof v === "number");
    if (allVals.length > 0) {
        const mean = allVals.reduce((a, b) => a + b, 0) / allVals.length;
        for (const [field, val] of Object.entries(calibrated)) {
            if (typeof val === "number" && val > mean + 3.5) {
                const capped = Math.round((mean + 3) * 10) / 10;
                adjustments[field] = adjustments[field] || [];
                adjustments[field].push(`outlier_${val}_vs_mean_${mean.toFixed(1)}: capped at ${capped}`);
                calibrated[field] = capped;
            }
        }
    }

    return { calibrated, adjustments };
}

// ── Calibration Report Generator ───────────────────────────────────────────

/**
 * Generate a detailed calibration report comparing a paper against reference standards.
 * This is what the examiner agent produces after traversing the calibration board.
 */
function generateCalibrationReport(content, rawScores) {
    const fieldResult = detectField(content);
    const signals = extractSignals(content);
    const benchmarks = REFERENCE_BENCHMARKS[fieldResult.field] || null;
    const { calibrated, adjustments } = calibrateScores(rawScores, signals, benchmarks);

    // Calculate overall from calibrated section scores
    const SECTIONS = ["abstract", "introduction", "methodology", "results", "discussion", "conclusion", "references"];
    const sectionValues = SECTIONS.map(s => calibrated[s] || 0);
    const overall = Math.round((sectionValues.reduce((a, b) => a + b, 0) / SECTIONS.length) * 10) / 10;

    // Grade assignment
    let grade;
    if (overall >= 9) grade = "A+ (Reference quality — comparable to landmark papers)";
    else if (overall >= 8) grade = "A (Publishable in top venue — strong evidence and methodology)";
    else if (overall >= 7) grade = "B+ (Solid work — publishable with minor revisions)";
    else if (overall >= 6) grade = "B (Decent work — needs significant improvements)";
    else if (overall >= 5) grade = "C (Below average — major gaps in methodology or evidence)";
    else if (overall >= 3) grade = "D (Poor — fabricated data, missing sections, or no real contribution)";
    else grade = "F (Unacceptable — placeholder content or fundamentally flawed)";

    return {
        detected_field: fieldResult,
        field_benchmarks: benchmarks ? {
            field: benchmarks.field,
            reference_count: benchmarks.references.length,
            reference_papers: benchmarks.references.map(r => ({
                title: r.title,
                authors: r.authors,
                year: r.year,
                venue: r.venue,
            })),
        } : null,
        signals,
        raw_scores: rawScores,
        calibrated_scores: calibrated,
        calibrated_overall: overall,
        grade,
        adjustments,
        adjustment_count: Object.keys(adjustments).length,
        red_flags: signals.red_flags,
        deception_matches: signals.deception_matches || [],
        deception_count: signals.deception_count || 0,
        calibration_applied: Object.keys(adjustments).length > 0,
    };
}

// ── Exports ────────────────────────────────────────────────────────────────

export {
    REFERENCE_BENCHMARKS,
    DECEPTION_PATTERNS,
    detectField,
    extractSignals,
    calibrateScores,
    generateCalibrationReport,
};
