import { getAssistantPlaceholder, getVisibleToolActivities } from './coach-tool-display';
import type { CoachToolActivity } from './coach-stream-store';

describe('coach-tool-display', () => {
  const gymTool: CoachToolActivity = {
    name: 'search_nearby_gyms',
    label: '正在搜索附近健身房…',
    status: 'running',
  };

  it('uses tool label as assistant placeholder while running', () => {
    expect(getAssistantPlaceholder([gymTool], true)).toBe('正在搜索附近健身房…');
  });

  it('shows 正在整理回复 after tools settle', () => {
    const done: CoachToolActivity = {
      ...gymTool,
      status: 'done',
      summary: '找到 5 家',
      endedAt: Date.now(),
    };
    expect(getAssistantPlaceholder([done], true)).toBe('正在整理回复…');
  });

  it('keeps done pill visible briefly then shows reply pending', () => {
    const done: CoachToolActivity = {
      ...gymTool,
      status: 'done',
      summary: '找到 5 家',
      endedAt: Date.now() - 500,
    };
    const rows = getVisibleToolActivities([done], true, false, Date.now());
    expect(rows.some((row) => row.status === 'done')).toBe(true);
  });

  it('shows reply pending row when waiting for streamed text', () => {
    const done: CoachToolActivity = {
      ...gymTool,
      status: 'done',
      endedAt: Date.now() - 5000,
    };
    const rows = getVisibleToolActivities([done], true, false, Date.now());
    expect(rows.some((row) => row.rowKey === 'reply-pending')).toBe(true);
  });
});
