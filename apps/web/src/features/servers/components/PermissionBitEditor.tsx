import { PermissionBit, hasPermissionBit } from '@eiscord/shared';

const PERMISSION_LABELS: Record<number, string> = {
  [PermissionBit.ViewChannel]: '查看频道',
  [PermissionBit.SendMessage]: '发送消息',
  [PermissionBit.ManageMessage]: '管理消息',
  [PermissionBit.ManageChannel]: '管理频道',
  [PermissionBit.JoinVoice]: '加入语音',
  [PermissionBit.ManageMember]: '管理成员',
  [PermissionBit.ManageRole]: '管理角色',
  [PermissionBit.CreateInvite]: '创建邀请',
  [PermissionBit.ViewAudit]: '查看审计',
};

type PermissionBitEditorProps = {
  value: string;
  onChange: (bits: string) => void;
};

export function PermissionBitEditor({ value, onChange }: PermissionBitEditorProps) {
  const bits = Object.values(PermissionBit).filter(
    (b): b is PermissionBit => typeof b === 'number',
  );

  const currentBits = BigInt(value || '0');

  const toggle = (bit: PermissionBit) => {
    const has = hasPermissionBit(currentBits, bit);
    const updated = has ? currentBits - BigInt(bit) : currentBits + BigInt(bit);
    onChange(String(updated));
  };

  return (
    <div className="permission-bit-editor">
      {bits.map((bit) => (
        <label key={bit} className="permission-bit-row">
          <input
            type="checkbox"
            checked={hasPermissionBit(currentBits, bit)}
            onChange={() => toggle(bit)}
          />
          <span>{PERMISSION_LABELS[bit] ?? `权限位 ${bit}`}</span>
        </label>
      ))}
    </div>
  );
}
