import { DOMParser, type Document as XmlDocument, type Element as XmlElement, type Node as XmlNode } from "@xmldom/xmldom";

const ElementNodeType = 1;
const TextNodeType = 3;

export interface ParsedTeiSegment
{
	key: string;
	locator: {
		scheme: string;
		value: string;
	} | null;
	division: {
		kind: string;
		value: string;
	} | null;
	speaker: string | null;
	text: string;
	blockKind: "speech" | "narration" | "heading" | "other";
}

export interface ParsedTeiWork
{
	id: string;
	title: string;
	titleGreek: string | null;
	author: string;
	language: string;
	editor: string | null;
	sourceFile: string;
	segments: ParsedTeiSegment[];
}

type BlockKind = ParsedTeiSegment["blockKind"];

class SegmentCollector
{
	private readonly segments: ParsedTeiSegment[] = [];
	private readonly sourceFile: string;
	private currentBlockKind: BlockKind = "narration";
	private currentLocator: ParsedTeiSegment["locator"] = null;
	private currentDivision: ParsedTeiSegment["division"] = null;
	private currentSpeaker: string | null = null;
	private currentText = "";
	private segmentIndex = 0;

	public constructor(sourceFile: string)
	{
		this.sourceFile = sourceFile;
	}

	public ParseBlock(block: XmlElement): void
	{
		this.currentBlockKind = GetBlockKind(block);
		this.currentDivision = ReadDivision(block);
		this.currentSpeaker = null;
		this.ParseChildren(block);
		this.FlushSegment();
	}

	public GetSegments(): ParsedTeiSegment[]
	{
		const segments = this.segments;
		return segments;
	}

	private ParseChildren(node: XmlNode): void
	{
		for (let index = 0; index < node.childNodes.length; index += 1)
		{
			const childNode = node.childNodes.item(index);

			if (childNode)
			{
				this.ParseNode(childNode);
			}
		}
	}

	private ParseNode(node: XmlNode): void
	{
		if (node.nodeType === TextNodeType)
		{
			const textValue = node.nodeValue ?? "";
			this.AppendText(textValue);
		}

		if (node.nodeType === ElementNodeType)
		{
			const element = node as XmlElement;
			const elementName = element.localName;

			if (elementName === "milestone")
			{
				this.ReadMilestone(element);
			}

			if (elementName === "speaker")
			{
				this.ReadSpeaker(element);
			}

			if (elementName === "lb")
			{
				this.AppendBreak();
			}

			if (elementName !== "milestone" && elementName !== "speaker" && elementName !== "lb")
			{
				this.ParseChildren(element);
			}
		}
	}

	private ReadMilestone(element: XmlElement): void
	{
		const unit = GetAttributeValue(element, "unit");
		const response = GetAttributeValue(element, "resp");
		const locatorValue = GetAttributeValue(element, "n");
		const isSection = unit === "section" && response?.toLowerCase() === "stephanus";
		const isParagraph = unit === "para";

		if (isSection)
		{
			this.FlushSegment();
			this.currentLocator = CreateLocator(response, locatorValue);
		}

		if (isParagraph)
		{
			this.FlushSegment();
		}
	}

	private ReadSpeaker(element: XmlElement): void
	{
		const speakerText = GetText(element);
		const normalizedSpeaker = NormalizeText(speakerText);
		this.currentSpeaker = normalizedSpeaker.length > 0 ? normalizedSpeaker : null;
	}

	private AppendText(value: string): void
	{
		const normalizedValue = value.replace(/\s+/g, " ");
		this.currentText += normalizedValue;
	}

	private AppendBreak(): void
	{
		this.currentText += "\n";
	}

	private FlushSegment(): void
	{
		const text = NormalizeText(this.currentText);

		if (text.length > 0)
		{
			const key = CreateSegmentKey(this.sourceFile, this.segmentIndex);
			const segment: ParsedTeiSegment = {
				key,
				locator: this.currentLocator,
				division: this.currentDivision,
				speaker: this.currentSpeaker,
				text,
				blockKind: this.currentBlockKind
			};
			this.segments.push(segment);
			this.segmentIndex += 1;
		}

		this.currentText = "";
	}
}

function ReadDivision(element: XmlElement): ParsedTeiSegment["division"]
{
	let ancestor: XmlNode | null = element.parentNode;
	let division: ParsedTeiSegment["division"] = null;

	while (ancestor !== null && division === null)
	{
		if (ancestor.nodeType === ElementNodeType)
		{
			const ancestorElement = ancestor as XmlElement;
			const subtype = GetAttributeValue(ancestorElement, "subtype");
			const value = GetAttributeValue(ancestorElement, "n");

			if (ancestorElement.localName === "div" && subtype === "book" && value !== null)
			{
				division = { kind: "book", value };
			}
		}

		ancestor = ancestor.parentNode;
	}

	return division;
}

