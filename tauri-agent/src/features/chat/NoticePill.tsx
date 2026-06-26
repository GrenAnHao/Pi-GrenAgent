import { Collapse, Flexbox, Icon } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Sparkles } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { LazyMarkdown } from './LazyMarkdown';

const TITLES: Record<string, string> = {
  'knowledge-rag': '已注入知识库上下文',
  'long-term-memory': '已注入长期记忆',
  'self-evolve-dream-start': 'Dream 已启动',
  'self-evolve-distill-start': 'Distill 已启动',
  'self-evolve-dream-done': 'Auto Dream 已完成',
  'self-evolve-distill-done': 'Auto Distill 已完成',
  'self-evolve-dream-error': 'Auto Dream 失败',
  'self-evolve-distill-error': 'Auto Distill 失败',
};

const styles = createStaticStyles(({ css }) => ({
  label: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  count: css`
    color: ${cssVar.colorTextQuaternary};
  `,
  // 注入内容收进限高滚动区，记忆/上下文再多也不会把对话流撑长；正文整体压紧、标题降级，
  // 不再是生硬的大 h1。
  body: css`
    max-height: 200px;
    overflow: auto;
    padding-inline-end: 4px;
    scrollbar-width: thin;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    & h1,
    & h2,
    & h3,
    & h4 {
      margin: 4px 0;
      font-size: 12px;
      font-weight: 600;
      color: ${cssVar.colorTextSecondary};
    }

    & p {
      margin: 4px 0;
    }

    & ul,
    & ol {
      margin: 2px 0;
      padding-inline-start: 18px;
    }

    & li {
      margin: 1px 0;
    }
  `,
}));

interface NoticePillProps {
  customType: string;
  content: string;
}

function NoticePillInner({ customType, content }: NoticePillProps) {
  const [expanded, setExpanded] = useState(false);
  const title = TITLES[customType] ?? '已注入上下文';

  // 剥离扩展注入的首个标题行（与折叠头标题重复、显得生硬），并数出条目数放到折叠头。
  const { body, count } = useMemo(() => {
    const stripped = content.replace(/^\s*#{1,6}[ \t]+.*(?:\r?\n)+/, '').trim();
    const text = stripped || content.trim();
    const n = (text.match(/^[ \t]*[-*][ \t]+/gm) ?? []).length;
    return { body: text, count: n };
  }, [content]);

  return (
    <div data-testid="notice-pill" style={{ paddingInlineStart: 4, maxWidth: '100%' }}>
      <Collapse
        variant="borderless"
        gap={4}
        activeKey={expanded ? ['notice'] : []}
        onChange={(keys) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          setExpanded(arr.includes('notice'));
        }}
        items={[
          {
            key: 'notice',
            label: (
              <Flexbox horizontal align="center" gap={6} className={styles.label}>
                <Icon icon={Sparkles} size={13} />
                <span>
                  {title}
                  {count > 0 ? <span className={styles.count}> · {count} 条</span> : null}
                </span>
              </Flexbox>
            ),
            children: (
              <div className={styles.body}>
                <LazyMarkdown variant="chat" fontSize={12}>
                  {body}
                </LazyMarkdown>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

export const NoticePill = memo(NoticePillInner);
