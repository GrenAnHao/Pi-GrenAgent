import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { memHistory, runCommand } = vi.hoisted(() => ({
  memHistory: vi.fn(() =>
    Promise.resolve([
      { historyId: 2, memoryId: 'm1', op: 'UPDATE', oldText: 'uses npm', newText: 'uses pnpm', oldCategory: null, newCategory: null, reason: 'switch', version: 2, createdAt: 200, scope: 'project' },
      { historyId: 1, memoryId: 'm1', op: 'ADD', oldText: null, newText: 'uses npm', oldCategory: null, newCategory: null, reason: 'seed', version: 1, createdAt: 100, scope: 'project' },
    ]),
  ),
  runCommand: vi.fn(() => Promise.resolve('')),
}));
vi.mock('../../stores/AgentStoreContext', () => ({ useAgentStoreContext: () => ({ workspace: '/ws' }) }));
vi.mock('../../lib/pi', () => ({ pi: { memHistory, runCommand } }));

import { MemoryHistory } from './MemoryHistory';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MemoryHistory', () => {
  it('renders the change timeline', async () => {
    render(<MemoryHistory />);
    await waitFor(() => expect(screen.getByTestId('mem-hist-2')).toBeTruthy());
    expect(screen.getByTestId('mem-hist-2').textContent).toContain('uses pnpm');
    expect(screen.getByTestId('mem-hist-1').textContent).toContain('ADD');
  });

  it('rolls back via /memory rollback command', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryHistory />);
    await waitFor(() => expect(screen.getByTestId('mem-hist-rollback-2')).toBeTruthy());
    fireEvent.click(screen.getByTestId('mem-hist-rollback-2'));
    await waitFor(() => expect(runCommand).toHaveBeenCalledWith('/ws', '/memory rollback 2'));
  });
});
