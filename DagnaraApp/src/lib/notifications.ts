import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// Cancel all scheduled notifications with a given tag
async function cancelByTag(tag: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if ((n.content.data as { tag?: string })?.tag === tag) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

// Schedule a daily notification at a fixed time
async function scheduleDailyAt(
  tag: string,
  title: string,
  body: string,
  hour: number,
  minute: number,
) {
  await cancelByTag(tag);
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { tag } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

// ── Public helpers ──────────────────────────────────────────────────────────

export async function scheduleMealReminders(enabled: boolean) {
  if (!enabled) {
    await cancelByTag('meal_breakfast');
    await cancelByTag('meal_lunch');
    await cancelByTag('meal_dinner');
    return;
  }
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await scheduleDailyAt('meal_breakfast', '🥞 Log breakfast', "Don't forget to log your breakfast!", 8, 0);
  await scheduleDailyAt('meal_lunch',     '🥗 Log lunch',     "Time to log your lunch.",              12, 30);
  await scheduleDailyAt('meal_dinner',    '🍽 Log dinner',    "Have you logged dinner yet?",           19, 0);
}

export async function scheduleWaterReminder(enabled: boolean) {
  if (!enabled) { await cancelByTag('water_reminder'); return; }
  const granted = await requestNotificationPermission();
  if (!granted) return;
  // Every day at 14:00 as a midday nudge
  await scheduleDailyAt('water_reminder', '💧 Drink water', 'Halfway through the day — stay hydrated!', 14, 0);
}

export async function scheduleStreakReminder(enabled: boolean) {
  if (!enabled) { await cancelByTag('streak_reminder'); return; }
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await scheduleDailyAt('streak_reminder', '🔥 Keep your streak!', "Log something today to keep your streak alive.", 20, 0);
}

export async function scheduleWeightReminder(enabled: boolean) {
  if (!enabled) { await cancelByTag('weight_reminder'); return; }
  const granted = await requestNotificationPermission();
  if (!granted) return;
  // Monday mornings at 8:30
  await cancelByTag('weight_reminder');
  await Notifications.scheduleNotificationAsync({
    content: { title: '⚖️ Weekly weigh-in', body: 'Log your weight to track your progress!', data: { tag: 'weight_reminder' } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 2, // Monday (1=Sunday, 2=Monday)
      hour: 8,
      minute: 30,
    },
  });
}

// Cancel today's meal reminder and push it to tomorrow.
// Call this when the user logs their first food for a given meal.
export async function skipMealReminderToday(meal: 'breakfast' | 'lunch' | 'dinner') {
  const tag = `meal_${meal}`;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const exists = scheduled.some(n => (n.content.data as { tag?: string })?.tag === tag);
  if (!exists) return;

  const config: Record<string, [string, string, number, number]> = {
    breakfast: ['🥞 Log breakfast', "Don't forget to log your breakfast!", 8, 0],
    lunch:     ['🥗 Log lunch',     'Time to log your lunch.',              12, 30],
    dinner:    ['🍽 Log dinner',    'Have you logged dinner yet?',           19, 0],
  };
  const [title, body, hour, minute] = config[meal];
  const now = new Date();
  const reminderToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);

  // Only worth acting if reminder hasn't fired yet today
  if (now >= reminderToday) return;

  // Cancel recurring daily and fire a one-time tomorrow, then re-add daily.
  // This way the reminder skips today but resumes from tomorrow.
  await cancelByTag(tag);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute);
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { tag } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: tomorrow,
    },
  });
  // Re-add the daily so it keeps firing after tomorrow
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { tag } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function scheduleDailySummaryReminder(enabled: boolean) {
  if (!enabled) { await cancelByTag('daily_summary'); return; }
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await scheduleDailyAt(
    'daily_summary',
    '📊 Daily summary ready',
    'Tap to review today\'s nutrition and close out your diary.',
    21, 0,
  );
}

export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ── Quit program milestone notifications ──────────────────────────────────────

// Key milestones to push — subset of the 82 achievements, chosen for WHO health events.
const QS_MILESTONES_NOTIFY = [
  { hours: 0.33, title: '🫧 First 20 minutes smoke-free', body: 'Blood pressure is already normalizing.' },
  { hours: 8,    title: '🩸 8 hours smoke-free',          body: 'CO and nicotine cut in half — blood oxygen rising.' },
  { hours: 12,   title: '💨 12 hours smoke-free',         body: 'Carbon monoxide cleared from your blood.' },
  { hours: 24,   title: '📅 One full day!',               body: 'Heart attack risk has already dropped. Keep going!' },
  { hours: 48,   title: '👃 Two days smoke-free!',        body: 'Taste and smell are coming back.' },
  { hours: 72,   title: '🫁 Three days!',                 body: 'Nicotine is fully gone. Physical dependence broken.' },
  { hours: 168,  title: '🏃 One week smoke-free!',        body: 'Lungs rebuilding. Circulation improving daily.' },
  { hours: 336,  title: '💪 Two weeks!',                  body: 'Lung function improving. Less coughing every day.' },
  { hours: 720,  title: '🏆 One month smoke-free!',       body: 'Blood pressure and circulation back to normal.' },
  { hours: 2160, title: '🌟 Three months!',               body: 'Lung capacity up ~30%. Infection risk dropping.' },
  { hours: 4380, title: '🎉 Six months smoke-free!',      body: 'Congestion and shortness of breath greatly reduced.' },
  { hours: 8760, title: '🥇 ONE YEAR SMOKE-FREE!',        body: 'Heart disease risk is now half that of a smoker!' },
];

