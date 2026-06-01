import { colors } from '../theme';

// In-app inbox messages. `unread: true` marks a message as a notification that
// counts toward the unread badge until the user reads it (see readMessageIds in
// appStore). Messages without the flag are evergreen content, never counted.
export interface AppMessage {
  id: number;
  icon: string;
  type: string;
  title: string;
  time: string;
  body: string;
  group?: string;
  unread?: boolean;
}

export const MESSAGES: AppMessage[] = [
  { id: 7, icon: '👋', type: 'insight', title: 'Welcome to your inbox', time: 'Today', body: 'This is where new insights, milestones, and app updates land. Tap a message to mark it read.', unread: true },
  { id: 1, icon: '✦', type: 'insight', title: 'Sleep × activity insight', time: 'Today', body: 'On the 3 nights you slept 8+ hours this week, your step count was 34% higher. Your sleep is your biggest lever right now.' },
  { id: 2, icon: '🍎', type: 'nutrition', title: 'Why protein timing matters', time: 'Yesterday', body: 'Eating 30g+ of protein within 2 hours of waking improves satiety and reduces afternoon cravings by up to 25%.' },
  { id: 3, icon: '🚭', type: 'quit', title: '18 days smoke-free 🎉', time: '2 days ago', body: 'Your lung cilia are now fully active again. Breathing will feel noticeably easier over the next week.' },
  { id: 4, icon: '😴', type: 'sleep', title: 'The science of deep sleep', time: '3 days ago', body: 'Deep sleep (NREM stage 3) is when your body repairs muscle tissue and consolidates memory. A consistent bedtime is the #1 predictor.' },
  { id: 5, icon: '🏃', type: 'activity', title: '14-day step streak', time: '4 days ago', body: "You've hit your step goal every day for two weeks. 14 days is the threshold where a behaviour becomes automatic. You've built a habit." },
  { id: 6, icon: '💡', type: 'insight', title: 'Hydration & cognitive performance', time: '1 week ago', body: 'Even mild dehydration (1–2% body weight) reduces focus, working memory, and reaction time. Your daily water goal is set for peak performance.', group: 'Last month' },
];

export const MSG_COLORS: Record<string, string> = {
  insight: colors.violet, nutrition: colors.green, quit: colors.rose, sleep: colors.sky, activity: colors.honey,
};

// Number of unread notification messages given the set of read message ids.
export function countUnread(readIds: number[]): number {
  return MESSAGES.filter((m) => m.unread && !readIds.includes(m.id)).length;
}
