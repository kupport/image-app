// Only trustworthy behind a proxy that overwrites x-forwarded-for (e.g. Vercel, a configured nginx)
export function clientIp(headers: Headers) {
  return headers.get('x-forwarded-for')?.split(',')[0].trim() || headers.get('x-real-ip') || 'unknown';
}
