# Chora

*Where texts dream.*

Chora is an Electron environment for close reading. The reader remains in direct conversation with the text; the model sustains that encounter without replacing it. Read [VISION.md](VISION.md) before making product or design decisions.

## Current experience

Chora has three independent panels:

- **ChatPanel** — a session conversation whose context follows the active Dream or visible passage.
- **DocumentPanel** — the source text, exact locators, selection, and reading controls.
- **DreamPanel** — capture and editing of reader-authored Dreams.

A Dream contains an immutable source passage, zero or more manually selected signals, an optional title, and open-form exegesis. It has no required metadata, automatic signals, tags, folders, or automatic links.

## Dream capture

1. Select text in the source document.
2. Right-click and choose **Create Dream**, or press `Ctrl/Cmd+D`.
3. Write exegesis and optionally provide a title.
4. To add a signal, select exact text in either the original document or the copied source passage and choose **Add Signal**.
5. Chora autosaves after you pause, when the window loses focus, and before the editor closes. `Ctrl/Cmd+Enter` remains available for an immediate save.

The source passage remains immutable inside the editor. To extend it, select more source text in the Document panel and choose **Add to Dream**. Signal descriptions are optional, multiple signals retain source order, and a newly added signal is brought into view automatically. Dreams may be deleted explicitly from the editor.

## Chat context

Chat mode is inferred rather than selected:

| State | Mode | Model context |
|---|---|---|
| Dream editor open | `DREAM` | Exact passage, surrounding source, and complete Dream |
| Document visible | `TEXT` | Passage nearest the viewport focus, with surrounding source |
| No document | `FREE` | No passage context |

Conversation history is preserved for the application session. Model prompts live in `Prompts/` and are loaded by the main process.

When a Dream is open, the reader chooses how the model should meet it:

| Dream interaction | Model behavior |
|---|---|
| **Echo** | Mirrors only the symbols and relations the reader has already identified |
| **Socratic Nudge** | Returns attention to one exact linguistic or dramatic detail in the source passage |
| **Counter-Weight** | Offers one passage-bound detail that creates friction or complication |

These are reader-selected interaction stances inside inferred `DREAM` context; they do not replace the automatic `DREAM`, `TEXT`, and `FREE` context modes.

## Local Dream library

New Dreams are readable Markdown files under:

```text
Documents\Chora\Dreams\<work-id>\<title>--<id>.md
```

Untitled Dreams use `dream--<id>.md`. Existing libraries under `Documents\Chora\Memories` and `Documents\Eigen\Memories` are read without being moved or rewritten. The main process owns persistence; the renderer has no filesystem access. Writes use a temporary file followed by an atomic rename.

## Architecture

```text
src/main/         privileged Electron host, grouped by product feature
src/preload/      minimal typed context-isolated bridge
src/renderer/     browser UI with feature Panels, Controllers, Stores, and Gateways
src/shared/       cross-process contracts, types, and pure domain logic
Prompts/          model system prompts
```

See [CODING_STANDARDS.md](CODING_STANDARDS.md) and [AGENTS.md](AGENTS.md) before changing the code.

## Development

Prerequisites: Node.js 24 or later and npm.

```bash
npm install
npm run dev:mock
```

Kimi requires a local `.env.local`:

```text
MODEL_PROVIDER=kimi
KIMI_API_KEY=your-key
KIMI_MODEL=kimi-k2.6
KIMI_BASE_URL=https://api.moonshot.ai/v1
KIMI_MAX_COMPLETION_TOKENS=3000
```

Never commit `.env.local` or provider credentials.

Verification commands:

```bash
npm run typecheck
npm test
npm run build
```

The bundled Plato corpus is generated under `corpus/generated/` from PerseusDL. Corpus maintenance commands are documented in [AGENTS.md](AGENTS.md).
