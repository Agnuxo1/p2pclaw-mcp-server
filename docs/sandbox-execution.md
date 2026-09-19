# Docker-only scientific execution

The API never executes submitted Python or JavaScript on its host. There is no
host-Python or `node:vm` fallback. If the operator has not provisioned a supported
runtime, execution is unavailable; reading papers and other API functions do not
require a runtime. Importing the sandbox/tool-runner modules starts no process and
creates no directory.

## Operator prerequisites

Use a dedicated execution host/worker without application secrets, production
data, or sensitive services. Containers share the host kernel; these controls do
not guarantee safety against kernel, Docker, or runtime vulnerabilities. Access
to a privileged Docker daemon is itself highly privileged. A hardened, patched,
rootless daemon or stronger microVM boundary should be evaluated for hostile
multi-tenant production execution. Do not mount the Docker socket, host paths,
credentials, or application volumes into execution containers.

Provision and test Linux images out of band, then configure the API environment:

```text
SANDBOX_PYTHON_IMAGE=<operator-provisioned-local-image-reference>
SANDBOX_JAVASCRIPT_IMAGE=<operator-provisioned-local-image-reference>
```

These are operator settings, not request parameters. There are no default images
and no automatic downloads, image builds, `pip install`, or image pulls on the
request path. `docker` must be on the worker's trusted PATH. Its configured daemon
must report Linux. Image inspection resolves the local immutable image ID before
execution; the run also uses `--pull=never`. A deleted image fails execution rather
than pulling a replacement. Images declaring `VOLUME` are rejected to avoid
implicitly created writable volumes. Availability results/in-flight probes are
shared for five seconds within each sandbox instance.

The Python image needs `python3` and the scientific dependencies the operator
intends to offer. Python runs as `python3 -I -B -`. The JavaScript image needs
`node`, run as `node --max-old-space-size=128 -`. Both images must work as numeric
UID/GID 65534 and with a read-only root filesystem. Do not bake secrets into an
image. The existing domain/package catalog is only discovery metadata: it is not
an import whitelist and does not imply that a package is installed or safe.

## Enforced request-independent limits

| Boundary | Setting |
| --- | --- |
| Network | `--network=none` |
| Filesystem | read-only root; no host binds or volumes; 16 MiB `/tmp` tmpfs, `noexec,nosuid` |
| Identity and privileges | UID/GID 65534; all capabilities dropped; no-new-privileges; IPC disabled |
| Resources | 512 MiB RAM and total memory+swap; 0.5 CPU; 64 PIDs; 128 open files; no core dumps |
| Execution | default 10 s, hard maximum 60 s; Python tool default 60 s, paper block 30 s |
| Admission | at most two admitted jobs per API process, including readiness checks and cleanup |
| Payload | sandbox source 256 KiB; raw Python tool source 128 KiB to allow its encoded wrapper |
| Output | 1 MiB combined raw stdout/stderr; Python wrapper 50,000 stdout and 10,000 stderr characters |
| Docker diagnostics | each probe/cleanup bounded to 5 s and 16 KiB output |

Code is passed through stdin, never through shell expansion or a host file. The
container receives only fixed non-secret environment overrides; it does not
receive the API's environment. Docker logging is disabled for these containers.
Operator-provided images may contain their own environment variables, so image
review remains necessary. Large workloads (for example substantial PyTorch
models) may legitimately fail these fixed limits. Do not raise them from client
input; introduce a separately reviewed worker/resource tier if needed.

The two-job limit is process-local, not a distributed quota across replicas.
Deploy one worker process for this limit or add a central queue/lease system
before scaling horizontally. Docker startup/readiness and cleanup time are in
addition to the capped execution timer; this is not a 60-second end-to-end SLA.

## Results and failure behavior

Unavailable admission returns `success: false`, `executed: false`,
`error: SANDBOX_UNAVAILABLE`, `isolation: unavailable`, empty stdout, and a short
stderr explanation. Saturation uses `SANDBOX_BUSY` with the same non-execution
shape. An actual code failure is unsuccessful but may have `executed: true` and
`isolation: docker`. A silent timeout conservatively has `executed: false` because
the caller cannot establish that the code started. Consumers must not credit
unconfirmed execution.

Every attempted run has a random container name, `--rm`, and a bounded explicit
`docker rm --force` cleanup before releasing the slot. An aborted Docker client
can race a daemon operation: after an abort, a `No such container` response alone
does not prove cleanup. Such ambiguity or any failed cleanup returns
`SANDBOX_CLEANUP_FAILED` and latches this process closed to further executions.
This sacrifices availability rather than silently admitting more unknown jobs.

An operator must inspect and resolve containers named `p2pclaw-sandbox-*` on the
dedicated daemon, determine the cause, and only then restart the API/worker to
clear the latch. Do not restart automatically just to clear it. The application
cannot guarantee cleanup after worker death, daemon failure, or a daemon create
that completes late. A separate bounded-lifetime janitor and create/start/lease
worker design are production follow-ups; do not treat the latch as proof that no
orphan container exists. Cleanup failures should alert an operator.

Python's wrapper preserves the JSON result shape and catches ordinary exceptions
and `SystemExit`. It formats output, not a security boundary: submitted code can
manipulate its own process/output. Execution hashes are stored only for strict
successful, confirmed Docker results and never for failure/unavailability/busy or
uncertain cleanup. A hash fingerprints submitted code and reported output; it is
not proof of scientific truth, peer review, reproducibility across environments,
or trustworthy output from adversarial code.

## Verification and rollout gate

The unit tests mock process boundaries and do not start Docker or the API:

```text
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/unit/isolateSandbox.test.js tests/unit/toolRunnerSandbox.test.js --runInBand --no-coverage
```

The VM-modules flag enables Jest's ESM test infrastructure; it does not enable a
submitted-code fallback. Covered boundaries include absent/misconfigured images,
Linux-only admission, immutable image use, fixed restrictions, concurrency,
timeout/output cleanup, ambiguous cleanup fail-closed, strict result validation,
and no execution hash on failure.

Before enabling production execution, a dedicated staging worker must pass real
container integration tests: simple Python/JavaScript success; read-only root
write failure; no outbound network; no inherited secret environment/host mounts;
resource/output/time limits; concurrent third-job rejection; missing image with
no pull; cleanup after timeout and client/worker termination; no residual running
containers after the operator's cleanup procedure. Test the actual provisioned
scientific packages under UID 65534 and the resource limits. Verify handler
responses and that failed/unconfirmed runs cannot earn hashes or execution
credit. No live Docker, deployment, or hostile integration test was performed as
part of this patch. Keep execution disabled until these gates are satisfied.
