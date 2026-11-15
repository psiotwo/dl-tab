import type { CompletionGraph, Concept } from './logic.js';
import { blockedBy } from './rules.js';
import { breadthFirstRanks } from './graph.js';

export interface ExampleModel {
  domain: string[];
  individuals: { name: string; element: string }[];
  witnesses: { node: string; element: string }[];
  concepts: { name: string; members: string[] }[];
  roles: { name: string; pairs: [string, string][] }[];
  identified: { node: string; blocker: string; element: string }[];
}

function atomicNames(concept: Concept, names: Set<string>): void {
  switch (concept.kind) {
    case 'atom': case 'not': names.add(concept.name); break;
    case 'and': case 'or': atomicNames(concept.left, names); atomicNames(concept.right, names); break;
    case 'exists': case 'forall': atomicNames(concept.value, names); break;
  }
}

// A complete open graph gives a finite interpretation. Blocked nodes reuse an ancestor.
export function exampleModel(graph: CompletionGraph): ExampleModel {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const representativesById = new Map<string, string>();
  const representative = (id: string): string => {
    const cached = representativesById.get(id);
    if (cached) return cached;
    let node = nodes.get(id)!;
    let blocker: string | undefined;
    while ((blocker = blockedBy(graph, node))) node = nodes.get(blocker)!;
    representativesById.set(id, node.id);
    return node.id;
  };
  const ordered = [...breadthFirstRanks(graph).keys()];
  const representatives = [...new Set(ordered.map(representative))];
  const elements = new Map(representatives.map((id, index) => [id, `d${index}`]));
  const elementOf = (id: string): string => elements.get(representative(id))!;
  const domain = [...elements.values()];
  const individuals = graph.nodes.filter(node => !node.parent)
    .map(node => ({ name: node.id, element: elementOf(node.id) }));
  const witnesses = graph.nodes.filter(node => node.parent)
    .map(node => ({ node: node.id, element: elementOf(node.id) }));
  const names = new Set<string>();
  graph.nodes.forEach(node => node.labels.forEach(concept => atomicNames(concept, names)));
  const concepts = [...names].sort().map(name => ({
    name,
    members: [...new Set(graph.nodes.filter(node => node.labels.some(c => c.kind === 'atom' && c.name === name))
      .map(node => elementOf(node.id)))],
  }));
  const roleNames = [...new Set(graph.edges.map(edge => edge.role))].sort();
  const roles = roleNames.map(name => ({
    name,
    pairs: [...new Map(graph.edges.filter(edge => edge.role === name).map(edge => {
      const pair: [string, string] = [elementOf(edge.from), elementOf(edge.to)];
      return [JSON.stringify(pair), pair];
    })).values()],
  }));
  const identified = graph.nodes.flatMap(node => {
    const blocker = representative(node.id);
    return blocker === node.id ? [] : [{ node: node.id, blocker, element: elementOf(node.id) }];
  });
  return { domain, individuals, witnesses, concepts, roles, identified };
}
