# Dependency Audit Triage

Last reviewed with:

```bash
npm audit
```

Current result: 13 findings total, 12 low and 1 moderate. All findings are in npm/dev tooling dependency chains; this static frontend does not ship `node_modules` through Firebase Hosting.

## Findings

| Package | Severity | Direct? | Area | Runtime impact | Recommended action |
| --- | --- | --- | --- | --- | --- |
| `ws` via `puppeteer-core` / `lighthouse` | Moderate | Transitive | Lighthouse/dev tooling | Dev-only; not shipped to users | Wait for non-breaking Lighthouse/Puppeteer dependency update or verify an npm override in a separate dependency-upgrade PR |
| `firebase-admin` | Low | Direct dev dependency | Claims tooling | Admin script only, not browser runtime | Do not apply suggested downgrade to `10.3.0`; monitor upstream fix for `@google-cloud/*` chain |
| `@google-cloud/firestore` | Low | Transitive | `firebase-admin` | Claims tooling only | Covered by `firebase-admin`; no safe forced fix now |
| `@google-cloud/storage` | Low | Transitive | `firebase-admin` | Claims tooling only | Covered by `firebase-admin`; no safe forced fix now |
| `google-gax` | Low | Transitive | `firebase-admin` | Claims tooling only | Covered by `firebase-admin`; no safe forced fix now |
| `retry-request` | Low | Transitive | `firebase-admin` | Claims tooling only | Covered by `firebase-admin`; no safe forced fix now |
| `teeny-request` | Low | Transitive | `firebase-admin` | Claims tooling only | Covered by `firebase-admin`; no safe forced fix now |
| `http-proxy-agent` | Low | Transitive | `firebase-admin` chain | Claims tooling only | Suggested npm fix downgrades `firebase-admin`; defer |
| `@tootallnate/once` | Low | Transitive | `firebase-admin` chain | Claims tooling only | Suggested npm fix downgrades `firebase-admin`; defer |
| `@lhci/cli` | Low | Direct dev dependency | Lighthouse CI tooling | Dev-only | Suggested fix downgrades to `0.1.0`; do not apply blindly |
| `inquirer` | Low | Transitive | `@lhci/cli` | Dev-only | Covered by LHCI upgrade path |
| `external-editor` | Low | Transitive | `@lhci/cli` | Dev-only | Covered by LHCI upgrade path |
| `tmp` | Low | Transitive/direct via tools | LHCI/dev tooling | Dev-only | Covered by LHCI upgrade path |

## Decision

No automatic fix was applied in this pass. `npm audit fix --force` would introduce major/downgrade changes in Firebase Admin and Lighthouse tooling, which needs compatibility testing. The safe follow-up is a dedicated dependency-upgrade branch that:

1. Tests a newer Lighthouse/LHCI stack or an explicit `ws` override.
2. Tests the Firebase Admin claims script against Application Default Credentials.
3. Runs `npm run preflight`, `npm run test:unit`, `npm run test:e2e`, `npm run test:mobile`, and `npm run test:rules` with JDK 21.
