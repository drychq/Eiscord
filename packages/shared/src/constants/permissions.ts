export const PermissionBit = {
  ViewChannel: 1,
  SendMessage: 2,
  ManageMessage: 4,
  ManageChannel: 8,
  JoinVoice: 16,
  ManageMember: 32,
  ManageRole: 64,
  CreateInvite: 128,
  ViewAudit: 256,
  SpeakVoice: 512,
  ListenVoice: 1024,
} as const;

export type PermissionBit = (typeof PermissionBit)[keyof typeof PermissionBit];

export const DEFAULT_MEMBER_PERMISSION_BITS =
  PermissionBit.ViewChannel |
  PermissionBit.SendMessage |
  PermissionBit.JoinVoice |
  PermissionBit.SpeakVoice |
  PermissionBit.ListenVoice;

export function combinePermissionBits(bits: PermissionBit[]): number {
  return bits.reduce((combined, bit) => combined | bit, 0);
}

export function hasPermissionBit(permissionBits: bigint | number | string, bit: PermissionBit): boolean {
  return (parsePermissionBits(permissionBits) & BigInt(bit)) === BigInt(bit);
}

export function parsePermissionBits(value: bigint | number | string): bigint {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    return BigInt(value);
  }

  if (!/^\d+$/.test(value)) {
    throw new Error('Permission bits must be a non-negative integer string.');
  }

  return BigInt(value);
}
