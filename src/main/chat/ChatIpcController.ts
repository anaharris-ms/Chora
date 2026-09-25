import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import type { ChatContext, ChatConversationSnapshot, ChatConversationSummary, ChatResult, ChatStreamDelta, ChatToolDefinition } from "../../shared/chat/ChatTypes.js";
import type { ModelDeltaHandler, ModelSelection, ProviderId, ProviderOption } from "../../shared/chat/ModelTypes.js";
import { IPC_CHANNELS } from "../../shared/contracts/IpcChannels.js";
import { LibraryService } from "../library/LibraryService.js";
import { GetConfiguredProvider, GetProviderOptionsAsync } from "../models/ModelProviderFactory.js";
import { ResolveChatContext } from "./ChatContextService.js";
import { ChatService } from "./ChatService.js";

export class ChatIpcController
{
	// Channels owned by the Chat feature's renderer boundary.
	private readonly channels = [
		IPC_CHANNELS.startChat,
		IPC_CHANNELS.continueChat,
		IPC_CHANNELS.listChatConversations,
		IPC_CHANNELS.loadChatConversation,
		IPC_CHANNELS.deleteChatConversation,
		IPC_CHANNELS.getChatTools,
		IPC_CHANNELS.getConfiguredProvider,
		IPC_CHANNELS.getProviderOptions
	] as const;
	// Bound Electron handler that begins a durable conversation.
	private readonly startHandler: (event: IpcMainInvokeEvent, context: ChatContext, selection: ModelSelection, question: string, requestId: string) => Promise<ChatResult>;
	// Bound Electron handler that continues a durable conversation.
	private readonly continueHandler: (event: IpcMainInvokeEvent, conversationId: string, context: ChatContext, question: string, requestId: string) => Promise<ChatResult>;
	// Bound Electron handler that reads conversation summaries.
	private readonly listConversationsHandler: () => Promise<ChatConversationSummary[]>;
	// Bound Electron handler that reads one durable conversation.
	private readonly loadConversationHandler: (_event: IpcMainInvokeEvent, conversationId: string) => Promise<ChatConversationSnapshot>;
	// Bound Electron handler that deletes one saved conversation.
	private readonly deleteConversationHandler: (_event: IpcMainInvokeEvent, conversationId: string) => Promise<void>;
	// Bound Electron handler that reads available Chat tools.
	private readonly toolsHandler: () => ChatToolDefinition[];
	// Bound Electron handler that reads the configured default provider.
	private readonly configuredProviderHandler: () => ProviderId;
	// Bound Electron handler that reads selectable provider options.
	private readonly providerOptionsHandler: () => Promise<ProviderOption[]>;

	public constructor(private readonly sessions: ChatService, private readonly library: LibraryService)
	{
		this.startHandler = this.HandleStartAsync.bind(this);
		this.continueHandler = this.HandleContinueAsync.bind(this);
		this.listConversationsHandler = this.HandleListConversationsAsync.bind(this);
		this.loadConversationHandler = this.HandleLoadConversationAsync.bind(this);
		this.deleteConversationHandler = this.HandleDeleteConversationAsync.bind(this);
		this.toolsHandler = this.HandleGetTools.bind(this);
		this.configuredProviderHandler = this.HandleGetConfiguredProvider.bind(this);
		this.providerOptionsHandler = this.HandleGetProviderOptions.bind(this);
	}

	public Register(): void
	{
		ipcMain.handle(IPC_CHANNELS.startChat, this.startHandler);
		ipcMain.handle(IPC_CHANNELS.continueChat, this.continueHandler);
		ipcMain.handle(IPC_CHANNELS.listChatConversations, this.listConversationsHandler);
		ipcMain.handle(IPC_CHANNELS.loadChatConversation, this.loadConversationHandler);
		ipcMain.handle(IPC_CHANNELS.deleteChatConversation, this.deleteConversationHandler);
		ipcMain.handle(IPC_CHANNELS.getChatTools, this.toolsHandler);
		ipcMain.handle(IPC_CHANNELS.getConfiguredProvider, this.configuredProviderHandler);
		ipcMain.handle(IPC_CHANNELS.getProviderOptions, this.providerOptionsHandler);
	}

	public Unregister(): void
	{
		for (const channel of this.channels) ipcMain.removeHandler(channel);
	}

	private CreateDeltaHandler(sender: WebContents, requestId: string): ModelDeltaHandler
	{
		function SendDelta(text: string): void
		{
			const delta: ChatStreamDelta = { requestId, text };
			const isAvailable = !sender.isDestroyed();

			if (isAvailable)
			{
				sender.send(IPC_CHANNELS.chatDelta, delta);
			}
		}

		return SendDelta;
	}

	// Resolves context and begins a new Chat conversation.
	private async HandleStartAsync(event: IpcMainInvokeEvent, context: ChatContext, selection: ModelSelection, question: string, requestId: string): Promise<ChatResult>
	{
		const resolvedContext = await this.ResolveContextAsync(context);
		const deltaHandler = this.CreateDeltaHandler(event.sender, requestId);
		const result = await this.sessions.Start(resolvedContext, selection, question, deltaHandler);

		return result;
	}

	// Resolves context and continues an existing Chat conversation.
	private async HandleContinueAsync(event: IpcMainInvokeEvent, conversationId: string, context: ChatContext, question: string, requestId: string): Promise<ChatResult>
	{
		const resolvedContext = await this.ResolveContextAsync(context);
		const deltaHandler = this.CreateDeltaHandler(event.sender, requestId);
		const result = await this.sessions.Continue(conversationId, resolvedContext, question, deltaHandler);

		return result;
	}

	// Lists the reader's durable conversation summaries.
	private HandleListConversationsAsync(): Promise<ChatConversationSummary[]>
	{
		const conversations = this.sessions.ListConversationsAsync();

		return conversations;
	}

	// Loads one reader-owned durable conversation.
	private HandleLoadConversationAsync(_event: IpcMainInvokeEvent, conversationId: string): Promise<ChatConversationSnapshot>
	{
		const conversation = this.sessions.GetConversationAsync(conversationId);

		return conversation;
	}

	// Deletes a saved conversation through its owning service.
	private async HandleDeleteConversationAsync(_event: IpcMainInvokeEvent, conversationId: string): Promise<void>
	{
		await this.sessions.DeleteConversationAsync(conversationId);
	}

	// Lists available Chat tools for the renderer.
	private HandleGetTools(): ChatToolDefinition[]
	{
		const tools = this.sessions.GetTools();

		return tools;
	}

	// Returns the default provider selected by main-process configuration.
	private HandleGetConfiguredProvider(): ProviderId
	{
		const provider = GetConfiguredProvider();

		return provider;
	}

	// Lists model providers that may start a new Chat conversation.
	private HandleGetProviderOptions(): Promise<ProviderOption[]>
	{
		const options = GetProviderOptionsAsync();

		return options;
	}

	private async ResolveContextAsync(context: ChatContext): Promise<ChatContext>
	{
		let resolved = context;
		if (context.mode !== "FREE")
		{
			const text = await this.library.GetAsync(context.documentId);
			resolved = ResolveChatContext(text, context);
		}
		return resolved;
	}
}
