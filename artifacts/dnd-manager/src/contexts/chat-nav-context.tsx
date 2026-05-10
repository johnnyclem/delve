import { createContext, useContext } from "react";

export interface ChatNavContextValue {
  openWithConversation: (conversationId: number | null) => void;
}

export const ChatNavContext = createContext<ChatNavContextValue>({
  openWithConversation: () => {},
});

export function useChatNav(): ChatNavContextValue {
  return useContext(ChatNavContext);
}
