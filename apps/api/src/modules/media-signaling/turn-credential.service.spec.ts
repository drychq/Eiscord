import { ConfigService } from '@nestjs/config';

import { TurnCredentialService } from './turn-credential.service';

describe('TurnCredentialService', () => {
  it('signs HMAC-SHA1 base64 credentials with TTL-prefixed username', () => {
    const config: Pick<ConfigService, 'get'> = {
      get: ((key: string) => {
        if (key === 'TURN_SHARED_SECRET') return 'shared-secret';
        if (key === 'TURN_CREDENTIAL_TTL_SECONDS') return 600;
        if (key === 'TURN_URL') return 'turn:example.com:3478?transport=udp';
        return undefined;
      }) as ConfigService['get'],
    };
    const service = new TurnCredentialService(config as ConfigService);

    const credential = service.signCredential('user-uuid');

    expect(credential.urls).toEqual(['turn:example.com:3478?transport=udp']);
    expect(credential.credential_type).toBe('password');
    expect(credential.ttl_seconds).toBe(600);
    expect(credential.username.endsWith(':user-uuid')).toBe(true);
    expect(/^[A-Za-z0-9+/=]+$/.test(credential.credential)).toBe(true);
  });
});
