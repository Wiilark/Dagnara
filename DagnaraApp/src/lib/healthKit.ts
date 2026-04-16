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
  } catch {
    return false;
  }
}

async function iosReadData(date: string): Promise<HealthSyncData> {
  try {
    const AppleHealthKit = require('react-native-health').default;
    const startDate = `${date}T00:00:00.000Z`;
    const endDate = `${date}T23:59:59.000Z`;

    const steps = await new Promise<number>((resolve) => {
      AppleHealthKit.getStepCount({ date: startDate }, (_: unknown, r: { value?: number }) =>
        resolve(r?.value ?? 0),
      );
    });

    const kcal = await new Promise<number>((resolve) => {
      AppleHealthKit.getActiveEnergyBurned(
        { startDate, endDate },
        (_: unknown, r: Array<{ value: number }>) =>
          resolve((r ?? []).reduce((a, x) => a + (x?.value ?? 0), 0)),
      );
    });

    const sleepMins = await new Promise<number>((resolve) => {
      AppleHealthKit.getSleepSamples(
        { startDate, endDate },
        (_: unknown, r: Array<{ value: string; startDate: string; endDate: string }>) => {
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
  } catch {
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
  } catch {}
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
  } catch {
    return false;
  }
}

async function androidReadData(date: string): Promise<HealthSyncData> {
  try {
    const HC = require('react-native-health-connect');
    const startTime = `${date}T00:00:00.000Z`;
    const endTime = `${date}T23:59:59.000Z`;
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
  } catch {
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
  } catch {}
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
