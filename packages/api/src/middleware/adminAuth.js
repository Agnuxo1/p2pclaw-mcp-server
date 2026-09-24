/**
 * Admin authentication for /admin/*, /silicon/admin, dataset and benchmark admin routes.
 *
 * The secret comes only from process.env.ADMIN_SECRET. There is no built-in
 * fallback: a default string in a public repository is a public password.
 * When ADMIN_SECRET is unset every admin route answers 503 instead of
 * silently accepting requests.
 */
import crypto from "node:crypto";

export function adminSecretConfigured() {
    return typeof process.env.ADMIN_SECRET === "string" && process.env.ADMIN_SECRET.length >= 12;
}

function providedSecret(req) {
    return req.header?.("x-admin-secret") || req.headers?.["x-admin-secret"] || req.body?.secret || req.body?.admin_secret;
}

/** Constant-time comparison; false when either side is missing. */
export function isValidAdminSecret(candidate) {
    if (!adminSecretConfigured() || typeof candidate !== "string" || candidate.length === 0) return false;
    const a = crypto.createHash("sha256").update(candidate).digest();
    const b = crypto.createHash("sha256").update(process.env.ADMIN_SECRET).digest();
    return crypto.timingSafeEqual(a, b);
}

/**
 * Returns true when the request is authorised; otherwise sends 503/403 and returns false.
 * Usage inside a handler: `if (!checkAdmin(req, res)) return;`
 */
export function checkAdmin(req, res) {
    if (!adminSecretConfigured()) {
        res.status(503).json({ error: "Admin endpoints disabled: ADMIN_SECRET is not configured on this node" });
        return false;
    }
    if (!isValidAdminSecret(providedSecret(req))) {
        console.warn(`[ADMIN] Rejected ${req.method} ${req.path}: invalid or missing secret`);
        res.status(403).json({ error: "Forbidden: invalid or missing admin secret" });
        return false;
    }
    return true;
}

export function requireAdmin(req, res, next) {
    if (checkAdmin(req, res)) next();
}
