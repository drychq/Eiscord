import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateProfileRequestSchema, type UpdateProfileRequest } from '@eiscord/shared';
import { useAuthStore } from '../../shared/state/use-auth-store';
import { useWorkspaceStore } from '../../shared/state/use-workspace-store';
import { FormField } from '../../shared/components/FormField';
import { formFieldProps } from '../../shared/components/form-field-props';
import { Spinner } from '../../shared/components/Spinner';
import { useLogoutMutation } from '../auth/use-auth-mutations';
import { useUpdateProfileMutation } from './use-profile-queries';

export function ProfilePanel() {
  const { currentUser } = useAuthStore();
  const { isProfilePanelOpen, setProfilePanelOpen } = useWorkspaceStore();
  const logoutMutation = useLogoutMutation();
  const updateMutation = useUpdateProfileMutation();

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

  if (!isProfilePanelOpen || !currentUser) return null;

  return (
    <>
      <div
        className="profile-overlay"
        onClick={() => setProfilePanelOpen(false)}
        aria-hidden="true"
      />
      <aside className="profile-panel" role="dialog" aria-label="个人资料">
        <h2>个人资料</h2>

        <div className="profile-readonly">
          <span>用户名</span>
          <strong>{currentUser.username}</strong>
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
