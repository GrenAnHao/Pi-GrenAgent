export interface StreamingSource {
  getState: () => { isStreaming: boolean };
  subscribe: (listener: (s: { isStreaming: boolean }) => void) => () => void;
}

/**
 * 等待一次 streaming 周期结束——用于发 prompt 后占住并发槽直到本会话流式真正结束。
 *
 * pi 的 prompt RPC 是“接受即返回”（preflight 成功即响应，流式走事件），因此 prompt
 * resolve 时 isStreaming 往往尚未翻 true。这里据此处理三种情形：
 * - 已在 streaming：等它转 false；
 * - 尚未 streaming：先等它开始，再等结束；
 * - startTimeoutMs 内始终未开始（prompt 被去重/忽略/被拒）：放行，避免永久占槽。
 */
export function awaitStreamingEnd(
  source: StreamingSource,
  opts: { startTimeoutMs?: number } = {},
): Promise<void> {
  const startTimeoutMs = opts.startTimeoutMs ?? 3000;
  return new Promise<void>((resolve) => {
    if (source.getState().isStreaming) {
      const unsub = source.subscribe((s) => {
        if (!s.isStreaming) {
          unsub();
          resolve();
        }
      });
      return;
    }

    let started = false;
    let unsub = () => {};
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      unsub();
      if (startTimer) clearTimeout(startTimer);
      resolve();
    };
    unsub = source.subscribe((s) => {
      if (s.isStreaming) started = true;
      else if (started) finish();
    });
    startTimer = setTimeout(() => {
      if (!started) finish();
    }, startTimeoutMs);
  });
}
