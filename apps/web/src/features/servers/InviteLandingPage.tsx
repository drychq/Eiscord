import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../shared/state/use-auth-store';
import { useJoinServer } from './use-servers-queries';
import { Spinner } from '../../shared/components/Spinner';

export function InviteLandingPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const { mutate: joinServer, isError: joinFailed } = useJoinServer();
  const attempted = useRef(false);

  const isAuthenticated = status === 'authenticated';

  useEffect(() => {
    if (!isAuthenticated || !code || attempted.current) return;
    attempted.current = true;
    joinServer(code, {
      onSuccess: (data) => {
        navigate(`/app/servers/${data.server_id}/channels/default`, { replace: true });
      },
    });
  }, [isAuthenticated, code, joinServer, navigate]);

  if (!code) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>邀请无效</h1>
          <p className="auth-subtitle">该邀请链接缺少邀请码。</p>
          <button className="form-submit" type="button" onClick={() => navigate('/app')}>
            返回
          </button>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          {joinFailed ? (
            <>
              <h1>无法加入社区</h1>
              <p className="auth-subtitle">邀请链接可能已失效或被撤销。</p>
              <button className="form-submit" type="button" onClick={() => navigate('/app')}>
                返回
              </button>
            </>
          ) : (
            <>
              <h1>正在加入社区</h1>
              <p className="auth-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Spinner size={18} />
                请稍候…
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>你被邀请加入社区</h1>
        <p className="auth-subtitle">登录后即可加入。</p>
        <button className="form-submit" type="button" onClick={() => navigate('/login')}>
          登录后加入
        </button>
      </div>
    </div>
  );
}
