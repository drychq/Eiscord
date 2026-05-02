import { create } from 'zustand';

type WorkspaceState = {
  currentChannelId: string;
  currentServerId: string;
  isVoicePanelOpen: boolean;
  setCurrentChannelId: (channelId: string) => void;
  setCurrentServerId: (serverId: string) => void;
  setVoicePanelOpen: (isOpen: boolean) => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  currentChannelId: 'general',
  currentServerId: 'course',
  isVoicePanelOpen: true,
  setCurrentChannelId: (channelId) => set({ currentChannelId: channelId }),
  setCurrentServerId: (serverId) => set({ currentServerId: serverId }),
  setVoicePanelOpen: (isOpen) => set({ isVoicePanelOpen: isOpen }),
}));
