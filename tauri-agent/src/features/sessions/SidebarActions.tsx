import { useState } from 'react';
import { Icon } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Search } from 'lucide-react';
import { useSessionStore } from '../../store/session';
import { SearchBox } from './SearchBox';

const styles = createStaticStyles(({ css }) => ({
  wrap: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 8px 4px;
  `,
  act: css`
    display: flex;
    align-items: center;
    gap: 10px;
    height: 32px;
    padding: 0 10px;
    border-radius: 7px;
    color: ${cssVar.colorText};
    cursor: pointer;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

export function SidebarActions() {
  const [searching, setSearching] = useState(false);
  const setKeyword = useSessionStore((s) => s.setSearchKeyword);

  const closeSearch = () => {
    setSearching(false);
    setKeyword('');
  };

  return (
    <div className={styles.wrap}>
      {searching ? (
        <div
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) closeSearch();
          }}
        >
          <SearchBox />
        </div>
      ) : (
        <div className={styles.act} onClick={() => setSearching(true)}>
          <Icon icon={Search} size="small" /> 搜索会话
        </div>
      )}
    </div>
  );
}
