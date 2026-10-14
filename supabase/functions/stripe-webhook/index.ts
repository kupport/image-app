// Stripe webhook: mirrors subscription state into public.subscriptions.
// Deployed with verify_jwt = false; requests are authenticated by the Stripe signature instead.
import Stripe from 'npm:stripe@19';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe((Deno.env.get('STRIPE_API_KEY') ?? '').trim());
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const webhookSecret = (Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '').trim();
const paymentLinkId = (Deno.env.get('STRIPE_PAYMENT_LINK_ID') ?? '').trim();

// Without these, events would be rejected or skipped for good; a 500 makes Stripe retry until they are set
const missingSecrets = ['STRIPE_API_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PAYMENT_LINK_ID'].filter(
  (name) => !Deno.env.get(name),
);

// Service role bypasses RLS; it is the only writer of public.subscriptions
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idOf(value: string | { id: string } | null): string | null {
  return typeof value === 'string' ? value : value?.id ?? null;
}

function rowFor(subscription: Stripe.Subscription) {
  // Newer API versions keep the period on the item; older ones on the subscription
  const periodEnd =
    subscription.items.data[0]?.current_period_end ??
    (subscription as unknown as { current_period_end?: number }).current_period_end;
  if (!periodEnd) throw new Error(`Subscription ${subscription.id} has no current_period_end`);
  return {
    stripe_subscription_id: subscription.id,
    stripe_customer_id: idOf(subscription.customer)!,
    status: subscription.status,
    current_period_end: new Date(periodEnd * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription' || idOf(session.payment_link) !== paymentLinkId) {
    console.log(
      `Ignoring checkout session ${session.id}: mode ${session.mode}, payment link ` +
        `${idOf(session.payment_link)} (expected STRIPE_PAYMENT_LINK_ID ${JSON.stringify(paymentLinkId)})`,
    );
    return;
  }
  const userId = session.client_reference_id;
  const subscriptionId = idOf(session.subscription);
  if (!userId || !UUID_RE.test(userId) || !subscriptionId) {
    console.error(`Checkout session ${session.id} has no valid client_reference_id or subscription`);
    return;
  }
  const { data, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !data.user) {
    console.error(`Checkout session ${session.id} references unknown user ${userId}`);
    return;
  }

  // Fetch the current state rather than trusting event order
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const { error } = await supabase
    .from('subscriptions')
    .upsert({ ...rowFor(subscription), user_id: userId }, { onConflict: 'stripe_subscription_id' });
  if (error) throw error;
  console.log(`Linked subscription ${subscription.id} (${subscription.status}) to user ${userId}`);
}

async function handleSubscriptionChanged(eventSubscription: Stripe.Subscription, deleted: boolean) {
  const { data: existing, error: selectError } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('stripe_subscription_id', eventSubscription.id)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!existing) {
    // Not linked yet; checkout.session.completed will store the latest state
    console.log(`Ignoring update for unlinked subscription ${eventSubscription.id}`);
    return;
  }

  const subscription = deleted ? eventSubscription : await stripe.subscriptions.retrieve(eventSubscription.id);
  const { error } = await supabase
    .from('subscriptions')
    .update(rowFor(subscription))
    .eq('stripe_subscription_id', subscription.id);
  if (error) throw error;
  console.log(`Updated subscription ${subscription.id}: ${subscription.status}`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (missingSecrets.length > 0) {
    console.error(`Missing Edge Function secrets: ${missingSecrets.join(', ')}`);
    return new Response('Webhook not configured', { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    console.error('Webhook signature verification failed:', (err as Error).message);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionChanged(event.data.object, false);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionChanged(event.data.object, true);
        break;
      default:
        console.log(`Ignoring event ${event.type}`);
    }
  } catch (err) {
    // A 500 makes Stripe retry the event later
    console.error(`Failed to handle ${event.type} (${event.id}):`, err);
    return new Response('Webhook handler failed', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
