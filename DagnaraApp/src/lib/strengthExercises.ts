export const STRENGTH_EXERCISES = [
  // Chest
  'Bench Press', 'Incline Bench Press', 'Dumbbell Fly', 'Cable Fly', 'Push-up',
  // Back
  'Deadlift', 'Barbell Row', 'Pull-up', 'Lat Pulldown', 'Cable Row', 'T-Bar Row',
  // Shoulders
  'Overhead Press', 'Dumbbell Lateral Raise', 'Face Pull', 'Arnold Press',
  // Legs
  'Squat', 'Romanian Deadlift', 'Leg Press', 'Lunges', 'Leg Extension', 'Leg Curl', 'Hip Thrust', 'Calf Raise',
  // Arms
  'Dumbbell Curl', 'Barbell Curl', 'Hammer Curl', 'Tricep Pushdown', 'Skull Crusher', 'Dips',
  // Core
  'Plank', 'Crunch', 'Russian Twist', 'Hanging Leg Raise',
];

export function estimateStrengthKcal(exercises: Array<{ sets: Array<{ reps: number; weight: number; unit: 'kg' | 'lbs' }> }>): number {
  let total = 0;
  for (const ex of exercises) {
    for (const set of ex.sets) {
      const kg = set.unit === 'lbs' ? set.weight * 0.4536 : set.weight;
      total += set.reps * kg * 0.035;
    }
  }
  return Math.max(1, Math.round(total * 1.2));
}
