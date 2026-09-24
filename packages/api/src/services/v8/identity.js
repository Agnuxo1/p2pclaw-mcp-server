/**
 * P2PCLAW v8 — DID identity, capability tokens, and proof-of-work
 * ====================================================================
 * Uses node:crypto only (Ed25519 via generateKeyPairSync/sign/verify).
 * No external dependencies — includes a minimal base58 (Bitcoin alphabet)
 * codec since none is otherwise available.
 */

import crypto from 'node:crypto';

// ── base58 (Bitcoin alphabet) ───────────────────────────────────────────────

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP = (() => {
    const m = {};
    for (let i = 0; i < B58_ALPHABET.length; i++) m[B58_ALPHABET[i]] = i;
    return m;
})();

function base58Encode(buf) {
    if (buf.length === 0) return '';
    let digits = [0];
    for (let i = 0; i < buf.length; i++) {
        let carry = buf[i];
        for (let j = 0; j < digits.length; j++) {
            carry += digits[j] << 8;
            digits[j] = carry % 58;
            carry = (carry / 58) | 0;
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = (carry / 58) | 0;
        }
    }
    let leadingZeros = 0;
    for (let i = 0; i < buf.length && buf[i] === 0; i++) leadingZeros++;
    let str = B58_ALPHABET[0].repeat(leadingZeros);
    for (let i = digits.length - 1; i >= 0; i--) str += B58_ALPHABET[digits[i]];
    return str;
}

function base58Decode(str) {
    if (str.length === 0) return Buffer.alloc(0);
    let bytes = [0];
    for (let i = 0; i < str.length; i++) {
        const c = str[i];
        const value = B58_MAP[c];
        if (value === undefined) throw new Error(`base58Decode: invalid character "${c}"`);
        let carry = value;
        for (let j = 0; j < bytes.length; j++) {
            carry += bytes[j] * 58;
            bytes[j] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    let leadingZeros = 0;
    for (let i = 0; i < str.length && str[i] === B58_ALPHABET[0]; i++) leadingZeros++;
    const out = Buffer.alloc(leadingZeros + bytes.length);
    for (let i = 0; i < bytes.length; i++) out[leadingZeros + bytes.length - 1 - i] = bytes[i];
    return out;
}

function isHexString(s) {
    return typeof s === 'string' && /^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0;
}

/**
 * normalizeToHex(pubKeyHexOrBase58) -> lowercase hex string of the raw key bytes.
 * Accepts 64-hex (32 bytes) or base58-encoded.
 */
function normalizeToHex(input) {
    if (typeof input !== 'string' || input.length === 0) {
        throw new Error('normalizeToHex: input must be a non-empty string');
    }
    if (isHexString(input)) {
        return input.toLowerCase();
    }
    // try base58
    const decoded = base58Decode(input);
    return decoded.toString('hex');
}

// ── DID ──────────────────────────────────────────────────────────────────

/**
 * didFromPublicKey(pubKeyHexOrBase58) -> 'did:p2pclaw:<hex-address>'
 */
export function didFromPublicKey(pubKeyHexOrBase58) {
    const hex = normalizeToHex(pubKeyHexOrBase58);
    return `did:p2pclaw:${hex}`;
}

function addressFromDid(did) {
    const prefix = 'did:p2pclaw:';
    if (typeof did !== 'string' || !did.startsWith(prefix)) {
        throw new Error(`addressFromDid: not a p2pclaw DID: ${did}`);
    }
    return did.slice(prefix.length);
}

// multicodec ed25519-pub = 0xed, varint-encoded as [0xed, 0x01]
const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01]);

/**
 * didDocument(did) -> W3C DID Core document.
 */
export function didDocument(did) {
    const address = addressFromDid(did);
    const rawKey = Buffer.from(address, 'hex');
    const multicodecKey = Buffer.concat([ED25519_MULTICODEC_PREFIX, rawKey]);
    const publicKeyMultibase = 'z' + base58Encode(multicodecKey);
    const keyId = `${did}#key-1`;

    return {
        '@context': ['https://www.w3.org/ns/did/v1'],
        id: did,
        verificationMethod: [
            {
                id: keyId,
                type: 'Ed25519VerificationKey2020',
                controller: did,
                publicKeyMultibase
            }
        ],
        authentication: [keyId],
        assertionMethod: [keyId]
    };
}

