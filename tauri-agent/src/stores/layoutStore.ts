import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const DEFAULT_SIDEBAR_WIDTH = 240;
const DEFAULT_RIGHT_PANEL_WIDTH = 320;
const DEFAULT_TERMINAL_HEIGHT = 200;

interface LayoutState {
  sidebarWidth: number;
  sidebarOpen: boolean;
  rightPanelWidth: number;
  rightPanelOpen: boolean;
  terminalHeight: number;
  terminalOpen: boolean;

  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
  setRightPanelWidth: (width: number) => void;
  toggleRightPanel: () => void;
  setTerminalHeight: (height: number) => void;
  toggleTerminal: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      sidebarOpen: true,
      rightPanelWidth: DEFAULT_RIGHT_PANEL_WIDTH,
      rightPanelOpen: false,
      terminalHeight: DEFAULT_TERMINAL_HEIGHT,
      terminalOpen: false,

      setSidebarWidth: (width) =>
        set({ sidebarWidth: Math.max(180, Math.min(width, 600)) }),

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setRightPanelWidth: (width) =>
        set({ rightPanelWidth: Math.max(200, Math.min(width, 800)) }),

      toggleRightPanel: () =>
        set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),

      setTerminalHeight: (height) =>
        set({ terminalHeight: Math.max(100, Math.min(height, 600)) }),

      toggleTerminal: () => set((state) => ({ terminalOpen: !state.terminalOpen })),
    }),
    {
      name: 'hermes-layout',
      partialize: (state) => ({
        sidebarWidth: state.sidebarWidth,
        rightPanelWidth: state.rightPanelWidth,
        terminalHeight: state.terminalHeight,
        sidebarOpen: state.sidebarOpen,
        rightPanelOpen: state.rightPanelOpen,
        terminalOpen: state.terminalOpen,
      }),
    },
  ),
);
