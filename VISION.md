# Chora: A Different Way to Read

Chora is built around a simple idea: reading is not the extraction of information, but an encounter between a person and a text. Most AI reading tools place the model at the center of that encounter. The reader asks questions, the model answers them, summarizes passages, or explains what the author "really meant." Chora takes a different approach.

| Standard AI Reading Tool | Chora |
|---|---|
| Reader ↔ **AI** ↔ Text | Reader ↔ **Text** (AI sustains) |
| Model answers questions | Model asks better questions |
| Information extraction | Perceptual encounter |
| Universal interpretation | Personal journey |
| Stateless assistance | Accumulated memory |

The model is never the center of the experience. Instead, it helps sustain a conversation between the reader and the work itself. The relationship that matters is not **reader ↔ AI**, but **reader ↔ text**. The model exists only to deepen that relationship by helping the reader notice patterns, remember earlier observations, ask better questions, and return to passages with fresh eyes.

Because of this, Chora does not treat reading as a search for the correct interpretation. Every reader brings different experiences, memories, questions, and assumptions to a work. Those differences are not problems to be corrected; they are part of the reading itself. The goal is not to make every reader think the same thing, but to help each reader develop a richer conversation with the text.

---

## Dreams

As readers work, they record **dreams**. A dream is not a note or a summary. It is a moment of perception: something noticed, questioned, remembered, or wondered about while reading. A dream might capture a recurring image, an unusual word, a connection to another passage, or simply a question that feels important. Chora preserves these moments without forcing them into folders, tags, or predefined structures.

Every dream is valid. It is a genuine trace of an encounter. Some dreams are narrower than the text allows — but that is not a failure. It is a beginning. The text is inexhaustible. No reader, human or model, will ever see it whole.

The dreams are not simply stored. They become part of the model's understanding of the reader. As the collection grows, the model gradually learns what the reader has already seen, what questions continue to return, what themes have become important, and how the reader's understanding is evolving. Every new conversation begins with that accumulated history rather than starting from nothing.

This means the model is not attempting to build a universal interpretation of the text. It is building an understanding of the reader's journey through the text. The context is always personal, always evolving, and always grounded in the reader's own observations.

---

## Signals

A dream is anchored in the text by **signals** — exact words or phrases, located precisely. Each signal carries the reader's perception of that moment in the text. The signal is not a claim about what the text means. It is a record of what the reader saw.

The model can hold the text and the dream simultaneously, and perceive what else the text makes available that the reader has not yet seen. It does not correct. It does not explain. It formulates questions that reopen the text — questions the text itself sustains.

---

## The Four Terms

The architecture rests on four elements:

- **Text** — the work itself, present in exact form
- **Reader** — the living encounter, partial, genuine, evolving
- **Master** — a cultivated layer of perception upon the text, built from years of reading
- **Model** — the servant that holds text, reader, and master simultaneously, and asks what emerges

The Master is not the model. The Master is human — the first reader, the one who dreams the primary layer. The model starts there. It inherits a cultivated field of perception before any individual reader arrives. The Master's dreams are not authoritative. They are comprehensive — more tested, more wide — but still partial. The model learns the shape of the text's abundance from them.

---

## Main and Forks

The Master's cultivated dreams form **Main** — a repository of perception upon a text.

Readers **fork** Main. They inherit the Master's field, then dream their own dreams. Their forks are sovereign. The model always holds both: what Main sees, and what the reader sees.

A reader may offer a dream back to Main. The model assesses it against the text and against Main's field, then flags it for human review. The Master decides: accept, reject, or ask for refinement. A merged dream enriches Main. A rejected dream remains valid in the reader's fork — "not for Main" is not "not true."

Over time, as Main grows and the model's understanding deepens, human involvement shifts. It begins heavy — the Master cultivates alone. It increases as readers contribute. It stabilizes as the model learns to verify and propose. Eventually it recedes to exception and audit. But the human never disappears. The human can always fork, diverge, challenge.

