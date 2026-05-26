import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import {
  resetPasswordRequestSchema,
  type ResetPasswordRequest,
} from '@eiscord/shared';
import { FormField } from '../../shared/components/FormField';
import { formFieldProps } from '../../shared/components/form-field-props';
import { Spinner } from '../../shared/components/Spinner';
import {
  useConfirmPasswordResetMutation,
  useRequestPasswordResetMutation,
} from './use-auth-mutations';

const RESEND_COOLDOWN_SECONDS = 60;

const resetFormSchema = resetPasswordRequestSchema
  .extend({
    confirm_password: z.string().min(8).max(128),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: '两次密码输入不一致',
    path: ['confirm_password'],
  });

type ResetForm = z.infer<typeof resetFormSchema>;

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get('email') ?? '';

  const confirmMutation = useConfirmPasswordResetMutation();
  const requestMutation = useRequestPasswordResetMutation();
  const [resendUntil, setResendUntil] = useState<number>(() => Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remainingSeconds = useMemo(
    () => Math.max(0, Math.ceil((resendUntil - now) / 1000)),
    [resendUntil, now],
  );

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: {
      email: initialEmail,
      code: '',
      new_password: '',
      confirm_password: '',
    },
  });

  const onSubmit = (data: ResetForm) => {
    const payload: ResetPasswordRequest = {
      email: data.email,
      code: data.code,
      new_password: data.new_password,
    };
    confirmMutation.mutate(payload);
  };

  const onResend = () => {
    const email = getValues('email');
    if (!email) {
      return;
    }
    requestMutation.mutate(
      { email },
      {
        onSuccess: () => {
          setResendUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
        },
      },
    );
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>重置密码</h1>
        <p className="auth-subtitle">输入邮件中的 6 位验证码与新密码</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormField label="邮箱" error={errors.email?.message}>
            <input
              type="email"
              autoComplete="email"
              {...formFieldProps(register('email'), 'email-error', !!errors.email)}
            />
          </FormField>

          <FormField label="6 位验证码" error={errors.code?.message}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              {...formFieldProps(register('code'), 'code-error', !!errors.code)}
            />
          </FormField>

          <FormField label="新密码" error={errors.new_password?.message}>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="至少 8 位，含字母和数字"
              {...formFieldProps(
                register('new_password'),
                'new_password-error',
                !!errors.new_password,
              )}
            />
          </FormField>

          <FormField label="确认新密码" error={errors.confirm_password?.message}>
            <input
              type="password"
              autoComplete="new-password"
              {...formFieldProps(
                register('confirm_password'),
                'confirm_password-error',
                !!errors.confirm_password,
              )}
            />
          </FormField>

          <button className="form-submit" type="submit" disabled={confirmMutation.isPending}>
            {confirmMutation.isPending ? <Spinner size={18} /> : '提交重置'}
          </button>
        </form>

        <p className="auth-link">
          {remainingSeconds > 0 ? (
            <span>{remainingSeconds} 秒后可重新发送验证码</span>
          ) : (
            <button
              type="button"
              className="link-button"
              onClick={onResend}
              disabled={requestMutation.isPending}
            >
              重新发送验证码
            </button>
          )}
        </p>

        <p className="auth-link">
          <Link to="/login">返回登录</Link>
        </p>
      </div>
    </div>
  );
}
