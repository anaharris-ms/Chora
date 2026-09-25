import { contextBridge, ipcRenderer } from "electron";
import type { ChatContext, ChatConversationSnapshot, ChatConversationSummary, ChatResult, ChatStreamDelta, ChatToolDefinition } from "../shared/chat/ChatTypes.js";
import type { ModelSelection, ProviderId, ProviderOption } from "../shared/chat/ModelTypes.js";
import type { SelectionAction } from "../shared/library/SelectionTypes.js";
import type { LibraryText, LibraryTextSummary, SourceNotice } from "../shared/library/LibraryTypes.js";
import type { Dream } from "../shared/dreams/DreamTypes.js";
import type { PatternRecord } from "../shared/patterns/PatternTypes.js";
import { IPC_CHANNELS } from "../shared/contracts/IpcChannels.js";
import type { ApiSubscription, ChoraApi } from "../shared/contracts/ChoraApi.js";

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

async function CopySelectedText(selectedText: string): Promise<void>
{
	await ipcRenderer.invoke(IPC_CHANNELS.copySelectedText, selectedText);
}

async function LookUpWord(selectedText: string): Promise<void>
{
	await ipcRenderer.invoke(IPC_CHANNELS.lookUpWord, selectedText);
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

async function ListPatterns(workId: string): Promise<PatternRecord[]>
{
	const result = await ipcRenderer.invoke(IPC_CHANNELS.listPatterns, workId);

	return result as PatternRecord[];
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
	CopySelectedText,
	LookUpWord,
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
	ListPatterns,
	SaveDream,
	DeleteDream,
	ListDreams,
	AllocateDreamId
};

contextBridge.exposeInMainWorld("chora", api);
