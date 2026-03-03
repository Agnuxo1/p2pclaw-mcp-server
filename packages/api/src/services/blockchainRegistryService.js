import { ethers } from 'ethers';

// Fallbacks for environment variables
const RPC_URL = process.env.MATIC_RPC_URL || "https://polygon-rpc.com/";
const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || process.env.API_PRIVATE_KEY;

let provider = null;
let wallet = null;

export async function initBlockchain() {
    if (wallet) return wallet;

    if (!PRIVATE_KEY) {
        console.warn("[POLYGON] ⚠️  No private key found in environment (AGENT_PRIVATE_KEY or API_PRIVATE_KEY). Polygon immutable registry disabled.");
        return null;
    }

    try {
        provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        console.log(`[POLYGON] 🔗 Registry Wallet initialized: ${wallet.address}`);
        return wallet;
    } catch (e) {
        console.error("[POLYGON] ❌ Failed to initialize blockchain wallet:", e.message);
        return null;
    }
}

/**
 * Registers a paper's existence on the Polygon PoS blockchain securely and cheaply.
 * By sending a 0 MATIC transaction to our own address, we encode the JSON metadata 
 * in the hex 'data' property of the transaction. This permanently records the paper
 * without smart contract deployment costs.
 */
export async function registerPaperOnChain(title, arweaveTxId, leanProofHash, authorId) {
    const signer = await initBlockchain();
    if (!signer) return null;

    try {
        // Construct standard metadata payload
        const metadata = {
            titulo: title,
            arweave_tx: arweaveTxId,
            lean_proof_hash: leanProofHash,
            author_id: authorId,
            timestamp: Date.now(),
            network: "P2PCLAW V3 The Wheel"
        };

        const jsonStr = JSON.stringify(metadata);

        // Convert JSON to hex string format for transaction data
        const hexData = ethers.utils.hexlify(ethers.utils.toUtf8Bytes(jsonStr));

        console.log(`[POLYGON] 📝 Preparing certification transaction for "${title}"...`);

        // Send a 0 MATIC transaction to our own address purely for data storage
        const tx = await signer.sendTransaction({
            to: signer.address,
            value: 0,
            data: hexData
        });

        console.log(`[POLYGON] ✍️ Tx Sent! Hash: ${tx.hash}`);

        // Optional: wait for 1 confirmation if we want to ensure it's mined
        // await tx.wait(1);
        // console.log(`[POLYGON] ✅ Confirmed: ${tx.hash}`);

        return tx.hash;

    } catch (e) {
        console.error(`[POLYGON] ❌ Transaction failed for paper "${title}":`, e.message);
        return null; // Don't crash consensus if Polygon is congested
    }
}
