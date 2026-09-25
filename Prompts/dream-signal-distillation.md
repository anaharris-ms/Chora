You are given a reader's dream about one passage of Greek text. A dream has parts that must not be confused with one another:

- **The passage**: the exact Greek text the dream is anchored to, supplied in full below.
- **The dream's signals**: an array of specific words or phrases within the passage that the reader found striking. A dream may contain several. Each signal has its own `text` (the Greek surface form or phrase noticed) and `description` (the reader's free-form noticing-and-reflection prose about that one signal). Both are supplied below, per signal, each one numbered (Signal 1, Signal 2, ...). Your reply must preserve that numbering so each result can be matched back to its signal.
- **The dream's reflection**: the reader's overall interpretive narrative for the whole dream, written after considering all of its signals together. This is deliberately not supplied to you and is not part of your task — it stays with the reader and is never distilled into a signal.

Your task concerns only the passage and each signal's own `text` and `description`. Read every signal together before distilling any one of them: understanding what struck the reader across the whole dream can clarify what a single signal's `description` is actually pointing at. But you must still distill each signal independently — an observation you write for one signal must be grounded in that signal's own `text`, never borrowed from another signal's evidence.

Each signal's `description` will very likely contain interpretation, association, symbolism, or speculation. You must discard all of that and keep only what is grounded in the Greek language itself: the signal's own surface form, and any genuine lexical, morphological, or phonetic relation it bears to other real words of the language — whether or not those other words occur in the passage. Confirm that each signal's `text` actually occurs in the passage — it is the anchor for everything you write about that signal. A related word cited only for its kinship to that anchor does not need to occur in the passage too.

"Genuine" means the resemblance is actually there in the words as written or spoken — real shared letters, sounds, or a recognizable root or pattern — not that a modern historical-linguistic reconstruction certifies a common origin. Do not sit in judgment of a real surface resemblance by asking whether scholarly etymology would endorse it as a true cognate; Greek texts, Plato's especially, routinely exploit such resemblances between words as meaningful wordplay (paronomasia) regardless of their historical derivation. What must never happen is citing a resemblance that is not actually present in the forms at all — letters or sounds that are not really shared, a root that does not really recur.

## Method

For each signal, read its `description` and identify what textual detail it is actually grounded in: a recurrence, a lexical or morphological relation, a spatial or sequential configuration, a semantic cluster, a contrast or correspondence, or another precisely identifiable textual feature. Then confirm that detail is genuinely about that signal's own `text`, not merely mentioned somewhere in the same sentence of `description`, and not borrowed from a different signal. Reject a grounded-sounding detail if it does not actually concern the signal's own `text`. Ignore any claim about meaning, symbolism, myth, authorial intention, or philosophical implication, even when the reader states it with confidence. A genuine lexical, morphological, or phonetic relation between the signal's `text` and another real word of the language is not itself an interpretive claim, even when that related word does not occur in the passage — keep the relation, but strip away whatever meaning, myth, or ritual the reader hung on it.

Whether a related word occurs in the passage is already shown by the `elements` list: one that occurs there has its own element, one cited only for its kinship does not. Do not also state this fact in prose inside `observation` — write the relation itself, not bookkeeping about where it does or doesn't appear.

Good distillation:

- Signal text `χθὲς`, signal description associates it with `χθόνιος` and Orphic anamnesis → observation: "χθὲς shares the χθ- root with words for the underworld such as χθόνιος." (This is kept because the relation is a genuine feature of the language, even though `χθόνιος` does not occur in this passage — but that absence is not restated in the observation itself; the Orphic/anamnesis claim is discarded entirely.)
- Signal text `κατέβην`, signal description calls it a descent that maps to ritual katabasis → observation: "κατέβην names a downward movement." (Restated without the ritual claim.)

Bad distillation:

- Keeping "this descent is prerequisite for anamnesis" as the observation. This is interpretation, not a grounded textual observation.
- Citing a resemblance between two words that do not actually share the letters, sounds, or root claimed — inventing a relation that is not there at all. This is different from citing a real surface resemblance between two real words simply because modern etymology would not certify them as a true cognate pair, or because the related word doesn't happen to occur in this passage — both of those are genuine and must be kept.
- Discarding the observation entirely because the description is mostly interpretive. If a grounded textual detail is present anywhere in the description, preserve it; do not require the whole description to be disciplined.

If, after removing every interpretive claim, no textually grounded observation remains for a signal, do not produce one for it. Its result must be `{ "signal_types": [], "elements": [], "observation": null }` instead. Do not soften this by inventing a conservative substitute, a fallback observation, or a restatement of `text`'s mere presence for that signal — an ungrounded dream observation must be rejected, not weakened into something smaller but still invented. Reject each signal independently: one signal having no grounded observation must not affect any other signal's result.

## Evidence requirements

The signal's own `text`, and anything else you describe as occurring in the passage, must be checkable against the passage text supplied above: do not describe a form, phrase, or configuration within the passage that is not actually present in it, and do not normalize or alter the Greek surface form when quoting it. A related word cited only for its genuine lexical, morphological, or phonetic kinship to the signal's `text` does not itself need to occur in the passage — but it must be a real word of the language, never one you invent, and you must cite it only for that kinship, never for the meaning or myth attached to it.

For each supporting element:

- `form`: the exact surface form as it appears in the passage, unaltered.
- `context`: a short excerpt copied verbatim from the passage that contains `form` along with a few surrounding words. This excerpt is used afterward to locate exactly where in the passage `form` occurs, so quote it precisely — do not paraphrase or summarize it.
- Do not supply a `location` field. Where the element sits in the passage is resolved separately from `context`, not by you.
- Only give an element for a form that actually occurs in the passage, since it needs a `context` excerpt to be located there. A related word cited only for its lexical or morphological kinship, without occurring in the passage itself, is named in `observation` alone and does not get its own element.

After distilling the grounded observation, assign one or more descriptive `signal_types` from the list below. Assign the smallest set that accurately describes the noticed textual relation. Use `other_textual_configuration` only when none of the more specific types fits.

{{#runtime-import Shared/signal-type-definitions.md}}

## Output

Reply with exactly one JSON array containing exactly one result per signal, in the same order and numbering as the signals supplied above:

```
[
  { "index": 1, "signal_types": [...], "elements": [ { "form": "...", "context": "..." } ], "observation": "..." },
  { "index": 2, "signal_types": [], "elements": [], "observation": null }
]
```

`index` must match the signal's number as given above. Include every signal exactly once, even the ones with no grounded observation (`observation: null`). Do not wrap the array in another object and do not include any other field. Each `observation` field must be non-interpretive, per the discipline above.

Do not output fields such as {{#runtime-import Shared/forbidden-signal-keys.md}}.
