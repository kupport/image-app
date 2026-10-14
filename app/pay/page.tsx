import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { customerPortalUrl, subscriptionAccess } from '@/lib/access';
import SiteHeader from '@/components/SiteHeader';

const PRICE_LABEL = '$9.99';

// The Payment Link carries the Supabase user id so the Stripe webhook can link the subscription to this account
function paymentLinkFor(userId: string, email: string | undefined) {
  const base = process.env.STRIPE_PAYMENT_LINK_URL;
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set('client_reference_id', userId);
  if (email) url.searchParams.set('prefilled_email', email);
  return url.toString();
}

export default async function PayPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  // Dynamic rendering is required so Next.js can apply the per-request CSP nonce from proxy.ts
  await connection();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { active, lapsed } = await subscriptionAccess(supabase, user.id);
  if (active) redirect('/');

  const { status } = await searchParams;
  const confirming = status === 'success';
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const userName = profile?.full_name ?? user.user_metadata.full_name ?? user.email;
  const checkoutUrl = paymentLinkFor(user.id, user.email);
  if (!checkoutUrl) console.error('STRIPE_PAYMENT_LINK_URL is not set');

  return (
    <>
      {/* The webhook can land a moment after Stripe redirects back; re-check until it does */}
      {confirming && <meta httpEquiv="refresh" content="3" />}
      <SiteHeader userName={userName} manageUrl={lapsed ? customerPortalUrl() : undefined} />
      <main className="content paywall">
        <h1>{lapsed ? 'Your subscription has ended' : 'Subscribe to Try-On'}</h1>

        {confirming ? (
          <p className="paywall-status" role="status">
            <span className="spinner" />Confirming your payment…
          </p>
        ) : (
          <>
            <p className="paywall-lead">
              {lapsed
                ? 'Renew your subscription to keep generating looks.'
                : 'Unlimited virtual try-on: upload a person and a garment, and generate your look.'}
            </p>
            <div className="paywall-price">
              <span className="paywall-amount">{PRICE_LABEL}</span>
              <span className="paywall-interval">per month · cancel anytime</span>
            </div>
            {checkoutUrl ? (
              <a className="btn-generate paywall-cta" href={checkoutUrl}>
                <span>{lapsed ? 'Renew subscription' : 'Subscribe'}</span>
              </a>
            ) : (
              <p className="error" role="alert">Subscriptions are not available right now. Please try again later.</p>
            )}
            <p className="paywall-note">Secure checkout by Stripe. You&rsquo;ll come straight back here afterwards.</p>
          </>
        )}
      </main>
    </>
  );
}
