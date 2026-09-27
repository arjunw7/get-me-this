import type { AuthIntent } from '../types/auth';

const INTENTS: AuthIntent[] = ['home', 'wishlist', 'create-group', 'invite'];

export function parseIntent(value: string | null): AuthIntent | null {
  return value && (INTENTS as string[]).includes(value) ? (value as AuthIntent) : null;
}

/** Where to land once someone is signed in (and has a profile). */
export function intentPath(intent: AuthIntent, firstTime: boolean): string {
  switch (intent) {
    case 'wishlist':
      return firstTime ? '/add' : '/wishlist';
    case 'create-group':
      return '/groups/new';
    case 'invite':
      return '/invite/diwali-scenes';
    default:
      return '/home';
  }
}

export function postVerifyPath(intent: AuthIntent, isNewUser: boolean): string {
  return isNewUser ? '/onboarding' : intentPath(intent, false);
}

export function nameFromEmail(email: string): string {
  const local = email.split('@')[0]?.split(/[._-]/)[0] ?? '';
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : '';
}
