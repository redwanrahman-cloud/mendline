# Mendline

Keep the lesson when the next spreadsheet arrives. Mendline is a browser-local CSV correction workbench: teach a small value correction, clarify its meaning, review its scope, and explicitly approve its use on a later export. Conflicting changes and uncertain record identities stay visible for independent human decisions.

## Run locally

Use Node.js 22 LTS, npm 10 and a current desktop browser. Release checks use Node 22.23.2 and npm 10.9.8 on Windows. No application account, API key, inference service or database is required. From the extracted source directory in PowerShell:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the exact `http://127.0.0.1:...` address printed by Vite. Select **Try the example yourself** for the real seven-stage fictional workflow, or **Use your own CSV** for the empty workbench. Keep three separate inputs: Original (O), your corrected copy (C), and Latest (N).

On macOS/Linux use `npm` instead of `npm.cmd`. `npm ci` downloads the versions pinned by `package-lock.json` and may run dependency installation scripts; it needs npm registry access or a populated cache. Use it instead of `npm install` to reproduce the pinned snapshot.

```powershell
npm.cmd test
npm.cmd run check:engine
npm.cmd run build
npm.cmd exec -- vite preview --host 127.0.0.1
```

The build creates `dist/`. Open the preview URL printed by Vite; `file://` is not supported. Stop a server with Ctrl+C. This static application's default build assumes hosting at the origin root. Nested hosting paths require separate configuration and verification. Preview is a local check, not a production hosting service.

## Workflow

1. Import UTF-8 CSVs or use the fictional catalog. Choose a unique immutable key, independently stable identity fields and a continuity explanation. O/C need identical key sets; O/C/N need identical column-name sets, although order may differ.
2. Compare O/C/N. Eligible carries require explicit inclusion; upstream-fixed corrections need no second change. Conflicts, missing records and uncertain identities remain held. New rows remain as supplied by N.
3. Teach a non-key, non-identity value change. A finite grammar proposes trimming, case conversion, literal replacement or fixed prefix operations. Multiple fitting rules remain alternatives. Supply a distinguishing example, select the intended rule and approve its scope. Exact observed values are the default; broader starts-with scope is a human choice.
4. Preview exact cells and separately approve application. A rule cannot take over an existing correction, uncertain identity or another active application. Independently resolve conflicts and acknowledge missing rows. No arbitrary generated code or runtime model executes.
5. On the next export, retained teaching is an **inactive proposal** with source provenance. It needs fresh approval, preview and application for the new generation. Old approvals never silently apply to replacement files.
6. Review and download a new CSV and separate full-value JSON history. Undo records reversals. Input files are never overwritten; missing rows are not resurrected. History restore reconstructs its enclosed generation rather than merging old decisions into newly imported data.

The home page also offers a 33-second six-scene illustration with captions, pause/replay and manual reduced-motion controls. It is an illustration, not recorded execution. The live example uses the actual engine and includes a second export with an unseen value, an identity hold and a competing correction.

## Privacy and recovery

CSV processing runs in the browser. Application source contains no upload, analytics, remote font or runtime inference request. Loading a hosted app still contacts its host; local development also uses Vite's development connection.

Successful workbench decisions attempt to save full-value reviewed-session recovery in local storage. Input recovery is a separate opt-in copy; retained archived teaching requires that input recovery copy. The guided example offers a downloadable checkpoint. Neither local storage nor downloaded history is encrypted, redacted, authenticated authorship evidence or guaranteed durable storage. Histories can include raw input bytes, all three snapshots, decisions and earlier source histories. Use fictional or otherwise permitted nonconfidential data. Remove recovery with the workbench's Forget controls or clear site data for the exact origin. Check the browser's download location: requesting a download does not prove it was saved.

## Limits

- Cells are exact strings: leading zeroes, spaces and empty values matter. Matching identity fields is a continuity assumption; reuse with identical declared fields is undetectable. No fuzzy matching.
- Unresolved correction holds block final export. Formula-leading output after leading ASCII controls/spaces (`=`, `+`, `@`, `-`) is conservatively held, including ordinary negative values. This is not universal spreadsheet-safety certification.
- Parser bounds: 20,000,000 UTF-8 bytes/input, 100,000 data rows and 1,000 columns. Recovery has further size/event/depth limits. These are rejection bounds, not performance promises; large inputs and nested histories can consume substantial memory.
- No general-purpose learning, silent transformation, identity/key normalization, authenticated provenance, multi-user synchronization or real-user productivity result is claimed. Examples and tests do not establish market demand or comprehensive accessibility certification.

## Development and prior work

Mendline's local Git history begins on 2 November 2026. Its engine, rule-intent lifecycle, later-export reuse and teaching interface were developed as a separate project. Earlier **CSV Change Review** work informed the problem and engineering approach: it already parsed/diffed keyed CSVs, linked cell evidence, stored human review notes and staged unverified proposals. Those are prior work, not Mendline inventions. The inspected earlier comparison/review boundaries do not implement Mendline's O/C/N correction overlay, finite rule teaching, fresh later-generation approval or corrected CSV export. This scoped comparison does not prove global novelty or legal ownership.

Kiro contributed native source reading and specification writing on 2 November 2026. Saved [requirements and design](.kiro/specs/correction-continuity/) were reviewed and corrected, including removing proposed key transformations and clarifying transport BOM versus literal-marker behavior. These historical specs predate the later implementation in `src/rules/intelligence.ts`: their proposed value-rule sections and earlier schema description are not the current API reference. They do not establish that Kiro wrote all code or ran tests. Implementation and subsequent review used additional engineering assistants.

## Checks and layout

`npm test` runs Vitest engine/rule regressions, adapter/handler checks, static React markup and mocked lifecycle checks. These do not replace browser interaction or saved-download verification. `npm run check:engine` checks the engine test boundary; `npm run build` typechecks included TypeScript and builds with Vite. The historical optional Playwright script is not part of the prepared release or these commands.

- `src/engine/`: immutable snapshots, reconciliation, review events, export and recovery.
- `src/rules/`: bounded alternatives, approval, preview/application, undo and reuse.
- `src/ui/`, `src/styles/`: illustration, live example and CSV workbench.
- `tests/`: focused deterministic, handler and presentation regressions.

## Licensing

Original Mendline source code and documentation are licensed under the MIT License, copyright (c) 2026 Redwan Rahman; see [LICENSE](LICENSE). Third-party packages retain their own licenses; see `THIRD_PARTY_NOTICES.md` in the prepared source package. React, React DOM, scheduler and @noble/hashes are MIT-licensed runtime dependencies. Tooling includes MIT, ISC, BSD and Apache-2.0 components. Dependency permissions do not establish ownership of original additions or prior-project material.
