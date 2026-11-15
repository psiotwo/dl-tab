import test from 'node:test';
import assert from 'node:assert/strict';
import { blockedBy, explore, parseConcept, parseKnowledgeBase, show,
  alcRules, subsetBlocking, nodeById, exampleModel, initialGraph } from '../dist/index.js';
import { examples } from '../dist/examples.js';
import { CARD_WIDTH, layoutGraph } from '../dist/layout.js';
import { suggestions } from '../dist/autocomplete.js';

const check = (tbox, abox) => explore(parseKnowledgeBase(tbox, abox));

test('parses concepts and pushes negation inward', () => {
  assert.equal(show(parseConcept('!(A & exists r.B)')), '(¬A ⊔ ∀r.¬B)');
  assert.equal(show(parseConcept('∀r.(A ⊔ ¬B)')), '∀r.(A ⊔ ¬B)');
  assert.equal(show(parseConcept('A ⊓ B')), '(A ⊓ B)');
});
test('finds an open branch with independent witnesses', () => {
  const e = check('', '(∃child.Man ⊓ ∃child.Grandparent ⊓ ∀child.(¬Man ⊔ ¬Grandparent))(jan)');
  assert.equal(e.outcome, 'consistent');
  assert.ok(e.steps.some(s => s.rule === '⊔-rule'));
  assert.ok(e.steps.some(s => s.status === 'open'));
});
test('closes every branch when a TBox and ABox conflict', () => {
  const e = check('Headache ⊑ Pain ⊓ ∀FindingSite.Head\nLeg ⊑ ¬Head', '(Headache ⊓ ∃FindingSite.Leg)(finding1)');
  assert.equal(e.outcome, 'inconsistent');
  assert.ok(e.steps.some(s => s.status === 'closed'));
});
test('propagates a universal restriction over an asserted role edge', () => {
  const e = check('', 'a: forall r.A\nr(a,b)\nb: !A');
  assert.equal(e.outcome, 'inconsistent');
  assert.ok(e.steps.some(s => s.rule === '∀-rule'));
});
test('terminates a cyclic TBox by blocking', () => {
  const e = check('A ⊑ ∃r.A', 'A(a)');
  assert.equal(e.outcome, 'consistent');
  assert.ok(e.steps.some(s => s.status === 'open' && s.graph.nodes.some(n => blockedBy(s.graph, n) === 'a')));
});
test('reports parse errors with line numbers', () => {
  assert.throws(() => parseKnowledgeBase('', 'a: A\nbroken'), /ABox line 2/);
});
test('accepts concept and role assertions', () => {
  const kb = parseKnowledgeBase('', 'Person(alice)\nknows(alice,bob)\n(¬Guest ⊓ Person)(bob)');
  assert.equal(kb.abox.length, 2);
  assert.equal(kb.roles.length, 1);
  assert.equal(explore(kb).outcome, 'consistent');
  assert.equal(explore(parseKnowledgeBase('', 'has-child(mary-jane,bob)\nParent(mary-jane)')).outcome, 'consistent');
});
test('treats top as implicit and closes bottom branches', () => {
  assert.equal(check('', '(⊤ ⊓ A)(a)').outcome, 'consistent');
  assert.equal(check('', '(⊤ ⊔ A)(a)').outcome, 'consistent');
  assert.equal(check('', '⊥(a)').outcome, 'inconsistent');
});
test('applies each ALC rule and the subsumption rule', () => {
  const e = check('A ⊑ ∃r.(B ⊓ C)', '(A ⊓ ∀r.(¬B ⊔ D))(a)');
  for (const name of ['⊑-rule', '⊓-rule', '∀-rule', '⊔-rule', '∃-rule'])
    assert.ok(e.steps.some(s => s.rule === name), `missing ${name}`);
});
test('subset blocking checks generated ancestors only', () => {
  const e = check('A ⊑ ∃r.A', 'A(a)');
  const graph = e.steps.at(-1).graph;
  assert.equal(subsetBlocking.blockedBy(graph, nodeById(graph, 'a')), undefined);
  assert.equal(subsetBlocking.blockedBy(graph, nodeById(graph, 'w1')), 'a');
});
test('rechecks blocking after a universal rule adds a label', () => {
  const e = check('A ⊑ ∃r.A\nA ⊑ ∀r.B', 'A(a)');
  assert.equal(e.outcome, 'consistent');
  assert.ok(e.steps.at(-1).graph.nodes.length >= 3);
});
test('allows a custom rule and blocking policy', () => {
  const kb = parseKnowledgeBase('', '∃r.A(a)');
  let blockingChecks = 0;
  const blocking = { blockedBy(graph, node) {
    blockingChecks++;
    return subsetBlocking.blockedBy(graph, node);
  } };
  const custom = { name: 'demo', find: graph => graph.nodes[0].labels.length === 1
    ? { explanation: 'Add B.', choices: [g => g.nodes[0].labels.push(parseConcept('B'))] }
    : undefined };
  const e = explore(kb, { rules: [custom, ...alcRules], blocking });
  assert.equal(e.outcome, 'consistent');
  assert.ok(e.steps.some(s => s.rule === 'demo'));
  assert.ok(e.steps.at(-1).graph.nodes[0].labels.some(x => show(x) === 'B'));
  assert.ok(blockingChecks > 0);
});
test('reports unknown when a step limit prevents completion', () => {
  const e = explore(parseKnowledgeBase('', '(A ⊓ B)(a)'), { maxSteps: 1 });
  assert.equal(e.outcome, 'limit');
  assert.equal(e.steps.length, 1);
  assert.equal(e.steps[0].status, 'limit');
});
test('snapshot budget covers all sibling branches and preserves valid links', () => {
  const kb = parseKnowledgeBase('', '((A ⊓ ¬A) ⊔ (B ⊓ ¬B))(a)');
  for (const maxSteps of [1, 2, 3, 4]) {
    const e = explore(kb, { maxSteps });
    assert.equal(e.outcome, 'limit');
    assert.equal(e.steps.length, maxSteps);
    assert.ok(e.steps.some(step => step.status === 'limit'));
    for (const step of e.steps)
      for (const child of step.children)
        assert.equal(e.steps[child].parent, step.id);
  }
  assert.equal(explore(kb, { maxSteps: 5 }).outcome, 'inconsistent');
});
test('recognizes terminal graphs at the budget boundary', () => {
  for (const [abox, outcome] of [['A(a)', 'consistent'], ['⊥(a)', 'inconsistent']])
    assert.equal(explore(parseKnowledgeBase('', abox), { maxSteps: 1 }).outcome, outcome);
  assert.equal(explore(parseKnowledgeBase('', '(A ⊔ B)(a)'), { maxSteps: 2 }).outcome, 'consistent');
});
test('rejects invalid snapshot budgets', () => {
  const kb = parseKnowledgeBase('', 'A(a)');
  for (const maxSteps of [0, -1, 1.5, NaN, Infinity])
    assert.throws(() => explore(kb, { maxSteps }), RangeError);
});
test('every preset matches its described outcome', () => {
  for (const example of examples) {
    const e = check(example.tbox, example.abox);
    assert.equal(e.outcome, example.outcome, example.name);
    assert.ok(example.explanation.length > 40, example.name);
  }
});
test('open world: both classifications of Ada remain consistent', () => {
  const example = examples.find(example => example.name.startsWith('Open world'));
  for (const [assertion, expected] of [['Researcher(ada)', true], ['¬Researcher(ada)', false]]) {
    const exploration = check(example.tbox, `${example.abox}\n${assertion}`);
    assert.equal(exploration.outcome, 'consistent');
    const model = exampleModel(exploration.steps.find(step => step.status === 'open').graph);
    const ada = model.individuals.find(i => i.name === 'ada').element;
    assert.equal(model.concepts.find(c => c.name === 'Researcher').members.includes(ada), expected);
  }
});
test('a blocked open graph yields a finite example model', () => {
  const graph = check('Man ⊑ ∃hasParent.Man', 'Man(jan)').steps.at(-1).graph;
  const model = exampleModel(graph);
  assert.deepEqual(model.domain, ['d0']);
  assert.deepEqual(model.individuals, [{ name: 'jan', element: 'd0' }]);
  assert.deepEqual(model.roles.find(role => role.name === 'hasParent').pairs, [['d0', 'd0']]);
  assert.deepEqual(model.concepts.find(c => c.name === 'Man').members, ['d0']);
  assert.ok(model.identified.length > 0);
});
test('example models satisfy their TBox and ABox assertions', () => {
  for (const example of examples.filter(x => x.outcome === 'consistent')) {
    const kb = parseKnowledgeBase(example.tbox, example.abox);
    for (const step of explore(kb).steps.filter(s => s.status === 'open')) {
      const model = exampleModel(step.graph);
      const denotes = name => model.individuals.find(i => i.name === name)?.element;
      const members = name => model.concepts.find(c => c.name === name)?.members ?? [];
      const pairs = role => model.roles.find(r => r.name === role)?.pairs ?? [];
      const holds = (concept, individual) => {
        switch (concept.kind) {
          case 'atom': return members(concept.name).includes(individual);
          case 'not': return !members(concept.name).includes(individual);
          case 'top': return true;
          case 'bottom': return false;
          case 'and': return holds(concept.left, individual) && holds(concept.right, individual);
          case 'or': return holds(concept.left, individual) || holds(concept.right, individual);
          case 'exists': return pairs(concept.role).some(([from, to]) => from === individual && holds(concept.value, to));
          case 'forall': return pairs(concept.role).every(([from, to]) => from !== individual || holds(concept.value, to));
        }
      };
      for (const axiom of kb.tbox)
        for (const individual of model.domain)
          assert.ok(!holds(axiom.left, individual) || holds(axiom.right, individual), `${example.name}: TBox`);
      for (const assertion of kb.abox)
        assert.ok(holds(assertion.concept, denotes(assertion.individual)), `${example.name}: ABox`);
      for (const assertion of kb.roles)
        assert.ok(pairs(assertion.role).some(([from, to]) => from === denotes(assertion.from) && to === denotes(assertion.to)), `${example.name}: role`);
    }
  }
});
test('layout separates generations and routes a skipped generation above', () => {
  const graph = initialGraph(parseKnowledgeBase('', 'r(a,b)\nr(b,c)\nr(c,d)\nr(a,c)'));
  const heights = new Map(graph.nodes.map(node => [node.id, 140]));
  const layout = layoutGraph(graph, heights, label => label.length * 8);
  assert.deepEqual(['a', 'b', 'c', 'd'].map(id => layout.ranks.get(id)), [0, 1, 2, 3]);
  assert.equal(layout.edges.filter(edge => edge.route === 'above').length, 1);
  assert.ok(layout.positions.get('b').x < layout.positions.get('c').x);
  const gap = layout.positions.get('b').x - layout.positions.get('a').x - CARD_WIDTH;
  assert.ok(gap >= Math.max(...layout.edges.map(edge => edge.labelWidth)) + 40);
  const model = exampleModel(graph);
  assert.deepEqual(['a', 'b', 'c', 'd']
    .map(name => model.individuals.find(i => i.name === name).element), ['d0', 'd1', 'd2', 'd3']);
});
test('layout handles ABox cycles and groups role labels on one edge', () => {
  const graph = initialGraph(parseKnowledgeBase('', 'r(a,b)\ns(a,b)\nr(b,a)'));
  const layout = layoutGraph(graph, new Map(graph.nodes.map(node => [node.id, 140])), label => label.length * 8);
  assert.equal(layout.edges.length, 2);
  assert.ok(layout.edges.some(edge => edge.label === 'r, s'));
  assert.ok(layout.edges.some(edge => edge.route === 'below'));
});
test('traversal includes disconnected roots, cycles, and isolated individuals', () => {
  const graph = initialGraph(parseKnowledgeBase('', 'A(z)\nr(a,b)\nr(c,d)\nr(d,c)'));
  const layout = layoutGraph(graph, new Map(graph.nodes.map(node => [node.id, 140])), () => 8);
  assert.deepEqual([...layout.ranks], [['z', 0], ['a', 0], ['b', 1], ['c', 0], ['d', 1]]);
  assert.deepEqual(exampleModel(graph).individuals.map(i => i.name), graph.nodes.map(n => n.id));
  assert.equal(exampleModel(graph).domain.length, graph.nodes.length);
});
test('autocomplete suggests syntax according to the cursor context', () => {
  const items = (kind, text, caret = text.length) => suggestions(kind, text, caret).items.map(item => item.insert);
  assert.deepEqual(items('tbox', ''), ['C ⊑ D', 'C ≡ D']);
  assert.deepEqual(items('tbox', 'Headache'), [' ⊑ ', ' ≡ ']);
  assert.ok(items('tbox', 'Headache ⊑ ').includes('∃r.C'));
  assert.deepEqual(items('tbox', 'Headache ⊑ ∃'), ['r.C']);
  assert.deepEqual(items('tbox', 'Headache ⊑ ∃hasChild'), ['.']);
  assert.deepEqual(items('tbox', 'Headache ⊑ Head'), []);
  assert.deepEqual(suggestions('tbox', 'Headache ⊑ Head', 15, true).items.map(item => item.insert), [' ⊓ ', ' ⊔ ']);
  assert.deepEqual(items('abox', ''), ['C(a)', 'r(a,b)']);
  assert.deepEqual(items('abox', 'Headache'), ['(a)', '(a,b)']);
  assert.deepEqual(items('abox', '(A ⊓ B)'), ['(a)']);
  assert.deepEqual(items('abox', 'hasChild()', 'hasChild('.length), ['a', 'a,b']);
  assert.deepEqual(items('abox', 'hasChild(a,)', 'hasChild(a,'.length), ['b']);
});
