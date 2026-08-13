# Skill security/publication roadmap: implementation status

This increment is intentionally local and artifact-scoped. It follows selected
principles of least privilege, fail-closed validation, immutable provenance and
explicit user consent; it does not claim SLSA, OWASP, NIST, hosted-service, or
server-signature compliance.

## Implemented

1. **Policy/state model — implemented.** A versioned `security-policy-v1` contract
   covers malware verdict, capabilities, visibility, publication status, execution
   policy, policy version, exact GitHub commit/tree/path where applicable, normalized
   checksum, and approval scope. The default visibility is `private`; `published`
   means router-visible in that private catalog, not publicly released. Approval is
   bound to the exact artifact checksum, policy version and finding IDs and has no
   global/public trust effect.
2. **Immutable acquisition/quarantine — implemented and integrated.** Existing sparse
   acquisition, quarantine and content-addressed cache now carry and validate the
   policy. Blocked/denied/quarantined/revoked records cannot activate. Target code,
   dependencies, build hooks and install hooks are not run.
3. **Context-aware Scanner v2 — partial.** Documentation/examples are separated from
   configuration/executable content; only actual `package.json` lifecycle fields are
   Medium findings. API-key names are capabilities rather than automatic High
   findings; real tokens/private keys, executable remote-pipe and persistence canaries
   block. Stable finding/rule IDs, confidence, evidence, mitigations and truncation
   metadata are emitted. It remains deterministic static heuristics, not AST,
   dependency or runtime analysis.

## Not implemented

4. **Review/publication service and appeals:** only a local approval gate exists; no
   hosted queue, publication service or appeals workflow.
5. **Sandbox:** no enforced sandbox exists, so `sandbox-only` is never selected merely
   because a skill contains scripts.
6. **Publisher trust:** no ownership, MFA, reputation or digital signature system.
   Receipt SHA-256 values are integrity digests, not server/digital signatures.
7. **Global routing/revoke:** routing is local/private policy gating only; there is no
   global revoke or kill switch.
8. **Public launch:** no multi-tenant service, public catalog operations, SLOs, hosted
   scanner or hosted sandbox. Public Paseobility carries only its own public skills
   and minimal manager/router boundary; private catalog and workload payloads remain
   outside it.
