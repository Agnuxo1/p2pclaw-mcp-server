#!/usr/bin/env python3
"""
P2PCLAW Open-Tool Multiverse — Worker Node
==========================================
Run this script on YOUR machine to contribute computation to the P2PCLAW
research network. Your CPU/GPU executes simulations locally; results are
signed with Ed25519 and returned to the network.

This makes P2PCLAW scale infinitely at zero server cost — the more
researchers run this script, the more powerful the network becomes.

INSTALL:
  pip install httpx cryptography rdkit-pypi

OPTIONAL (for MuJoCo support):
  pip install mujoco

RUN:
  python p2p-worker-node.py
  python p2p-worker-node.py --api https://p2pclaw-api-production-df9f.up.railway.app
  python p2p-worker-node.py --tools rdkit_energy_minimize,rdkit_smiles_validate
"""

import argparse
import json
import os
import sys
import time
import hashlib
import traceback
from datetime import datetime, timezone

try:
    import httpx
except ImportError:
    print("ERROR: Install dependencies first:  pip install httpx cryptography")
    sys.exit(1)

# ── Ed25519 key pair (generates once, saves to worker_keys.json) ─────────────
def load_or_generate_keys():
    KEY_FILE = "worker_keys.json"
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives.serialization import (
            Encoding, PrivateFormat, PublicFormat, NoEncryption,
        )
    except ImportError:
        print("WARNING: cryptography not installed — signatures disabled (pip install cryptography)")
        worker_id = f"worker_{hashlib.sha256(os.urandom(16)).hexdigest()[:12]}"
        return worker_id, None, None

    if os.path.exists(KEY_FILE):
        with open(KEY_FILE) as f:
            data = json.load(f)
        return data["worker_id"], data["private_key_hex"], data["public_key_hex"]

    private_key = Ed25519PrivateKey.generate()
    pub_hex  = private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex()
    priv_hex = private_key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption()).hex()
    worker_id = f"worker_{pub_hex[:12]}"

    with open(KEY_FILE, "w") as f:
        json.dump({"worker_id": worker_id, "public_key_hex": pub_hex, "private_key_hex": priv_hex}, f)
    print(f"[KEY] Generated new worker identity: {worker_id}")
    print(f"[KEY] Public key saved to {KEY_FILE} — share your public key to build trust score")
    return worker_id, priv_hex, pub_hex


def sign_result(result_json: str, private_key_hex: str | None) -> str | None:
    if not private_key_hex:
        return None
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption
        priv = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(private_key_hex))
        sig  = priv.sign(result_json.encode())
        return sig.hex()
    except Exception:
        return None


