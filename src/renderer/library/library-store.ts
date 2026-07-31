import type { LibraryText, LibraryTextSummary, SourceNotice } from "../../shared/library/library-types.js";
import type { TextSelection } from "../../shared/library/selection-types.js";

export interface LibrarySnapshot
{
	texts: readonly LibraryTextSummary[];
	text: LibraryText | null;
	sourceNotice: SourceNotice | null;
	selection: TextSelection | null;
	focus: TextSelection | null;
}

export class LibraryStore
{
	private texts: LibraryTextSummary[] = [];
	private text: LibraryText | null = null;
	private sourceNotice: SourceNotice | null = null;
	private selection: TextSelection | null = null;
	private focus: TextSelection | null = null;

	public GetSnapshot(): LibrarySnapshot
	{
		return { texts: [...this.texts], text: this.text, sourceNotice: this.sourceNotice, selection: this.selection, focus: this.focus };
	}

	public SetLibrary(texts: LibraryTextSummary[]): void
	{
		this.texts = [...texts];
	}

	public Open(text: LibraryText, sourceNotice: SourceNotice | null): void
	{
		this.text = text;
		this.sourceNotice = sourceNotice;
		this.selection = null;
		this.focus = null;
	}

	public SetSelection(selection: TextSelection | null): void
	{
		this.selection = selection;
	}

	public SetFocus(focus: TextSelection | null): void
	{
		this.focus = focus;
	}

	public GetText(): LibraryText | null
	{
		return this.text;
	}

	public GetSourceNotice(): SourceNotice | null
	{
		return this.sourceNotice;
	}

	public GetSelection(): TextSelection | null
	{
		return this.selection;
	}

	public GetContextSelection(): TextSelection | null
	{
		return this.selection ?? this.focus;
	}
}