The arc is not a handoff. It is an equilibrium — human and model in genuine collaboration, neither dominant.

---

## The Eigenstate Substrate

Beneath Main lies a substrate generated by the model. It is not editable by humans, not editable by forks. It emerges from the model's traversal of Main's dreams — patterns, resonances, tensions discovered across the cultivated field.

The substrate serves two purposes. It **verifies** reader observations: does this dream align with known patterns, diverge from them, or contradict them productively? And it **discovers gaps**: what has Main missed that forks are seeing?

The substrate is not a map of the text's meaning. It is a map of the text's hermeneutic topology — what vibrates, what returns, what holds tension. The model uses it to test the power of a dream by attempting to destabilize it gently — not to correct, but to open.

---

## The Conversation

The conversation itself is iterative. Each exchange changes what the model knows about the reader, and those changes shape future conversations. The reader is never speaking to a stateless assistant. Every dialogue continues the one that came before.

The model also works locally. It does not need to reason over an entire book every time the reader asks a question. The current passage provides the immediate focus, while the reader's accumulated dreams provide the broader context. If the reader notices that Socrates' descent recalls the cave, for example, the model can explore that observation by drawing on previous dreams and by examining other relevant passages without losing sight of the section currently being read. The reader's attention remains anchored in the present text, while memory quietly enriches the conversation.

This evolving conversation is the foundation of the Chora engine. Rather than retrieving information from a static knowledge base, the engine continuously weaves together three sources of context: the passage currently being read, the reader's accumulated dreams, and the ongoing dialogue between reader and model. The purpose is not simply to answer questions, but to participate in an unfolding exploration that grows richer over time.

In this relationship, the reader is both student and teacher. The text teaches the reader through careful engagement, while the reader teaches the model through every dream, every observation, and every conversation. The model gradually learns how this particular reader thinks, what captures their attention, which ideas continue to develop, and where they currently are in their understanding. The goal is never for the model to replace the reader's judgment, but to become a better conversational partner as it learns alongside them.

---

## The Role of AI

This philosophy changes the role of AI. The model is not a teacher, an authority, or an oracle that delivers answers. It is a thoughtful companion whose purpose is to support attention rather than replace it. Sometimes that means asking a question instead of giving an explanation. Sometimes it means reminding the reader of something they noticed weeks earlier. Sometimes it simply means encouraging the reader to remain with a difficult passage instead of resolving it too quickly.

The model is comfortable with ambiguity. It trusts the reader's intelligence. It speaks from the text, not from authority. It risks being wrong — because hermeneutics is risky.

---

## The Guiding Question

Every design decision in Chora should follow one question:

> **Does this feature deepen the conversation between the reader and the text?**

| Temptation | Does it deepen the reader-text conversation? | Verdict |
|---|---|---|
| Automatically summarize a passage | No — it replaces reading | **Reject** |
| Automatically link related dreams | No — it replaces the reader's perceptual connection | **Reject** |
| Suggest similar passages | Maybe — yes when the reader asks; no when pushed | **Conditional** |
| Remind the reader of an earlier dream on a word | Yes — it returns them to their own history with the text | **Accept** |
| Show the source passage with an exact locator | Yes — it anchors them in the text | **Accept** |
| Automatically generate signal descriptions | No — it replaces the perceptual moment | **Reject** |

If a feature deepens that conversation, it belongs in Chora. If it shifts attention toward the model, automates the act of reading, or replaces the reader's judgment, it moves the project away from its purpose.

---

## What Chora Is For

Although Chora can work with any text, it is designed for works that reward sustained engagement: Plato, Dickens, Dante, Shakespeare, Homer, Augustine, Nietzsche, and other authors whose writings continue to reveal new meanings over repeated readings. The software is intended to cultivate the habits of careful reading rather than accelerate the consumption of information.

Chora is not designed to read for the user. It is designed to help people become better readers. Over time, it becomes a companion that grows alongside them, learning from their dreams while continually returning them to the work itself — where the real conversation has always been.
