// Curated adjective list for guest display names (e.g., RunningWeasel54).
//
// Criteria: short, positive/neutral tone, no hyphens or compound words, no
// ambiguity in meaning, no awkward collisions with the animal list (avoid
// "Quick" + "Hare" clichés where possible but don't stress about it).
//
// Combined space: ADJECTIVES × ANIMALS × 100 digit suffixes. Extend freely —
// the name space is already ample so there's no rush, but more diversity is
// always welcome as long as entries stay on-brand (friendly, memorable).
export const ADJECTIVES: readonly string[] = [
  'Bold', 'Brave', 'Bright', 'Calm', 'Cheerful', 'Clever', 'Curious',
  'Dapper', 'Daring', 'Eager', 'Earnest', 'Fancy', 'Friendly', 'Gallant',
  'Gentle', 'Graceful', 'Happy', 'Hopeful', 'Humble', 'Jolly', 'Joyful',
  'Keen', 'Kind', 'Lively', 'Lucky', 'Mellow', 'Merry', 'Nimble', 'Noble',
  'Patient', 'Perky', 'Playful', 'Plucky', 'Proud', 'Quiet', 'Quick',
  'Radiant', 'Running', 'Sincere', 'Silly', 'Spirited', 'Steady', 'Sunny',
  'Swift', 'Tidy', 'Upbeat', 'Vibrant', 'Vivid', 'Wandering', 'Warm',
  'Wise', 'Witty', 'Zesty',
] as const;
