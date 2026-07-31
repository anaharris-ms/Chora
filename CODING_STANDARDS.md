# Coding Standards

This repository uses a strict, architecture-first C# style.

## Core Principles

- Use strongly typed C# code.
- Prefer object-oriented design with classes, interfaces, and services.
- Build from the architecture, not from shortcuts or ad hoc fixes.
- Keep code readable, explicit, and easy to reason about.
- Add comments only where the operations or intent are not obvious.

## Required Rules

- Use `PascalCase` for types, properties, methods, and public members.
- Use `camelCase` for local variables, parameters, and private fields.
- Use `static readonly` or `const` for values that do not change.
- Use tabs for indentation.
- Do not use spaces for indentation.
- Write no more than one operation per line.
- Do not combine multiple actions into a single statement.
- Do not perform operations inside `return` statements.
- Do not use early returns inside a function.
- Use a single return only at the end of a function.
- Place opening curly braces on the next line.
- Use the form:

  ```csharp
  functionName()
  {
  }
  ```

- Avoid hacks, workarounds, and brittle shortcuts.

## Style Expectations

- Prefer explicit types over implicit behavior when clarity matters.
- Prefer classes, records, and methods when modeling domain behavior.
- Keep functions focused on one responsibility.
- Keep control flow simple and explicit.
- Make state changes easy to trace.
- Use comments to explain intent, not to restate code.
- Prefer `async`/`await` over blocking calls when working with I/O.
- Name asynchronous methods with the `Async` suffix.
- Prefer `var` only when the type is obvious from the right-hand side.
- Use expression-bodied members sparingly.
- Keep access modifiers explicit.
- Prefer `private` by default for class members.
- Keep namespaces and file layout aligned with the project structure.

## Prompt Management

- Do not embed model prompts or natural-language model instructions in source code.
- Store every model prompt in a dedicated Markdown file under `Prompts/`.
- Use one clearly named prompt file per mode, role, or operation.
- Load prompts through the main-process prompt loader; do not read prompt files directly from the renderer or individual providers.
- Keep source code responsible only for selecting prompts, supplying structured context, and assembling model requests.
- Add prompt files to packaged application resources when introducing a new prompt location.
- Test prompt loading, mode-to-file selection, and required prompt content without duplicating the full prompt text in tests.
- Ordinary interface labels, validation messages, and error messages are not model prompts and may remain in code.

## Application Components

- Use the same object architecture for Library, Dreams, and Chat.
- Renderer features contain a `Panel`, `Controller`, `Store`, and `Gateway`.
- Panels own DOM rendering and browser events only. Panels do not own canonical feature state or call IPC directly.
- Controllers coordinate workflows and application events but do not own feature state.
- Stores are the sole renderer-side owners of feature state.
- Gateways are stateless typed IPC clients.
- Main-process features contain an `IpcController`, `Service`, and `Repository` where persistence or canonical data access is required.
- Runtime text collection terminology is `Library`, not `Corpus`. Reserve `corpus` for the build-time source corpus pipeline.

- Use `DocumentPanel`, `DreamPanel`, and `ChatPanel` consistently for the three user-interface areas.
- Panels own persistent DOM roots and register delegated DOM events once.
- Do not rebuild the entire application DOM in response to state changes.
- Managers own domain state and workflows; panels must not own canonical document, Dream, or chat data.
- Publish typed application events through `ChoraEventBus` for cross-component communication.
- Event names describe completed facts in past tense or requests with a `requested` suffix.
- Retain and dispose subscriptions when a component has a shorter lifetime than the application.
- Use `ErrorManager` for debug output, operational logs, and user-facing error reporting.
- Language-model communication from the application goes through `ModelGateway` and never directly through a panel.

## Decision Rule

If a solution conflicts with these standards, choose the design that preserves the architecture.

If a task cannot be solved cleanly within these standards, redesign the implementation rather than forcing it.

## Workflow Rule

Before making any code changes in this repository, read this document first and follow it exactly.
