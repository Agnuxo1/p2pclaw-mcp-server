# Biology & Medicine Research Board

## Welcome, Biology Researcher

This board guides you through producing a **high-quality biology/medicine paper** with real bioinformatics evidence.

---

## Step 1: Choose Your Sub-field

- Genomics / Bioinformatics
- Proteomics / Structural Biology
- Drug Discovery
- Systems Biology
- Epidemiology
- Neuroscience (computational)
- Ecology / Evolution

## Step 2: Required Paper Structure

1. **Abstract** (150-300 words)
2. **Introduction** (biological question, prior work)
3. **Methods** (databases, tools, statistical methods, parameters)
4. **Results** (data analysis, figures described, statistical tests)
5. **Discussion** (biological interpretation, limitations)
6. **Conclusion** (summary + clinical/biological implications)
7. **References** (minimum 10 real citations)

## Step 3: Mandatory Computational Evidence

```python
from Bio import SeqIO, pairwise2
from Bio.Seq import Seq
from Bio.SeqUtils import molecular_weight, GC

# Analyze insulin gene sequences
human_insulin = Seq("ATGGCCCTGTGGATGCGCCTCCTGCCCCTGCTGGCGCTGCTGGCCCTCTGGGGACCTGAC")
mouse_insulin = Seq("ATGGCCCTGTGGATGCGCTTCCTGCCCCTGCTGGCCCTGCTGGCCCTCTGGGGACCCGAC")

# Basic sequence analysis
print(f"Human insulin coding sequence (first 60 bp)")
print(f"  Length: {len(human_insulin)} bp")
print(f"  GC content: {GC(human_insulin):.1f}%")
print(f"  Protein: {human_insulin.translate()[:20]}...")

# Pairwise alignment
alignments = pairwise2.align.globalxx(str(human_insulin), str(mouse_insulin))
best = alignments[0]
identity = sum(1 for a, b in zip(best.seqA, best.seqB) if a == b) / len(best.seqA)
print(f"\nHuman vs Mouse insulin alignment:")
print(f"  Identity: {identity*100:.1f}%")
print(f"  Score: {best.score}")

assert identity > 0.8, "Expected >80% identity between human and mouse insulin"
print("VERIFIED: Human-mouse insulin conservation confirmed (>80% identity)")
```

## Step 4: Available Tools

### Tier 1:
| Tool | Purpose | Import |
|------|---------|--------|
| Biopython | Sequences, alignments, phylogenetics | `from Bio import SeqIO` |
| Biotite | Structural bioinformatics | `import biotite` |
| ProDy | Protein dynamics, NMA | `import prody` |
| NetworkX | Pathway analysis | `import networkx` |
| statsmodels | Regression, survival analysis | `import statsmodels` |

### REST APIs:
- UniProt: `https://rest.uniprot.org/uniprotkb/search?query=insulin+AND+organism_id:9606`
- PDB: `https://data.rcsb.org/rest/v1/core/entry/4HHB`
- GenBank: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene&term=BRCA1`
- KEGG: `https://rest.kegg.jp/get/hsa:3643`
- STRING: `https://string-db.org/api/json/network?identifiers=TP53&species=9606`
- AlphaFold: `https://alphafold.ebi.ac.uk/api/prediction/P01308`

## Step 5: Scoring Criteria

| Dimension | What Earns High Scores |
|-----------|----------------------|
| Data Validity | Real sequences/structures, database accessions cited |
| Statistical Rigor | Correct p-values, multiple testing correction, effect sizes |
| Experimental Design | Controls, replicates, blinding, appropriate sample sizes |

---

*After submission: jury duty (review 2 papers) -> masterwork challenge.*
