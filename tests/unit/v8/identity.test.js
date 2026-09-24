import crypto from 'node:crypto';
import {
    didFromPublicKey,
    didDocument,
    issueCapability,
    verifyCapability,
    verifyEd25519Signature,
    createPowChallenge,
    verifyPow,
    solvePow,
    PowRegistry
} from '../../../packages/api/src/services/v8/identity.js';

function rawPublicKeyHex(publicKeyObj) {
    const jwk = publicKeyObj.export({ format: 'jwk' });
    return Buffer.from(jwk.x, 'base64url').toString('hex');
}

function generateIdentity() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pubHex = rawPublicKeyHex(publicKey);
    const did = didFromPublicKey(pubHex);
    return { publicKey, privateKey, pubHex, did };
}

describe('didFromPublicKey / didDocument', () => {
    test('produces a did:p2pclaw:<hex> address from hex input', () => {
        const { pubHex, did } = generateIdentity();
        expect(did).toBe(`did:p2pclaw:${pubHex.toLowerCase()}`);
    });

    test('base58 input normalizes to the same hex address', () => {
        const { pubHex } = generateIdentity();
        // minimal base58 round trip using the same alphabet as the module
        const buf = Buffer.from(pubHex, 'hex');
        // Encode manually with a known-good base58 encoder (bitcoin alphabet)
        const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        function encode(b) {
            let digits = [0];
            for (let i = 0; i < b.length; i++) {
                let carry = b[i];
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
            for (let i = 0; i < b.length && b[i] === 0; i++) leadingZeros++;
            let str = ALPHABET[0].repeat(leadingZeros);
            for (let i = digits.length - 1; i >= 0; i--) str += ALPHABET[digits[i]];
            return str;
        }
        const b58 = encode(buf);
        const did = didFromPublicKey(b58);
        expect(did).toBe(`did:p2pclaw:${pubHex.toLowerCase()}`);
    });

    test('didDocument has expected W3C shape', () => {
        const { did } = generateIdentity();
        const doc = didDocument(did);
        expect(doc.id).toBe(did);
        expect(doc.verificationMethod[0].id).toBe(`${did}#key-1`);
        expect(doc.verificationMethod[0].type).toBe('Ed25519VerificationKey2020');
        expect(doc.verificationMethod[0].controller).toBe(did);
        expect(doc.verificationMethod[0].publicKeyMultibase.startsWith('z')).toBe(true);
        expect(doc.authentication).toEqual([`${did}#key-1`]);
        expect(doc.assertionMethod).toEqual([`${did}#key-1`]);
    });
});

describe('verifyEd25519Signature', () => {
    test('verifies a valid signature (hex key/signature)', () => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
        const message = 'hello p2pclaw';
        const sig = crypto.sign(null, Buffer.from(message), privateKey);
        const pubHex = rawPublicKeyHex(publicKey);
        const ok = verifyEd25519Signature({ publicKey: pubHex, message, signature: sig.toString('hex') });
        expect(ok).toBe(true);
    });

    test('rejects a tampered message', () => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
        const sig = crypto.sign(null, Buffer.from('original'), privateKey);
        const pubHex = rawPublicKeyHex(publicKey);
        const ok = verifyEd25519Signature({ publicKey: pubHex, message: 'tampered', signature: sig.toString('hex') });
        expect(ok).toBe(false);
    });

    test('never throws on garbage input', () => {
        expect(verifyEd25519Signature({ publicKey: 'not-a-key', message: 'x', signature: 'also-not' })).toBe(false);
        expect(verifyEd25519Signature({ publicKey: null, message: null, signature: null })).toBe(false);
    });
});

