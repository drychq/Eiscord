import type { ElementType, ReactNode } from 'react';

type EmptyStateProps = {
  icon?: ElementType;
  title: string;
  description?: string;
  children?: ReactNode;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      {Icon && (
        <div className="empty-state-icon">
          <Icon size={48} />
        </div>
      )}
      <h2 className="empty-state-title">{title}</h2>
      {description && <p className="empty-state-description">{description}</p>}
      {children && <div className="empty-state-actions">{children}</div>}
    </div>
  );
}
