import { blockedBy, clash, exampleModel, explore, parseKnowledgeBase, show,
  type CompletionGraph, type ExampleModel, type Exploration, type KnowledgeBase } from './index.js';
import { examples } from './examples.js';
import { CARD_WIDTH, layoutGraph } from './layout.js';
import { attachAutocomplete } from './autocomplete.js';
import type { GraphNode } from './logic.js';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
let result: Exploration | undefined;
let selected = 0;
const expandedNodes = new Set<string>();

const select = $('example') as HTMLSelectElement;
const tboxEditor = $('tbox') as HTMLTextAreaElement;
const aboxEditor = $('abox') as HTMLTextAreaElement;
const parseError = $('parse-error');
let activeEditor = aboxEditor;
[tboxEditor, aboxEditor].forEach(editor => editor.addEventListener('focus', () => { activeEditor = editor; }));
let validationTimer: ReturnType<typeof setTimeout>;
function showSyntaxError(message = ''): void {
  parseError.textContent = message;
  tboxEditor.removeAttribute('aria-invalid');
  aboxEditor.removeAttribute('aria-invalid');
  if (message) (message.startsWith('TBox') ? tboxEditor : aboxEditor).setAttribute('aria-invalid', 'true');
}
function readKnowledgeBase(): KnowledgeBase | undefined {
  try {
    const kb = parseKnowledgeBase(tboxEditor.value, aboxEditor.value);
    showSyntaxError();
    return kb;
  } catch (error) {
    showSyntaxError((error as Error).message);
  }
}
for (const [editor, kind] of [[tboxEditor, 'tbox'], [aboxEditor, 'abox']] as const)
  attachAutocomplete(editor, kind, () => {
    result = undefined;
    $('results').hidden = true;
    clearTimeout(validationTimer);
    validationTimer = setTimeout(readKnowledgeBase, 400);
  });