export async function scheduleQsNotifications(quitDate: Date): Promise<void> {
  if (Platform.OS === 'web') return;
  // Cancel all existing qs milestone notifications
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    const tag = String((n.content.data as Record<string, unknown>)?.tag ?? '');
    if (tag.startsWith('qs_milestone_') || tag === 'qs_daily') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
  const granted = await requestNotificationPermission();
  if (!granted) return;
  const now = Date.now();
  for (const ms of QS_MILESTONES_NOTIFY) {
    const fireAt = new Date(quitDate.getTime() + ms.hours * 3600_000);
    if (fireAt.getTime() <= now) continue; // milestone already passed
    await Notifications.scheduleNotificationAsync({
      content: { title: ms.title, body: ms.body, data: { tag: `qs_milestone_${ms.hours}` } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
  }
}

export async function cancelQsNotifications(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    const tag = String((n.content.data as Record<string, unknown>)?.tag ?? '');
    if (tag.startsWith('qs_milestone_') || tag === 'qs_daily') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

// ── Quit Drinking milestone notifications ─────────────────────────────────────

const QD_MILESTONES_NOTIFY = [
  { hours: 12,   title: '🍵 12 hours alcohol-free',     body: 'Blood sugar is stabilising and sleep will start improving.' },
  { hours: 24,   title: '📅 One full day!',              body: 'Hydration is already up and anxiety starting to ease.' },
  { hours: 48,   title: '💪 Two days alcohol-free!',     body: 'Your liver has begun clearing fatty deposits.' },
  { hours: 72,   title: '🧠 Three days!',                body: 'Dopamine receptors are beginning to recalibrate.' },
  { hours: 168,  title: '🏃 One week alcohol-free!',     body: 'Sleep quality is noticeably better. Keep going!' },
  { hours: 336,  title: '🌿 Two weeks!',                 body: 'Blood pressure measurably lower. Skin looking clearer.' },
  { hours: 720,  title: '🏆 One month alcohol-free!',    body: 'Liver fat significantly reduced. Energy is up.' },
  { hours: 2160, title: '🌟 Three months!',              body: 'Immune system stronger. Mood is more stable day-to-day.' },
  { hours: 4380, title: '🎉 Six months alcohol-free!',   body: 'Liver largely healed. Cancer risk is falling.' },
  { hours: 8760, title: '🥇 ONE YEAR ALCOHOL-FREE!',     body: 'Heart disease risk cut in half. You are transformed.' },
];

export async function scheduleQdNotifications(quitDate: Date): Promise<void> {
  if (Platform.OS === 'web') return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    const tag = String((n.content.data as Record<string, unknown>)?.tag ?? '');
    if (tag.startsWith('qd_milestone_')) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
  const granted = await requestNotificationPermission();
  if (!granted) return;
  const now = Date.now();
  for (const ms of QD_MILESTONES_NOTIFY) {
    const fireAt = new Date(quitDate.getTime() + ms.hours * 3600_000);
    if (fireAt.getTime() <= now) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: ms.title, body: ms.body, data: { tag: `qd_milestone_${ms.hours}` } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
  }
}

export async function cancelQdNotifications(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    const tag = String((n.content.data as Record<string, unknown>)?.tag ?? '');
    if (tag.startsWith('qd_milestone_')) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

// ── Pill reminder notifications ───────────────────────────────────────────────

/**
 * Re-schedule notifications for every medication × time.
 * Call this whenever the medication list changes (add / edit / delete).
 * Clears all existing pill_ notifications first so there are no stale ones.
 *
 * `daysOfWeek` is Apple-style (0=Mon … 6=Sun). When null/undefined the medication
 * fires every day (DAILY trigger). When set, one WEEKLY trigger is scheduled per
 * active day so users on a Mon/Wed/Fri schedule don't get notifications on Tue/Thu.
 */
export async function schedulePillReminders(
  meds: Array<{
    id: string;
    name: string;
    dosage: string;
    times: string[];
    daysOfWeek?: number[] | null;
  }>,
): Promise<void> {
  if (Platform.OS === 'web') return;

  // Cancel every existing pill notification
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    const tag = String((n.content.data as Record<string, unknown>)?.tag ?? '');
    if (tag.startsWith('pill_')) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  if (meds.length === 0) return;
  const granted = await requestNotificationPermission();
  if (!granted) return;

  // Convert Apple-style weekday (0=Mon..6=Sun) → Expo weekly weekday (1=Sun..7=Sat).
  const toExpoWeekday = (appleDay: number): number => ((appleDay + 1) % 7) + 1;

  for (const med of meds) {
    const everyDay = !med.daysOfWeek || med.daysOfWeek.length === 0 || med.daysOfWeek.length === 7;
    for (const t of med.times) {
      const parts = t.split(':');
      const hour   = parseInt(parts[0], 10) || 0;
      const minute = parseInt(parts[1], 10) || 0;

      if (everyDay) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `💊 ${med.name}`,
            body:  `Time to take ${med.dosage}`,
            data:  { tag: `pill_${med.id}_${t}` },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
          },
        });
      } else {
        for (const appleDay of med.daysOfWeek!) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `💊 ${med.name}`,
              body:  `Time to take ${med.dosage}`,
              data:  { tag: `pill_${med.id}_${t}_${appleDay}` },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday: toExpoWeekday(appleDay),
              hour,
              minute,
            },
          });
        }
      }
    }
  }
}
