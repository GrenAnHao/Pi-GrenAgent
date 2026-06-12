import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore } from './layoutStore';

describe('layoutStore', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      sidebarWidth: 240,
      sidebarOpen: true,
      rightPanelWidth: 320,
      rightPanelOpen: false,
      terminalHeight: 200,
      terminalOpen: false,
    });
  });

  it('should have default values', () => {
    const state = useLayoutStore.getState();
    expect(state.sidebarWidth).toBe(240);
    expect(state.rightPanelWidth).toBe(320);
    expect(state.terminalHeight).toBe(200);
  });

  it('should update sidebar width', () => {
    useLayoutStore.getState().setSidebarWidth(300);
    expect(useLayoutStore.getState().sidebarWidth).toBe(300);
  });

  it('should toggle sidebar', () => {
    useLayoutStore.getState().toggleSidebar();
    expect(useLayoutStore.getState().sidebarOpen).toBe(false);
    useLayoutStore.getState().toggleSidebar();
    expect(useLayoutStore.getState().sidebarOpen).toBe(true);
  });

  it('should update right panel width', () => {
    useLayoutStore.getState().setRightPanelWidth(400);
    expect(useLayoutStore.getState().rightPanelWidth).toBe(400);
  });

  it('should toggle right panel', () => {
    useLayoutStore.getState().toggleRightPanel();
    expect(useLayoutStore.getState().rightPanelOpen).toBe(true);
    useLayoutStore.getState().toggleRightPanel();
    expect(useLayoutStore.getState().rightPanelOpen).toBe(false);
  });

  it('should update terminal height', () => {
    useLayoutStore.getState().setTerminalHeight(300);
    expect(useLayoutStore.getState().terminalHeight).toBe(300);
  });

  it('should toggle terminal', () => {
    useLayoutStore.getState().toggleTerminal();
    expect(useLayoutStore.getState().terminalOpen).toBe(true);
    useLayoutStore.getState().toggleTerminal();
    expect(useLayoutStore.getState().terminalOpen).toBe(false);
  });

  it('should clamp sidebar width to [180, 600]', () => {
    useLayoutStore.getState().setSidebarWidth(50);
    expect(useLayoutStore.getState().sidebarWidth).toBe(180);
    useLayoutStore.getState().setSidebarWidth(9999);
    expect(useLayoutStore.getState().sidebarWidth).toBe(600);
  });

  it('should clamp right panel width to [200, 800]', () => {
    useLayoutStore.getState().setRightPanelWidth(10);
    expect(useLayoutStore.getState().rightPanelWidth).toBe(200);
    useLayoutStore.getState().setRightPanelWidth(9999);
    expect(useLayoutStore.getState().rightPanelWidth).toBe(800);
  });

  it('should clamp terminal height to [100, 600]', () => {
    useLayoutStore.getState().setTerminalHeight(10);
    expect(useLayoutStore.getState().terminalHeight).toBe(100);
    useLayoutStore.getState().setTerminalHeight(9999);
    expect(useLayoutStore.getState().terminalHeight).toBe(600);
  });
});