document.querySelectorAll<HTMLButtonElement>('.symbol-toolkit button').forEach(button => button.addEventListener('click', () => {
  const editor = button.dataset.target === 'tbox' ? tboxEditor : activeEditor;
  const start = editor.selectionStart, end = editor.selectionEnd;
  const selectedText = editor.value.slice(start, end);
  const token = button.dataset.insert || '';
  const insertion = token === '()' ? `(${selectedText})` : token === '¬' && selectedText ? `¬(${selectedText})` : token;
  editor.setRangeText(insertion, start, end, 'end');
  const caret = start + insertion.length + Number(button.dataset.caret || 0);
  editor.focus(); editor.setSelectionRange(caret, caret);
  editor.dispatchEvent(new Event('input'));
}));
examples.forEach((x, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = x.name; select.append(o); });
function loadExample(): void {
  const example = examples[Number(select.value)];
  tboxEditor.value = example.tbox;
  aboxEditor.value = example.abox;
  $('example-explanation').textContent = example.explanation;
  run();
}
function run(): void {
  clearTimeout(validationTimer);
  const kb = readKnowledgeBase();
  if (!kb) return;
  result = explore(kb);
  $('results').hidden = false;
  selectStep(0);
}
function render(): void {
  if (!result) return;
  const status = $('outcome'); status.textContent = result.outcome === 'consistent' ? 'CONSISTENT · open branch' : result.outcome === 'inconsistent' ? 'INCONSISTENT · all branches closed' : 'LIMIT REACHED';
  status.className = `outcome ${result.outcome}`;
  const trace = $('trace'); trace.replaceChildren();
  result.steps.forEach(s => {
    const b = document.createElement('button'); b.className = `trace-step ${s.status} ${s.id === selected ? 'selected' : ''}`;
    b.style.paddingLeft = `${12 + Math.min(s.depth, 10) * 14}px`;
    b.textContent = `${s.id + 1}. ${s.rule} · ${s.status === 'active' ? 'expand' : s.status}`;
    b.title = s.explanation; b.onclick = () => selectStep(s.id); trace.append(b);
  });
  const step = result.steps[selected];
  $('step-title').textContent = `Step ${selected + 1}/${result.steps.length} · ${step.rule}`;
  $('step-explanation').textContent = step.explanation;
  ($('prev') as HTMLButtonElement).disabled = selected === 0;
  ($('next') as HTMLButtonElement).disabled = selected === result.steps.length - 1;
  const model = step.status === 'open' ? exampleModel(step.graph) : undefined;
  renderGraph(step.graph, model);
  const panel = $('model-panel') as HTMLDetailsElement;
  panel.hidden = !model;
  if (model) renderModel(model);
}
function renderModel(model: ExampleModel): void {
  const content = $('model-content');
  const list = document.createElement('dl');
  const row = (name: string, value: string) => {
    const term = document.createElement('dt'); term.textContent = name;
    const superscript = document.createElement('sup'); superscript.textContent = '𝓘'; term.append(superscript);
    const definition = document.createElement('dd'); definition.textContent = value;
    list.append(term, definition);
  };
  row('Δ', `{${model.domain.join(', ')}}`);
  model.individuals.forEach(i => row(i.name, i.element));
  model.concepts.forEach(c => row(c.name, `{${c.members.join(', ')}}`));
  model.roles.forEach(r => row(r.name, `{${r.pairs.map(([a, b]) => `⟨${a}, ${b}⟩`).join(', ')}}`));
  const notation = document.createElement('p');
  notation.textContent = 'Names are symbols; d0, d1, … are domain elements. Different names may share an element or a set.';
  content.replaceChildren(notation, list);
  if (model.witnesses.length) {
    const note = document.createElement('p');
    note.textContent = `Graph witnesses: ${model.witnesses.map(x => {
      const blocked = model.identified.find(y => y.node === x.node);
      return `${x.node} → ${x.element}${blocked ? ` (blocked by ${blocked.blocker})` : ''}`;
    }).join(', ')}.`;
    content.append(note);
  }
}
function svg(tag: string, attributes: Record<string, string>): SVGElement {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attributes)) e.setAttribute(k, v);
  return e;
}
function nodeCard(node: GraphNode, element: string | undefined, blocker: string | undefined,
  expanded: boolean, toggle: () => void): HTMLDivElement {
  const card = document.createElement('div');
  card.className = `node-card ${expanded ? 'expanded' : ''} ${clash(node) ? 'clash' : blocker ? 'blocked' : ''}`;
  card.title = node.parent ? 'Generated witness' : 'ABox individual';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-expanded', String(expanded));
  card.setAttribute('aria-label', `Node ${node.id}; ${node.labels.length} concepts in its label; click to ${expanded ? 'collapse' : 'expand'}`);

  const heading = document.createElement('strong');
  heading.textContent = node.id;
  if (element) {
    const denotation = document.createElement('span');
    denotation.className = 'denotation';
    denotation.textContent = `↦ ${element}`;
    heading.append(denotation);
  }
  card.append(heading);
  if (blocker) {
    const note = document.createElement('span');
    note.className = 'blocked-note';
    note.textContent = `blocked by ${blocker}`;
    card.append(note);
  }
  const list = document.createElement('ul');
  for (const concept of expanded ? node.labels : node.labels.slice(0, 2)) {
    const item = document.createElement('li');
    item.textContent = show(concept);
    list.append(item);
  }
  if (!node.labels.length) {
    const item = document.createElement('li');
    item.textContent = 'Empty label';
    list.append(item);
  }
  card.append(list);
  if (!expanded && node.labels.length > 2) {
    const more = document.createElement('small');
    more.textContent = `+${node.labels.length - 2} more · click to expand`;
    card.append(more);
  }
  card.addEventListener('click', toggle);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
  return card;
}
function renderGraph(g: CompletionGraph, model?: ExampleModel): void {
  const host = $('graph'); host.replaceChildren();
  const elements = new Map<string, string>([...(model?.individuals ?? []), ...(model?.witnesses ?? [])]
    .map(item => ['name' in item ? item.name : item.node, item.element]));
  const measure = document.createElement('div');
  measure.className = 'graph-measure';
  host.append(measure);
  const cards = new Map<string, { card: HTMLDivElement; height: number }>();
  for (const node of g.nodes) {
    const expanded = expandedNodes.has(node.id);
    const blocker = blockedBy(g, node);
    const toggle = () => {
      if (expanded) expandedNodes.delete(node.id); else expandedNodes.add(node.id);
      renderGraph(g, model);
    };
    const card = nodeCard(node, elements.get(node.id), blocker, expanded, toggle);
    measure.append(card);
    cards.set(node.id, { card, height: Math.ceil(card.getBoundingClientRect().height) });
  }
  const context = document.createElement('canvas').getContext('2d');
  if (context) context.font = '700 13px Inter, sans-serif';
  const layout = layoutGraph(g, new Map([...cards].map(([id, value]) => [id, value.height])),
    label => context?.measureText(label).width ?? label.length * 8);
  const canvas = svg('svg', { viewBox: `0 0 ${layout.width} ${layout.height}`, width: String(layout.width), height: String(layout.height), role: 'img', 'aria-label': 'Completion graph' });
  const defs = svg('defs', {}), marker = svg('marker', { id: 'edge-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto' });
  marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#4b6485' }));
  defs.append(marker); canvas.append(defs);
  for (const edge of layout.edges)
    canvas.append(svg('path', { d: edge.path, class: 'graph-edge', 'marker-end': 'url(#edge-arrow)' }));
  for (const edge of layout.edges) {
    const tag = svg('g', { class: 'edge-tag' });
    tag.append(svg('rect', { x: String(edge.labelX - edge.labelWidth / 2 - 7), y: String(edge.labelY - 14), width: String(edge.labelWidth + 14), height: '20', rx: '4' }));
    const label = svg('text', { x: String(edge.labelX), y: String(edge.labelY), 'text-anchor': 'middle', class: 'edge-label' });
    label.textContent = edge.label; tag.append(label); canvas.append(tag);
  }
  for (const n of g.nodes) {
    const p = layout.positions.get(n.id)!, { card, height: cardHeight } = cards.get(n.id)!;
    const box = svg('foreignObject', { x: String(p.x - CARD_WIDTH / 2), y: String(p.y - cardHeight / 2), width: String(CARD_WIDTH), height: String(cardHeight) });
    box.append(card); canvas.append(box);
  }
  measure.remove();
  host.append(canvas);
}
select.addEventListener('change', loadExample);
$('run').addEventListener('click', run);
function selectStep(index: number): void {
  if (!result || index < 0 || index >= result.steps.length) return;
  selected = index;
  expandedNodes.clear();
  result.steps[index].graph.nodes.forEach(node => expandedNodes.add(node.id));
  ($('model-panel') as HTMLDetailsElement).open = false;
  render();
}
$('prev').addEventListener('click', () => selectStep(selected - 1));
$('next').addEventListener('click', () => selectStep(selected + 1));
document.addEventListener('keydown', e => { if (e.target instanceof HTMLTextAreaElement) return; if (e.key === 'ArrowRight') $('next').click(); if (e.key === 'ArrowLeft') $('prev').click(); });
loadExample();
