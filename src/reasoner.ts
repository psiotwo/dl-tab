import { clash, initialGraph, type CompletionGraph, type KnowledgeBase } from './logic.js';
import { alcRules, compileInclusions, subsetBlocking,
  type BlockingPolicy, type InferenceRule, type RuleContext } from './rules.js';

export type Status = 'active' | 'open' | 'closed' | 'limit';
export interface Step {
  id: number;
  parent?: number;
  depth: number;
  rule: string;
  explanation: string;
  graph: CompletionGraph;
  status: Status;
  children: number[];
}
export interface Exploration {
  steps: Step[];
  outcome: 'consistent' | 'inconsistent' | 'limit';
}
export interface ReasonerOptions {
  maxSteps?: number;
  rules?: readonly InferenceRule[];
  blocking?: BlockingPolicy;
}

export function explore(kb: KnowledgeBase, options: ReasonerOptions = {}): Exploration {
  const { maxSteps = 400, rules = alcRules, blocking = subsetBlocking } = options;
  const context: RuleContext = { inclusions: compileInclusions(kb.tbox), blocking };
  const steps: Step[] = [];
  let open = false, limited = false;

  function visit(graph: CompletionGraph, parent: number | undefined, rule: string,
    explanation: string, depth: number): number {
    const id = steps.length;
    const step: Step = { id, parent, depth, rule, explanation, graph, status: 'active', children: [] };
    steps.push(step);

    if (id >= maxSteps) { step.status = 'limit'; limited = true; return id; }
    const conflict = graph.nodes.map(clash).find(Boolean);
    if (conflict) {
      step.status = 'closed';
      step.explanation += ` Direct clash: ${conflict}. This branch closes.`;
      return id;
    }
    let match: { rule: InferenceRule; application: NonNullable<ReturnType<InferenceRule['find']>> } | undefined;
    for (const candidate of rules) {
      const application = candidate.find(graph, context);
      if (application) { match = { rule: candidate, application }; break; }
    }
    if (!match?.application) {
      step.status = 'open';
      step.explanation += ' No rule applies and there is no direct clash: this completion graph is complete and the branch is open.';
      open = true;
      return id;
    }
    const { rule: appliedRule, application } = match;
    application.choices.forEach((change, i) => {
      const next = structuredClone(graph);
      change(next);
      const choice = application.choices.length > 1 ? ` Choice ${i + 1}.` : '';
      step.children.push(visit(next, id, appliedRule.name, application.explanation + choice, depth + 1));
    });
    return id;
  }

  visit(initialGraph(kb), undefined, 'Start', 'Initial ABox assertions.', 0);
  return { steps, outcome: open ? 'consistent' : limited ? 'limit' : 'inconsistent' };
}
