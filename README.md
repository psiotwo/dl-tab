# DL-TAB

DL-TAB (Description Logic Tableau) is a small browser demo for ALC. It shows the expansion trace, branching, direct clashes, subset blocking, and the label of each completion-graph node. Nodes show their full labels by default; click one to collapse it. The code is plain TypeScript with no UI framework.

```sh
npm install
npm run dev
```

Open <http://localhost:5173>. The development server binds to IPv4 loopback and serves only the HTML, CSS, and compiled JavaScript assets. `npm test` runs parser, reasoning, layout, completion, and server checks. `npm run build` compiles the TypeScript to `dist/`.

The example picker starts with a single existential witness, a disjunction with one closed branch, and a one-person open-world example. Child and clinical cases, a cyclic TBox, and nested restrictions follow. Each preset explains its expected result and the inference rules to watch.

Requires Node.js 22 or newer. See [Contributing](CONTRIBUTING.md) for versioning, automated checks, and GitHub setup, and [Security](SECURITY.md) for vulnerability reporting.

## Input

Write one statement per line. Examples:

```text
# TBox
Headache ⊑ Pain ⊓ ∀FindingSite.Head
Leg ⊑ ¬Head

# ABox
(Headache ⊓ ∃FindingSite.Leg)(finding1)
```

Supported concept operators: `¬`, `⊓`, `⊔`, `∃`, `∀`, `⊤`, `⊥`. The toolbar inserts them at the cursor; `⊑` and `≡` always go into the TBox. After `∃` or `∀`, type a role, a dot, and a concept, for example `∃child.Person`. Use parentheses for grouping. ASCII `!`, `&`, `|`, `exists`, `forall`, `top`, `bottom`, `<=`, and `=` also work. A TBox line is `C ⊑ D` (or `C ≡ D` for equivalence). An ABox line is `C(individual)` or `role(individual,individual)`. The earlier `individual: C` form also works.

Syntax help sits with the symbol toolbar. The editors close typed parentheses and suggest the next structural fragment according to the TBox/ABox cursor position: inclusions, assertions, concept constructors, role separators, and individual arguments. `Ctrl+Space` reopens suggestions. Arrow keys select one; Enter or Tab inserts it. Syntax is checked after a short pause, showing the first error and its line number. Editing hides the previous tableau until it is rebuilt.

The tableau algorithm internalizes each TBox inclusion as `¬C ⊔ D` at every node, then applies the `⊓`, `∀`, `⊔`, and `∃` inference rules. A complete completion graph without a direct clash gives an open branch and shows that the knowledge base is consistent. If every branch closes with a direct clash, it is inconsistent. Cyclic TBoxes use ancestor subset blocking on generated nodes.

The result concerns **knowledge-base consistency**. To test whether a concept `C` is satisfiable with respect to a TBox, assert `C(a)` for a fresh individual `a` and check whether the resulting knowledge base is consistent.

Each complete open branch offers an example interpretation `𝓘`. The graph uses individual names (`jan`) and generated witness names (`w1`), with their denotations shown on the nodes. Neutral domain elements keep syntax and semantics separate: `jan^𝓘 = d0`, `A^𝓘 = {d0}`, and `r^𝓘 = {⟨d0,d1⟩}`. A blocked witness can map to the same element as its blocker, for example `jan → d0` and `w1 → d0`. Different individual names may denote one element, and different concept names may have one extension; the example model chooses one interpretation.

## Extending the reasoner

`src/rules.ts` contains the five independent rule objects and the `BlockingPolicy` interface. A rule finds one applicable match and returns graph changes, one per branch. `src/reasoner.ts` applies each change to a separate graph copy and records the trace. Pass a custom ordered `rules` array or `blocking` policy to `explore(kb, { rules, blocking })`. Rule order controls which explanation students see first. The default order applies deterministic rules before branching and witness creation.

This is a deliberately small teaching implementation of **ALC**, not a production OWL reasoner. It stops after 400 snapshots and reports an unknown result if that limit prevents a conclusion. For a cyclic TBox, a blocked completion graph represents a finite model by folding blocked nodes back to their blockers; the UI shows the blocking relationship.

`maxSteps` must be a positive safe integer and caps the total snapshots across all branches, including the initial graph. A terminal graph at the limit still yields a conclusion; a discovered open branch establishes consistency even if other alternatives remain unexplored.
