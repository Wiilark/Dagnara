import { colors } from '../theme';

// In-app inbox messages. `unread: true` marks a message as a notification that
// counts toward the unread badge until the user reads it (see readMessageIds in
// appStore). Messages without the flag are evergreen content, never counted.
export interface AppMessage {
  id: number;
  icon: string;
  type: string;
  title: string;
  daysAgo: number;  // age in days; the date-group header is derived from this
  body: string;
  cta?: string;     // optional pill button label shown at the bottom of the card
  route?: string;   // tab to navigate to when the CTA is tapped
  unread?: boolean;
}

export const MESSAGES: AppMessage[] = [
  { id: 8, icon: '🍳', type: 'nutrition', title: 'A recipe picked for your goals', daysAgo: 0, body: "We've added high-protein, low-effort recipes that fit your calorie target. Find something to cook tonight.", cta: 'Go to Recipes', route: '/(tabs)/recipes', unread: true },
  { id: 9, icon: '📖', type: 'insight', title: 'You haven\'t logged today yet', daysAgo: 0, body: 'Logging your meals takes under a minute and is the single best predictor of hitting your goal. Open your diary to start.', cta: 'Go to Diary', route: '/(tabs)/diary', unread: true },
  { id: 1, icon: '✦', type: 'insight', title: 'Sleep × activity insight', daysAgo: 0, body: 'On the 3 nights you slept 8+ hours this week, your step count was 34% higher. See the full breakdown in your progress.', cta: 'Go to Progress', route: '/(tabs)/progress' },
  { id: 10, icon: '🏆', type: 'activity', title: 'A new program is ready for you', daysAgo: 1, body: 'Based on your activity level, we\'ve unlocked a 4-week strength program. Start it whenever you\'re ready.', cta: 'Go to Programs', route: '/(tabs)/programs' },
  { id: 2, icon: '🍎', type: 'nutrition', title: 'Why protein timing matters', daysAgo: 1, body: 'Eating 30g+ of protein within 2 hours of waking improves satiety and reduces afternoon cravings by up to 25%.' },
  { id: 3, icon: '🚭', type: 'quit', title: '18 days smoke-free 🎉', daysAgo: 2, body: 'Your lung cilia are now fully active again. Breathing will feel noticeably easier over the next week.' },
  { id: 4, icon: '😴', type: 'sleep', title: 'The science of deep sleep', daysAgo: 3, body: 'Deep sleep (NREM stage 3) is when your body repairs muscle tissue and consolidates memory. A consistent bedtime is the #1 predictor.' },
  { id: 5, icon: '🏃', type: 'activity', title: '14-day step streak', daysAgo: 4, body: "You've hit your step goal every day for two weeks. 14 days is the threshold where a behaviour becomes automatic. You've built a habit." },
  { id: 6, icon: '💡', type: 'insight', title: 'Hydration & cognitive performance', daysAgo: 7, body: 'Even mild dehydration (1–2% body weight) reduces focus, working memory, and reaction time. Your daily water goal is set for peak performance.' },
];

export const MSG_COLORS: Record<string, string> = {
  insight: colors.violet, nutrition: colors.green, quit: colors.rose, sleep: colors.sky, activity: colors.honey,
};

// Date-group header for a message. Today / Yesterday stay relative; anything
// older shows the real calendar date, e.g. "31 May" or "31 May 2025".
function groupLabel(daysAgo: number): string {
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${day} ${month}${year}`;
}

// Messages grouped by their derived date label, preserving array order.
export function groupMessages(): { label: string; items: AppMessage[] }[] {
  const groups: { label: string; items: AppMessage[] }[] = [];
  for (const m of MESSAGES) {
    const label = groupLabel(m.daysAgo);
    let g = groups.find((x) => x.label === label);
    if (!g) { g = { label, items: [] }; groups.push(g); }
    g.items.push(m);
  }
  return groups;
}

// Number of unread notification messages given the set of read message ids.
export function countUnread(readIds: number[]): number {
  return MESSAGES.filter((m) => m.unread && !readIds.includes(m.id)).length;
}
