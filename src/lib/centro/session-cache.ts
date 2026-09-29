/**
 * Caché en memoria del Centro Alcohn. Se limpia al cerrar sesión / cambiar de usuario.
 * No usa localStorage para conversaciones ni contenido privado.
 */

import type { CentroArticleMeta, CentroChatMessage } from './types';

type CacheState = {
  userId: string | null;
  version: string | null;
  contentHash: string | null;
  articles: CentroArticleMeta[] | null;
  chatMessages: CentroChatMessage[];
  chatNoticeShown: boolean;
};

const state: CacheState = {
  userId: null,
  version: null,
  contentHash: null,
  articles: null,
  chatMessages: [],
  chatNoticeShown: false,
};

export function bindCentroUser(userId: string | null) {
  if (state.userId && userId && state.userId !== userId) {
    clearCentroSession();
  }
  if (!userId) {
    clearCentroSession();
    return;
  }
  state.userId = userId;
}

export function clearCentroSession() {
  state.userId = null;
  state.version = null;
  state.contentHash = null;
  state.articles = null;
  state.chatMessages = [];
  state.chatNoticeShown = false;
}

export function getCachedCatalog(): {
  version: string;
  contentHash: string;
  articles: CentroArticleMeta[];
} | null {
  if (!state.articles || !state.version || !state.contentHash) return null;
  return { version: state.version, contentHash: state.contentHash, articles: state.articles };
}

export function setCachedCatalog(data: {
  version: string;
  contentHash: string;
  articles: CentroArticleMeta[];
}) {
  state.version = data.version;
  state.contentHash = data.contentHash;
  state.articles = data.articles;
}

export function getChatMessages(): CentroChatMessage[] {
  return state.chatMessages;
}

export function setChatMessages(messages: CentroChatMessage[]) {
  state.chatMessages = messages;
}

export function getChatNoticeShown(): boolean {
  return state.chatNoticeShown;
}

export function setChatNoticeShown(value: boolean) {
  state.chatNoticeShown = value;
}

export function getContentVersion(): string | null {
  return state.version;
}
