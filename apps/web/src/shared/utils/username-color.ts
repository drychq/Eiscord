/**
 * Deterministic per-user color from a stable id (user_id, username, etc.).
 *
 * Strategy: hash → hue 0-359, fixed saturation & lightness chosen per theme so
 * the color is readable on both dark and light backgrounds.
 */

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function usernameColor(id: string): string {
  const hue = hashString(id) % 360;
  return `hsl(${hue} 65% 62%)`;
}
