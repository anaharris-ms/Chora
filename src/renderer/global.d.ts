import type { ChoraApi } from "../shared/contracts/chora-api.js";

declare global {
	interface Window {
		chora: ChoraApi;
	}
}
