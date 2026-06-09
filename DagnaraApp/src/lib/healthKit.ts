import { Platform } from 'react-native';

export type HealthSyncData = {
  steps: number;
  activeCalories: number;
  sleepMinutes: number;
};

export function isHealthAvailable(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export function healthPlatformName(): string {
  return Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
}

// Build ISO strings for [start-of-local-day, end-of-local-day] for the given YYYY-MM-DD.
// Parsing `${date}T00:00:00` (no `Z`) yields local midnight; toISOString() converts to UTC.
function localDayRangeIso(date: string): { startDate: string; endDate: string } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

// ── iOS HealthKit ─────────────────────────────────────────────────────────────
async function iosRequestPermissions(): Promise<boolean> {
  try {
    const AppleHealthKit = require('react-native-health').default;
    const { Permissions } = AppleHealthKit.Constants;
    return new Promise((resolve) => {
      AppleHealthKit.initHealthKit(
        {
          permissions: {
            read: [Permissions.Steps, Permissions.ActiveEnergyBurned, Permissions.SleepAnalysis],
            write: [Permissions.ActiveEnergyBurned, Permissions.Workout],
          },
        },
        (err: unknown) => resolve(!err),
      );
    });
  } catch (e) {
    if (__DEV__) console.warn('[healthKit] iosRequestPermissions failed:', e);
    return false;
  }
}

async function iosReadData(date: string): Promise<HealthSyncData> {
  try {
    const AppleHealthKit = require('react-native-health').default;
    const { startDate, endDate } = localDayRangeIso(date);

    const steps = await new Promise<number>((resolve) => {
      AppleHealthKit.getStepCount({ date: startDate }, (_: unknown, r: { value?: number }) =>
        resolve(r?.value ?? 0),
      );
    });

    const kcal = await new Promise<number>((resolve) => {
      AppleHealthKit.getActiveEnergyBurned(
        { startDate, endDate },
        (_: unknown, r: { value: number }[]) =>
          resolve((r ?? []).reduce((a, x) => a + (x?.value ?? 0), 0)),
      );
    });

    const sleepMins = await new Promise<number>((resolve) => {
      AppleHealthKit.getSleepSamples(
        { startDate, endDate },
        (_: unknown, r: { value: string; startDate: string; endDate: string }[]) => {
          const mins = (r ?? [])
            .filter((s) => s.value === 'ASLEEP')
            .reduce((a, s) => {
              const diff = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
              return a + diff;
            }, 0);
          resolve(Math.round(mins));
        },
      );
    });

    return { steps, activeCalories: Math.round(kcal), sleepMinutes: sleepMins };
  } catch (e) {
    if (__DEV__) console.warn('[healthKit] iosReadData failed:', e);
    return { steps: 0, activeCalories: 0, sleepMinutes: 0 };
  }
}

async function iosWriteWorkout(params: {
  activityType: string;
  startDate: Date;
  endDate: Date;
  calories: number;
}): Promise<void> {
  try {
    const AppleHealthKit = require('react-native-health').default;
    AppleHealthKit.saveWorkout(
      {
        type: 'TraditionalStrengthTraining',
        startDate: params.startDate.toISOString(),
        endDate: params.endDate.toISOString(),
        energyBurned: params.calories,
        energyBurnedUnit: 'calorie',
      },
      () => {},
    );
  } catch (e) {
    if (__DEV__) console.warn('[healthKit] iosWriteWorkout failed:', e);
  }
}

// ── Android Health Connect ────────────────────────────────────────────────────
async function androidRequestPermissions(): Promise<boolean> {
  try {
    const HC = require('react-native-health-connect');
    const initialized = await HC.initialize();
    if (!initialized) return false;
    const granted = await HC.requestPermission([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'SleepSession' },
      { accessType: 'write', recordType: 'ExerciseSession' },
    ]);
    return granted.length > 0;
  } catch (e) {
    if (__DEV__) console.warn('[healthKit] androidRequestPermissions failed:', e);
    return false;
  }
}

async function androidReadData(date: string): Promise<HealthSyncData> {
  try {
    const HC = require('react-native-health-connect');
    const { startDate: startTime, endDate: endTime } = localDayRangeIso(date);
    const filter = { timeRangeFilter: { operator: 'between', startTime, endTime } };

    const [stepsRes, kcalRes, sleepRes] = await Promise.all([
      HC.readRecords('Steps', filter).catch(() => ({ records: [] })),
      HC.readRecords('ActiveCaloriesBurned', filter).catch(() => ({ records: [] })),
      HC.readRecords('SleepSession', filter).catch(() => ({ records: [] })),
    ]);

    const steps = (stepsRes.records ?? []).reduce((a: number, r: { count: number }) => a + (r?.count ?? 0), 0);
    const kcal = (kcalRes.records ?? []).reduce(
      (a: number, r: { energy?: { inKilocalories?: number } }) => a + (r?.energy?.inKilocalories ?? 0), 0,
    );
    const sleepMins = (sleepRes.records ?? []).reduce(
      (a: number, r: { startTime: string; endTime: string }) => {
        const diff = (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60000;
        return a + diff;
      }, 0,
    );

    return { steps, activeCalories: Math.round(kcal), sleepMinutes: Math.round(sleepMins) };
  } catch (e) {
    if (__DEV__) console.warn('[healthKit] androidReadData failed:', e);
    return { steps: 0, activeCalories: 0, sleepMinutes: 0 };
  }
}

async function androidWriteWorkout(params: {
  activityType: string;
  startDate: Date;
  endDate: Date;
  calories: number;
}): Promise<void> {
  try {
    const HC = require('react-native-health-connect');
    await HC.insertRecords([
      {
        recordType: 'ExerciseSession',
        startTime: params.startDate.toISOString(),
        endTime: params.endDate.toISOString(),
        exerciseType: 'STRENGTH_TRAINING',
      },
    ]);
  } catch (e) {
    if (__DEV__) console.warn('[healthKit] androidWriteWorkout failed:', e);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function requestHealthPermissions(): Promise<boolean> {
  if (Platform.OS === 'ios') return iosRequestPermissions();
  if (Platform.OS === 'android') return androidRequestPermissions();
  return false;
}

export async function readHealthData(date: string): Promise<HealthSyncData> {
  if (Platform.OS === 'ios') return iosReadData(date);
  if (Platform.OS === 'android') return androidReadData(date);
  return { steps: 0, activeCalories: 0, sleepMinutes: 0 };
}

export async function writeWorkout(params: {
  activityType: string;
  startDate: Date;
  endDate: Date;
  calories: number;
}): Promise<void> {
  if (Platform.OS === 'ios') return iosWriteWorkout(params);
  if (Platform.OS === 'android') return androidWriteWorkout(params);
}
