import type { CompletionGraph } from './logic.js';

export const CARD_WIDTH = 208;
type Point = { x: number; y: number };
export interface DrawEdge {
  path: string;
  label: string;
  labelX: number;
  labelY: number;
  labelWidth: number;
  route: 'direct' | 'above' | 'below';
}
export interface GraphLayout {
  width: number;
  height: number;
  positions: Map<string, Point>;
  edges: DrawEdge[];
  ranks: Map<string, number>;
}

function ranksOf(graph: CompletionGraph): Map<string, number> {
  const ranks = new Map(graph.nodes.map(node => [node.id, 0]));
  for (let pass = 0; pass < graph.nodes.length; pass++) {
    let changed = false;
    for (const edge of graph.edges) {
      const next = ranks.get(edge.from)! + 1;
      if (next > ranks.get(edge.to)!) { ranks.set(edge.to, next); changed = true; }
    }
    if (!changed) return ranks;
  }
  // ABox cycles have no topological order; use shortest paths from roots instead.
  const fallback = new Map<string, number>();
  const incoming = new Set(graph.edges.map(edge => edge.to));
  const outgoing = new Map(graph.nodes.map(node => [node.id, [] as string[]]));
  for (const edge of graph.edges) outgoing.get(edge.from)!.push(edge.to);
  const roots = graph.nodes.filter(node => !incoming.has(node.id)).map(node => node.id);
  for (const start of [...roots, ...graph.nodes.map(node => node.id)]) {
    if (fallback.has(start)) continue;
    fallback.set(start, 0);
    const queue = [start];
    for (const id of queue)
      for (const to of outgoing.get(id)!)
        if (!fallback.has(to)) { fallback.set(to, fallback.get(id)! + 1); queue.push(to); }
  }
  return fallback;
}

export function layoutGraph(
  graph: CompletionGraph,
  heights: Map<string, number>,
  textWidth: (label: string) => number,
): GraphLayout {
  const ranks = ranksOf(graph);
  const groups = new Map<number, string[]>();
  for (const node of graph.nodes) {
    const rank = ranks.get(node.id)!;
    groups.set(rank, [...(groups.get(rank) ?? []), node.id]);
  }
  // Order nodes near their predecessors to reduce crossings within adjacent layers.
  const order = new Map<string, number>();
  const incoming = new Map(graph.nodes.map(node => [node.id, [] as string[]]));
  for (const edge of graph.edges) incoming.get(edge.to)!.push(edge.from);
  for (const rank of [...groups.keys()].sort((a, b) => a - b)) {
    const ids = groups.get(rank)!;
    if (rank) ids.sort((a, b) => {
      const score = (id: string) => {
        const predecessors = incoming.get(id)!.filter(from => ranks.get(from)! < rank);
        return predecessors.length ? predecessors.reduce((sum, from) => sum + (order.get(from) ?? 0), 0) / predecessors.length : Infinity;
      };
      return score(a) - score(b);
    });
    ids.forEach((id, index) => order.set(id, index));
  }

  const pairs = new Map<string, { from: string; to: string; roles: Set<string> }>();
  for (const edge of graph.edges) {
    const key = `${edge.from}\0${edge.to}`;
    if (!pairs.has(key)) pairs.set(key, { from: edge.from, to: edge.to, roles: new Set() });
    pairs.get(key)!.roles.add(edge.role);
  }
  const visualEdges = [...pairs.values()].map(pair => ({ ...pair, label: [...pair.roles].join(', ') }));
  const longCount = visualEdges.filter(edge => ranks.get(edge.to)! > ranks.get(edge.from)! + 1).length;
  const backCount = visualEdges.filter(edge => ranks.get(edge.to)! <= ranks.get(edge.from)!).length;
  const gap = Math.max(120, ...visualEdges.map(edge => Math.ceil(textWidth(edge.label)) + 48));
  const spacing = CARD_WIDTH + gap;
  const topPadding = 46 + longCount * 28, bottomPadding = 46 + backCount * 28;
  const columnHeight = (ids: string[]) => ids.reduce((sum, id) => sum + heights.get(id)!, 0) + Math.max(0, ids.length - 1) * 36;
  const height = Math.max(350, ...[...groups.values()].map(ids => columnHeight(ids) + topPadding + bottomPadding));
  const width = Math.max(640, 48 + CARD_WIDTH + Math.max(...groups.keys()) * spacing);
  const positions = new Map<string, Point>();
  for (const rank of [...groups.keys()].sort((a, b) => a - b)) {
    const ids = groups.get(rank)!;
    let y = topPadding + (height - topPadding - bottomPadding - columnHeight(ids)) / 2;
    for (const id of ids) {
      const nodeHeight = heights.get(id)!;
      positions.set(id, { x: 24 + CARD_WIDTH / 2 + rank * spacing, y: y + nodeHeight / 2 });
      y += nodeHeight + 36;
    }
  }

  let above = 0, below = 0;
  const edges: DrawEdge[] = visualEdges.map(edge => {
    const source = positions.get(edge.from)!, target = positions.get(edge.to)!;
    const difference = ranks.get(edge.to)! - ranks.get(edge.from)!;
    const labelWidth = Math.ceil(textWidth(edge.label));
    let path: string, labelX: number, labelY: number, route: DrawEdge['route'];
    const forward = difference > 0;
    const x1 = source.x + (forward ? 1 : -1) * CARD_WIDTH / 2;
    const x2 = target.x - (forward ? 1 : -1) * (CARD_WIDTH / 2 + 5);
    if (difference === 1) {
      path = `M ${x1} ${source.y} L ${x2} ${target.y}`;
      labelX = (x1 + x2) / 2; labelY = (source.y + target.y) / 2 - 12; route = 'direct';
    } else {
      const bend1 = x1 + (forward ? 20 : -20), bend2 = x2 - (forward ? 20 : -20);
      const track = forward ? topPadding - 24 - above++ * 28 : height - bottomPadding + 24 + below++ * 28;
      path = `M ${x1} ${source.y} L ${bend1} ${source.y} L ${bend1} ${track} L ${bend2} ${track} L ${bend2} ${target.y} L ${x2} ${target.y}`;
      labelX = (bend1 + bend2) / 2; labelY = track - 8; route = forward ? 'above' : 'below';
    }
    return { path, label: edge.label, labelX, labelY, labelWidth, route };
  });
  return { width, height, positions, edges, ranks };
}
