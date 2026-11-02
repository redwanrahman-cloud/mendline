# Correction Continuity: Requirements

Labels: **Source-observed** (read from source), **Proposed** (unimplemented). No tests were executed this session, so no **Tested** label is used; `tests/engine/lifecycle.test.ts` is the named suite that asserts several cases below. Scope: exact-key reconciliation of original (O), corrected (C), refreshed (N) CSV exports, plus a proposed value-rule layer. Contribution boundary: read-only review of this workspace; only `.kiro/specs/correction-continuity/**` is written. `src/engine`, `src/ui`, and root config are not modified; no implementation code is written.

## CSV marker clarification — reviewed after implementation repair
The independently reproduced defect concerned a literal U+FEFF at the beginning of the first header, not preservation of CSV formatting bytes. The engine now quotes that literal on serialization and consumes exactly one initial UTF-8 transport BOM on parsing; quoted, interior and cell markers remain values. Original bytes/hashes remain retained. CSV serialization does not promise raw-byte equality with the input (quoting and line endings can differ). Logical cell/header roundtrip is the required property. Regression evidence is in tests/engine/unicode-roundtrip.test.ts; execution receipts are maintained separately from this source-observed specification.

## Functional requirements (Source-observed)
- FR-1 Reconcile validates snapshots/policy, a shared header set across O/C/N (order may differ), a key map per snapshot, O==C key set, and identity columns unchanged O->C; emits one assessment per cell where O and C differ.
- FR-2 Duplicate/blank keys are rejected in **each** of O, C, N (`DUPLICATE_KEY`/`BLANK_KEY`, role-tagged).
- FR-3 Identity assumption: `known` iff identity columns are set, `assumptionConfirmed`, reason non-blank, and identity fields equal O->N; else `identity_hold`. Identity check precedes value comparison. `retire`/`confirm_continuity` require a reason.
- FR-4 Carry: `known` and `refreshed==old` -> `carry`, not auto-resolved; explicit inclusion required.
- FR-5 Upstream-fixed: `known` and `refreshed==corrected` -> `upstream_fixed`, the only auto-resolved state.
- FR-6 Conflict: `known` and otherwise -> `conflict`; `apply`/`keep_latest`/`replace(value)` require a reason.
- FR-7 Orphan: corrected key absent from N -> `orphan`; only `acknowledge_omission`; row absent from output.
- FR-8 Stale rejection: `resolve`/`undo`/`exportReviewed`/`importHistory` reject any binding mismatch (generation/policy/revision/inputHashes) as `STALE_BINDING` without mutation.
- FR-9 Undo rebuilds via `reconcile` plus replay of remaining active events; `confirm_continuity` undo invalidates dependents; undo-of-undo rejected; inputs not mutated.
- FR-10 Unchanged originals: `old==corrected` yields no assessment; N==O still yields `carry` needing inclusion.
- FR-11 CSV roundtrip: `serializeCsv` quotes/doubles/CRLF; `parseCsv` is left-inverse for logical content (transport BOM distinguished from quoted literal marker); export output re-parses to expected rows.
- FR-12 Formula hold: `exportReviewed` scans all preview cells (headers, rows, untouched and user-replaced) for `^[\u0000-\u0020]*[=+@-]`; any match -> `FORMULA_HOLD`, no CSV, history `complete=false`.
- FR-13 History/recovery: `mendline-history/v1`; `importHistory` replays events requiring exact match (timestamp is provenance), validates generation, verifies the final receipt for complete history; tamper rejected. Session round-trips with readback.
- FR-14 Immutability/determinism: inputs and prior state never mutated; identical inputs give identical hashes, ids, states, order.

## Example-based cases (fixture F0)
P0: `keyColumn=sku`, `identityColumns=[product_code]`, `assumptionConfirmed=true`, reason given. O0=`sku,product_code,label` then `001,P1,Tea / 002,P2,Cup / 003,P3,Box / 004,P4,Pen / 005,P5,Pad`. C0 corrects labels to Green tea/Blue cup/Gift box/Black pen/Memo pad. N0 reorders to `label,sku,product_code`: `New item,006,P6 / Large box,003,P3 / Tea,001,P1 / Pad,005,P9 / Blue cup,002,P2`.

| Case | Expected (Source-observed) |
|---|---|
| F0 classify | states `[carry,upstream_fixed,conflict,orphan,identity_hold]` for 001..005 |
| 001 carry N==O | unresolved; needs apply/keep_latest |
| 002 upstream-fixed N==C | resolved, output Blue cup |
| 003 conflict | apply->Gift box, keep_latest->Large box, replace(v)->v; reason req |
| 004 orphan | acknowledge_omission; row absent from output |
| 005 identity_hold (P5->P9) | retire keeps Pad; confirm_continuity->carry then apply |
| dup key (N0+`001`) | DUPLICATE_KEY (role N); same in O/C |
| blank key | BLANK_KEY (role-tagged) |
| C0 001->01 | KEY_SET |
| C0 P1->PX | IDENTITY_EDIT |
| empty replace | replace('')+reason -> output ''; without reason -> INVALID_ACTION |
| stale binding | pre-completion binding -> STALE_BINDING, no mutation |
| undo 003 keep_latest | 003 unresolved, export fails |
| undo confirm_continuity | invalidates later apply; 005 back to identity_hold |
| formula ` \t=1+1` in 006 | FORMULA_HOLD row2 col label; complete=false |
| CSV special | `comma, quote" and\nnewline` and `` roundtrip; ragged/malformed/0xff rejected |
| history/import | importHistory(exportHistory(S)) deep-equals S |
| tamper | snapshot/event edit -> HISTORY_MISMATCH/HISTORY_SCHEMA |

## Property-based invariants (Proposed as checked; no runner specified)
P1 immutability; P2 determinism; P3 classification totality (orphan|carry|upstream_fixed|conflict|identity_hold); P4 known-flag form; P5 upstream-fixed iff known and refreshed==corrected, auto-resolved; P6 carry never auto-resolved; P7 holds==unresolved ids; P8 stale binding no-mutation; P9 undo reconstruction; P10 history roundtrip; P11 CSV logical-content roundtrip (transport BOM distinguished from quoted literal marker); P12 formula hold completeness; P13 key integrity; P14 N-order preserved in output; P15 action legality; P16 replace exactness incl. ''; P17 revision monotonicity.

## Proposed value-rule layer (not implemented; see design.md)
Bounded example-driven rules over **non-key, non-identity corrected cell values only** (trim/case/literal/prefix). Preview-only; confirmation re-runs reconcile and records review events; abstention is mandatory. Never transforms or normalizes record keys or identity fields. Key-transform/matching is explicitly out of scope and removed.


