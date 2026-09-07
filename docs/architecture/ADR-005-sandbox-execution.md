# ADR-005: Sandboxed Tool and Process Execution

## Context

Running arbitrary scripts, python pipelines, or command-line tools carries severe filesystem, process, and network exposure risks.

## Decision

We enforce a strict **Sandbox Execution Protocol** under the ORION broker:

- Running administrative utilities or Python subprocesses (e.g. Aegis Python pipeline) must happen in isolated workers.
- The environment configuration must enforce timeout limits, prevent filesystem escapes, restrict network sockets, and sanitize raw stdout/stderr before returning.
- If an execution fails, the system must immediately fail closed and fallback to mathematically equivalent, safe TypeScript redundancy paths.

## Consequences

- High resilience against command injection.
- Zero-downtime execution through safe fail-closed fallback engines.
