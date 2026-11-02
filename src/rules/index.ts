/** Proposal-only finite DSL. Never imports or changes the reconciliation engine. */
export type Example = Readonly<{ input: string; output: string }>;
export type Operation =
  | { kind: 'trim' | 'lower' | 'upper' }
  | { kind: 'literalReplace'; from: string; to: string }
  | { kind: 'removePrefix' | 'addPrefix'; prefix: string };
export type Scope = Readonly<{ column: string; predicate: Readonly<{ kind: 'exactValues'; values: readonly string[] }> }>;
export type Candidate = Readonly<{
  operation: Operation; description: string; scope: Scope;
  preconditions: readonly string[]; preview: readonly Example[];
  requiresConfirmation: true; createsNewCorrectedGeneration: true;
}>;
export type Proposal = Readonly<{
  status: 'PROPOSED' | 'ABSTAIN'; reason: string;
  candidates: readonly Candidate[]; selectedCandidate: null;
}>;

export function transform(op: Operation, input: string): string {
  switch (op.kind) {
    case 'trim': return input.trim();
    case 'lower': return input.toLowerCase();
    case 'upper': return input.toUpperCase();
    case 'literalReplace': return input.split(op.from).join(op.to);
    case 'removePrefix': return input.startsWith(op.prefix) ? input.slice(op.prefix.length) : input;
    case 'addPrefix': return op.prefix + input;
  }
}
function describe(op: Operation): string {
  switch (op.kind) {
    case 'trim': return 'Remove leading and trailing ECMAScript whitespace';
    case 'lower': return 'Convert to Unicode lowercase (locale independent)';
    case 'upper': return 'Convert to Unicode uppercase (locale independent)';
    case 'literalReplace': return `Replace every exact literal ${JSON.stringify(op.from)} with ${JSON.stringify(op.to)}`;
    case 'removePrefix': return `Remove fixed prefix ${JSON.stringify(op.prefix)}`;
    case 'addPrefix': return `Add fixed prefix ${JSON.stringify(op.prefix)}`;
  }
}
const abstain = (reason: string, candidates: Candidate[] = []): Proposal =>
  ({ status: 'ABSTAIN', reason, candidates, selectedCandidate: null });

/** Two distinct input examples and at least one changed pair are required.
 * Whitespace and empty cell strings are data; an empty example list is not evidence.
 * The exact-values predicate MUST NOT be widened by a consumer.
 */
function infer(column: string, examples: readonly Example[], minimum: number): Proposal {
  if (typeof column !== 'string' || column.trim() === '') return abstain('Explicit column required');
  if (!Array.isArray(examples) || examples.length < minimum || examples.length > 32)
    return abstain('Require 2..32 explicit examples');
  if (examples.some(e => !e || typeof e.input !== 'string' || typeof e.output !== 'string' ||
      e.input.length > 256 || e.output.length > 256)) return abstain('Examples must be strings of at most 256 UTF-16 units');
  const pairs = new Map<string, string>();
  for (const e of examples) {
    if (pairs.has(e.input) && pairs.get(e.input) !== e.output) return abstain('Conflicting outputs for the same exact input');
    pairs.set(e.input, e.output);
  }
  const evidence = [...pairs].map(([input, output]) => ({ input, output }));
  if (pairs.size < minimum || !evidence.some(e => e.input !== e.output)) return abstain('Insufficient informative examples');
  if (minimum === 2 && new Set(pairs.values()).size !== pairs.size) return abstain('Example outputs collide; key continuity cannot be inferred');
  const changed = evidence.find(e => e.input !== e.output)!;
  const ops: Operation[] = [{ kind: 'trim' }, { kind: 'lower' }, { kind: 'upper' }];
  // Enumerate only literal edits anchored in the first changed example.
  // Every generated operation is subsequently checked against ALL examples.
  const { input, output } = changed;
  if (output.endsWith(input) && output.length > input.length)
    ops.push({ kind: 'addPrefix', prefix: output.slice(0, output.length - input.length) });
  if (input.endsWith(output) && input.length > output.length)
    ops.push({ kind: 'removePrefix', prefix: input.slice(0, input.length - output.length) });
  let left = 0;
  while (left < Math.min(input.length, output.length) && input[left] === output[left]) left++;
  let right = 0;
  while (right < Math.min(input.length, output.length) - left &&
    input[input.length - 1 - right] === output[output.length - 1 - right]) right++;
  const from = input.slice(left, input.length - right);
  const to = output.slice(left, output.length - right);
  if (from !== '') ops.push({ kind: 'literalReplace', from, to });
  // At most 256 additional literal candidates, including repeated replacements.
  // Infer replacement length from the exact non-overlapping occurrence count.
  for (let length = 1; length <= input.length - left; length++) {
    const literal = input.slice(left, left + length);
    const count = input.split(literal).length - 1;
    const replacementLength = length + (output.length - input.length) / count;
    if (Number.isInteger(replacementLength) && replacementLength >= 0 && left + replacementLength <= output.length)
      ops.push({ kind: 'literalReplace', from: literal, to: output.slice(left, left + replacementLength) });
  }
  // Whole-cell literal alternative is kept distinct from inferred substring edits.
  if (input !== '') ops.push({ kind: 'literalReplace', from: input, to: output });
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const op of ops) {
    const key = JSON.stringify(op);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!evidence.every(e => transform(op, e.input) === e.output)) continue;
    candidates.push({ operation: op, description: describe(op),
      scope: { column, predicate: { kind: 'exactValues', values: [...pairs.keys()] } },
      preconditions: ['Exact column and exact input-value allowlist only',
        'Human confirmation must create a new explicit corrected generation',
        'Revalidate snapshot binding, key uniqueness, identity and conflict holds; never resolve existing holds here',
        'No evidence of intent or correctness outside these examples'],
      preview: evidence.map(e => ({ ...e })), requiresConfirmation: true, createsNewCorrectedGeneration: true });
  }
  if (candidates.length === 0) return abstain('No supported single operation fits all examples');
  if (candidates.length > 1) return abstain('Multiple consistent operations; alternatives require human choice', candidates);
  return { status: 'PROPOSED', reason: 'One supported candidate; human confirmation still required', candidates, selectedCandidate: null };
}

/** Preview known examples only. Returns null outside the original exact scope.
 * Does not execute a supplied operation or apply anything to CSV/snapshots.
 */
export function previewEffect(candidate: Candidate, column: string, input: string): Example | null {
  if (column !== candidate.scope.column || !candidate.scope.predicate.values.includes(input)) return null;
  const effect = candidate.preview.find(e => e.input === input);
  return effect ? { ...effect } : null;
}

export function proposeCandidates(column:string, examples:readonly Example[]):Proposal { return infer(column,examples,2); }
export function inferOneExample(column:string, examples:readonly Example[]):Proposal { return infer(column,examples,1); }
