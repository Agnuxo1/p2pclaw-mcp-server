import express from 'express';
import crypto from 'node:crypto';
import nacl from 'tweetnacl';
import util from 'tweetnacl-util';

/**
 * P2PCLAW Core Engine — Ed25519 & PoW (Proof of Work)
 * ==================================================
 * IMMUTABLE CORE: Do not modify for frontend updates.
 *
 * This engine formally replaces Gun.js SEA with strict Ed25519 
 * high-speed cryptographic identity, alongside a SHA-256 Proof of Work 
 * verifier designed to resist Sybil attacks.
 */

const app = express();
app.use(express.json({ limit: '5mb' }));

// ── 1. Ed25519 Identity ──

app.post('/identity/generate', (req, res) => {
  const keyPair = nacl.sign.keyPair();
  res.json({
    publicKey: util.encodeBase64(keyPair.publicKey),
    secretKey: util.encodeBase64(keyPair.secretKey)
  });
});

app.post('/identity/sign', (req, res) => {
  const { message, secretKeyBase64 } = req.body;
  if (!message || !secretKeyBase64) return res.status(400).json({ error: 'Missing message or secretKey' });

  try {
    const messageUint8 = util.decodeUTF8(message);
    const secretKeyUint8 = util.decodeBase64(secretKeyBase64);
    const signature = nacl.sign.detached(messageUint8, secretKeyUint8);
    res.json({ signature: util.encodeBase64(signature) });
  } catch (err) {
    res.status(500).json({ error: 'Signing failed', details: err.message });
  }
});

app.post('/identity/verify', (req, res) => {
  const { message, signatureBase64, publicKeyBase64 } = req.body;
  
  if (!message || !signatureBase64 || !publicKeyBase64) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const messageUint8 = util.decodeUTF8(message);
    const signatureUint8 = util.decodeBase64(signatureBase64);
    const publicKeyUint8 = util.decodeBase64(publicKeyBase64);

    const isValid = nacl.sign.detached.verify(messageUint8, signatureUint8, publicKeyUint8);
    res.json({ verified: isValid });
  } catch (err) {
    res.json({ verified: false, error: err.message });
  }
});

// ── 2. SHA-256 Proof of Work (PoW) ──

app.post('/pow/solve', (req, res) => {
  const { challenge, difficulty = 4 } = req.body;
  if (!challenge) return res.status(400).json({ error: 'Missing challenge' });

  let nonce = 0;
  let hash = '';
  const target = '0'.repeat(difficulty);
  const startTime = Date.now();

  // Functional simulated CUDA solver (CPU bound for now)
  while (true) {
    hash = crypto.createHash('sha256').update(challenge + nonce).digest('hex');
    if (hash.startsWith(target)) break;
    nonce++;
    if (nonce > 10000000) return res.status(500).json({ error: 'Max iterations reached' });
  }

  res.json({
    challenge,
    nonce,
    hash,
    difficulty,
    elapsed_ms: Date.now() - startTime
  });
});

app.post('/pow/verify', (req, res) => {
  const { challenge, nonce, difficulty = 4 } = req.body;
  
  const hash = crypto.createHash('sha256').update(challenge + nonce).digest('hex');
  const target = '0'.repeat(difficulty);
  
  res.json({
    verified: hash.startsWith(target),
    hash,
    target
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'operational',
    service: 'p2pclaw-core-crypto-ed25519',
    engine: 'TweetNaCl + SHA256 PoW (Immutable)',
    uptime: process.uptime()
  });
});

const PORT = process.env.CORE_CRYPTO_PORT || 5002;
app.listen(PORT, () => {
  console.log(`[CORE:CRYPTO] Immutable Cryptography Engine listening on port ${PORT}`);
});
