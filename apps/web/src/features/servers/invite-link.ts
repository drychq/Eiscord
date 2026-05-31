export function buildInviteLink(code: string): string {
  return `${window.location.origin}/invite/${code}`;
}
