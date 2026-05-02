import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

const PASSWORD_ALGORITHM = 'pbkdf2_sha256';
const PASSWORD_HASH_BYTES = 32;
const PASSWORD_ITERATIONS = 310_000;

@Injectable()
export class PasswordService {
  hashPassword(password: string): string {
    const salt = randomBytes(16).toString('base64url');
    const hash = pbkdf2Sync(
      password,
      salt,
      PASSWORD_ITERATIONS,
      PASSWORD_HASH_BYTES,
      'sha256',
    ).toString('base64url');

    return `${PASSWORD_ALGORITHM}$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
  }

  verifyPassword(password: string, encodedHash: string): boolean {
    const [algorithm, iterationsValue, salt, storedHash] = encodedHash.split('$');
    const iterations = Number(iterationsValue);

    if (
      algorithm !== PASSWORD_ALGORITHM ||
      !Number.isInteger(iterations) ||
      iterations <= 0 ||
      !salt ||
      !storedHash
    ) {
      return false;
    }

    const expected = Buffer.from(storedHash, 'base64url');
    const actual = pbkdf2Sync(password, salt, iterations, expected.length, 'sha256');

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  isStrongPassword(password: string): boolean {
    return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
  }
}
