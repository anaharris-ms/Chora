# Chora

*Where texts dream.*

Chora is an Electron environment for close reading. The reader remains in direct conversation with the text; the model sustains that encounter without replacing it. Read [VISION.md](VISION.md) before making product or design decisions.

## Current experience

Chora has three independent panels:

- **ChatPanel** — a session conversation whose context follows the active Dream or visible passage.
- **DocumentPanel** — the source text, exact locators, selection, and reading controls.
- **DreamPanel** — capture and editing of reader-authored Dreams.
- **Ideas** — work-scoped interpretations connected to reader-authored Signals.

A Dream contains an immutable source passage, zero or more manually selected signals, an optional title, and open-form exegesis. It has no required metadata, automatic signals, tags, folders, or automatic links.

## Dream capture

1. Select text in the source document.
2. Right-click and choose **Create Dream**, or press `Ctrl/Cmd+D`.
3. Write exegesis and optionally provide a title.
4. To add a signal, select exact text in either the original document or the copied source passage and choose **Add Signal**.
5. Chora autosaves after you pause, when the window loses focus, and before the editor closes. `Ctrl/Cmd+Enter` remains available for an immediate save.

The source passage remains immutable inside the editor. To extend it, select more source text in the Document panel and choose **Add to Dream**. Signal descriptions are optional, multiple signals retain source order, and a newly added signal is brought into view automatically. Dreams may be deleted explicitly from the editor.

Signals and Exegesis use a shared Milkdown editor with bold, italic, lists, quotations, links, and undo/redo. Formatting is saved as Markdown in the existing description and reflection fields. Editors retain their contents and undo history when switching tabs or collapsing a signal, and the lower-right grip resizes the editing area vertically. Links are editable but do not navigate from the editor; remote images are displayed as alt text without fetching them. The Dream action menu can copy the complete Dream as Markdown, including its source passage, Signals, observations, resonances, attached passages, and General Observations.

Each signal has a **Chat with the model** icon. It opens Chat focused on that signal without sending a message. The signal's words appear above the conversation, and the model receives its complete description, including current unsaved edits, with the Dream's source as context. That focus stays with the conversation when navigating away and when reopening a saved chat. Selecting a different signal starts a new conversation while preserving the unsent draft; selecting the same signal returns to the current conversation. A response in progress must finish before switching signals.

Each Signal has one **Add to Idea…** action. Ideas use the same catalogue-and-editor structure as Dreams: the left tab contains a searchable flat list with a new-Idea action, while the selected Idea opens in the shared editor pane. Idea rows show their connected Signal count and are not grouped by Book. The editor contains only the title, description, and one Signals list. **Find Signals** asks the configured model to identify up to five strong connections among existing reader-authored, observed Signals and displays a concise rationale for each result. **+ Add Signal** opens a separate searchable work-wide Signal browser where several existing Signals can be inspected in the established Signal panel or connected directly without leaving the browser. A new Idea may begin empty; its first connected Signal becomes the internal immutable origin, but the interface presents every connected Signal together without origin or related-evidence terminology. Starting from **Add to Idea…** uses the normal Ideas catalogue to select an existing Idea or create a new Idea with that Signal already connected. A durable Idea requires at least three Signals.

## Chat context

Chat mode is inferred rather than selected:

| State | Mode | Model context |
|---|---|---|
| Dream editor open | `DREAM` | Exact passage, surrounding source, and complete Dream |
| Document visible | `TEXT` | Passage nearest the viewport focus, with surrounding source |
| No document | `FREE` | No passage context |

Completed conversations are automatically saved under `Documents\Chora\Conversations` and can be reopened from Chat history. Model prompts live in `Prompts/` and are loaded by the main process.

## Local Dream library

New Dreams are readable Markdown files under:

```text
Documents\Chora\Dreams\<work-id>\<title>--<id>.md
```

Untitled Dreams use `dream--<id>.md`. The main process owns persistence; the renderer has no filesystem access. Writes use a temporary file followed by an atomic rename.

Dream catalogue items show the source's full locator range. A Dream icon beside a Stephanus label opens the catalogue filtered to Dreams whose saved source spans overlap that passage, including intermediate passages. Signals do not affect this association. The icon's tooltip reports the number of matching Dreams. Passage filtering clears the previous keyword query, can be narrowed with search, and has an explicit clear button. It does not open an editor or move the reading position; opening a different work clears the passage filter.

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

Chora opens the preferred Library text at launch in a permanent three-column workspace: Dreams Explorer, Dream editor, and source reader. With no Dream open, the middle editor shows Open Dream and Create Dream actions. The Explorer uses a compact selected-text-to-Book-to-Dream tree with each Dream's Stephanus range on the same line as its title. Opening a Dream adds it to a persistent editor tab strip; switching tabs restores that Dream's editor navigation and follows its source in the reader, while closing a dirty tab saves it before removal.

Prerequisites: Node.js 24 or later and npm.

```bash
npm install
npm run dev:mock
```

Milkdown 7.22 publishes extensionless TypeScript declaration imports. The `postinstall` script runs `scripts/FixMilkdownDeclarations.mjs` to repair only installed Milkdown declaration specifiers for this project's NodeNext resolution. Runtime packages and compiler settings are unchanged. If dependencies are installed with scripts disabled, run `npm run postinstall` before typechecking.

Kimi requires a local `.env.local`:

```text
MODEL_PROVIDER=kimi
KIMI_API_KEY=your-key
KIMI_MODEL=kimi-k2.6
KIMI_BASE_URL=https://api.moonshot.ai/v1
KIMI_MAX_COMPLETION_TOKENS=3000
```

Never commit `.env.local` or provider credentials.

### VS Code Copilot Relay

Saved chats have a trash button in chat history and in the conversation header. Deletion requires confirmation, is permanent, and is unavailable while a reply is in progress. Deleting a chat does not delete its Dream or signals, and an unsent composer draft is retained.

The Relay provider uses the GitHub Copilot session already active in a local VS Code Extension Development Host. Configure the same non-empty secret in both places:

```json
{
	"choraCopilotRelay.sharedSecret": "choose-a-long-local-secret"
}
```

Add the matching Chora values to `.env.local`:

```text
COPILOT_RELAY_SHARED_SECRET=choose-a-long-local-secret
COPILOT_RELAY_MODEL_FAMILY=claude-sonnet-4.5
COPILOT_RELAY_PORT=4319
```

Start Chora's `Chora Copilot Relay: Launch Extension Host` debug profile, then run:

```bash
npm run dev:relay
```

When the Relay is running, the model selector lists every Copilot model family available in that VS Code session. `COPILOT_RELAY_MODEL_FAMILY` is only the fallback used while the Relay catalogue is unavailable. A selected model is saved with its conversation. Choosing another model in a saved chat asks for confirmation and starts a new chat, keeping the selected signal and unsent draft; the original conversation remains in history. Model switching is disabled while a response is in progress. The Relay is loopback-only and rejects requests without the shared secret.

Verification commands:

```bash
npm run typecheck
npm test
npm run build
```

The bundled Plato corpus is generated under `corpus/generated/` from PerseusDL. Corpus maintenance commands are documented in [AGENTS.md](AGENTS.md).
