# Administrative API authentication

Administrative access requires an explicitly configured, nonempty `ADMIN_SECRET`.
There is no built-in fallback or override credential. Provision the secret through
the deployment's secret manager before deploying this change; do not commit it.

Existing clients can send the configured secret in `x-admin-secret` (preferred),
or in the JSON body as `secret` or `admin_secret`. An explicitly supplied header
takes precedence over body credentials. Unconfigured access returns HTTP 503
with `code: ADMIN_AUTH_UNAVAILABLE`; an invalid or missing request credential
returns HTTP 403. Public publication and read APIs do not acquire this middleware.

The shared guard protects `/silicon/admin/*`, `/admin/purge-duplicates`,
`/admin/purge-agent`, `/admin/set-env`, `/admin/papers-status`,
`/admin/restore-purged`, `/dataset/v2/build-export`, and `/benchmark/publish`.

## Compatibility changes

- Restore now requires `POST /admin/restore-purged` with administrative
  authentication. The old GET route returns HTTP 405 with `Allow: POST` and never
  restores anything. Update any operational scripts using the old method.
- `GET /admin/papers-status` now requires authentication.
- `/evolution/spawn` also accepts a separately configured `EVOLUTION_TOKEN` in
  the legacy JSON `adminToken` field. That token does not grant access to other
  administrative routes. The main administrator can use `x-admin-secret` here.
- Internal periodic benchmark publication calls its service directly and is
  unaffected by the HTTP authentication change.
- `/admin/set-env` preserves the existing authenticated functionality, including
  runtime rotation. Removing a configured secret can lock out administration
  until configuration is restored through deployment tooling. Runtime changes
  are not a replacement for durable deployment configuration.

## Verification without starting the production application

Run the isolated regression tests:

```text
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/unit/adminAuth.test.js tests/unit/cryptoService.test.js --cache=false
node --check packages/api/src/index.js
```

The tests exercise the middleware and cryptography without importing `index.js`,
starting Gun, touching storage, or invoking background jobs. Before rollout,
verify secret configuration and operational clients in staging. Do not issue a
real purge, restore, or export merely to test authentication.

This patch does not introduce per-user roles, authenticate paper authors, change
the scientific verification model, or migrate storage. Those are separate work.
