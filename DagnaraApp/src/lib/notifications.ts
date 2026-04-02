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
    if ((n.content.data as any)?.tag === tag) {
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

export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
