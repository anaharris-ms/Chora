import { contextBridge, ipcRenderer } from "electron";
import type { ChatContext, ChatConversationSnapshot, ChatConversationSummary, ChatResult, ChatStreamDelta, ChatToolDefinition } from "../shared/chat/ChatTypes.js";
import type { ModelSelection, ProviderId, ProviderOption } from "../shared/chat/ModelTypes.js";
import type { SelectionAction } from "../shared/library/SelectionTypes.js";
import type { LibraryText, LibraryTextSummary, SourceNotice } from "../shared/library/LibraryTypes.js";
import type { Dream } from "../shared/dreams/DreamTypes.js";
import type { DeleteIdeaCommand, IdeaDiscoveryRequest, IdeaDiscoverySuggestion, IdeaRecord, SaveIdeaCommand } from "../shared/ideas/IdeaTypes.js";
import { IPC_CHANNELS } from "../shared/contracts/IpcChannels.js";
import type { ApiSubscription, ChoraApi, FormattingAction } from "../shared/contracts/ChoraApi.js";
import type { LookupBounds, LookupCommand, LookupState } from "../shared/library/LookupTypes.js";

async function ListLibraryTexts(): Promise<LibraryTextSummary[]>
{
	const works = await ipcRenderer.invoke(IPC_CHANNELS.listLibraryTexts);
	return works as LibraryTextSummary[];
}

async function LoadLibraryText(workId: string): Promise<LibraryText>
{
	const work = await ipcRenderer.invoke(IPC_CHANNELS.loadLibraryText, workId);
	return work as LibraryText;
}

function SubscribeLibraryTextSelected(callback: (workId: string) => void): ApiSubscription
{
	const listener = (_event: Electron.IpcRendererEvent, workId: unknown): void =>
	{
		callback(workId as string);
	};
	ipcRenderer.on(IPC_CHANNELS.selectLibraryText, listener);
	return () => ipcRenderer.removeListener(IPC_CHANNELS.selectLibraryText, listener);
}

function SubscribeExternalTextLoaded(callback: (work: LibraryText) => void): ApiSubscription
{
	const listener = (_event: Electron.IpcRendererEvent, work: unknown): void =>
	{
		callback(work as LibraryText);
	};
	ipcRenderer.on(IPC_CHANNELS.externalTextLoaded, listener);
	return () => ipcRenderer.removeListener(IPC_CHANNELS.externalTextLoaded, listener);
}

async function ShowSelectionContextMenu(): Promise<SelectionAction>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.showSelectionContextMenu);
	return result as SelectionAction;
}

async function ShowDreamSourceContextMenu(): Promise<SelectionAction>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.showDreamSourceContextMenu);
	return result as SelectionAction;
}

async function ShowFormattingContextMenu(): Promise<FormattingAction>
{
	const result = await new Promise<FormattingAction>(function AwaitNativeMenu(resolve): void
	{
		ipcRenderer.once(IPC_CHANNELS.showFormattingContextMenu, function ReceiveAction(_event, action: FormattingAction): void
		{
			resolve(action);
		});
	});
	return result;
}

async function CopySelectedText(selectedText: string): Promise<void>
{
	await ipcRenderer.invoke(IPC_CHANNELS.copySelectedText, selectedText);
}

async function LookUpWord(selectedText: string): Promise<void>
{
	await ipcRenderer.invoke(IPC_CHANNELS.lookUpWord, selectedText);
}

// Reads dictionary state when the renderer mounts.
async function GetLookupState(): Promise<LookupState>
{
	const state = await ipcRenderer.invoke(IPC_CHANNELS.getLookupState);
	return state as LookupState;
}

// Places or hides the isolated dictionary view.
async function SetLookupBounds(bounds: LookupBounds | null): Promise<void>
{
	await ipcRenderer.invoke(IPC_CHANNELS.setLookupBounds, bounds);
}

// Sends a dictionary toolbar command.
async function ExecuteLookupCommand(command: LookupCommand): Promise<void>
{
	await ipcRenderer.invoke(IPC_CHANNELS.lookupCommand, command);
}

// Subscribes to dictionary navigation and loading state.
function SubscribeLookupState(callback: (state: LookupState) => void): ApiSubscription
{
	function ReceiveState(_event: Electron.IpcRendererEvent, state: LookupState): void
	{
		callback(state);
	}
	function Unsubscribe(): void
	{
		ipcRenderer.removeListener(IPC_CHANNELS.lookupStateChanged, ReceiveState);
	}
	ipcRenderer.on(IPC_CHANNELS.lookupStateChanged, ReceiveState);
	return Unsubscribe;
}

