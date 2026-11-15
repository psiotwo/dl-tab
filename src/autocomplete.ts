import { parseConcept } from './logic.js';

type EditorKind = 'tbox' | 'abox';
export interface CompletionItem { label: string; insert: string; kind: string; select?: [number, number] }

const conceptForms: CompletionItem[] = [
  { label: 'C', insert: 'C', kind: 'Atomic concept', select: [0, 1] },
  { label: '¬C', insert: '¬C', kind: 'Negation', select: [1, 2] },
  { label: '(C ⊓ D)', insert: '(C ⊓ D)', kind: 'Conjunction', select: [1, 2] },
  { label: '(C ⊔ D)', insert: '(C ⊔ D)', kind: 'Disjunction', select: [1, 2] },
  { label: '∃r.C', insert: '∃r.C', kind: 'Existential', select: [1, 2] },
  { label: '∀r.C', insert: '∀r.C', kind: 'Universal', select: [1, 2] },
  { label: '⊤', insert: '⊤', kind: 'Top' },
  { label: '⊥', insert: '⊥', kind: 'Bottom' },
];
const tboxForms: CompletionItem[] = [
  { label: 'C ⊑ D', insert: 'C ⊑ D', kind: 'Inclusion', select: [0, 1] },
  { label: 'C ≡ D', insert: 'C ≡ D', kind: 'Equivalence', select: [0, 1] },
];
const aboxForms: CompletionItem[] = [
  { label: 'C(a)', insert: 'C(a)', kind: 'Concept assertion', select: [0, 1] },
  { label: 'r(a,b)', insert: 'r(a,b)', kind: 'Role assertion', select: [0, 1] },
];

export function suggestions(kind: EditorKind, source: string, caret: number, explicit = false): { start: number; items: CompletionItem[] } {
  const line = source.slice(0, caret).split('\n').at(-1) ?? '';
  const before = line.trimEnd();
  const offer = (items: CompletionItem[]) => ({ start: caret, items });
  if (/^\s*#/.test(line)) return offer([]);
  if (!before) return offer(kind === 'tbox' ? tboxForms : aboxForms);

  const closing = source[caret] === ')' ? '' : ')';
  const item = (label: string, insert = label, type = 'Next', select?: [number, number]): CompletionItem =>
    ({ label, insert, kind: type, select });
  if (/[∃∀]\s*$/.test(before)) return offer([item('r.C', 'r.C', 'Role and filler', [0, 1])]);
  if (/[∃∀][A-Za-z_][\w-]*$/.test(before)) return offer([item('.', '.', 'Role separator')]);
  if (kind === 'abox') {
    if (/[A-Za-z_][\w-]*\([^)]*,\s*$/.test(before))
      return offer([item('b', `b${closing}`, 'Second individual', [0, 1])]);
    if (/[A-Za-z_][\w-]*\($/.test(before) || /\)\($/.test(before))
      return offer([item('a', `a${closing}`, 'Individual', [0, 1]),
        item('a,b', `a,b${closing}`, 'Two individuals', [0, 1])]);
    if (/[A-Za-z_][\w-]*\([^)]*$/.test(before)) return offer([]);
  }
  if (/[.⊓⊔¬(]\s*$/.test(before)) return offer(conceptForms);

  if (kind === 'tbox') {
    if (/(?:⊑|≡|<=|=)\s*$/.test(before)) return offer(conceptForms);
    if (!/(?:⊑|≡|<=|=)/.test(before)) return offer([item('⊑', ' ⊑ ', 'Inclusion'), item('≡', ' ≡ ', 'Equivalence')]);
    return offer(explicit ? [item('⊓', ' ⊓ ', 'Conjunction'), item('⊔', ' ⊔ ', 'Disjunction')] : []);
  }
  if (before.endsWith(')')) {
    try {
      parseConcept(before);
      return offer([item('(a)', '(a)', 'Concept assertion', [1, 2])]);
    } catch { return offer([]); }
  }
  return offer([item('(a)', '(a)', 'Concept assertion', [1, 2]),
    item('(a,b)', '(a,b)', 'Role assertion', [1, 2])]);
}

export function attachAutocomplete(editor: HTMLTextAreaElement, kind: EditorKind,
  onInput: () => void): void {
  const popup = document.createElement('div');
  popup.id = `completions-${kind}`;
  popup.className = 'completion-list';
  popup.setAttribute('role', 'listbox');
  popup.hidden = true;
  editor.parentElement!.append(popup);
  let choices: CompletionItem[] = [], start = 0, selected = 0;
  const hide = () => { popup.hidden = true; editor.setAttribute('aria-expanded', 'false'); };
  const highlight = () => popup.querySelectorAll('button').forEach((button, index) => {
    button.classList.toggle('selected', index === selected);
    button.setAttribute('aria-selected', String(index === selected));
  });
  const accept = (index: number) => {
    const item = choices[index]; if (!item) return;
    editor.setRangeText(item.insert, start, editor.selectionEnd, 'end');
    if (item.select) editor.setSelectionRange(start + item.select[0], start + item.select[1]);
    editor.focus(); hide();
    editor.dispatchEvent(new Event('input'));
  };
  const show = (explicit = false) => {
    const completion = suggestions(kind, editor.value, editor.selectionStart, explicit);
    choices = completion.items; start = completion.start; selected = 0;
    popup.replaceChildren();
    for (const [index, item] of choices.entries()) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = item.label;
      button.setAttribute('role', 'option');
      const type = document.createElement('small'); type.textContent = item.kind; button.append(type);
      button.addEventListener('pointerdown', event => event.preventDefault());
      button.addEventListener('click', () => accept(index));
      popup.append(button);
    }
    popup.hidden = !choices.length;
    editor.setAttribute('aria-expanded', String(choices.length > 0));
    highlight();
  };
  editor.setAttribute('aria-autocomplete', 'list');
  editor.setAttribute('aria-controls', popup.id);
  editor.addEventListener('input', () => { onInput(); show(); });
  editor.addEventListener('focus', () => { if (!editor.value.trim()) show(); });
  editor.addEventListener('blur', () => setTimeout(hide, 100));
  editor.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
      event.preventDefault(); show(true); return;
    }
    if (!popup.hidden && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
      highlight(); return;
    }
    if (!popup.hidden && ['Enter', 'Tab'].includes(event.key)) { event.preventDefault(); accept(selected); return; }
    if (event.key === 'Escape') { hide(); return; }
    if (event.key !== '(' || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    const from = editor.selectionStart, to = editor.selectionEnd;
    const selectedText = editor.value.slice(from, to);
    editor.setRangeText(`(${selectedText})`, from, to);
    editor.setSelectionRange(from + 1, from + 1 + selectedText.length);
    editor.dispatchEvent(new Event('input'));
  });
}

