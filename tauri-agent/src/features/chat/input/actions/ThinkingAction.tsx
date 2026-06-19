import { useCallback, useEffect, useRef, useState } from 'react';
import { Select } from '@lobehub/ui/base-ui';
import { useAgentStoreContext } from '../../../../stores/AgentStoreContext';
import { useThinkingMemoryStore } from '../../../../stores/thinkingMemoryStore';
import { pi } from '../../../../lib/pi';
import { modelKey } from '../modelUtils';
import { levelOptions, type RpcModel } from '../thinkingLevels';

interface RpcSessionState {
  thinkingLevel?: string;
  model?: RpcModel | null;
}

// 记住每个 workspace 的推理档位 + 当前模型：切换对话时同步回显，避免选择器值闪动 / 瞬时消失重现
// （与 ModeAction 的 per-workspace 即时回显一致）。
const thinkingByWorkspace = new Map<string, { level: string; model: RpcModel | null }>();

export default function ThinkingAction() {
  const { workspace, workspaceReady } = useAgentStoreContext();
  const [level, setLevel] = useState(() => thinkingByWorkspace.get(workspace)?.level ?? 'off');
  const [model, setModel] = useState<RpcModel | null>(() => thinkingByWorkspace.get(workspace)?.model ?? null);
  const [ready, setReady] = useState(() => thinkingByWorkspace.has(workspace));
  // 单调递增的加载令牌：用户一旦选档就 +1，使在途的 loadLevel 结果失效，
  // 避免「打开时的 getState」晚到后把刚选的值覆盖回旧值。
  const loadSeq = useRef(0);
  // 模型切换信号：ModelAction 切模型并据记忆/默认设好后端档位后递增，这里据此重读后端刷新显示。
  const switchSeq = useThinkingMemoryStore((s) => s.switchSeq[workspace] ?? 0);

  // 切换对话（workspace 变化）时同步回显该 workspace 的缓存档位/模型：render 期对齐 state，不闪旧值，
  // 也不会让选择器先按旧模型显隐再跳变。
  const prevWorkspaceRef = useRef(workspace);
  if (prevWorkspaceRef.current !== workspace) {
    prevWorkspaceRef.current = workspace;
    const cached = thinkingByWorkspace.get(workspace);
    setLevel(cached?.level ?? 'off');
    setModel(cached?.model ?? null);
    setReady(cached !== undefined);
  }

  const loadLevel = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const state = (await pi.getState(workspace)) as RpcSessionState;
      if (seq !== loadSeq.current) return true;
      if (state?.thinkingLevel) setLevel(state.thinkingLevel);
      const nextModel = state?.model ?? null;
      setModel(nextModel);
      setReady(true);
      thinkingByWorkspace.set(workspace, {
        level: state?.thinkingLevel ?? thinkingByWorkspace.get(workspace)?.level ?? 'off',
        model: nextModel,
      });
      return true;
    } catch {
      setReady(false);
      return false;
    }
  }, [workspace]);

  useEffect(() => {
    if (!workspaceReady) {
      setReady(false);
      return;
    }
    void loadLevel();
    // switchSeq 变化（切模型）时也重读后端档位刷新显示。
  }, [workspace, workspaceReady, loadLevel, switchSeq]);

  const onChange = (next: string) => {
    loadSeq.current++;
    setLevel(next);
    thinkingByWorkspace.set(workspace, { level: next, model });
    void pi.setThinkingLevel(workspace, next);
    // 按模型记忆本次选择，切回该模型时恢复。
    if (model?.provider && model?.id) {
      useThinkingMemoryStore.getState().remember(modelKey(model.provider, model.id), next);
    }
  };

  // 每次打开都重新拉取：切换模型后档位随之更新。
  const onOpenChange = (open: boolean) => {
    if (open) void loadLevel();
  };

  const options = levelOptions(model);
  // 非推理模型只有 off 一档（无可选推理强度）：隐藏整个选择器，chatinput 不展示无意义控件。
  // 模型未加载完成时 model 为 null，levelOptions 同样只返回 off，故加载期间也不闪现。
  if (options.length <= 1) return null;
  // 当前档位若不在集合内（罕见），补一个回显项避免下拉空白。
  const withCurrent = options.some((o) => o.value === level) ? options : [...options, { label: level, value: level }];

  return (
    <Select
      size="small"
      popupMatchSelectWidth={false}
      disabled={!workspaceReady || !ready}
      value={level}
      options={withCurrent}
      placeholder="推理"
      style={{ width: 'auto', maxWidth: 120 }}
      onChange={onChange}
      onOpenChange={onOpenChange}
    />
  );
}