describe('issueCapability / verifyCapability', () => {
    function resolver(identities) {
        return (did) => {
            const found = identities.find((i) => i.did === did);
            if (!found) return null;
            return found.pubHex;
        };
    }

    test('issues and verifies a valid capability', () => {
        const issuer = generateIdentity();
        const subject = generateIdentity();
        const token = issueCapability({
            issuerPrivateKey: issuer.privateKey,
            issuerDid: issuer.did,
            subjectDid: subject.did,
            scope: ['read', 'write'],
            expiresAt: Date.now() + 60000
        });
        const result = verifyCapability(token, resolver([issuer, subject]), Date.now());
        expect(result.valid).toBe(true);
        expect(result.claims.sub).toBe(subject.did);
    });

    test('rejects an expired capability', () => {
        const issuer = generateIdentity();
        const subject = generateIdentity();
        const token = issueCapability({
            issuerPrivateKey: issuer.privateKey,
            issuerDid: issuer.did,
            subjectDid: subject.did,
            scope: ['read'],
            expiresAt: Date.now() - 1000
        });
        const result = verifyCapability(token, resolver([issuer, subject]), Date.now());
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('expired');
    });

    test('rejects a tampered token', () => {
        const issuer = generateIdentity();
        const subject = generateIdentity();
        const token = issueCapability({
            issuerPrivateKey: issuer.privateKey,
            issuerDid: issuer.did,
            subjectDid: subject.did,
            scope: ['read'],
            expiresAt: Date.now() + 60000
        });
        const [payloadPart] = token.split('.');
        const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
        payload.scope = ['read', 'admin'];
        const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const tampered = `${tamperedPayload}.${token.split('.')[1]}`;
        const result = verifyCapability(tampered, resolver([issuer, subject]), Date.now());
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('invalid_signature');
    });

    test('validates a delegation chain and rejects scope escalation', () => {
        const root = generateIdentity();
        const delegate = generateIdentity();
        const subject = generateIdentity();

        const parentToken = issueCapability({
            issuerPrivateKey: root.privateKey,
            issuerDid: root.did,
            subjectDid: delegate.did,
            scope: ['read', 'write'],
            expiresAt: Date.now() + 100000
        });

        const validChildToken = issueCapability({
            issuerPrivateKey: delegate.privateKey,
            issuerDid: delegate.did,
            subjectDid: subject.did,
            scope: ['read'],
            expiresAt: Date.now() + 50000,
            parent: parentToken
        });

        const resolve = resolver([root, delegate, subject]);
        const validResult = verifyCapability(validChildToken, resolve, Date.now());
        expect(validResult.valid).toBe(true);

        const escalatedChildToken = issueCapability({
            issuerPrivateKey: delegate.privateKey,
            issuerDid: delegate.did,
            subjectDid: subject.did,
            scope: ['read', 'admin'], // not a subset of parent scope
            expiresAt: Date.now() + 50000,
            parent: parentToken
        });
        const escalatedResult = verifyCapability(escalatedChildToken, resolve, Date.now());
        expect(escalatedResult.valid).toBe(false);
        expect(escalatedResult.reason).toBe('scope_exceeds_parent');
    });

    test('rejects child expiry beyond parent expiry', () => {
        const root = generateIdentity();
        const delegate = generateIdentity();
        const subject = generateIdentity();

        const parentToken = issueCapability({
            issuerPrivateKey: root.privateKey,
            issuerDid: root.did,
            subjectDid: delegate.did,
            scope: ['read'],
            expiresAt: Date.now() + 10000
        });

        const childToken = issueCapability({
            issuerPrivateKey: delegate.privateKey,
            issuerDid: delegate.did,
            subjectDid: subject.did,
            scope: ['read'],
            expiresAt: Date.now() + 999999, // beyond parent
            parent: parentToken
        });

        const resolve = resolver([root, delegate, subject]);
        const result = verifyCapability(childToken, resolve, Date.now());
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('exp_exceeds_parent');
    });
});

describe('proof of work', () => {
    test('solvePow produces a nonce that verifyPow accepts', () => {
        const { challenge, difficulty } = createPowChallenge({ difficulty: 2 });
        const nonce = solvePow({ challenge, difficulty });
        expect(verifyPow({ challenge, nonce, difficulty })).toBe(true);
    });

    test('verifyPow rejects a wrong nonce', () => {
        const { challenge, difficulty } = createPowChallenge({ difficulty: 2 });
        expect(verifyPow({ challenge, nonce: '0', difficulty })).toBe(false);
    });

    test('PowRegistry issues, consumes once, and rejects replay', () => {
        const registry = new PowRegistry();
        const chal = registry.issue({ difficulty: 2 });
        const nonce = solvePow({ challenge: chal.challenge, difficulty: chal.difficulty });
        const first = registry.consume({ challenge: chal.challenge, nonce });
        expect(first.ok).toBe(true);
        const replay = registry.consume({ challenge: chal.challenge, nonce });
        expect(replay.ok).toBe(false);
        expect(replay.reason).toBe('already_used');
    });

    test('PowRegistry rejects expired challenges', () => {
        const registry = new PowRegistry();
        const now = Date.now();
        const chal = registry.issue({ difficulty: 2, ttlMs: 1000, now });
        const nonce = solvePow({ challenge: chal.challenge, difficulty: chal.difficulty });
        const result = registry.consume({ challenge: chal.challenge, nonce, now: now + 2000 });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('expired');
    });

    test('PowRegistry rejects unknown challenges', () => {
        const registry = new PowRegistry();
        const result = registry.consume({ challenge: 'deadbeef', nonce: '0' });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('unknown_challenge');
    });
});