function GetText(node: XmlNode): string
{
	let text = "";

	if (node.nodeType === TextNodeType)
	{
		text = node.nodeValue ?? "";
	}

	if (node.nodeType !== TextNodeType)
	{
		for (let index = 0; index < node.childNodes.length; index += 1)
		{
			const childNode = node.childNodes.item(index);

			if (childNode)
			{
				const childText = GetText(childNode);
				text += childText;
			}
		}
	}

	return text;
}

function NormalizeText(value: string): string
{
	const normalizedLines = value.replace(/[ \t]*\n[ \t]*/g, "\n");
	const normalizedText = normalizedLines.replace(/[ \t]+/g, " ");
	const trimmedText = normalizedText.trim();
	const composedText = trimmedText.normalize("NFC");
	return composedText;
}

function GetAttributeValue(element: XmlElement, attributeName: string): string | null
{
	const value = element.getAttribute(attributeName);
	let attributeValue: string | null = null;

	if (value && value.length > 0)
	{
		attributeValue = value;
	}

	return attributeValue;
}

function CreateLocator(response: string | null, value: string | null): ParsedTeiSegment["locator"]
{
	const scheme = response?.toLowerCase() ?? "generic";
	const locatorValue = value ?? "";
	const locator = locatorValue.length > 0
		? {
			scheme,
			value: locatorValue
		}
		: null;
	return locator;
}

function CreateSegmentKey(sourceFile: string, segmentIndex: number): string
{
	const indexText = String(segmentIndex).padStart(5, "0");
	const key = `${sourceFile}-${indexText}`;
	return key;
}

function IsBlock(element: XmlElement): boolean
{
	const elementName = element.localName;
	const isBlock = elementName === "p" || elementName === "sp" || elementName === "lg";
	return isBlock;
}

function GetBlockKind(element: XmlElement): BlockKind
{
	const elementName = element.localName;
	let blockKind: BlockKind = "narration";

	if (elementName === "sp")
	{
		blockKind = "speech";
	}

	if (elementName === "lg")
	{
		blockKind = "other";
	}

	return blockKind;
}

function CollectBlocks(node: XmlNode, blocks: XmlElement[]): void
{
	if (node.nodeType === ElementNodeType)
	{
		const element = node as XmlElement;
		const isBlock = IsBlock(element);

		if (isBlock)
		{
			blocks.push(element);
		}

		if (!isBlock)
		{
			for (let index = 0; index < node.childNodes.length; index += 1)
			{
				const childNode = node.childNodes.item(index);

				if (childNode)
				{
					CollectBlocks(childNode, blocks);
				}
			}
		}
	}
}

function ReadTitle(document: XmlDocument): string
{
	const titleNodes = document.getElementsByTagNameNS("*", "title");
	const titleNode = titleNodes.item(0);
	const titleText = titleNode ? GetText(titleNode) : "Untitled";
	const title = NormalizeText(titleText);
	return title;
}

function ReadAuthor(document: XmlDocument): string
{
	const authorNodes = document.getElementsByTagNameNS("*", "author");
	const authorNode = authorNodes.item(0);
	const authorText = authorNode ? GetText(authorNode) : "Unknown";
	const author = NormalizeText(authorText);
	return author;
}

function ReadEditor(document: XmlDocument): string | null
{
	const editorNodes = document.getElementsByTagNameNS("*", "editor");
	const editorNode = editorNodes.item(0);
	const editorText = editorNode ? GetText(editorNode) : "";
	const normalizedEditor = NormalizeText(editorText);
	const editor = normalizedEditor.length > 0 ? normalizedEditor : null;
	return editor;
}

function ReadBlocks(document: XmlDocument): XmlElement[]
{
	const bodyNodes = document.getElementsByTagNameNS("*", "body");
	const bodyNode = bodyNodes.item(0);
	const blocks: XmlElement[] = [];

	if (bodyNode)
	{
		CollectBlocks(bodyNode, blocks);
	}

	return blocks;
}

export function ParseTeiWork(xmlText: string, sourceFile: string): ParsedTeiWork
{
	const document = new DOMParser().parseFromString(xmlText, "application/xml");
	const title = ReadTitle(document);
	const author = ReadAuthor(document);
	const editor = ReadEditor(document);
	const blocks = ReadBlocks(document);
	const collector = new SegmentCollector(sourceFile);

	for (const block of blocks)
	{
		collector.ParseBlock(block);
	}

	const segments = collector.GetSegments();
	const workId = sourceFile.replace(/\.xml$/i, "");
	const parsedWork: ParsedTeiWork = {
		id: workId,
		title,
		titleGreek: title,
		author,
		language: "grc",
		editor,
		sourceFile,
		segments
	};
	return parsedWork;
}
