/**
 * P2PCLAW Blockchain Registry Service
 * =====================================
 * Anchors research paper hashes to multiple EVM blockchains for
 * permanent, immutable, trustless proof-of-existence.
 *
 * Storage method: 0-value transactions with JSON metadata in the data field.
 * No smart contract needed — the transaction hash IS the proof.
 *
 * Supported chains (in priority order):
 *   1. Polygon PoS mainnet   — MATIC_RPC_URL   + AGENT_PRIVATE_KEY  (cheapest, ~$0.001)
 *   2. Ethereum Sepolia      — ETH_SEPOLIA_RPC + AGENT_PRIVATE_KEY  (free testnet)
 *   3. Base L2 mainnet       — BASE_RPC_URL    + AGENT_PRIVATE_KEY  (Ethereum L2, ~$0.001)
 *
 * Environment variables:
 *   AGENT_PRIVATE_KEY or API_PRIVATE_KEY — EVM wallet private key (same for all chains)
 *   MATIC_RPC_URL    — Polygon RPC  (default: https://polygon-rpc.com/)
 *   ETH_SEPOLIA_RPC  — Sepolia RPC  (default: https://rpc.sepolia.org)
 *   BASE_RPC_URL     — Base L2 RPC  (default: https://mainnet.base.org)
 */
import { ethers } from 'ethers';
import crypto from 'crypto';

const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || process.env.API_PRIVATE_KEY;

const CHAINS = [
    {
        id:   'polygon',
        name: 'Polygon PoS',
        rpc:  process.env.MATIC_RPC_URL    || 'https://polygon-rpc.com/',
        enabled: !!PRIVATE_KEY,
    },
    {
        id:   'sepolia',
        name: 'Ethereum Sepolia',
        rpc:  process.env.ETH_SEPOLIA_RPC  || 'https://rpc.sepolia.org',
        enabled: !!PRIVATE_KEY,
    },
    {
        id:   'base',
        name: 'Base L2',
        rpc:  process.env.BASE_RPC_URL     || 'https://mainnet.base.org',
        enabled: !!PRIVATE_KEY,
    },
];

// Wallet cache per chain
const _wallets = {};

async function getWallet(chain) {
    if (_wallets[chain.id]) return _wallets[chain.id];
    if (!PRIVATE_KEY) return null;
    try {
        const provider = new ethers.providers.JsonRpcProvider(chain.rpc);
        const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
        _wallets[chain.id] = wallet;
        return wallet;
    } catch (e) {
        console.error(`[BLOCKCHAIN] ❌ ${chain.name} wallet init failed: ${e.message}`);
        return null;
    }
}

/**
 * Compute a SHA-256 content hash for a paper (deterministic, chain-agnostic).
 */
function contentHash(title, content, paperId) {
    return crypto.createHash('sha256')
        .update(`${paperId}:${title}:${content}`)
        .digest('hex');
}

/**
 * Anchor a paper to a single chain. Returns tx hash or null on failure.
 */
async function anchorToChain(chain, paperId, title, content, ipfsCid, authorId) {
    const wallet = await getWallet(chain);
    if (!wallet) return null;

    const hash = contentHash(title, content, paperId);
    const metadata = {
        v:          2,
        network:    'P2PCLAW',
        paper_id:   paperId,
        title:      title.slice(0, 120),
        sha256:     hash,
        ipfs:       ipfsCid || null,
        author:     authorId,
        ts:         Date.now(),
    };

    const hexData = ethers.utils.hexlify(
        ethers.utils.toUtf8Bytes(JSON.stringify(metadata))
    );

    try {
        const tx = await wallet.sendTransaction({
            to:    wallet.address,
            value: 0,
            data:  hexData,
        });
        console.log(`[BLOCKCHAIN] ✅ ${chain.name} — paper ${paperId} → tx ${tx.hash}`);
        return tx.hash;
    } catch (e) {
        // Log warning but do not throw — blockchain failure must never block paper publishing
        console.warn(`[BLOCKCHAIN] ⚠️  ${chain.name} tx failed for ${paperId}: ${e.message}`);
        return null;
    }
}

/**
 * Register a paper on all configured chains (fire-and-forget, non-blocking).
 *
 * @param {string}  paperId   — Internal paper ID
 * @param {string}  title     — Paper title
 * @param {string}  content   — Full paper content (used for hash)
 * @param {string}  ipfsCid   — IPFS CID (optional)
 * @param {string}  authorId  — Agent ID of the author
 * @returns {Object}  { polygon, sepolia, base, sha256 } — tx hashes per chain (null if skipped)
 */
export async function registerPaperOnChain(paperId, title, content, ipfsCid, authorId) {
    if (!PRIVATE_KEY) {
        console.log('[BLOCKCHAIN] ℹ️  No wallet key set (AGENT_PRIVATE_KEY). Blockchain anchoring disabled.');
        return null;
    }

    const hash = contentHash(title, content || '', paperId);
    console.log(`[BLOCKCHAIN] 📝 Anchoring paper ${paperId} (sha256=${hash.slice(0, 16)}…)`);

    // Run all chains in parallel; failures are isolated
    const results = await Promise.allSettled(
        CHAINS.filter(c => c.enabled).map(chain =>
            anchorToChain(chain, paperId, title, content, ipfsCid, authorId)
        )
    );

    const txMap = {};
    CHAINS.filter(c => c.enabled).forEach((chain, i) => {
        txMap[chain.id] = results[i].status === 'fulfilled' ? results[i].value : null;
    });

    const successCount = Object.values(txMap).filter(Boolean).length;
    console.log(`[BLOCKCHAIN] ${successCount}/${CHAINS.filter(c=>c.enabled).length} chains anchored. sha256=${hash}`);

    return { ...txMap, sha256: hash };
}

/**
 * Backwards-compatible alias (old signature: title, arweaveTxId, leanProofHash, authorId)
 * Used by consensusService.js's existing call site.
 */
export async function registerPaperOnChainLegacy(title, arweaveTxId, leanProofHash, authorId) {
    // Old call site doesn't have paperId/content — stub with available data
    const paperId = `legacy-${Date.now()}`;
    return registerPaperOnChain(paperId, title, leanProofHash || '', arweaveTxId, authorId);
}

// Init log
if (PRIVATE_KEY) {
    console.log('[BLOCKCHAIN] 🔗 Wallet key found — multi-chain anchoring enabled (Polygon + Sepolia + Base)');
    // Log wallet address once
    const provider = new ethers.providers.JsonRpcProvider(CHAINS[0].rpc);
    const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
    console.log(`[BLOCKCHAIN] 🔑 Wallet address: ${wallet.address}`);
    _wallets['polygon'] = wallet;
} else {
    console.log('[BLOCKCHAIN] ℹ️  Set AGENT_PRIVATE_KEY on Railway to enable multi-chain paper anchoring.');
}
