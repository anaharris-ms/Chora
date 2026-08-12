import { ApplicationModule } from "../bootstrap/ApplicationModule.js";
import { LibraryService } from "../library/LibraryService.js";
import { ChatIpcController } from "./ChatIpcController.js";
import { ChatConversationRepository } from "./ChatConversationRepository.js";
import { ChatSessionRepository } from "./ChatSessionRepository.js";
import { ChatService } from "./ChatService.js";

// Owns Chat session behavior and its renderer IPC boundary.
export class ChatModule extends ApplicationModule
{
	// Chat behavior and session state owned for the application lifetime.
	private readonly service: ChatService;
	// Renderer IPC controller owned by this module.
	private readonly ipcController: ChatIpcController;

	// Creates the module with the Library context resolver it depends on.
	public constructor(library: LibraryService, documentsPath: string)
	{
		super();
		const sessions = new ChatSessionRepository();
		const conversations = new ChatConversationRepository(documentsPath);
		this.service = new ChatService(undefined, undefined, undefined, sessions, conversations);
		this.ipcController = new ChatIpcController(this.service, library);
	}

	// Registers the Chat IPC boundary.
	protected StartCore(): void
	{
		this.ipcController.Register();
	}

	// Removes the Chat IPC boundary.
	protected StopCore(): void
	{
		this.ipcController.Unregister();
		this.service.Stop();
	}
}