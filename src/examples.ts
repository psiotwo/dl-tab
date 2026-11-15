export interface Example {
  name: string;
  tbox: string;
  abox: string;
  explanation: string;
  outcome: 'consistent' | 'inconsistent';
}

export const examples: readonly Example[] = [
  {
    name: 'A witness for ∃',
    tbox: '',
    abox: '∃hasChild.Student(ada)',
    explanation: 'The ∃-rule creates one new child with Student in its label. The open graph gives a small example model with a parent and a child.',
    outcome: 'consistent',
  },
  {
    name: 'One branch closes',
    tbox: '',
    abox: '(Student ⊔ Teacher)(ada)\n¬Student(ada)',
    explanation: 'The ⊔-rule tries Student and Teacher in separate branches. Student clashes with ¬Student; the Teacher branch stays open.',
    outcome: 'consistent',
  },
  {
    name: 'Open world: is Ada a researcher?',
    tbox: 'Researcher ⊑ Person',
    abox: 'Person(ada)',
    explanation: 'Every researcher is a person, but Person(ada) does not settle whether Ada is a researcher. Add Researcher(ada), then try ¬Researcher(ada) instead. Both stay consistent.',
    outcome: 'consistent',
  },
  {
    name: 'Two different children',
    tbox: '',
    abox: '(∃hasChild.Man ⊓ ∃hasChild.Grandparent ⊓ ¬∃hasChild.(Man ⊓ Grandparent))(jan)',
    explanation: 'The ∃-rule creates two child witnesses. The ∀-rule prevents either child from being both Man and Grandparent, so an open branch remains.',
    outcome: 'consistent',
  },
  {
    name: 'Impossible child',
    tbox: '',
    abox: '(∃hasChild.(Man ⊓ Grandparent) ⊓ ¬(∃hasChild.Man ⊓ ∃hasChild.Grandparent))(jan)',
    explanation: 'One child must be both Man and Grandparent, but the ABox denies one of those requirements. Both ⊔-rule branches end in a direct clash.',
    outcome: 'inconsistent',
  },
  {
    name: 'Cyclic definition and blocking',
    tbox: 'Man ⊑ ∃hasParent.Man',
    abox: 'Man(jan)',
    explanation: 'The ∃-rule keeps requiring a male parent. Subset blocking stops expansion when a generated node’s label is contained in an ancestor’s label.',
    outcome: 'consistent',
  },
  {
    name: 'Headache in a leg',
    tbox: 'Headache ⊑ Pain ⊓ ∀FindingSite.Head\nLeg ⊑ ¬Head',
    abox: '(Headache ⊓ ∃FindingSite.Leg)(finding1)',
    explanation: 'The TBox puts every headache finding site in Head and every Leg outside Head. The required leg site receives both Head and ¬Head: a direct clash.',
    outcome: 'inconsistent',
  },
  {
    name: 'Advanced: nested restrictions',
    tbox: '',
    abox: '(∃P1.(∀P2.∀P3.C11) ⊓ ∃P1.(∀P2.∀P3.C12) ⊓ ∀P1.(∃P2.(∀P3.C21) ⊓ ∃P2.(∀P3.C22) ⊓ ∀P2.(∃P3.C31 ⊓ ∃P3.C32)))(I)',
    explanation: 'Watch the ∃-rule create successors at three levels and the ∀-rule propagate concepts to them. Expand nodes to inspect their labels.',
    outcome: 'consistent',
  },
  {
    name: 'Custom input',
    tbox: '',
    abox: 'A(a)',
    explanation: 'Edit the axioms, then build the tableau to see which rules apply.',
    outcome: 'consistent',
  },
];
