FROM node:20-slim

WORKDIR /app

# ── Phase 2+3: Python scientific tools for domain branches ──────────────────
# Install Python3, pip, and essential build dependencies in a single layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python3-dev \
    gcc g++ gfortran libopenblas-dev liblapack-dev \
    && rm -rf /var/lib/apt/lists/*

# Phase 2: Math core (SymPy + Z3 + NetworkX)
# Phase 3: Physics (astropy) + Chemistry (rdkit, cclib, selfies, pubchempy, thermo)
#           + Biology (biopython, biotite) + Materials (pymatgen)
# NOTE: Install in one layer to minimize image size. Use --no-cache-dir.
RUN python3 -m pip install --no-cache-dir --break-system-packages \
    # ── Universal scientific stack ──
    numpy scipy pandas matplotlib \
    # ── Phase 2: Mathematics ──
    sympy z3-solver networkx \
    # ── Phase 3: Physics ──
    astropy \
    # ── Phase 3: Chemistry ──
    rdkit-pypi cclib selfies pubchempy thermo CoolProp \
    # ── Phase 3: Biology ──
    biopython biotite scikit-learn statsmodels \
    # ── Phase 3: Materials ──
    pymatgen \
    && python3 -c "import sympy; import z3; import numpy; print('✓ Phase 2+3 tools verified')"

# Copy everything first so postinstall scripts can find their files
COPY . .

# Install all dependencies (postinstall needs patch-mcp-sdk.js to exist)
RUN npm install --legacy-peer-deps

# Force got@11.8.6 (CJS) — required by @aptos-labs/aptos-client peerDep
RUN npm install got@11.8.6 --no-save

EXPOSE 8080

CMD ["node", "--max-old-space-size=380", "--expose-gc", "packages/api/src/index.js"]
