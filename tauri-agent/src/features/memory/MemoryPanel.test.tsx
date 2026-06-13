import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { memStats, memList, runCommand } = vi.hoisted(() => ({
  memStats: vi.fn(() => Promise.resolve({ project: 1, global: 1 })),
  memList: vi.fn(() =>
    Promise.resolve([
      { id: 'g1', text: 'global fact', category: null, createdAt: 200, scope: 'global' },
      { id: 'p1', text: 'project pref', category: 'preference', createdAt: 100, scope: 'project' },
    ]),
  ),
  runCommand: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../stores/AgentStoreContext', () => ({
  useAgentStoreContext: () => ({ workspace: '/ws' }),
}));
vi.mock('../../lib/pi', () => ({ pi: { memStats, memList, runCommand } }));

import { MemoryPanel } from './MemoryPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MemoryPanel', () => {
  it('shows stats and both scopes by default', async () => {
    render(<MemoryPanel />);
    await waitFor(() => expect(screen.getByTestId('mem-header').textContent).toContain('项目 1'));
    expect(screen.getByTestId('mem-header').textContent).toContain('全局 1');
    expect(screen.getByTestId('mem-item-global-g1')).toBeTruthy();
    expect(screen.getByTestId('mem-item-project-p1')).toBeTruthy();
  });

  it('filters by scope', async () => {
    render(<MemoryPanel />);
    await waitFor(() => expect(screen.getByTestId('mem-item-project-p1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('mem-filter-project'));
    expect(screen.queryByTestId('mem-item-global-g1')).toBeNull();
    expect(screen.getByTestId('mem-item-project-p1')).toBeTruthy();
  });

  it('shows detail when an item is clicked', async () => {
    render(<MemoryPanel />);
    await waitFor(() => expect(screen.getByTestId('mem-item-project-p1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('mem-item-project-p1'));
    expect(screen.getByTestId('mem-detail').textContent).toContain('project pref');
    expect(screen.getByTestId('mem-detail').textContent).toContain('preference');
  });

  it('deletes the selected memory via /memory forget', async () => {
    render(<MemoryPanel />);
    await waitFor(() => expect(screen.getByTestId('mem-item-project-p1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('mem-item-project-p1'));
    fireEvent.click(screen.getByTestId('mem-delete'));
    await waitFor(() => expect(runCommand).toHaveBeenCalledWith('/ws', '/memory forget p1'));
  });

  it('clears memories via /memory clear', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryPanel />);
    await waitFor(() => expect(screen.getByTestId('mem-clear')).toBeTruthy());
    fireEvent.click(screen.getByTestId('mem-clear'));
    await waitFor(() => expect(runCommand).toHaveBeenCalledWith('/ws', '/memory clear all'));
  });

  it('adds a memory via /memory add', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('用户喜欢深色');
    render(<MemoryPanel />);
    await waitFor(() => expect(screen.getByTestId('mem-add')).toBeTruthy());
    fireEvent.click(screen.getByTestId('mem-add'));
    await waitFor(() => expect(runCommand).toHaveBeenCalledWith('/ws', '/memory add 用户喜欢深色'));
  });

  it('promotes a project memory to global', async () => {
    render(<MemoryPanel />);
    await waitFor(() => expect(screen.getByTestId('mem-item-project-p1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('mem-item-project-p1'));
    fireEvent.click(screen.getByTestId('mem-promote'));
    await waitFor(() => expect(runCommand).toHaveBeenCalledWith('/ws', '/memory promote p1'));
  });
});
