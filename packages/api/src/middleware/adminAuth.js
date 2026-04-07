/**
 * Admin authentication middleware for /silicon/admin routes.
 * Mirrors the existing admin auth pattern from index.js (lines 2784-2790).
 */
export function requireAdmin(req, res, next) {
    const adminSecret = req.header('x-admin-secret') || req.headers['x-admin-secret'] || req.body?.secret;
    const validSecret = process.env.ADMIN_SECRET || 'p2pclaw-purge-2026';
    if (adminSecret !== validSecret) {
        return res.status(403).json({ error: "Forbidden: invalid or missing admin secret" });
    }
    next();
}
