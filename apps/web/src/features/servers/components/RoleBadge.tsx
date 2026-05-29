type RoleBadgeProps = {
  name: string;
  color?: string | null;
};

export function RoleBadge({ name, color }: RoleBadgeProps) {
  return (
    <span
      className="role-badge"
      style={color ? { backgroundColor: `${color}22`, color, borderColor: color } : undefined}
    >
      {name}
    </span>
  );
}
