'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { clientIp } from '@/lib/clientIp';
import { rateLimit } from '@/lib/rateLimit';
import { createClient } from '@/lib/supabase/server';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 100;

export type AuthState = { error?: string; message?: string };

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

async function limited(action: string) {
  const ip = clientIp(await headers());
  return !rateLimit(`${action}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS).allowed;
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = field(formData, 'name').trim();
  const email = field(formData, 'email').trim().toLowerCase();
  const password = field(formData, 'password');

  if (!name || name.length > MAX_NAME_LENGTH) return { error: `Enter your name (up to ${MAX_NAME_LENGTH} characters).` };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (await limited('signup')) return { error: 'Too many attempts. Please wait a few minutes and try again.' };

  const origin = (await headers()).get('origin');
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: origin ? `${origin}/auth/confirm` : undefined,
    },
  });

  if (error) {
    console.error('Sign-up failed:', error.code, error.message);
    if (error.code === 'weak_password') return { error: 'Please choose a stronger password.' };
    return { error: 'Sign-up failed. Please try again.' };
  }

  // Same message whether or not the email is already registered, so accounts can't be enumerated
  return { message: 'Check your email for a link to confirm your account, then log in.' };
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, 'email').trim().toLowerCase();
  const password = field(formData, 'password');

  if (!email || !password) return { error: 'Enter your email and password.' };
  if (await limited('login')) return { error: 'Too many attempts. Please wait a few minutes and try again.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === 'email_not_confirmed') return { error: 'Please confirm your email first. Check your inbox for the link.' };
    if (error.code !== 'invalid_credentials') console.error('Login failed:', error.code, error.message);
    return { error: 'Invalid email or password.' };
  }

  redirect('/');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