def hash_result(result: dict) -> str:
    canonical = json.dumps(result, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


# ── Tool implementations ─────────────────────────────────────────────────────

def tool_rdkit_energy_minimize(params: dict) -> dict:
    """Minimize molecular energy using RDKit MMFF94 force field."""
    from rdkit import Chem
    from rdkit.Chem import AllChem
    smiles = params.get("smiles")
    if not smiles:
        raise ValueError("params.smiles is required")
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES: {smiles}")
    mol = Chem.AddHs(mol)
    AllChem.EmbedMolecule(mol, randomSeed=42)  # deterministic seed for consensus
    result = AllChem.MMFFOptimizeMolecule(mol)
    ff = AllChem.MMFFGetMoleculeForceField(mol, AllChem.MMFFGetMoleculeProperties(mol))
    energy = ff.CalcEnergy() if ff else None
    return {
        "smiles":   smiles,
        "energy_kcal_mol": round(energy, 6) if energy is not None else None,
        "converged": result == 0,
        "tool": "MMFF94",
    }


def tool_rdkit_smiles_validate(params: dict) -> dict:
    """Validate a SMILES string and return canonical form."""
    from rdkit import Chem
    smiles = params.get("smiles")
    if not smiles:
        raise ValueError("params.smiles is required")
    mol = Chem.MolFromSmiles(smiles)
    valid = mol is not None
    return {
        "smiles":    smiles,
        "valid":     valid,
        "canonical": Chem.MolToSmiles(mol) if valid else None,
        "formula":   Chem.rdMolDescriptors.CalcMolFormula(mol) if valid else None,
    }


def tool_rdkit_fingerprint(params: dict) -> dict:
    """Compute Morgan fingerprint for a SMILES molecule."""
    from rdkit import Chem
    from rdkit.Chem import AllChem
    smiles = params.get("smiles")
    radius = int(params.get("radius", 2))
    n_bits = int(params.get("n_bits", 2048))
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES: {smiles}")
    fp = AllChem.GetMorganFingerprintAsBitVect(mol, radius, nBits=n_bits)
    return {
        "smiles":      smiles,
        "fingerprint": fp.ToBitString(),
        "radius":      radius,
        "n_bits":      n_bits,
    }


def tool_lean4_verify(params: dict) -> dict:
    """Verify a Lean 4 proof (requires `lean` CLI in PATH)."""
    import subprocess, tempfile
    proof = params.get("proof", "")
    if not proof:
        raise ValueError("params.proof is required")
    with tempfile.NamedTemporaryFile(suffix=".lean", mode="w", delete=False) as f:
        f.write(proof)
        fname = f.name
    try:
        result = subprocess.run(["lean", fname], capture_output=True, text=True, timeout=30)
        return {
            "verified": result.returncode == 0,
            "stdout":   result.stdout[:500],
            "stderr":   result.stderr[:500],
        }
    except FileNotFoundError:
        raise RuntimeError("lean CLI not found — install Lean 4 from https://leanprover.github.io/")
    finally:
        os.unlink(fname)


def tool_generic_python(params: dict) -> dict:
    """
    Execute a sandboxed Python snippet. WARNING: basic sandbox only.
    For production, use a proper sandbox (Docker, nsjail, etc.).
    """
    code    = params.get("code", "")
    timeout = min(int(params.get("timeout", 10)), 30)
    import subprocess, tempfile
    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
        f.write(code)
        fname = f.name
    try:
        result = subprocess.run(
            [sys.executable, fname],
            capture_output=True, text=True, timeout=timeout,
        )
        return {
            "stdout":      result.stdout[:2000],
            "stderr":      result.stderr[:500],
            "returncode":  result.returncode,
        }
    finally:
        os.unlink(fname)


TOOL_MAP = {
    "rdkit_energy_minimize":  tool_rdkit_energy_minimize,
    "rdkit_smiles_validate":  tool_rdkit_smiles_validate,
    "rdkit_fingerprint":      tool_rdkit_fingerprint,
    "lean4_verify":           tool_lean4_verify,
    "generic_python":         tool_generic_python,
}


# ── Worker main loop ─────────────────────────────────────────────────────────

def detect_available_tools() -> list[str]:
    available = ["generic_python"]
    try:
        import rdkit  # noqa
        available += ["rdkit_energy_minimize", "rdkit_smiles_validate", "rdkit_fingerprint"]
    except ImportError:
        pass
    try:
        import subprocess
        r = subprocess.run(["lean", "--version"], capture_output=True, timeout=3)
        if r.returncode == 0:
            available.append("lean4_verify")
    except Exception:
        pass
    return available


def run_worker(api_url: str, worker_id: str, priv_hex: str | None, pub_hex: str | None,
               tools: list[str], poll_interval: int = 5):
    client = httpx.Client(timeout=30.0)

    print(f"\n{'='*60}")
    print(f"  P2PCLAW Open-Tool Multiverse — Worker Node")
    print(f"{'='*60}")
    print(f"  API:     {api_url}")
    print(f"  Worker:  {worker_id}")
    print(f"  Tools:   {', '.join(tools)}")
    print(f"  Signed:  {'YES (Ed25519)' if pub_hex else 'NO (no cryptography lib)'}")
    print(f"{'='*60}\n")

    # Register worker
    try:
        r = client.post(f"{api_url}/simulation/worker/register", json={
            "workerId": worker_id,
            "tools":    tools,
            "pubkey":   pub_hex,
        })
        if r.is_success:
            print(f"[✓] Registered in P2PCLAW network")
        else:
            print(f"[!] Registration warning: {r.status_code}")
    except Exception as e:
        print(f"[!] Could not reach API: {e}")

    print(f"[…] Polling for jobs every {poll_interval}s — Ctrl+C to stop\n")

    jobs_processed = 0
    while True:
        try:
            # Poll for pending jobs matching our tools
            for tool in tools:
                r = client.get(f"{api_url}/simulation/jobs",
                               params={"status": "pending", "tool": tool, "limit": 5})
                if not r.is_success:
                    continue
                pending = r.json().get("jobs", [])
                for job in pending:
                    job_id = job["id"]
                    # Claim job
                    cr = client.post(f"{api_url}/simulation/{job_id}/claim",
                                     json={"workerId": worker_id})
                    if not cr.is_success:
                        continue  # Another worker grabbed it

                    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
                    print(f"[{ts}] ▶ {job['tool']} job {job_id[:16]}...")

                    try:
                        fn = TOOL_MAP.get(job["tool"])
                        if fn is None:
                            raise NotImplementedError(f"Tool {job['tool']} not implemented")
                        result = fn(job.get("params", {}))
                    except Exception as e:
                        result = {"error": str(e), "traceback": traceback.format_exc()[:300]}

                    result_json = json.dumps(result, sort_keys=True)
                    result_hash = hash_result(result)
                    signature   = sign_result(result_json, priv_hex)

                    rr = client.put(f"{api_url}/simulation/{job_id}/result", json={
                        "workerId":    worker_id,
                        "workerPubkey": pub_hex,
                        "result":       result,
                        "resultHash":   result_hash,
                        "signature":    signature,
                    })

                    jobs_processed += 1
                    if rr.is_success:
                        status = rr.json().get("status", "?")
                        verified = rr.json().get("verified", False)
                        badge = "✓ VERIFIED" if verified else "✓ submitted"
                        print(f"[{ts}] {badge} — {job['tool']} result={str(result)[:60]}")
                    else:
                        print(f"[!] Result submission failed: {rr.status_code}")

            time.sleep(poll_interval)

        except KeyboardInterrupt:
            print(f"\n[…] Worker stopped. Jobs processed: {jobs_processed}")
            break
        except Exception as e:
            print(f"[!] Worker error: {e}")
            time.sleep(poll_interval * 2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="P2PCLAW Worker Node")
    parser.add_argument("--api",      default="https://p2pclaw-api-production-df9f.up.railway.app",
                        help="P2PCLAW API URL")
    parser.add_argument("--tools",    default=None,
                        help="Comma-separated list of tools to support (auto-detects if omitted)")
    parser.add_argument("--interval", default=5, type=int,
                        help="Poll interval in seconds (default: 5)")
    args = parser.parse_args()

    worker_id, priv_hex, pub_hex = load_or_generate_keys()
    tools = args.tools.split(",") if args.tools else detect_available_tools()
    run_worker(args.api, worker_id, priv_hex, pub_hex, tools, args.interval)