// ── key encoding helpers for sign/verify ────────────────────────────────────

function decodeKeyBytes(input) {
    // Accept hex, base58, or base64.
    if (Buffer.isBuffer(input)) return input;
    if (typeof input !== 'string') throw new Error('decodeKeyBytes: unsupported key type');
    if (isHexString(input)) return Buffer.from(input, 'hex');
    // try base64 (standard, possibly with padding)
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(input) && input.length % 4 === 0 && /[+/=]/.test(input)) {
        try {
            const b = Buffer.from(input, 'base64');
            if (b.length > 0) return b;
        } catch {
            /* fall through */
        }
    }
    // try base58
    try {
        const b = base58Decode(input);
        if (b.length > 0) return b;
    } catch {
        /* fall through */
    }
    // last resort: base64 without the strict regex above
    return Buffer.from(input, 'base64');
}

function rawEd25519PublicKeyToKeyObject(rawBytes) {
    // Ed25519 SPKI DER prefix for raw 32-byte public keys.
    const derPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const der = Buffer.concat([derPrefix, rawBytes]);
    return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
}

function rawEd25519PrivateKeyToKeyObject(rawBytes) {
    const derPrefix = Buffer.from('302e020100300506032b657004220420', 'hex');
    const der = Buffer.concat([derPrefix, rawBytes]);
    return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

function toKeyObject(input, kind) {
    if (input && typeof input === 'object' && typeof input.export === 'function') {
        return input; // already a KeyObject
    }
    const raw = decodeKeyBytes(input);
    return kind === 'public' ? rawEd25519PublicKeyToKeyObject(raw) : rawEd25519PrivateKeyToKeyObject(raw);
}

// ── base64url helpers ───────────────────────────────────────────────────────

function b64urlEncode(buf) {
    return Buffer.from(buf).toString('base64url');
}

function b64urlDecode(str) {
    return Buffer.from(str, 'base64url');
}

// ── Capability tokens ───────────────────────────────────────────────────────

/**
 * issueCapability({issuerPrivateKey, issuerDid, subjectDid, scope, expiresAt, parent})
 * -> compact token: base64url(JSON payload) + '.' + base64url(signature)
 */
export function issueCapability({ issuerPrivateKey, issuerDid, subjectDid, scope = [], expiresAt, parent = null }) {
    const payload = {
        iss: issuerDid,
        sub: subjectDid,
        scope,
        exp: expiresAt,
        parent: parent || null,
        iat: Date.now()
    };
    const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
    const privateKeyObj = toKeyObject(issuerPrivateKey, 'private');
    const signature = crypto.sign(null, payloadBuf, privateKeyObj);
    return `${b64urlEncode(payloadBuf)}.${b64urlEncode(signature)}`;
}

function decodeToken(token) {
    if (typeof token !== 'string' || !token.includes('.')) return null;
    const [payloadPart, sigPart] = token.split('.');
    try {
        const payloadBuf = b64urlDecode(payloadPart);
        const claims = JSON.parse(payloadBuf.toString('utf8'));
        const signature = b64urlDecode(sigPart);
        return { claims, payloadBuf, signature };
    } catch {
        return null;
    }
}

function isSubsetScope(childScope, parentScope) {
    if (!Array.isArray(childScope) || !Array.isArray(parentScope)) return false;
    return childScope.every((s) => parentScope.includes(s));
}

/**
 * verifyCapability(token, resolvePublicKey, now)
 * resolvePublicKey(did) -> public key (hex/base58/base64/KeyObject) for that issuer DID.
 * Validates signature, expiry, and delegation chain (parent token, if present).
 * Returns {valid, claims, reason}.
 */
export function verifyCapability(token, resolvePublicKey, now = Date.now()) {
    const decoded = decodeToken(token);
    if (!decoded) return { valid: false, claims: null, reason: 'malformed_token' };
    const { claims, payloadBuf, signature } = decoded;

    let publicKey;
    try {
        publicKey = resolvePublicKey(claims.iss);
    } catch {
        publicKey = null;
    }
    if (!publicKey) return { valid: false, claims, reason: 'unknown_issuer' };

    let sigValid = false;
    try {
        const publicKeyObj = toKeyObject(publicKey, 'public');
        sigValid = crypto.verify(null, payloadBuf, publicKeyObj, signature);
    } catch {
        sigValid = false;
    }
    if (!sigValid) return { valid: false, claims, reason: 'invalid_signature' };

    if (typeof claims.exp === 'number' && now > claims.exp) {
        return { valid: false, claims, reason: 'expired' };
    }

    if (claims.parent) {
        const parentResult = verifyCapability(claims.parent, resolvePublicKey, now);
        if (!parentResult.valid) {
            return { valid: false, claims, reason: `invalid_parent:${parentResult.reason}` };
        }
        if (!isSubsetScope(claims.scope, parentResult.claims.scope)) {
            return { valid: false, claims, reason: 'scope_exceeds_parent' };
        }
        if (typeof claims.exp === 'number' && typeof parentResult.claims.exp === 'number' && claims.exp > parentResult.claims.exp) {
            return { valid: false, claims, reason: 'exp_exceeds_parent' };
        }
    }

    return { valid: true, claims, reason: null };
}

// ── Ed25519 signature verification (generic) ────────────────────────────────

/**
 * verifyEd25519Signature({publicKey, message, signature}) -> boolean, never throws.
 * publicKey/signature accept hex, base58, or base64 encodings (or Buffer/KeyObject).
 * message accepts a string (utf8) or Buffer.
 */
export function verifyEd25519Signature({ publicKey, message, signature }) {
    try {
        const publicKeyObj = toKeyObject(publicKey, 'public');
        const messageBuf = Buffer.isBuffer(message) ? message : Buffer.from(String(message), 'utf8');
        const signatureBuf = Buffer.isBuffer(signature) ? signature : decodeKeyBytes(signature);
        return crypto.verify(null, messageBuf, publicKeyObj, signatureBuf);
    } catch {
        return false;
    }
}

// ── Proof of work ────────────────────────────────────────────────────────────

/**
 * createPowChallenge({difficulty, ttlMs, now}) -> {challenge, difficulty, expires_at}
 */
export function createPowChallenge({ difficulty = 4, ttlMs = 300000, now = Date.now() } = {}) {
    const challenge = crypto.randomBytes(16).toString('hex');
    return { challenge, difficulty, expires_at: now + ttlMs };
}

function powHash(challenge, nonce) {
    return crypto.createHash('sha256').update(`${challenge}:${nonce}`).digest('hex');
}

/**
 * verifyPow({challenge, nonce, difficulty}) -> boolean
 */
export function verifyPow({ challenge, nonce, difficulty }) {
    const hash = powHash(challenge, nonce);
    const zeros = '0'.repeat(difficulty);
    return hash.startsWith(zeros);
}

/**
 * solvePow({challenge, difficulty}, {maxIterations}) -> nonce (string) that solves the challenge.
 * Test helper — brute-force search.
 */
export function solvePow({ challenge, difficulty }, { maxIterations = 5_000_000 } = {}) {
    for (let nonce = 0; nonce < maxIterations; nonce++) {
        if (verifyPow({ challenge, nonce: String(nonce), difficulty })) {
            return String(nonce);
        }
    }
    throw new Error('solvePow: exceeded maxIterations without finding a solution');
}

/**
 * PowRegistry — issues and consumes PoW challenges once (replay protection + expiry).
 */
export class PowRegistry {
    constructor() {
        this.challenges = new Map(); // challenge -> {difficulty, expires_at, consumed}
    }

    issue({ difficulty = 4, ttlMs = 300000, now = Date.now() } = {}) {
        const chal = createPowChallenge({ difficulty, ttlMs, now });
        this.challenges.set(chal.challenge, { difficulty, expires_at: chal.expires_at, consumed: false });
        return chal;
    }

    consume({ challenge, nonce, now = Date.now() }) {
        const entry = this.challenges.get(challenge);
        if (!entry) return { ok: false, reason: 'unknown_challenge' };
        if (entry.consumed) return { ok: false, reason: 'already_used' };
        if (now > entry.expires_at) return { ok: false, reason: 'expired' };
        const solved = verifyPow({ challenge, nonce, difficulty: entry.difficulty });
        if (!solved) return { ok: false, reason: 'invalid_solution' };
        entry.consumed = true;
        return { ok: true, reason: null };
    }
}
