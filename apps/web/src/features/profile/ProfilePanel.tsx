import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Monitor, Moon, Sun, X } from 'lucide-react';
import {
  updateProfileRequestSchema,
  type UpdatePresenceRequest,
  type UpdateProfileRequest,
} from '@eiscord/shared';
import { useAuthStore } from '../../shared/state/use-auth-store';
import { useThemeStore, type ThemePreference } from '../../shared/state/use-theme-store';
import { useWorkspaceStore } from '../../shared/state/use-workspace-store';
import { useBackDismiss } from '../../shared/hooks/use-back-dismiss';
import { FormField } from '../../shared/components/FormField';
import { formFieldProps } from '../../shared/components/form-field-props';
import { Spinner } from '../../shared/components/Spinner';
import { useLogoutMutation } from '../auth/use-auth-mutations';
import { useUpdatePresenceMutation, useUpdateProfileMutation } from './use-profile-queries';

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Moon }> = [
  { value: 'dark', label: '暗色', icon: Moon },
  { value: 'light', label: '亮色', icon: Sun },
  { value: 'system', label: '跟随系统', icon: Monitor },
];

export function ProfilePanel() {
  const { currentUser } = useAuthStore();
  const { isProfilePanelOpen, setProfilePanelOpen } = useWorkspaceStore();
  const themePreference = useThemeStore((state) => state.preference);
  const setThemePreference = useThemeStore((state) => state.setPreference);
  const logoutMutation = useLogoutMutation();
  const updateMutation = useUpdateProfileMutation();
  const presenceMutation = useUpdatePresenceMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileRequest>({
    resolver: zodResolver(updateProfileRequestSchema),
    defaultValues: {
      nickname: currentUser?.nickname ?? '',
      bio: currentUser?.bio ?? '',
    },
  });

  useBackDismiss(isProfilePanelOpen, () => setProfilePanelOpen(false));

  if (!isProfilePanelOpen || !currentUser) return null;

  return (
    <>
      <div
        className="profile-overlay"
        onClick={() => setProfilePanelOpen(false)}
        aria-hidden="true"
      />
      <aside className="profile-panel" role="dialog" aria-label="个人资料">
        <div className="profile-panel-header">
          <h2>个人资料</h2>
          <button
            className="icon-button profile-close"
            type="button"
            aria-label="关闭"
            onClick={() => setProfilePanelOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="profile-readonly">
          <span>用户名</span>
          <strong>{currentUser.username}</strong>
        </div>

        <div className="profile-readonly">
          <span>在线状态</span>
          <select
            className="form-input"
            value={currentUser.presence_status}
            disabled={presenceMutation.isPending}
            onChange={(event) =>
              presenceMutation.mutate({
                desired_status: event.target.value as UpdatePresenceRequest['desired_status'],
              })
            }
          >
            <option value="online">在线</option>
            <option value="idle">离开</option>
            <option value="busy">忙碌</option>
            <option value="invisible">隐身</option>
            <option value="offline">离线</option>
          </select>
        </div>

        <div className="profile-readonly">
          <span>外观</span>
          <div className="theme-switcher" role="group" aria-label="主题外观">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                className={`theme-switcher-option${themePreference === value ? ' active' : ''}`}
                onClick={() => setThemePreference(value)}
                aria-pressed={themePreference === value}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit((data) => updateMutation.mutate(data))} noValidate>
          <FormField label="昵称" error={errors.nickname?.message}>
            <input
              type="text"
              {...formFieldProps(
                register('nickname'),
                'nickname-error',
                !!errors.nickname,
              )}
            />
          </FormField>

          <FormField label="简介" error={errors.bio?.message}>
            <textarea
              {...formFieldProps(
                register('bio'),
                'bio-error',
                !!errors.bio,
              )}
            />
          </FormField>

          <button
            className="form-submit"
            type="submit"
            disabled={!isDirty || updateMutation.isPending}
          >
            {updateMutation.isPending ? <Spinner size={18} /> : '保存'}
          </button>
        </form>

        <button
          className="profile-logout"
          type="button"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending ? <Spinner size={16} /> : '退出登录'}
        </button>
      </aside>
    </>
  );
}
