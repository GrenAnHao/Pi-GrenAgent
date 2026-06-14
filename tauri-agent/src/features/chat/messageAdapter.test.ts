import { describe, expect, it } from 'vitest';
import { toLobeMessages } from './messageAdapter';
import type { DisplayMessage } from './groupMessages';

describe('toLobeMessages', () => {
  it('user → role:user + meta（含默认头像/标题元数据）', () => {
    const input: DisplayMessage[] = [{ kind: 'user', id: 'u1', text: 'hi' }];
    const out = toLobeMessages(input);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'u1',
      role: 'user',
      content: 'hi',
      meta: { title: 'You' },
    });
    expect(typeof out[0].createAt).toBe('number');
    expect(typeof out[0].updateAt).toBe('number');
  });

  it('assistantGroup → role:assistant + extra.kind=assistantGroup + tools 数组', () => {
    const input: DisplayMessage[] = [
      {
        kind: 'assistantGroup',
        id: 'a1',
        text: 'ok',
        thinking: 'reasoning',
        streaming: false,
        thinkingDuration: 1500,
        tools: [
          {
            id: 't1',
            toolCallId: 'tc1',
            toolName: 'grep',
            args: { q: 'x' },
            result: { hits: 3 },
            status: 'done',
          },
        ],
      },
    ];
    const out = toLobeMessages(input);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'a1',
      role: 'assistant',
      content: 'ok',
      extra: {
        kind: 'assistantGroup',
        thinking: 'reasoning',
        streaming: false,
        thinkingDuration: 1500,
        tools: [
          {
            id: 't1',
            toolCallId: 'tc1',
            toolName: 'grep',
            args: { q: 'x' },
            result: { hits: 3 },
            status: 'done',
          },
        ],
      },
    });
  });

  it('notice → role:system + extra.kind=notice', () => {
    const input: DisplayMessage[] = [
      { kind: 'notice', id: 'n1', customType: 'knowledge-rag', content: '已注入 3 条' },
    ];
    const out = toLobeMessages(input);
    expect(out[0]).toMatchObject({
      id: 'n1',
      role: 'system',
      content: '已注入 3 条',
      extra: { kind: 'notice', customType: 'knowledge-rag', content: '已注入 3 条' },
    });
  });

  it('孤儿 tool（无前置 assistantGroup）→ role:system + extra.kind=orphanTool', () => {
    const input: DisplayMessage[] = [
      {
        kind: 'tool',
        id: 't9',
        toolCallId: 'tc9',
        toolName: 'orphan',
        args: {},
        result: null,
        status: 'running',
      },
    ];
    const out = toLobeMessages(input);
    expect(out[0]).toMatchObject({
      id: 't9',
      role: 'system',
      content: '',
      extra: {
        kind: 'orphanTool',
        toolCallId: 'tc9',
        toolName: 'orphan',
        status: 'running',
      },
    });
  });

  it('混合顺序保留', () => {
    const input: DisplayMessage[] = [
      { kind: 'user', id: 'u1', text: 'hi' },
      { kind: 'notice', id: 'n1', customType: 'x', content: 'y' },
      {
        kind: 'assistantGroup',
        id: 'a1',
        text: 'ok',
        thinking: '',
        streaming: false,
        tools: [],
      },
    ];
    const out = toLobeMessages(input);
    expect(out.map((m) => m.id)).toEqual(['u1', 'n1', 'a1']);
    expect(out.map((m) => m.role)).toEqual(['user', 'system', 'assistant']);
  });
});
