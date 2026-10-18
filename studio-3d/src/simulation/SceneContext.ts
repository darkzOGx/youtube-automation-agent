import React from 'react';
import { SceneManager } from './SceneManager';

/**
 * SceneContext — provides SceneManager to React components.
 *
 * Components that need to trigger 3D actions (startChat, endChat, sendMessage)
 * read from this context instead of calling store action stubs.
 *
 * Pure data (isChatting, chatMessages, etc.) still comes from useUiStore.
 */
export const SceneContext = React.createContext<SceneManager | null>(null);

export function useSceneManager(): SceneManager | null {
  return React.useContext(SceneContext);
}
