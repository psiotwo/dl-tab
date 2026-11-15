export type Concept =
  | { kind: 'atom'; name: string }
  | { kind: 'not'; name: string }
  | { kind: 'top' | 'bottom' }
  | { kind: 'and' | 'or'; left: Concept; right: Concept }
  | { kind: 'exists' | 'forall'; role: string; value: Concept };

export interface Gci { left: Concept; right: Concept }
export interface Axiom { individual: string; concept: Concept }
export interface RoleAssertion { role: string; from: string; to: string }
export interface KnowledgeBase { tbox: Gci[]; abox: Axiom[]; roles: RoleAssertion[] }
export interface GraphNode { id: string; labels: Concept[]; parent?: string }
export interface GraphEdge { from: string; to: string; role: string }
export interface CompletionGraph { nodes: GraphNode[]; edges: GraphEdge[]; nextWitness: number }

const tokenPattern = /\s*(<=|[()&|!.,=]|⊑|≡|⊓|⊔|∧|∨|¬|∃|∀|⊤|⊥|[A-Za-z_][A-Za-z_0-9-]*)/gy;

class Parser {
  private tokens: string[] = [];
  private i = 0;
  constructor(source: string) {
    let pos = 0;
    while (pos < source.length) {
      if (/^\s*$/.test(source.slice(pos))) break;
      tokenPattern.lastIndex = pos;
      const m = tokenPattern.exec(source);
      if (!m) throw new Error(`Unexpected text near “${source.slice(pos, pos + 16)}”`);
      this.tokens.push(m[1]); pos = tokenPattern.lastIndex;
    }
  }
  private peek(): string | undefined { return this.tokens[this.i]; }
  private take(): string { const t = this.tokens[this.i++]; if (!t) throw new Error('Concept ends too early'); return t; }
  private accept(...values: string[]): boolean { if (values.includes(this.peek() || '')) { this.i++; return true; } return false; }
  private expect(value: string): void { if (!this.accept(value)) throw new Error(`Expected “${value}”, found “${this.peek() ?? 'end'}”`); }
  parse(): Concept { const c = this.or(); if (this.peek()) throw new Error(`Unexpected “${this.peek()}”`); return c; }
  private or(): Concept { let a = this.and(); while (this.accept('|', '∨', '⊔', 'or')) a = { kind: 'or', left: a, right: this.and() }; return a; }
  private and(): Concept { let a = this.unary(); while (this.accept('&', '∧', '⊓', 'and')) a = { kind: 'and', left: a, right: this.unary() }; return a; }
  private unary(): Concept {
    if (this.accept('!', '¬', 'not')) return negate(this.unary());
    if (this.accept('exists', '∃', 'forall', '∀')) {
      const op = this.tokens[this.i - 1]; const role = this.take();
      if (!/^[A-Za-z_][A-Za-z_0-9-]*$/.test(role)) throw new Error(`Invalid role “${role}”`);
      this.expect('.');
      return { kind: op === 'exists' || op === '∃' ? 'exists' : 'forall', role, value: this.unary() };
    }
    if (this.accept('(')) { const a = this.or(); this.expect(')'); return a; }
    const t = this.take();
    if (t === 'top' || t === '⊤') return { kind: 'top' };
    if (t === 'bottom' || t === '⊥') return { kind: 'bottom' };
    if (!/^[A-Za-z_][A-Za-z_0-9-]*$/.test(t)) throw new Error(`Invalid concept “${t}”`);
    return { kind: 'atom', name: t };
  }
}

