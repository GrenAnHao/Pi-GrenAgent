import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../stores/AgentStoreContext', () => ({
  useAgentStoreContext: () => ({ workspace: '/ws' }),
}));

const { rvList, runCommand, prompt, getGitDiff } = vi.hoisted(() => ({
  rvList: vi.fn(() =>
    Promise.resolve([
      { id: 'n1', file: 'a.ts', line: 10, severity: 'major', message: 'bug here', createdAt: 100 },
      { id: 'n2', file: 'b.ts', line: null, severity: 'nit', message: 'style', createdAt: 200 },
    ]),
  ),
  runCommand: vi.fn(() => Promise.resolve()),
  prompt: vi.fn(() => Promise.resolve()),
  getGitDiff: vi.fn(() => Promise.resolve('@@ -1 +1 @@\n-one\n+two')),
}));
vi.mock('../../lib/pi', () => ({ pi: { rvList, runCommand, prompt, getGitDiff } }));

import { ReviewPanel } from './ReviewPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ReviewPanel', () => {
  it('shows total and grouped findings', async () => {
    render(<ReviewPanel />);
    await waitFor(() => expect(screen.getByTestId('rv-header').textContent).toContain('2'));
    expect(screen.getByTestId('rv-note-n1').textContent).toContain('a.ts');
    expect(screen.getByTestId('rv-note-n1').textContent).toContain('10');
    expect(screen.getByTestId('rv-note-n2')).toBeTruthy();
  });

  it('shows detail when a finding is clicked', async () => {
    render(<ReviewPanel />);
    await waitFor(() => expect(screen.getByTestId('rv-note-n1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('rv-note-n1'));
    expect(screen.getByTestId('rv-detail').textContent).toContain('bug here');
    expect(screen.getByTestId('rv-detail').textContent).toContain('major');
  });

  it('clears review notes via /review clear', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ReviewPanel />);
    await waitFor(() => expect(screen.getByTestId('rv-clear')).toBeTruthy());
    fireEvent.click(screen.getByTestId('rv-clear'));
    await waitFor(() => expect(runCommand).toHaveBeenCalledWith('/ws', '/review clear'));
  });

  it('triggers agent review via prompt', async () => {
    render(<ReviewPanel />);
    await waitFor(() => expect(screen.getByTestId('rv-agent')).toBeTruthy());
    fireEvent.click(screen.getByTestId('rv-agent'));
    await waitFor(() => expect(prompt).toHaveBeenCalled());
  });

  it('loads file diff in detail when a finding is selected', async () => {
    render(<ReviewPanel />);
    await waitFor(() => expect(screen.getByTestId('rv-note-n1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('rv-note-n1'));
    await waitFor(() => expect(getGitDiff).toHaveBeenCalledWith('/ws', 'a.ts'));
    await waitFor(() => expect(screen.getByTestId('rv-diff').textContent).toContain('two'));
  });
});
