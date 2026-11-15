import type { CompletionGraph } from './logic.js';

// Visit roots first, then any disconnected cycles. Map order is traversal order.
export function breadthFirstRanks(graph: CompletionGraph): Map<string, number> {
  const incoming = new Set(graph.edges.map(edge => edge.to));
  const outgoing = new Map(graph.nodes.map(node => [node.id, [] as string[]]));
  for (const edge of graph.edges) outgoing.get(edge.from)!.push(edge.to);
  const starts = [...graph.nodes.filter(node => !incoming.has(node.id)), ...graph.nodes];
  const ranks = new Map<string, number>();
  for (const start of starts) {
    if (ranks.has(start.id)) continue;
    ranks.set(start.id, 0);
    const queue = [start.id];
    for (const id of queue)
      for (const to of outgoing.get(id)!)
        if (!ranks.has(to)) {
          ranks.set(to, ranks.get(id)! + 1);
          queue.push(to);
        }
  }
  return ranks;
}
