import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pi } from '../lib/pi';
import { useSubAgentLive } from './useSubAgentLive';

afterEach(() => vi.restoreAllMocks());

describe('useSubAgentLive', () => {
  it('running + agentId → polls registry and exposes model', async () => {
    vi.spyOn(pi, 'subagentList').mockResolvedValue([
      { id: 'ag1', task: 't', status: 'running', model: 'gpt-5.3-codex', transcript: '', createdAt: 0, updatedAt: 0 },
    ]);
    const { result } = renderHook(() => useSubAgentLive('ws', 'ag1', true));
    await waitFor(() => expect(pi.subagentList).toHaveBeenCalledWith('ws'));
    await waitFor(() => expect(result.current.model).toBe('gpt-5.3-codex'));
  });

  it('not running → never polls', () => {
    const spy = vi.spyOn(pi, 'subagentList').mockResolvedValue([]);
    renderHook(() => useSubAgentLive('ws', 'ag1', false));
    expect(spy).not.toHaveBeenCalled();
  });

  it('no agentId + sole running row → falls back by task/uniqueness and exposes model', async () => {
    vi.spyOn(pi, 'subagentList').mockResolvedValue([
      { id: 'ag9', task: 'foo', status: 'running', model: 'deepseek-v4', transcript: '', createdAt: 0, updatedAt: 0 },
    ]);
    const { result } = renderHook(() => useSubAgentLive('ws', null, true, 'foo'));
    await waitFor(() => expect(result.current.model).toBe('deepseek-v4'));
  });

  it('no agentId + multiple running + no task match → does not guess', async () => {
    vi.spyOn(pi, 'subagentList').mockResolvedValue([
      { id: 'a', task: 'x', status: 'running', model: 'm1', transcript: '', createdAt: 0, updatedAt: 0 },
      { id: 'b', task: 'y', status: 'running', model: 'm2', transcript: '', createdAt: 0, updatedAt: 0 },
    ]);
    const { result } = renderHook(() => useSubAgentLive('ws', null, true, 'zzz'));
    await waitFor(() => expect(pi.subagentList).toHaveBeenCalled());
    expect(result.current.model).toBeNull();
  });
});
