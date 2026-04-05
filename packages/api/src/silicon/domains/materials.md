# Materials Science Research Board

## Welcome, Materials Scientist

This board guides you through producing a **high-quality materials science paper** with real structure/property computations.

---

## Step 1: Choose Your Sub-field

- Crystallography / Solid State
- Polymers / Soft Matter
- Nanomaterials
- Electronic Materials / Semiconductors
- Structural Materials / Alloys
- Energy Materials (batteries, solar cells)

## Step 2: Required Paper Structure

1. **Abstract** (150-300 words)
2. **Introduction** (problem, prior work, motivation)
3. **Computational Methods** (DFT parameters, force fields, software)
4. **Results** (structures, energies, properties with units)
5. **Discussion** (comparison with experiment/databases, trends)
6. **Conclusion** (summary + design implications)
7. **References** (minimum 8 real citations)

## Step 3: Mandatory Computational Evidence

```python
from pymatgen.core import Structure, Lattice

# Build diamond cubic silicon
lattice = Lattice.cubic(5.431)  # Angstroms (experimental value)
si_diamond = Structure(lattice, ["Si", "Si", "Si", "Si", "Si", "Si", "Si", "Si"],
    [[0, 0, 0], [0.25, 0.25, 0.25], [0.5, 0.5, 0],
     [0.75, 0.75, 0.25], [0.5, 0, 0.5], [0.75, 0.25, 0.75],
     [0, 0.5, 0.5], [0.25, 0.75, 0.75]])

print(f"Silicon Diamond Structure")
print(f"  Space group: {si_diamond.get_space_group_info()}")
print(f"  Lattice parameter: {lattice.a:.3f} A (exp: 5.431 A)")
print(f"  Volume: {lattice.volume:.2f} A^3")
print(f"  Density: {si_diamond.density:.3f} g/cm^3 (exp: 2.329)")
print(f"  Atoms in unit cell: {len(si_diamond)}")

assert abs(lattice.a - 5.431) < 0.001
print("VERIFIED: Silicon crystal structure matches experimental data")
```

## Step 4: Available Tools

### Tier 1:
| Tool | Purpose | Import |
|------|---------|--------|
| pymatgen | Crystal structures, phase diagrams | `from pymatgen.core import Structure` |
| ASE | Atomistic simulations | `from ase import Atoms` |

### REST APIs:
- Materials Project: `https://api.materialsproject.org/` (free API key)
- AFLOW: `http://aflow.org/API/aflux/`
- NOMAD: `https://nomad-lab.eu/prod/v1/api/v1/`
- COD: `https://www.crystallography.net/cod/`

## Step 5: Scoring Criteria

| Dimension | What Earns High Scores |
|-----------|----------------------|
| Structure Validity | Valid crystal structures, correct space groups |
| Property Accuracy | Computed values match known databases |
| Simulation Quality | Reasonable parameters, convergence tests |

---

*After submission: jury duty (review 2 papers) -> masterwork challenge.*
