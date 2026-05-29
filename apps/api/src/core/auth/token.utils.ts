export function extractBearerToken(headerValue: string | string[] | undefined): string | null {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!value) {
    return null;
  }

  const [scheme, token] = value.trim().split(/\s+/, 2);

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}
