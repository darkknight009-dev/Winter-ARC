/**
 * Winter Arc core domain.
 * The arc always runs Oct 1 -> Feb 28 (151 days: Oct 31 + Nov 30 + Dec 31 + Jan 31 + Feb 28).
 */

export const ARC_START_MONTH = 9; // October (0-indexed)
export const ARC_START_DAY = 1;
export const ARC_END_MONTH = 1; // February (0-indexed)
export const ARC_END_DAY = 28;
export const ARC_TOTAL_DAYS = 151;
export const XP_PER_HABIT = 10;
export const MAX_FREEZES = 3;

export interface Chapter {
  id: number;
  name: string;
  /** 0-indexed calendar months this chapter covers */
  months: number[];
  blurb: string;
}

/** Chapters of the arc — one per calendar month, Oct -> Feb. */
export const CHAPTERS: Chapter[] = [
  {
    id: 1,
    name: "Foundation",
    months: [9],
    blurb: "Build the identity. Start small, and never miss twice.",
  },
  {
    id: 2,
    name: "Momentum",
    months: [10],
    blurb: "The novelty fades. Systems carry you now.",
  },
  {
    id: 3,
    name: "Trials",
    months: [11],
    blurb: "Holidays, travel, excuses. This is where arcs are won.",
  },
  {
    id: 4,
    name: "Deep Winter",
    months: [0],
    blurb: "Dark and quiet. Who shows up when nobody is clapping?",
  },
  {
    id: 5,
    name: "Forge",
    months: [1],
    blurb: "Final chapter. Finish so strong that March-you is inevitable.",
  },
];

export interface ArcDay {
  index: number; // 0-based day of the arc
  date: Date;
  isToday: boolean;
  isFuture: boolean;
  isPast: boolean;
  completed: boolean;
  frozen: boolean;
  missed: boolean;
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/**
 * "Now" as the user experiences it: shifts the server clock (usually UTC on
 * Vercel) into the user's timezone so day boundaries fall at THEIR midnight,
 * not the server's. Without this, IST users get UTC day boundaries (+5:30 shift).
 */
export function zonedNow(timezone?: string | null): Date {
  if (!timezone) return new Date();
  try {
    return new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  } catch {
    return new Date();
  }
}

/** Local-time arc start (Oct 1) for the current arc year. */
export function arcStartDate(now: Date = new Date()): Date {
  const y = now.getFullYear();
  // Before Oct 1 -> the arc started last year's Oct 1 (still running).
  if (now < new Date(y, ARC_START_MONTH, ARC_START_DAY)) {
    return new Date(y - 1, ARC_START_MONTH, ARC_START_DAY);
  }
  return new Date(y, ARC_START_MONTH, ARC_START_DAY);
}

export function arcEndDate(now: Date = new Date()): Date {
  const start = arcStartDate(now);
  return new Date(start.getFullYear() + 1, ARC_END_MONTH, ARC_END_DAY);
}

/** 0-based index of today within the arc (negative = before the arc). */
export function dayIndexOf(now: Date = new Date()): number {
  const start = arcStartDate(now);
  const diff = startOfDay(now).getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

/** 1-based day number (Day 1 -> Day 151). 0 or negative = pre-arc. */
export function dayNumber(now: Date = new Date()): number {
  return dayIndexOf(now) + 1;
}

export function isArcOver(now: Date = new Date()): boolean {
  return startOfDay(now) > arcEndDate(now);
}

export function isArcActive(now: Date = new Date()): boolean {
  return !isArcOver(now);
}

/** Days left in the arc, counting today. Pre-arc returns the full 151. */
export function daysRemaining(now: Date = new Date()): number {
  if (isArcOver(now)) return 0;
  const idx = dayIndexOf(now);
  if (idx < 0) return ARC_TOTAL_DAYS;
  return Math.max(0, ARC_TOTAL_DAYS - idx);
}

export function chapterFor(date: Date): Chapter {
  const m = date.getMonth();
  return CHAPTERS.find((c) => c.months.includes(m)) ?? CHAPTERS[0];
}

export function chapterProgress(now: Date = new Date()): { chapter: Chapter; progress: number } {
  const chapter = chapterFor(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const total = monthEnd.getTime() - monthStart.getTime();
  const elapsed = now.getTime() - monthStart.getTime();
  return { chapter, progress: Math.min(1, Math.max(0, elapsed / total)) };
}

/* ------------------------------- XP & levels ------------------------------ */

export function xpForDay(habitsDone: number, habitCount: number): number {
  if (habitCount <= 0) return 0;
  // Perfect days pay a bonus to reward full completion.
  return habitsDone * XP_PER_HABIT + (habitsDone === habitCount ? 10 : 0);
}

export interface LevelInfo {
  level: number;
  title: string;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number; // 0..1
}

export const LEVEL_TITLES = [
  "Drifter",
  "Starter",
  "Builder",
  "Disciplined",
  "Relentless",
  "Iron",
  "Unshakeable",
  "Arc Legend",
];

export function levelFor(totalXp: number): LevelInfo {
  // Thresholds: Lv1 at 0 XP, Lv2 at 300, Lv3 at 900, Lv4 at 1800, ...
  // i.e. threshold(n) = 150 * n * (n - 1). Level 1 starts at ZERO so the bar
  // fills from the very first check-in (the old formula had a 150 XP floor bug).
  let level = 1;
  while (150 * (level + 1) * level <= totalXp) level += 1;
  const floorXp = 150 * level * (level - 1);
  const nextXp = 150 * (level + 1) * level;
  const xpIntoLevel = Math.max(0, totalXp - floorXp);
  const span = nextXp - floorXp;
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    xpIntoLevel,
    xpForNext: span,
    progress: Math.min(1, Math.max(0, xpIntoLevel / span)),
  };
}

/* ---------------------------- Streaks & freezes --------------------------- */

/**
 * Current streak = consecutive completed (or frozen) days ending today or yesterday.
 * `completedByIndex` maps arc day index -> habits completed count.
 */
export function currentStreak(
  completedByIndex: Map<number, number>,
  frozenIndexes: Set<number>,
  habitCount: number,
  todayIndex: number
): number {
  if (habitCount === 0) return 0;
  let streak = 0;
  let i = todayIndex;
  // Today not yet done? Start counting from yesterday so the streak isn't "lost" during the day.
  const doneToday = (completedByIndex.get(todayIndex) ?? 0) >= habitCount;
  if (!doneToday && !frozenIndexes.has(todayIndex)) i = todayIndex - 1;
  while (i >= 0) {
    const done = (completedByIndex.get(i) ?? 0) >= habitCount;
    if (done || frozenIndexes.has(i)) {
      streak += 1;
      i -= 1;
    } else {
      break;
    }
  }
  return streak;
}

export function longestStreak(
  completedByIndex: Map<number, number>,
  frozenIndexes: Set<number>,
  habitCount: number,
  totalDaysSoFar: number
): number {
  if (habitCount === 0) return 0;
  let best = 0;
  let run = 0;
  for (let i = 0; i < totalDaysSoFar; i++) {
    const done = (completedByIndex.get(i) ?? 0) >= habitCount;
    if (done || frozenIndexes.has(i)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
