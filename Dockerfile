FROM node:20-slim

WORKDIR /app

# Phase 2+3: Python scientific tools for domain branches
# Install Python3, pip, and essential build dependencies in a single layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python3-dev \
    gcc g++ gfortran libopenblas-dev liblapack-dev \
    && rm -rf /var/lib/apt/lists/*

# Install scientific Python packages.
# numpy<2 required for rdkit-pypi compatibility.
RUN python3 -m pip install --no-cache-dir --break-system-packages \
    "numpy<2" scipy pandas matplotlib \
    sympy z3-solver networkx \
    astropy \
    rdkit-pypi cclib selfies pubchempy thermo CoolProp \
    biopython biotite scikit-learn statsmodels \
    pymatgen \
    && python3 -c "import sympy; import z3; import numpy; print('Phase 2+3 tools verified')"

# Copy everything first so postinstall scripts can find their files
COPY . .

# Install all dependencies (postinstall needs patch-mcp-sdk.js to exist)
RUN npm install --legacy-peer-deps

# Force got@11.8.6 (CJS) — required by @aptos-labs/aptos-client peerDep
RUN npm install got@11.8.6 --no-save

EXPOSE 8080

CMD ["node", "--max-old-space-size=380", "--expose-gc", "packages/api/src/index.js"]
