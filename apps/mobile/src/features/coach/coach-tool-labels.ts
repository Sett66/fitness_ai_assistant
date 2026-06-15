import type { CoachToolName } from '@fitness/shared';
import { COACH_TOOL_PROGRESS_LABELS_ZH } from '@fitness/shared';

/** SSE label 缺失时的中文回退 */
export function coachToolProgressLabel(name: CoachToolName, label?: string): string {
  return label ?? COACH_TOOL_PROGRESS_LABELS_ZH[name] ?? name;
}
