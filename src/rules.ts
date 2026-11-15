import { addLabel, hasLabel, negate, nodeById, show,
  type CompletionGraph, type Concept, type Gci, type GraphNode } from './logic.js';

export interface BlockingPolicy {
  blockedBy(graph: CompletionGraph, node: GraphNode): string | undefined;
}

// Ancestor subset blocking terminates cyclic ALC expansions.
export const subsetBlocking: BlockingPolicy = {
  blockedBy(graph, node) {
    let ancestor = node.parent ? nodeById(graph, node.parent) : undefined;
    while (ancestor) {
      const candidate = ancestor;
      if (node.labels.every(label => hasLabel(candidate, label))) return candidate.id;
      ancestor = ancestor.parent ? nodeById(graph, ancestor.parent) : undefined;
    }
  },
};

export const blockedBy = (graph: CompletionGraph, node: GraphNode): string | undefined =>
  subsetBlocking.blockedBy(graph, node);

export interface RuleContext {
  inclusions: { axiom: Gci; concept: Concept }[];
  blocking: BlockingPolicy;
}

export interface RuleApplication {
  explanation: string;
  // Each choice mutates a separate copy of the current graph.
  choices: ((graph: CompletionGraph) => void)[];
}

export interface InferenceRule {
  name: string;
  find(graph: CompletionGraph, context: RuleContext): RuleApplication | undefined;
}

function firstLabel(
  graph: CompletionGraph,
  match: (node: GraphNode, concept: Concept) => RuleApplication | undefined,
): RuleApplication | undefined {
  for (const node of graph.nodes)
    for (const concept of node.labels) {
      const application = match(node, concept);
      if (application) return application;
    }
}

export const subsumptionRule: InferenceRule = {
  name: '⊑-rule',
  find(graph, { inclusions }) {
    for (const node of graph.nodes)
      for (const { axiom, concept } of inclusions)
        if (!hasLabel(node, concept)) return {
          explanation: `Apply ${show(axiom.left)} ⊑ ${show(axiom.right)} to ${node.id}: add ${show(concept)}.`,
          choices: [g => addLabel(nodeById(g, node.id), concept)],
        };
  },
};

export const conjunctionRule: InferenceRule = {
  name: '⊓-rule',
  find: graph => firstLabel(graph, (node, concept) => {
    if (concept.kind !== 'and' || (hasLabel(node, concept.left) && hasLabel(node, concept.right))) return;
    return {
      explanation: `${node.id} has ${show(concept)}; both parts must hold.`,
      choices: [g => {
        const target = nodeById(g, node.id);
        addLabel(target, concept.left);
        addLabel(target, concept.right);
      }],
    };
  }),
};

export const universalRule: InferenceRule = {
  name: '∀-rule',
  find: graph => firstLabel(graph, (node, concept) => {
    if (concept.kind !== 'forall') return;
    const edge = graph.edges.find(e => e.from === node.id && e.role === concept.role
      && !hasLabel(nodeById(graph, e.to), concept.value));
    if (!edge) return;
    return {
      explanation: `${node.id} has ${show(concept)} and ${edge.role}(${node.id},${edge.to}); add ${show(concept.value)} to ${edge.to}.`,
      choices: [g => addLabel(nodeById(g, edge.to), concept.value)],
    };
  }),
};

export const disjunctionRule: InferenceRule = {
  name: '⊔-rule',
  find: graph => firstLabel(graph, (node, concept) => {
    if (concept.kind !== 'or' || hasLabel(node, concept.left) || hasLabel(node, concept.right)) return;
    return {
      explanation: `${node.id} has ${show(concept)}. Explore each alternative in its own branch.`,
      choices: [concept.left, concept.right].map(part => g => addLabel(nodeById(g, node.id), part)),
    };
  }),
};

export const existentialRule: InferenceRule = {
  name: '∃-rule',
  find: (graph, { blocking }) => firstLabel(graph, (node, concept) => {
    if (concept.kind !== 'exists' || blocking.blockedBy(graph, node)) return;
    const witnessed = graph.edges.some(e => e.from === node.id && e.role === concept.role
      && hasLabel(nodeById(graph, e.to), concept.value));
    if (witnessed) return;
    return {
      explanation: `${node.id} needs a ${concept.role}-successor satisfying ${show(concept.value)}. Create a fresh witness.`,
      choices: [g => {
        let id: string;
        do { id = `w${g.nextWitness++}`; } while (g.nodes.some(n => n.id === id));
        g.nodes.push({ id, parent: node.id, labels: [concept.value] });
        g.edges.push({ from: node.id, to: id, role: concept.role });
      }],
    };
  }),
};

// Priority is explicit: deterministic rules, then branching, then fresh witnesses.
export const alcRules: readonly InferenceRule[] = [
  subsumptionRule, conjunctionRule, universalRule, disjunctionRule, existentialRule,
];

export function compileInclusions(tbox: Gci[]): RuleContext['inclusions'] {
  return tbox.map(axiom => ({ axiom, concept: { kind: 'or', left: negate(axiom.left), right: axiom.right } }));
}
