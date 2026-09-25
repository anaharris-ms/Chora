# Agent Guidance for Chora

## Project Identity

Chora is an Electron research reading environment. Its top-level source folders represent real Electron runtime boundaries:

- `src/main/` — privileged Electron host code, organized into Library, Chat, Dreams, models, shell, IPC, bootstrap, and diagnostics
- `src/preload/` — the deliberately small, context-isolated IPC bridge
- `src/renderer/` — the browser UI, organized into Library, Chat, Dreams, application composition, and shared renderer infrastructure under `core/`
- `src/shared/` — pure cross-process contracts, types, and deterministic domain logic

Within a process, organize primarily by product feature. Every renderer feature separates `Panel`, `Controller`, `Store`, and `Gateway` objects. Panels own DOM behavior only; controllers coordinate; stores own state; gateways own IPC. Every main-process feature separates `IpcController`, `Service`, and `Repository` objects. Do not collapse these responsibilities into generic manager classes. Use `core/` only for mechanisms shared across multiple renderer features, such as events, diagnostics, context, and session persistence.

The bundled corpus is Plato's *Republic* from PerseusDL.

## Product Vision

Read `VISION.md` in full before making product, UX, architecture, or implementation decisions. Treat it as Chora's design compass, not as optional background material.

Evaluate every proposed feature against its guiding question:

> **Does this feature deepen the conversation between the reader and the text?**

Keep the reader-text relationship at the center. The model should support attention, memory, and continuing inquiry without replacing the reader's judgment or presenting itself as the authority.

## Build and Development

Prerequisites: Node.js 24+, npm

```bash
npm install
npm run dev:mock        # safe network-free default
npm run dev:kimi        # requires .env.local with KIMI_API_KEY
```

Other essential commands:

```bash
npm run typecheck       # TypeScript only, no emit
npm test                # vitest
npm run build           # main + preload + renderer
npm run package         # electron-forge package
```

Corpus maintenance:

```bash
npm run corpus:fetch
npm run corpus:build
npm run corpus:verify
npm run corpus:update   # blocked until upstream revision is selected
```

## Code Conventions

Read `CODING_STANDARDS.md` first. This project uses the C#-style rules described there, applied to TypeScript:

- PascalCase for exported functions, types, classes, interfaces, and public members.
- camelCase for local variables, parameters, and private fields.
- Tabs for indentation.
- Opening braces on the next line (Allman style).
- One operation per line; no combined statements.
- Single `return` at the end of a function; avoid early returns.
- Explicit types when clarity matters.
- Async methods named with an `Async` suffix where applicable.
- Import with `.js` extensions for cross-module TypeScript imports (NodeNext module resolution).
- Prefer `const` / `readonly`; mutable `let` only when necessary.
- Keep main-process responsibilities out of the renderer; use `IPC_CHANNELS` for all cross-layer communication.
- Panels own DOM and local user interaction. Managers own state and workflows.
- Components communicate through the typed `ChoraEventBus`; do not call other panels directly.
- Use `ErrorManager` for application logs, diagnostics, and user-facing errors; do not scatter raw `console` calls through application code.
- Only `ModelGateway` may initiate language-model IPC from the browser-side application.

## Architecture Boundaries

- The renderer has no direct filesystem or network access. Use the IPC channels defined in `src/shared/contracts/IpcChannels.ts`.
- API keys and provider configuration live only in the main process and `.env.local`.
- Dreams are local Markdown files under `Documents/Chora/Dreams` (main process owns persistence).
- The corpus lives in `corpus/generated/` and is built from scripts in `scripts/corpus/`.

## Configuration

Copy `.env.example` to `.env.local` and fill in provider credentials. Never commit `.env.local` or API keys.

## Testing

Tests are in `tests/` and run with Vitest. Mirror the source layout:

- `tests/main/*` for main-process modules
- `tests/renderer/*` for renderer modules
- `tests/corpus/*` for corpus scripts

Run tests before finishing a change.

## Common Gotchas

- TypeScript module resolution is `NodeNext`; always include the `.js` extension in relative imports, e.g. `../shared/memory-types.js`.
- `tsconfig.json` extends `tsconfig.main.json`; the latter is the source of compiler options.
- The renderer build uses Vite; the main build uses `tsc`.
- `Prompts/` is packaged as an extra resource by Electron Forge.
- The bundled app loads from `.vite/build/` and `.vite/renderer/`.

## When in Doubt

Preserve the existing architecture and conventions. Match the style of neighboring files. Do not introduce new dependencies without checking `package.json` first.
