import type { ChoraApi } from "../shared/contracts/ChoraApi.js";

declare global {
	interface Window {
		chora: ChoraApi;
	}
}
