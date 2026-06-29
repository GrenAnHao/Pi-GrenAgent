import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { VList, type VListHandle } from 'virtua';
import type { DisplayMessage } from './groupMessages';

interface VirtualizedMessageListProps {
  display: DisplayMessage[];
  /** 单条消息渲染器（user/turn/tool/notice 分发）。 */
  renderItem: (msg: DisplayMessage) => ReactNode;
  /** 列表末尾附加元素（如「准备响应中」占位），作为最后一个虚拟条目。 */
  footer?: ReactNode;
  /** 填充方式：主对话父容器是 position:relative → 'absolute'；子代理面板是 flex 子项 → 'flex'（默认）。 */
  fill?: 'absolute' | 'flex';
  /** 每条消息左右内边距（主对话 24，子代理 16）。 */
  paddingInline?: number;
  'data-testid'?: string;
}

// 距底多少像素内算「贴底」：与原手写滚动阈值一致。
const BOTTOM_THRESHOLD = 120;

const fillStyle = (fill: 'absolute' | 'flex'): CSSProperties =>
  fill === 'absolute'
    ? { position: 'absolute', inset: 0 }
    : { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' };

/**
 * 共享虚拟化消息列表：virtua 只渲染视口 ± buffer 的条目（离屏卸载），
 * 并在用户停留在底部时随新内容/流式增长自动滚底（上滑后不打扰）。
 * 主对话与子代理对话共用，替代旧的 LazyMount + 手写 scrollTop/ResizeObserver。
 */
export function VirtualizedMessageList({
  display,
  renderItem,
  footer,
  fill = 'flex',
  paddingInline = 24,
  'data-testid': testId,
}: VirtualizedMessageListProps) {
  const ref = useRef<VListHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const countRef = useRef(0);
  const resizingRef = useRef(false);
  // 不贴底时 resize 的稳定锚点：顶部可见条目索引 + 该条目已滚过视口顶的像素。
  const anchorIndexRef = useRef(0);
  const anchorWithinRef = useRef(0);

  const itemStyle: CSSProperties = { paddingInline, paddingBlock: 4 };
  const children: ReactNode[] = display.map((msg) => (
    <div key={msg.id} style={itemStyle}>
      {renderItem(msg)}
    </div>
  ));
  if (footer) {
    children.push(
      <div key="__footer" style={itemStyle}>
        {footer}
      </div>,
    );
  }
  const count = children.length;
  countRef.current = count;

  // 贴底：仅在用户停留在底部时滚到最后一条（用 ref 读最新 count，供 resize 回调复用）。
  const stickToBottom = () => {
    if (atBottomRef.current && ref.current && countRef.current > 0) {
      ref.current.scrollToIndex(countRef.current - 1, { align: 'end' });
    }
  };

  // 内容变化（新消息 / 流式增长）后贴底。
  useEffect(stickToBottom);

  // 视口尺寸变化（窗口压缩 / 面板折叠 / 文字重排）时保持位置。
  // 难点：virtua 在 resize 时按自身锚点逐帧重排，中部阅读位会抖；且重排触发的 onScroll 会污染贴底判断。
  // 方案：resize 期间用 resizingRef 冻结 atBottomRef/锚点（onScroll 跳过），按冻结前意图持续钉回——
  //   贴底：交给收尾一次性 scrollToIndex(end)（virtua 自身贴底重排是平滑的，逐帧滚反而打架）；
  //   不贴底：逐帧 scrollTo(锚点条目当前 offset + 偏移)，盖掉 virtua 的抖动，把阅读位钉死。
  //   收尾再钉一次确保最终位置准确，并延一帧解冻以避开程序化滚动自身触发的 onScroll。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const restore = () => {
      const h = ref.current;
      if (!h) return;
      if (atBottomRef.current) {
        if (countRef.current > 0) h.scrollToIndex(countRef.current - 1, { align: 'end' });
      } else {
        // 用 scrollToIndex 而非 scrollTo：它保证锚点条目落入渲染范围，rapid resize 下即使条目高度暂时
        // 还是旧值也不会因 offset 越界而瞬间空白；align:'start'+offset 落点与原 scrollTo 等价。
        h.scrollToIndex(anchorIndexRef.current, { align: 'start', offset: anchorWithinRef.current });
      }
    };
    const ro = new ResizeObserver(() => {
      resizingRef.current = true;
      if (!atBottomRef.current) restore();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        restore();
        requestAnimationFrame(() => {
          resizingRef.current = false;
        });
      }, 100);
    });
    ro.observe(el);
    return () => {
      clearTimeout(settleTimer);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} data-testid={testId} style={fillStyle(fill)}>
      <VList
        ref={ref}
        style={{ height: '100%', flex: 1, minHeight: 0 }}
        onScroll={() => {
          if (resizingRef.current) return;
          const h = ref.current;
          if (!h) return;
          atBottomRef.current = h.scrollOffset + h.viewportSize >= h.scrollSize - BOTTOM_THRESHOLD;
          // 记录当前顶部可见条目作为锚点，供 resize 期间钉回阅读位置。
          anchorIndexRef.current = h.findItemIndex(h.scrollOffset);
          anchorWithinRef.current = h.scrollOffset - h.getItemOffset(anchorIndexRef.current);
        }}
      >
        {children}
      </VList>
    </div>
  );
}
