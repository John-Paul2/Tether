import {
  getSetting,
  insertWebhookEvent,
  markLocalOrderPaid,
  type VerificationStatus,
} from '@/lib/db';
import { getPayPalAccessToken } from '@/lib/paypal';

const PAYPAL_SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';

type PayPalWebhookPayload = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    supplementary_data?: {
      related_ids?: {
        order_id?: string;
      };
    };
  };
};

async function verifyPayPalWebhookSignature(
  headers: Headers,
  webhookEvent: unknown,
): Promise<VerificationStatus> {
  const authAlgo = headers.get('paypal-auth-algo');
  const certUrl = headers.get('paypal-cert-url');
  const transmissionId = headers.get('paypal-transmission-id');
  const transmissionSig = headers.get('paypal-transmission-sig');
  const transmissionTime = headers.get('paypal-transmission-time');
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;

  if (
    !authAlgo ||
    !certUrl ||
    !transmissionId ||
    !transmissionSig ||
    !transmissionTime ||
    !webhookId ||
    !webhookEvent ||
    typeof webhookEvent !== 'object'
  ) {
    return 'FAILURE';
  }

  try {
    const accessToken = await getPayPalAccessToken();
    const response = await fetch(
      `${PAYPAL_SANDBOX_BASE_URL}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: webhookEvent,
        }),
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return 'FAILURE';
    }

    const result = (await response.json()) as { verification_status?: string };
    return result.verification_status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE';
  } catch {
    return 'FAILURE';
  }
}

export async function POST(request: Request) {
  // Labelled demo fault injection: when settings.drop_webhooks is "true",
  // return 200 immediately without storing or processing the webhook event.
  if (getSetting('drop_webhooks', 'false') === 'true') {
    return Response.json(
      { received: true, dropped: true },
      { status: 200 },
    );
  }

  const rawBody = await request.text();
  const receivedAt = new Date().toISOString();
  const headersJson = JSON.stringify(Object.fromEntries(request.headers.entries()));

  let parsedEvent: PayPalWebhookPayload | undefined;
  try {
    parsedEvent = JSON.parse(rawBody) as PayPalWebhookPayload;
  } catch {
    parsedEvent = undefined;
  }

  const verificationStatus = await verifyPayPalWebhookSignature(request.headers, parsedEvent);

  const eventId =
    typeof parsedEvent?.id === 'string' && parsedEvent.id.trim() !== ''
      ? parsedEvent.id
      : `unparsed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const eventType =
    typeof parsedEvent?.event_type === 'string' && parsedEvent.event_type.trim() !== ''
      ? parsedEvent.event_type
      : 'UNKNOWN';

  const resourceId =
    typeof parsedEvent?.resource?.id === 'string' ? parsedEvent.resource.id : null;

  const orderId =
    typeof parsedEvent?.resource?.supplementary_data?.related_ids?.order_id === 'string'
      ? parsedEvent.resource.supplementary_data.related_ids.order_id
      : null;

  insertWebhookEvent({
    id: eventId,
    event_type: eventType,
    resource_id: resourceId,
    order_id: orderId,
    raw_body: rawBody,
    headers_json: headersJson,
    verification_status: verificationStatus,
    received_at: receivedAt,
  });

  // Only verified PAYMENT.CAPTURE.COMPLETED events may update local order state to PAID.
  if (
    verificationStatus === 'SUCCESS' &&
    eventType === 'PAYMENT.CAPTURE.COMPLETED' &&
    orderId
  ) {
    markLocalOrderPaid(orderId);
  }

  return Response.json(
    { received: true, id: eventId, verification_status: verificationStatus },
    { status: 200 },
  );
}
