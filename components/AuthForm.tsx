'use client';

import { useActionState } from 'react';
import { login, signup, type AuthState } from '@/app/auth/actions';

type AuthFormProps = { mode: 'login' | 'signup'; initialError?: string };

export default function AuthForm({ mode, initialError }: AuthFormProps) {
  const isSignup = mode === 'signup';
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(
    isSignup ? signup : login,
    { error: initialError },
  );

  if (state.message) {
    return <p className="auth-message" role="status">{state.message}</p>;
  }

  return (
    <form className="auth-form" action={formAction}>
      {isSignup && (
        <label className="field">
          <span>Name</span>
          <input name="name" type="text" autoComplete="name" required maxLength={100} />
        </label>
      )}
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          name="password"
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          required
          minLength={isSignup ? 8 : undefined}
        />
      </label>

      {state.error && <p className="error" role="alert">{state.error}</p>}

      <button type="submit" className="btn-generate" disabled={isPending}>
        <span>{isPending ? 'Please wait…' : isSignup ? 'Create account' : 'Log in'}</span>
        {isPending && <span className="spinner spinner-light" />}
      </button>

      <p className="auth-switch">
        {isSignup ? (
          <>Already have an account? <a href="/login">Log in</a></>
        ) : (
          <>New here? <a href="/signup">Create an account</a></>
        )}
      </p>
    </form>
  );
}