export function negate(c: Concept): Concept {
  switch (c.kind) {
    case 'atom': return { kind: 'not', name: c.name };
    case 'not': return { kind: 'atom', name: c.name };
    case 'top': return { kind: 'bottom' };
    case 'bottom': return { kind: 'top' };
    case 'and': return { kind: 'or', left: negate(c.left), right: negate(c.right) };
    case 'or': return { kind: 'and', left: negate(c.left), right: negate(c.right) };
    case 'exists': return { kind: 'forall', role: c.role, value: negate(c.value) };
    case 'forall': return { kind: 'exists', role: c.role, value: negate(c.value) };
  }
}
export function parseConcept(text: string): Concept { return new Parser(text).parse(); }
export function show(c: Concept): string {
  switch (c.kind) {
    case 'atom': return c.name; case 'not': return `¬${c.name}`;
    case 'top': return '⊤'; case 'bottom': return '⊥';
    case 'and': return `(${show(c.left)} ⊓ ${show(c.right)})`;
    case 'or': return `(${show(c.left)} ⊔ ${show(c.right)})`;
    case 'exists': return `∃${c.role}.${show(c.value)}`;
    case 'forall': return `∀${c.role}.${show(c.value)}`;
  }
}
export const hasLabel = (n: GraphNode, c: Concept): boolean =>
  c.kind === 'top' || n.labels.some(x => show(x) === show(c));
export function addLabel(n: GraphNode, c: Concept): void {
  if (c.kind !== 'top' && !hasLabel(n, c)) n.labels.push(c);
}
export function nodeById(g: CompletionGraph, id: string): GraphNode {
  const node = g.nodes.find(n => n.id === id);
  if (!node) throw new Error(`Unknown individual “${id}”`);
  return node;
}

export function parseKnowledgeBase(tboxText: string, aboxText: string): KnowledgeBase {
  const kb: KnowledgeBase = { tbox: [], abox: [], roles: [] };
  const lines = (s: string) => s.split(/\r?\n/).map((text, i) => ({ text: text.replace(/#.*/, '').trim(), line: i + 1 })).filter(x => x.text);
  for (const { text, line } of lines(tboxText)) {
    const m = text.match(/^(.+?)\s*(<=|⊑|=|≡)\s*(.+)$/);
    if (!m) throw new Error(`TBox line ${line}: expected C <= D or C = D`);
    try { const left = parseConcept(m[1]), right = parseConcept(m[3]); kb.tbox.push({ left, right }); if (m[2] === '=' || m[2] === '≡') kb.tbox.push({ left: right, right: left }); }
    catch (e) { throw new Error(`TBox line ${line}: ${(e as Error).message}`); }
  }
  for (const { text, line } of lines(aboxText)) {
    const role = text.match(/^([A-Za-z_][\w-]*)\(([A-Za-z_][\w-]*)\s*,\s*([A-Za-z_][\w-]*)\)$/);
    if (role) { kb.roles.push({ role: role[1], from: role[2], to: role[3] }); continue; }
    const colon = text.match(/^([A-Za-z_][\w-]*)\s*:\s*(.+)$/);
    const call = text.match(/^(.+)\(\s*([A-Za-z_][\w-]*)\s*\)$/);
    if (!colon && !call) throw new Error(`ABox line ${line}: expected C(alice) or r(alice,bob)`);
    try { kb.abox.push({ individual: colon ? colon[1] : call![2], concept: parseConcept(colon ? colon[2] : call![1]) }); }
    catch (e) { throw new Error(`ABox line ${line}: ${(e as Error).message}`); }
  }
  if (!kb.abox.length && !kb.roles.length) throw new Error('Add at least one ABox assertion');
  return kb;
}

export function initialGraph(kb: KnowledgeBase): CompletionGraph {
  const g: CompletionGraph = { nodes: [], edges: [], nextWitness: 1 };
  const node = (id: string) => { let n = g.nodes.find(x => x.id === id); if (!n) { n = { id, labels: [] }; g.nodes.push(n); } return n; };
  kb.abox.forEach(x => addLabel(node(x.individual), x.concept));
  kb.roles.forEach(x => { node(x.from); node(x.to); g.edges.push({ ...x }); });
  return g;
}
export function clash(n: GraphNode): string | undefined {
  if (n.labels.some(x => x.kind === 'bottom')) return `${n.id} contains ⊥`;
  for (const c of n.labels) {
    if (c.kind === 'atom' && hasLabel(n, { kind: 'not', name: c.name }))
      return `${n.id} contains ${c.name} and ¬${c.name}`;
  }
}
