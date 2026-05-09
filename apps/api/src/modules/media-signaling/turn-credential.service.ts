import { createHmac } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { IceServer } from '@eiscord/shared';

@Injectable()
export class TurnCredentialService {
  constructor(private readonly configService: ConfigService) {}

  signCredential(userId: string): IceServer {
    const ttlSeconds = this.configService.get<number>('TURN_CREDENTIAL_TTL_SECONDS') ?? 300;
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const username = `${expiresAt}:${userId}`;
    const secret = this.configService.get<string>('TURN_SHARED_SECRET') ?? 'change-me-turn';
    const credential = createHmac('sha1', secret).update(username).digest('base64');

    return {
      credential,
      credential_type: 'password',
      ttl_seconds: ttlSeconds,
      urls: [this.configService.get<string>('TURN_URL') ?? 'turn:localhost:3478?transport=udp'],
      username,
    };
  }
}
