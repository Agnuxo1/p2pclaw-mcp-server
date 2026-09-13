import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { requireAdmin, requireEvolutionAdmin, rejectUnsafeAdminGet } from '../../packages/api/src/middleware/adminAuth.js';

const originalAdminSecret = process.env.ADMIN_SECRET;
const originalEvolutionToken = process.env.EVOLUTION_TOKEN;
const adminSecret = 'local-unit-test-administrator';
const evolutionToken = 'local-unit-test-evolution';

function response() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
    };
}

function attempt(middleware, request = {}) {
    const res = response();
    const next = jest.fn();
    middleware(request, res, next);
    return { res, next };
}

beforeEach(() => {
    delete process.env.ADMIN_SECRET;
    delete process.env.EVOLUTION_TOKEN;
});

afterAll(() => {
    if (originalAdminSecret === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = originalAdminSecret;
    if (originalEvolutionToken === undefined) delete process.env.EVOLUTION_TOKEN;
    else process.env.EVOLUTION_TOKEN = originalEvolutionToken;
});

describe('fail-closed administrative authentication', () => {
    test.each([undefined, '', '   '])('denies access with absent/blank configuration: %s', configured => {
        if (configured !== undefined) process.env.ADMIN_SECRET = configured;
        const { res, next } = attempt(requireAdmin);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ADMIN_AUTH_UNAVAILABLE' }));
    });

    test('does not bootstrap administration with a submitted but unconfigured secret', () => {
        const { res, next } = attempt(requireAdmin, { headers: { 'x-admin-secret': adminSecret } });
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
    });

    test.each([
        { headers: { 'x-admin-secret': adminSecret } },
        { body: { secret: adminSecret } },
        { body: { admin_secret: adminSecret } },
    ])('preserves a configured administrative credential channel: %j', req => {
        process.env.ADMIN_SECRET = adminSecret;
        const { res, next } = attempt(requireAdmin, req);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test.each([undefined, '', 'wrong', 42, {}, [adminSecret]])('rejects missing or malformed credential: %j', candidate => {
        process.env.ADMIN_SECRET = adminSecret;
        const { res, next } = attempt(requireAdmin, { headers: { 'x-admin-secret': candidate } });
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('does not fall through from an invalid header to a valid body', () => {
        process.env.ADMIN_SECRET = adminSecret;
        const { next } = attempt(requireAdmin, { headers: { 'x-admin-secret': 'wrong' }, body: { secret: adminSecret } });
        expect(next).not.toHaveBeenCalled();
    });

    test('reads legitimate rotation per request and rejects the previous credential', () => {
        process.env.ADMIN_SECRET = adminSecret;
        expect(attempt(requireAdmin, { body: { secret: adminSecret } }).next).toHaveBeenCalledTimes(1);
        process.env.ADMIN_SECRET = 'rotated-local-unit-test-secret';
        expect(attempt(requireAdmin, { body: { secret: adminSecret } }).next).not.toHaveBeenCalled();
        expect(attempt(requireAdmin, { body: { secret: process.env.ADMIN_SECRET } }).next).toHaveBeenCalledTimes(1);
    });
});

describe('evolution credential scope', () => {
    test('denies missing configuration even if the request also omits adminToken', () => {
        const { res, next } = attempt(requireEvolutionAdmin, { body: {} });
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
    });

    test('retains the configured evolution token without granting general administration', () => {
        process.env.EVOLUTION_TOKEN = evolutionToken;
        expect(attempt(requireEvolutionAdmin, { body: { adminToken: evolutionToken } }).next).toHaveBeenCalledTimes(1);
        expect(attempt(requireAdmin, { headers: { 'x-admin-secret': evolutionToken } }).next).not.toHaveBeenCalled();
        process.env.ADMIN_SECRET = adminSecret;
        expect(attempt(requireAdmin, { headers: { 'x-admin-secret': evolutionToken } }).next).not.toHaveBeenCalled();
    });

    test('accepts the main administrator for evolution and rejects invalid tokens', () => {
        process.env.ADMIN_SECRET = adminSecret;
        process.env.EVOLUTION_TOKEN = evolutionToken;
        expect(attempt(requireEvolutionAdmin, { headers: { 'x-admin-secret': adminSecret } }).next).toHaveBeenCalledTimes(1);
        expect(attempt(requireEvolutionAdmin, { body: { adminToken: 'wrong' } }).next).not.toHaveBeenCalled();
    });
});

describe('administrative route contracts without starting the API', () => {
    test('legacy restore GET is a non-mutating 405 with the replacement method', () => {
        const res = response();
        const next = jest.fn();
        rejectUnsafeAdminGet({}, res, next);
        expect(res.status).toHaveBeenCalledWith(405);
        expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST');
        expect(next).not.toHaveBeenCalled();
    });

    test('sensitive route registration includes its centralized guard before the handler', () => {
        // Read source only: importing index.js erases radata and starts background work.
        const source = readFileSync(new URL('../../packages/api/src/index.js', import.meta.url), 'utf8');
        const registrations = new Map([...source.matchAll(/app\.(get|post)\(["']([^"']+)["'],\s*(\w+)/g)]
            .map(([, method, path, guard]) => [`${method.toUpperCase()} ${path}`, guard]));
        const guarded = [
            'POST /admin/purge-duplicates', 'POST /admin/purge-agent', 'POST /admin/set-env',
            'GET /admin/papers-status', 'POST /admin/restore-purged',
            'POST /dataset/v2/build-export', 'POST /benchmark/publish',
        ];
        for (const route of guarded) expect(registrations.get(route)).toBe('requireAdmin');
        expect(registrations.get('POST /evolution/spawn')).toBe('requireEvolutionAdmin');
        expect(registrations.get('GET /admin/restore-purged')).toBe('rejectUnsafeAdminGet');
        for (const [route, guard] of registrations) {
            if (route.includes(' /admin/')) expect(['requireAdmin', 'rejectUnsafeAdminGet']).toContain(guard);
        }
        const siliconSource = readFileSync(new URL('../../packages/api/src/routes/siliconAdminRoutes.js', import.meta.url), 'utf8');
        expect(siliconSource).toMatch(/router\.use\(requireAdmin\)/);
    });
});
