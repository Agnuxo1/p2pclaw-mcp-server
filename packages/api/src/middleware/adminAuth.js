import { timingSafeEqual } from 'node:crypto';

function configuredSecret(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function matchesSecret(candidate, expected) {
    if (typeof candidate !== 'string' || candidate.length === 0) return false;
    const candidateBytes = Buffer.from(candidate, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');
    return candidateBytes.length === expectedBytes.length
        && timingSafeEqual(candidateBytes, expectedBytes);
}

function authorize(req, res, next, { evolution = false } = {}) {
    // Read configuration per request so legitimate runtime key rotation still works.
    // An absent secret must never compare equal to an absent request credential.
    const secrets = [process.env.ADMIN_SECRET];
    if (evolution) secrets.push(process.env.EVOLUTION_TOKEN);
    const configured = secrets.filter(configuredSecret);
    if (configured.length === 0) {
        return res.status(503).json({
            error: 'Administrative access is not configured',
            code: 'ADMIN_AUTH_UNAVAILABLE',
        });
    }

    // Preserve existing header and JSON-body clients. Header takes precedence;
    // an invalid header cannot fall through to another supplied credential.
    const candidate = req.headers?.['x-admin-secret']
        ?? req.body?.secret
        ?? req.body?.admin_secret
        ?? (evolution ? req.body?.adminToken : undefined);
    if (!configured.some(secret => matchesSecret(candidate, secret))) {
        return res.status(403).json({ error: 'Forbidden: invalid or missing admin secret' });
    }
    return next();
}

/** Shared fail-closed authentication for administrative API routes. */
export function requireAdmin(req, res, next) {
    return authorize(req, res, next);
}

/** Preserve the dedicated evolution token only on the evolution endpoint. */
export function requireEvolutionAdmin(req, res, next) {
    return authorize(req, res, next, { evolution: true });
}

/** Keep old links safe while explaining the authenticated replacement. */
export function rejectUnsafeAdminGet(_req, res) {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use authenticated POST for this administrative operation' });
}
