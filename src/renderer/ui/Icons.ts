import { createElement, Ellipsis, Pencil, Plus, Search, Settings, ArrowUpRight, ChevronLeft, ChevronRight, FileText } from "lucide";

export const MoreIcon = createElement(Ellipsis).outerHTML;
export const EditIcon = createElement(Pencil).outerHTML;
export const AddIcon = createElement(Plus).outerHTML;
export const SearchIcon = createElement(Search).outerHTML;
export const SettingsIcon = createElement(Settings).outerHTML;
export const OpenIcon = createElement(ArrowUpRight).outerHTML;
export const PreviousIcon = createElement(ChevronLeft).outerHTML;
export const NextIcon = createElement(ChevronRight).outerHTML;
export const DocumentIcon = createElement(FileText).outerHTML;

// Shared inline SVG icon markup, reused across panels so button glyphs stay consistent.

// A floppy-disk outline, used for save actions.
export const SaveIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l2 2v14H5z"></path><path d="M8 4v6h8V4M8 20v-6h8v6"></path></svg>`;

// An X outline, used for close actions.
export const CloseIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>`;

// A trash-can outline, used for delete actions.
export const TrashIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg>`;

// A chain-link outline, used for passage-attachment actions.
export const LinkIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 15l6-6"></path><path d="M8 17H6a4 4 0 010-8h2M16 7h2a4 4 0 010 8h-2"></path></svg>`;
