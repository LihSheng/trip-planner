import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = (Deno.env.get('INVITE_ALLOWED_ORIGIN') ?? Deno.env.get('AI_IMPORT_ALLOWED_ORIGIN') ?? '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsHeaders(request?: Request) {
  const origin = request?.headers.get('Origin') ?? '';
  const isLocalOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  const allowOrigin = allowedOrigins.includes('*')
    ? '*'
    : allowedOrigins.includes(origin) || isLocalOrigin
      ? origin
      : allowedOrigins[0] ?? 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(payload: unknown, status = 200, request?: Request) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function invitationUrl(request: Request, submittedUrl: unknown, planId: string) {
  const configuredUrl = Deno.env.get('INVITE_APP_URL');
  const candidate = configuredUrl ?? (typeof submittedUrl === 'string' ? submittedUrl : '');
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    const requestOrigin = request.headers.get('Origin');
    const isLocalUrl = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url.origin);
    if (url.protocol !== 'https:' && !isLocalUrl) return null;
    if (!configuredUrl && requestOrigin && url.origin !== requestOrigin) return null;
    url.search = '';
    url.hash = '';
    url.searchParams.set('plan', planId);
    return url.toString();
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json({ message: 'Use POST.' }, 405, request);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ message: 'Sign in to invite collaborators.' }, 401, request);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Request body must be JSON.' }, 400, request);
  }

  const planId = typeof body.planId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.planId)
    ? body.planId
    : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!planId) return json({ message: 'Select a valid trip plan.' }, 400, request);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ message: 'Enter a valid collaborator email.' }, 400, request);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return json({ message: 'Sign in to invite collaborators.' }, 401, request);
  if (userData.user.email?.toLowerCase() === email) return json({ message: 'You already own this trip.' }, 400, request);

  const { data: trips, error: tripError } = await client
    .from('trip_plans')
    .select('id,state')
    .eq('id', planId)
    .eq('owner_id', userData.user.id)
    .limit(1);
  if (tripError || !trips?.length) return json({ message: 'Only the trip owner can invite collaborators.' }, 403, request);

  const { data: existing } = await client
    .from('trip_collaborators')
    .select('member_id')
    .eq('trip_plan_id', planId)
    .eq('invite_email', email)
    .limit(1);
  if (existing?.[0]?.member_id) {
    return json({ emailSent: false, alreadyAccepted: true, message: 'This collaborator already has access.' }, 200, request);
  }

  const { error: inviteError } = await client
    .from('trip_collaborators')
    .upsert(
      { trip_plan_id: planId, invite_email: email },
      { onConflict: 'trip_plan_id,invite_email' },
    );
  if (inviteError) return json({ message: 'Could not save the collaborator invitation.' }, 500, request);

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('INVITE_FROM_EMAIL');
  const inviteUrl = invitationUrl(request, body.inviteUrl, planId);
  if (!resendKey || !fromEmail || !inviteUrl) {
    return json({
      emailSent: false,
      message: 'Access was granted, but invitation email is not configured. Share the app link manually.',
    }, 200, request);
  }

  const state = trips[0].state as { tripName?: unknown } | null;
  const tripName = typeof state?.tripName === 'string' && state.tripName.trim() ? state.tripName.trim() : 'a trip';
  const ownerEmail = userData.user.email ?? 'A trip planner user';
  const subject = `You’re invited to collaborate on ${tripName}`;
  const safeTripName = escapeHtml(tripName);
  const safeOwnerEmail = escapeHtml(ownerEmail);
  const safeInviteUrl = escapeHtml(inviteUrl);

  try {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject,
        text: `${ownerEmail} invited you to collaborate on ${tripName}.\n\nOpen the trip: ${inviteUrl}\n\nSign in using ${email} to receive editor access.`,
        html: `<p><strong>${safeOwnerEmail}</strong> invited you to collaborate on <strong>${safeTripName}</strong>.</p><p><a href="${safeInviteUrl}">Open the trip</a></p><p>Sign in using <strong>${escapeHtml(email)}</strong> to receive editor access.</p>`,
      }),
    });
    if (!emailResponse.ok) {
      console.error(JSON.stringify({ code: 'INVITE_EMAIL_FAILED', status: emailResponse.status, planId }));
      return json({ emailSent: false, message: 'Access was granted, but the invitation email could not be delivered. Share the app link manually.' }, 200, request);
    }
    return json({ emailSent: true, message: `Invitation emailed to ${email}.` }, 200, request);
  } catch (error) {
    console.error(JSON.stringify({ code: 'INVITE_EMAIL_FAILED', message: error instanceof Error ? error.message : 'unknown', planId }));
    return json({ emailSent: false, message: 'Access was granted, but the invitation email could not be delivered. Share the app link manually.' }, 200, request);
  }
});
