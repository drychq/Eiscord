import { create } from 'zustand';

import type { JoinVoiceMediaResponse } from '@eiscord/shared';

const RECENT_PATH_KEY = 'eiscord:recent-path';

function loadRecentPath(): string | null {
  try {
    return localStorage.getItem(RECENT_PATH_KEY);
  } catch {
    return null;
  }
}

function saveRecentPath(path: string): void {
  try {
    localStorage.setItem(RECENT_PATH_KEY, path);
  } catch {
    // ignore quota errors
  }
}

export type WorkspaceState = {
  activeServerId: string | null;
  activeChannelId: string | null;
  activeDmId: string | null;
  activeVoiceChannelId: string | null;
  activeVoiceSession: {
    channel_id: string;
    connection_status: string;
    deafen_state: boolean;
    mute_state: boolean;
    session_id: string;
    user_id: string;
  } | null;
  pendingVoiceMedia: JoinVoiceMediaResponse | null;
  isServerSettingsOpen: boolean;
  isProfilePanelOpen: boolean;
  isMobileNavOpen: boolean;
  recentPath: string | null;

  setActiveServerId: (serverId: string | null) => void;
  setActiveChannelId: (channelId: string | null) => void;
  setActiveDmId: (dmId: string | null) => void;
  setActiveVoiceChannelId: (voiceChannelId: string | null) => void;
  setActiveVoiceSession: (
    session: WorkspaceState['activeVoiceSession'],
  ) => void;
  setPendingVoiceMedia: (media: JoinVoiceMediaResponse | null) => void;
  setServerSettingsOpen: (open: boolean) => void;
  setProfilePanelOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  setRecentPath: (path: string) => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeServerId: null,
  activeChannelId: null,
  activeDmId: null,
  activeVoiceChannelId: null,
  activeVoiceSession: null,
  pendingVoiceMedia: null,
  isServerSettingsOpen: false,
  isProfilePanelOpen: false,
  isMobileNavOpen: false,
  recentPath: loadRecentPath(),

  setActiveServerId: (serverId) => set({ activeServerId: serverId }),
  setActiveChannelId: (channelId) => set({ activeChannelId: channelId }),
  setActiveDmId: (dmId) => set({ activeDmId: dmId }),
  setActiveVoiceChannelId: (voiceChannelId) =>
    set(
      voiceChannelId === null
        ? { activeVoiceChannelId: null, activeVoiceSession: null, pendingVoiceMedia: null }
        : { activeVoiceChannelId: voiceChannelId },
    ),
  setActiveVoiceSession: (session) =>
    set({
      activeVoiceChannelId: session?.channel_id ?? null,
      activeVoiceSession: session,
      ...(session ? {} : { pendingVoiceMedia: null }),
    }),
  setPendingVoiceMedia: (media) => set({ pendingVoiceMedia: media }),
  setServerSettingsOpen: (open) => set({ isServerSettingsOpen: open }),
  setProfilePanelOpen: (open) => set({ isProfilePanelOpen: open }),
  setMobileNavOpen: (open) => set({ isMobileNavOpen: open }),
  setRecentPath: (path) => {
    saveRecentPath(path);
    set({ recentPath: path });
  },
}));
