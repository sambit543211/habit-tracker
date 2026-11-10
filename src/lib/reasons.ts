import type { ReasonCode } from '../types';

export const REASONS: { code: ReasonCode; label: string; emoji: string }[] = [
  { code: 'forgot', label: 'Forgot', emoji: '💭' },
  { code: 'no_time', label: 'No time', emoji: '⏳' },
  { code: 'low_energy', label: 'Low energy', emoji: '🪫' },
  { code: 'distracted', label: 'Distracted', emoji: '📱' },
  { code: 'other_priority', label: 'Something else', emoji: '🔀' },
  { code: 'overplanned', label: 'Overplanned', emoji: '📚' },
  { code: 'blocked', label: 'Blocked', emoji: '🚧' },
  { code: 'chose_not', label: 'Chose not to', emoji: '✋' },
];

export const reasonLabel = (code?: ReasonCode) =>
  REASONS.find((r) => r.code === code)?.label ?? 'Missed';

/** A gentle, research-backed suggestion for each kind of miss. */
export const REASON_TIPS: Record<ReasonCode, string> = {
  forgot: 'Anchor it to something you already do: "After I…, I will…".',
  no_time: 'Use the tiny version — 2 minutes still keeps the identity alive.',
  low_energy: 'Schedule it for your high-energy window, or shrink it.',
  distracted: 'Remove the temptation first — phone in another room, one tab open.',
  other_priority: 'If something else keeps winning, plan it explicitly — or ask if this still matters.',
  overplanned: 'Plan fewer things. 3 must-dos beats 10 maybes.',
  blocked: 'Write down the first concrete step to unblock it.',
  chose_not: 'Fine — but if this keeps happening, is it still a priority?',
};