async function StartChat(context: ChatContext, selection: ModelSelection, question: string, requestId: string): Promise<ChatResult>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.startChat, context, selection, question, requestId);

	return result as ChatResult;
}

async function ContinueChat(conversationId: string, context: ChatContext, question: string, requestId: string): Promise<ChatResult>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.continueChat, conversationId, context, question, requestId);

	return result as ChatResult;
}

async function ListChatConversations(): Promise<ChatConversationSummary[]>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.listChatConversations);

	return result as ChatConversationSummary[];
}

// Deletes a saved conversation through the isolated bridge.
async function DeleteChatConversation(conversationId: string): Promise<void>
{
	await ipcRenderer.invoke(IPC_CHANNELS.deleteChatConversation, conversationId);
}

// Loads a saved conversation through the isolated bridge.
async function LoadChatConversation(conversationId: string): Promise<ChatConversationSnapshot>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.loadChatConversation, conversationId);

	return result as ChatConversationSnapshot;
}

async function GetChatTools(): Promise<ChatToolDefinition[]>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.getChatTools);

	return result as ChatToolDefinition[];
}

function SubscribeChatDelta(callback: (delta: ChatStreamDelta) => void): ApiSubscription
{
	const listener = (_event: Electron.IpcRendererEvent, delta: unknown): void =>
	{
		callback(delta as ChatStreamDelta);
	};
	ipcRenderer.on(IPC_CHANNELS.chatDelta, listener);
	return () => ipcRenderer.removeListener(IPC_CHANNELS.chatDelta, listener);
}

async function GetConfiguredProvider(): Promise<ProviderId>
{
	const provider = await ipcRenderer.invoke(IPC_CHANNELS.getConfiguredProvider);

	return provider as ProviderId;
}

async function GetProviderOptions(): Promise<ProviderOption[]>
{
	const options = await ipcRenderer.invoke(IPC_CHANNELS.getProviderOptions);

	return options as ProviderOption[];
}

async function GetSourceNotice(workId: string): Promise<SourceNotice>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.getSourceNotice, workId);
	return result as SourceNotice;
}

// Lists durable Ideas through the isolated renderer bridge.
async function ListIdeas(workId: string): Promise<IdeaRecord[]>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.listIdeas, workId);

	return result as IdeaRecord[];
}

// Discovers related existing Signals through the isolated renderer bridge.
async function DiscoverIdeaSignals(request: IdeaDiscoveryRequest): Promise<IdeaDiscoverySuggestion[]>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.discoverIdeaSignals, request);

	return result as IdeaDiscoverySuggestion[];
}

// Saves reader-editable Idea data through the isolated renderer bridge.
async function SaveIdea(command: SaveIdeaCommand): Promise<IdeaRecord>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.saveIdea, command);

	return result as IdeaRecord;
}

// Deletes one work-owned Idea through the isolated renderer bridge.
async function DeleteIdea(command: DeleteIdeaCommand): Promise<void>
{
	await ipcRenderer.invoke(IPC_CHANNELS.deleteIdea, command);
}

async function SaveDream(dream: Dream): Promise<Dream>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.saveDream, dream);

	return result as Dream;
}

async function ListDreams(): Promise<Dream[]>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.listDreams);

	return result as Dream[];
}

async function DeleteDream(dreamId: string): Promise<void>
{
	await ipcRenderer.invoke(IPC_CHANNELS.deleteDream, dreamId);
}

async function AllocateDreamId(): Promise<string>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.allocateDreamId);

	return result as string;
}

const api: ChoraApi = {
	ListLibraryTexts,
	LoadLibraryText,
	SubscribeLibraryTextSelected,
	SubscribeExternalTextLoaded,
	ShowSelectionContextMenu,
	ShowDreamSourceContextMenu,
	ShowFormattingContextMenu,
	CopySelectedText,
	LookUpWord,
	GetLookupState,
	SetLookupBounds,
	ExecuteLookupCommand,
	SubscribeLookupState,
	StartChat,
	ContinueChat,
	ListChatConversations,
	LoadChatConversation,
	DeleteChatConversation,
	GetChatTools,
	SubscribeChatDelta,
	GetConfiguredProvider,
	GetProviderOptions,
	GetSourceNotice,
	ListIdeas,
	DiscoverIdeaSignals,
	SaveIdea,
	DeleteIdea,
	SaveDream,
	DeleteDream,
	ListDreams,
	AllocateDreamId
};

contextBridge.exposeInMainWorld("chora", api);
