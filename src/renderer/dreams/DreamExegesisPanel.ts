import { TabPanel } from "../ui/TabPanel.js";
import { DreamController } from "./DreamController.js";
import { MarkdownEditor } from "../ui/MarkdownEditor.js";
import type { ErrorManager } from "../core/diagnostics/RendererErrorManager.js";

// Owns the persistent Exegesis editor and forwards edits to the Dream workflow.
export class DreamExegesisPanel extends TabPanel
{
	// Editor retained across tab switches and unrelated structural changes.
	private readonly editor: MarkdownEditor;

	// Seeds content when the owning Dream is opened.
	public constructor(private readonly controller: DreamController, reflection: string, errors: ErrorManager)
	{
		super("exegesis", "General Observations");
		this.Root.classList.add("dream-exegesis-tab");
		this.editor = new MarkdownEditor(reflection, "General Observations", this.HandleChange.bind(this), errors);
		this.editor.Root.classList.add("dream-exegesis-markdown");
		this.editor.Root.dataset.dreamExegesis = "";
		this.Root.append(this.editor.Root);
	}

	// Releases editor listeners and DOM.
	public override Dispose(): void
	{
		this.editor.Dispose();
		super.Dispose();
	}

	// Delegates edits and autosave to the controller.
	private HandleChange(markdown: string): void
	{
		this.controller.UpdateExegesis(markdown);
	}
}