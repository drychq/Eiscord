import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  forgotPasswordRequestSchema,
  type ForgotPasswordRequest,
} from '@eiscord/shared';
import { FormField } from '../../shared/components/FormField';
import { formFieldProps } from '../../shared/components/form-field-props';
import { Spinner } from '../../shared/components/Spinner';
import { useRequestPasswordResetMutation } from './use-auth-mutations';

const GENERIC_HINT = '若该邮箱已注册，验证码已发送，请查收邮件后输入验证码完成重置。';

export function ForgotPasswordPage() {
  const mutation = useRequestPasswordResetMutation();
  const navigate = useNavigate();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(forgotPasswordRequestSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = (data: ForgotPasswordRequest) => {
    mutation.mutate(data, {
      onSuccess: () => {
        setSubmittedEmail(data.email);
      },
    });
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>找回密码</h1>
        <p className="auth-subtitle">输入注册时使用的邮箱，我们会发送 6 位验证码</p>

        {submittedEmail ? (
          <>
            <div className="auth-success" role="status">{GENERIC_HINT}</div>
            <button
              className="form-submit"
              type="button"
              onClick={() =>
                navigate(`/reset-password?email=${encodeURIComponent(submittedEmail)}`)
              }
            >
              我已收到验证码，去重置密码
            </button>
            <p className="auth-link">
              没收到？<button
                type="button"
                className="link-button"
                onClick={() => setSubmittedEmail(null)}
              >
                重新发送
              </button>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <FormField label="邮箱" error={errors.email?.message}>
              <input
                type="email"
                autoComplete="email"
                placeholder="your@email.com"
                {...formFieldProps(register('email'), 'email-error', !!errors.email)}
              />
            </FormField>

            <button className="form-submit" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Spinner size={18} /> : '发送验证码'}
            </button>
          </form>
        )}

        <p className="auth-link">
          想起密码了？<Link to="/login">返回登录</Link>
        </p>
      </div>
    </div>
  );
}
