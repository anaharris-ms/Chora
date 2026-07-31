import { ipcMain, type WebContents } from "electron";
import type { ChatContext, ChatStreamDelta } from "../../shared/chat/chat-types.js";
import type { ModelDeltaHandler, ProviderId } from "../../shared/chat/model-types.js";
import { IPC_CHANNELS } from "../../shared/contracts/ipc-channels.js";
import { LibraryService } from "../library/library-service.js";
import { GetConfiguredProvider, GetProviderOptions } from "../models/model-provider-factory.js";
import { ResolveChatContext } from "./chat-context-service.js";
import { ChatService } from "./chat-service.js";

export class ChatIpcController
{
	private readonly channels = [IPC_CHANNELS.startChat, IPC_CHANNELS.continueChat, IPC_CHANNELS.getChatTools, IPC_CHANNELS.getConfiguredProvider, IPC_CHANNELS.getProviderOptions] as const;

	public constructor(private readonly sessions: ChatService, private readonly library: LibraryService)
	{
	}

	public Register(): void
	{
		ipcMain.handle(IPC_CHANNELS.startChat, async (event, context: ChatContext, providerId: ProviderId, question: string, requestId: string) =>
		{
			const resolved = await this.ResolveContextAsync(context);
			return this.sessions.Start(resolved, providerId, question, this.CreateDeltaHandler(event.sender, requestId));
		});
		ipcMain.handle(IPC_CHANNELS.continueChat, async (event, conversationId: string, context: ChatContext, question: string, requestId: string) =>
		{
			const resolved = await this.ResolveContextAsync(context);
			return this.sessions.Continue(conversationId, resolved, question, this.CreateDeltaHandler(event.sender, requestId));
		});
		ipcMain.handle(IPC_CHANNELS.getChatTools, () => this.sessions.GetTools());
		ipcMain.handle(IPC_CHANNELS.getConfiguredProvider, () => GetConfiguredProvider());
		ipcMain.handle(IPC_CHANNELS.getProviderOptions, () => GetProviderOptions());
	}

	public Unregister(): void
	{
		for (const channel of this.channels) ipcMain.removeHandler(channel);
	}

	private CreateDeltaHandler(sender: WebContents, requestId: string): ModelDeltaHandler
	{
		return (text) =>
		{
			const delta: ChatStreamDelta = { requestId, text };
			if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.chatDelta, delta);
		};
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
