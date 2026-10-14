import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// Statuses that grant access. past_due, unpaid, canceled, incomplete etc. lock the user out.
const ACTIVE_STATUSES = ['active', 'trialing'];
// Tolerates a late renewal webhook; also locks users out if a cancellation webhook is ever missed
const PERIOD_GRACE_MS = 24 * 60 * 60 * 1000;

export type SubscriptionAccess = { active: boolean; lapsed: boolean };

/**
 * Reads the user's subscriptions through their RLS-scoped client (users can only see their own rows).
 * Rows are written only by the Stripe webhook edge function (supabase/functions/stripe-webhook).
 */
export async function subscriptionAccess(supabase: SupabaseClient, userId: string): Promise<SubscriptionAccess> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', userId);
  if (error) {
    console.error('Subscription lookup failed:', error.message);
    return { active: false, lapsed: false };
  }
  const cutoff = Date.now() - PERIOD_GRACE_MS;
  const active = data.some(
    (row) => ACTIVE_STATUSES.includes(row.status) && new Date(row.current_period_end).getTime() > cutoff,
  );
  return { active, lapsed: !active && data.length > 0 };
}

export async function hasActiveSubscription(supabase: SupabaseClient, userId: string) {
  return (await subscriptionAccess(supabase, userId)).active;
}

/** Stripe customer portal login link, where subscribers manage or cancel. */
export function customerPortalUrl() {
  return process.env.STRIPE_CUSTOMER_PORTAL_URL || undefined;
}
