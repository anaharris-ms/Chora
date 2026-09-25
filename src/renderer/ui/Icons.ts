import { createElement, Ellipsis, Pencil, Plus, Search, SlidersHorizontal, ArrowUpRight, ChevronLeft, ChevronRight, MessageCircle } from "lucide";

export const MoreIcon = createElement(Ellipsis).outerHTML;
export const EditIcon = createElement(Pencil).outerHTML;
export const AddIcon = createElement(Plus).outerHTML;
export const SearchIcon = createElement(Search).outerHTML;
export const SettingsIcon = createElement(SlidersHorizontal).outerHTML;
export const OpenIcon = createElement(ArrowUpRight).outerHTML;
export const PreviousIcon = createElement(ChevronLeft).outerHTML;
export const NextIcon = createElement(ChevronRight).outerHTML;
export const ChatIcon = createElement(MessageCircle).outerHTML;

// Shared inline SVG icon markup, reused across panels so button glyphs stay consistent.

// A floppy-disk outline, used for save actions.
export const SaveIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5z"></path><path d="M8 4v6h8V4M8 20v-6h8v6"></path></svg>`;

// An X outline, used for close actions.
export const CloseIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>`;

// A trash-can outline, used for delete actions.
export const TrashIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg>`;

// A gear outline, used for management/settings actions.
export const GearIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82A1.65 1.65 0 003 14H2.91a2 2 0 010-4H3a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"></path></svg>`;

// A chain-link outline, used for passage-attachment actions.
export const LinkIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 15l6-6"></path><path d="M8 17H6a4 4 0 010-8h2M16 7h2a4 4 0 010 8h-2"></path></svg>`;
