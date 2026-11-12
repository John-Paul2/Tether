<div align="center">

# Tether

**The PayPal webhook doctor: finds paid orders your system never heard about, explains why, and heals them safely.**

[![Next.js](https://img.shields.io/badge/Next.js-16.3.6-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PayPal Sandbox](https://img.shields.io/badge/PayPal-Sandbox_REST_API-003087?style=flat-square&logo=paypal&logoColor=white)](https://developer.paypal.com/api/rest/)
[![Gemini](https://img.shields.io/badge/Google_Gemini-Function_Calling-4285F4?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
[![AG Studio](https://img.shields.io/badge/AG_Studio-3.0.0-0070E0?style=flat-square)](https://www.ag-grid.com/studio/)
[![Render](https://img.shields.io/badge/Hosted_on-Render-46E3B7?style=flat-square&logo=render&logoColor=black)](https://render.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-2EAD4B?style=flat-square)](LICENSE)

[**Live demo**]([LIVE_DEMO_URL]) · [**Demo video**]([VIDEO_URL]) · [**Devpost**]([DEVPOST_URL])

</div>

![Tether dashboard](docs/screenshots/01-drift.png)

## The problem

PayPal retries a webhook only when the listener visibly fails the request. If your listener answers `HTTP 200` and then loses the event — during a deploy, a queue hiccup, a swallowed exception, or a downstream DB timeout — PayPal marks the delivery complete and never retries. PayPal says the order is `COMPLETED`, while your local database stays stuck at `CREATED` with no error in any log. [PayPal retries non-2xx webhooks up to 25 times over 3 days](https://developer.paypal.com/api/rest/webhooks/), yet [73% of SME decision-makers call payment reconciliation a major frustration](https://ffnews.com/newsarticle/adyen-highlights-slow-cash-flow-and-payment-reconciliation-stalling-sme-growth-draining-time-and-resources/).

## What Tether does

1. **Detect** — Compares unpaid local orders in SQLite against live PayPal sandbox order statuses (`GET /v2/checkout/orders/{id}`) to spot silent state drift.
2. **Diagnose** — Runs a tool-calling Gemini Doctor Agent across webhook registrations, local receipt logs, PayPal event logs, and fault settings, streaming each step over Server-Sent Events (SSE).
3. **Guard** — Evaluates five server-side pre-conditions in [`lib/heal.ts`](lib/heal.ts) and recomputes `safe_to_heal` in code rather than trusting model output.
4. **Heal** — Requests an official PayPal webhook replay (`POST /v1/notifications/webhooks-events/{event_id}/resend`) after human approval, never editing the database directly.
5. **Prove** — Verifies the cryptographic signature on the re-delivered webhook (`POST /v1/notifications/verify-webhook-signature`), flips the order to `PAID`, and logs `seconds_to_fixed` in the audit trail.

## Try it in 60 seconds

> **Note:** If the live demo is hosted on Render's free tier, the instance may take up to a minute to wake on the first request.

1. **Create a drifting order (or pick an existing one):** Click **DEMO** in the top-right bar, turn **Simulate dropped webhooks** **ON**, click **Create sandbox order**, open **Approve in PayPal sandbox** to sign in as a buyer, click **Capture order**, and then turn **Simulate dropped webhooks** **OFF** so the listener can receive the replay.
2. **Open the Doctor panel:** Click the red **`N open`** drift pill in the top bar (or select the drifting row in the **Local orders** table) to open the **Doctor panel**.
3. **Investigate:** Click **Investigate** on the drifting order; watch live SSE step cards (`02-doctor.png`) stream in as Gemini calls its diagnostic tools and produces a root-cause card (`03-diagnosis.png`).
4. **Approve fix:** Click **Approve fix** in the Doctor panel footer to trigger a guarded PayPal webhook resend.
5. **See the proof:** Within seconds, PayPal resends `PAYMENT.CAPTURE.COMPLETED`, `/api/webhook` verifies its signature, the reconciliation strip and order status flip from `CREATED` to `PAID`, **Open drift** drops to `$0`, and the heal card records the exact **Seconds to fixed** (`04-healed.png`).

## How it works

### Architecture

```mermaid
flowchart LR
  PP["PayPal Sandbox API"]
  WH["POST /api/webhook<br/>Signature Verifier"]
  DB[("SQLite<br/>data/tether.db")]
  DR["GET /api/drift<br/>lib/drift.ts"]
  AG["POST /api/agent<br/>Gemini Doctor + 7 Tools"]
  GD["Guard & Heal<br/>lib/heal.ts (5 checks)"]
  UI["Next.js Dashboard<br/>AG Studio + Doctor Panel"]

  PP -- "Webhook delivery" --> WH
  WH -- "Verify signature" --> PP
  WH -- "Store event & mark PAID" --> DB
  UI -- "Check drift" --> DR
  DR -- "Read CREATED orders" --> DB
  DR -- "GET /v2/checkout/orders/{id}" --> PP
  UI -- "Investigate (SSE)" --> AG
  AG -- "Read logs & state" --> DB
  AG -- "Inspect orders, events, webhooks" --> PP
  UI -- "Approve fix" --> GD
  GD -- "POST .../webhooks-events/{id}/resend" --> PP
```

### Guarded heal sequence

```mermaid
sequenceDiagram
  autonumber
  participant P as PayPal Sandbox
  participant W as POST /api/webhook
  participant D as SQLite (tether.db)
  participant A as Doctor Agent (Gemini)
  participant H as Operator (UI)
  participant G as Heal Guard (lib/heal.ts)

  P->>W: PAYMENT.CAPTURE.COMPLETED (drop_webhooks = true)
  W-->>P: 200 OK (dropped before DB write)
  Note over P,D: Drift: PayPal is COMPLETED, local_orders is CREATED
  H->>A: Click "Investigate" (POST /api/agent SSE)
  A->>P: get_paypal_order, get_paypal_event_log, check_webhook_registration
  A->>D: get_receipt_log, check_fault_switch, propose_heal
  A-->>H: Diagnosis JSON + server-recomputed safe_to_heal: true
  H->>G: Click "Approve fix" (POST /api/agent/approve)
  G->>P: Re-verify 5 pre-conditions + POST /v1/notifications/webhooks-events/{id}/resend
  P->>W: Re-deliver PAYMENT.CAPTURE.COMPLETED
  W->>P: POST /v1/notifications/verify-webhook-signature (SUCCESS)
  W->>D: Insert webhook_events + UPDATE local_orders SET local_status = 'PAID'
  G->>D: Poll local_orders (1s interval, up to 30s) & write heal_log
  G-->>H: healed: true + seconds_to_fixed
```

## Safety by design

| Principle | How it is enforced in code |
|---|---|
| **AI investigates, code decides** | `runDoctorAgent` in [`lib/agent/run.ts`](lib/agent/run.ts) overwrites the model's `safe_to_heal` boolean with the server-computed result of `propose_heal(orderId)`. |
| **No direct DB edits during heal** | `healOrderDrift` in [`lib/heal.ts`](lib/heal.ts) never updates `local_orders`. It only asks PayPal to resend the webhook; only a signature-verified `PAYMENT.CAPTURE.COMPLETED` in [`app/api/webhook/route.ts`](app/api/webhook/route.ts) can mark an order `PAID`. |
| **Evidence validation** | Every item in `evidence[]` must cite a real `tool_call_id` from the current run's trace. If JSON parsing or `tool_call_id` validation fails, the response is rejected and retried once (`validateAgentFinalResult`). |
| **Never claim success without proof** | After calling PayPal's resend endpoint, `healOrderDrift` polls `local_orders` every `1s` for up to `30s`. If `local_status` does not flip to `PAID`, it returns `healed: false` (`resend requested, not confirmed`). |
| **Full audit trail** | Every agent run is saved to `agent_runs` (model, trace JSON, result JSON) and every heal attempt — whether `healed`, `refused`, `resend_failed`, or `error` — is recorded in `heal_log`. |

### Five heal pre-conditions (`lib/heal.ts`)

Both `checkHealPreconditions` (called by `propose_heal`) and `healOrderDrift` enforce these five checks before calling PayPal's resend endpoint:

1. **`paypal_order_completed`** — Live `GET /v2/checkout/orders/{orderId}` confirms the PayPal order exists and its `status` is `COMPLETED`.
2. **`no_local_capture_webhook`** — `hasCompletedCaptureWebhookForOrder(orderId)` confirms no `PAYMENT.CAPTURE.COMPLETED` event is already stored in local `webhook_events` for this order.
3. **`event_in_paypal_log`** — `GET /v1/notifications/webhooks-events` finds the matching `PAYMENT.CAPTURE.COMPLETED` event in PayPal's event log and extracts its `event_id`.
4. **`not_already_resent_or_on_cooldown`** — `getLastResendAttemptForEvent(eventId)` checks `heal_log` to ensure the event was not already healed and is not within the `60s` resend cooldown (`RESEND_COOLDOWN_MS = 60_000`).
5. **`drop_webhooks_disabled`** — `settings.drop_webhooks` in SQLite is `"false"`, preventing a resend while the demo fault switch is still dropping webhooks.

## How PayPal is used

All live calls target `https://api-m.sandbox.paypal.com` using plain `fetch`:

| Capability | Endpoint | Purpose |
|---|---|---|
| OAuth 2.0 authentication | `POST /v1/oauth2/token` | Exchanges `PAYPAL_CLIENT_ID` and `PAYPAL_SECRET` (`client_credentials`) for a bearer token. |
| Webhook signature verification | `POST /v1/notifications/verify-webhook-signature` | Verifies `paypal-transmission-sig`, cert URL, transmission ID, timestamp, and `PAYPAL_WEBHOOK_ID` in `/api/webhook`. |
| Order status & drift check | `GET /v2/checkout/orders/{id}` | Reads live order `status` and capture details in `lib/drift.ts`, `lib/heal.ts`, and `lib/agent/tools.ts`. |
| Demo order creation | `POST /v2/checkout/orders` | Creates a sandbox `CAPTURE` order in `/api/demo/orders` and records `CREATED` in `local_orders`. |
| Demo order capture | `POST /v2/checkout/orders/{id}/capture` | Captures an approved sandbox order in `/api/demo/orders/[id]/capture` without touching `local_orders`. |
| Webhook event log lookup | `GET /v1/notifications/webhooks-events` | Searches PayPal's event history by `transaction_id` or 7-day time window for `PAYMENT.CAPTURE.COMPLETED`. |
| Webhook registration check | `GET /v1/notifications/webhooks` | Lists registered webhook URLs and event subscriptions to check against `PUBLIC_BASE_URL`. |
| Guarded webhook replay | `POST /v1/notifications/webhooks-events/{event_id}/resend` | Requests PayPal to re-deliver the missed webhook event (scoped to `PAYPAL_WEBHOOK_ID` when set). |

## How AI is used

- **Models & configuration ([`lib/gemini.ts`](lib/gemini.ts)):** Calls Google's Gemini REST API (`v1beta/models/{model}:generateContent`) using `GEMINI_API_KEY`. Primary model defaults to `GEMINI_MODEL` (`gemini-3.6-flash` if unset) and falls back to `GEMINI_FALLBACK_MODEL` (`gemini-3.5-flash` if unset).
- **Loop & validation limits ([`lib/agent/run.ts`](lib/agent/run.ts)):** Runs up to `MAX_STEPS = 8` tool-calling steps per investigation. If the model hits 8 tool calls without a final answer, it makes one final JSON-only turn. If the output fails schema or `tool_call_id` citation checks, it is rejected and retried once.
- **Timeout & fallback behaviour ([`lib/gemini.ts`](lib/gemini.ts)):** Each Gemini HTTP call has a `30,000ms` timeout (`CALL_TIMEOUT_MS`). On a timeout (`AbortError` / `TimeoutError`) or HTTP `429`, `500`, or `503`, `generateGeminiTurn` automatically retries the turn once on `GEMINI_FALLBACK_MODEL`.
- **Root-cause categories (`VALID_ROOT_CAUSES`):**
  - `WEBHOOK_DROPPED_BY_LISTENER`
  - `WEBHOOK_URL_OR_EVENT_MISMATCH`
  - `SIGNATURE_VERIFICATION_FAILING`
  - `NO_DRIFT`
  - `UNKNOWN`

### Agent tools (`lib/agent/tools.ts`)

| Tool name | What it checks |
|---|---|
| `get_drift` | Compares unpaid `local_orders` (`local_status != 'PAID'`) against live PayPal order statuses (`GET /v2/checkout/orders/{id}`). |
| `get_paypal_order` | Fetches live PayPal order status, intent, amount, and captures for `orderId`, alongside the local SQLite row. |
| `get_receipt_log` | Queries local `webhook_events` in SQLite for `orderId`, including `event_type` and `verification_status`. |
| `get_paypal_event_log` | Queries PayPal's `GET /v1/notifications/webhooks-events` (page size 50) for events matching `orderId` or its capture IDs. |
| `check_webhook_registration` | Calls `GET /v1/notifications/webhooks` and checks whether a registered webhook matches `PUBLIC_BASE_URL` and subscribes to `PAYMENT.CAPTURE.COMPLETED` (or `*`). |
| `check_fault_switch` | Reads `settings.drop_webhooks` from SQLite to see if demo fault injection is currently active. |
| `propose_heal` | Runs all 5 pre-condition checks in `checkHealPreconditions(orderId)` without resending any webhook, returning per-check results and `safe_to_heal`. |

## Built with

| Technology | Role in Tether |
|---|---|
| **Next.js 16 & React 19 (TypeScript)** | App Router frontend, server-rendered live data snapshot (`getTetherData`), and REST/SSE API routes. |
| **PayPal Sandbox REST API** | OAuth2, Checkout Orders v2, Webhook Signature Verification, Webhooks Management, and Event Resend. |
| **Google Gemini API** | Function-calling diagnostic agent (`lib/gemini.ts`, `lib/agent/run.ts`) with automatic fallback model retry. |
| **AG Studio 3.0 & AG Grid 36.2** | Relational data model (`webhook_events`, `local_orders`, `heal_log`, `agent_runs`, `drift` joined on `order_id`), KPI expressions (`moneyAtRisk`, `verificationRate`, `openDriftCount`, `avgSecondsToFixed`), charts, and interactive grids. |
| **SQLite (`better-sqlite3`)** | WAL-mode local persistence (`data/tether.db`) for orders, verified webhook receipts, heal audit logs, and agent runs. |
| **Server-Sent Events (SSE)** | Streams live agent `step`, `result`, and `error` events from `POST /api/agent` to the Doctor panel. |
| **Render** | Cloud web service hosting for the live demo. |
| **Antigravity & Claude** | AI development assistance used during the hackathon. |

## Run it locally

### Prerequisites

- **Node.js** `^20` (see `@types/node` in [`package.json`](package.json))
- A **PayPal Sandbox REST application** ([PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox))
- A **Google Gemini API key** ([Google AI Studio](https://aistudio.google.com/))

### Setup

```bash
git clone https://github.com/John-Paul2/Tether.git
cd Tether
npm install
cp .env.example .env.local
```

Fill in `.env.local`, then start the development server:

```bash
npm run dev
```

Open `http://localhost:3000` (which redirects to `/dashboard`). Other scripts in `package.json`: `npm run build`, `npm run start`, and `npm run lint`.

<details>
<summary><strong>Environment variables (matches <code>.env.example</code>)</strong></summary>

| Variable | Required? | Description |
|---|---|---|
| `PAYPAL_CLIENT_ID` | Yes | PayPal sandbox REST app client ID. |
| `PAYPAL_SECRET` | Yes | PayPal sandbox REST app secret. |
| `PAYPAL_WEBHOOK_ID` | Yes | ID of the webhook registered in your PayPal sandbox app (used for signature verification and scoped resends). |
| `PUBLIC_BASE_URL` | Yes | Publicly reachable base URL for your app (e.g. your ngrok tunnel URL); compared against PayPal's registered webhook URL. |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for the Doctor Agent. |
| `GEMINI_MODEL` | No | Primary Gemini model ID (defaults to `gemini-3.6-flash` in `lib/gemini.ts`). |
| `GEMINI_FALLBACK_MODEL` | No | Fallback Gemini model ID used on timeout or 429/500/503 (defaults to `gemini-3.5-flash`). |
| `AG_STUDIO` | No | Optional AG Studio license key passed to `AgStudioProvider`. |

</details>

### Expose the webhook and create a drifting order

1. Start a tunnel pointing at port `3000`, for example: `ngrok http 3000`.
2. Set `PUBLIC_BASE_URL` in `.env.local` to your tunnel's HTTPS URL (for example, `https://your-subdomain.ngrok-free.dev`).
3. In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox), add a webhook to your sandbox app with URL `<PUBLIC_BASE_URL>/api/webhook`, subscribe to `PAYMENT.CAPTURE.COMPLETED` (and optionally `CHECKOUT.ORDER.APPROVED`), and copy the resulting **Webhook ID** into `PAYPAL_WEBHOOK_ID` in `.env.local`.
4. In the Tether UI, open **DEMO**, enable **Simulate dropped webhooks**, click **Create sandbox order**, approve the order in the PayPal sandbox buyer window, click **Capture order**, and then turn **Simulate dropped webhooks** **OFF**. You now have a live drifting order ready to investigate and heal.

## Tested scenarios

[`scripts/test-agent.ts`](scripts/test-agent.ts) runs three end-to-end diagnostic scenarios against real PayPal sandbox orders and restores database state when finished:

| Scenario | Setup in `scripts/test-agent.ts` | Expected `root_cause` | `safe_to_heal` |
|---|---|---|---|
| **(a) Dropped webhook** | Order `2JJ686322T369532X` (`COMPLETED` in PayPal) set to `CREATED` locally with its local `PAYMENT.CAPTURE.COMPLETED` row removed and `drop_webhooks = false`. | `WEBHOOK_DROPPED_BY_LISTENER` | `true` |
| **(b) No drift** | Order `8N99210137712282F` already `PAID` locally and `COMPLETED` in PayPal with `drop_webhooks = false`. | `NO_DRIFT` | `false` |
| **(c) Webhook URL mismatch** | `PUBLIC_BASE_URL` temporarily set to `https://wrong-tunnel-url.ngrok-free.dev` so `check_webhook_registration` detects a mismatch. | `WEBHOOK_URL_OR_EVENT_MISMATCH` | `false` |

Run the test suite with:

```bash
node --experimental-strip-types scripts/test-agent.ts
```

## Project structure

```text
app/api/webhook/route.ts                  # Receives PayPal webhooks, verifies signatures, updates PAID status
app/api/drift/route.ts                    # GET endpoint returning live PayPal vs. SQLite drift items
app/api/events/route.ts                   # GET endpoint returning the latest 100 local webhook_events
app/api/heal/route.ts                     # POST endpoint running guarded webhook resend and 30s verification poll
app/api/heal/log/route.ts                 # GET endpoint returning the latest 50 heal_log audit rows
app/api/agent/route.ts                    # GET recent agent runs; POST streams live Doctor Agent SSE steps
app/api/agent/approve/route.ts            # POST human-approved heal endpoint used by the Doctor panel
app/api/demo/fault/route.ts               # GET/POST toggle for settings.drop_webhooks fault injection
app/api/demo/orders/route.ts              # POST creates a PayPal sandbox order and inserts local CREATED row
app/api/demo/orders/[id]/capture/route.ts # POST captures a PayPal sandbox order without updating local SQLite
app/dashboard/                            # AG Studio dashboard, TopBar, MoneyBox, ReconciliationStrip, DoctorPanel
lib/db.ts                                 # SQLite schema and queries (webhook_events, local_orders, settings, heal_log, agent_runs)
lib/drift.ts                              # Read-only drift detector comparing unpaid local orders to PayPal
lib/heal.ts                               # Five pre-condition checks, PayPal webhook resend, and verification polling
lib/gemini.ts                             # Gemini REST client with function calling, 30s timeout, and fallback retry
lib/agent/tools.ts                        # Seven diagnostic tool declarations and implementations
lib/agent/run.ts                          # Doctor Agent loop, evidence validator, and server-side safe_to_heal override
lib/tether-data.ts                        # Server snapshot builder flattening SQLite and live drift for AG Studio
scripts/test-agent.ts                     # End-to-end verification script for Scenarios (a), (b), and (c)
DESIGN.md                                 # Design system tokens, typography, and component rules
```

## Limitations and roadmap

**Current limitations:**
- **Sandbox only:** Hardcoded to `https://api-m.sandbox.paypal.com`.
- **Human-in-the-loop required:** Every heal requires an operator to click **Approve fix** (or call `/api/heal` / `/api/agent/approve`).
- **Ephemeral SQLite on Render free tier:** Local SQLite state in `data/tether.db` resets when a free Render instance spins down or redeploys.
- **Order-creation return URLs:** `/api/demo/orders` uses static sandbox return/cancel URLs for buyer approval redirect.

**Roadmap (not built yet):**
- **Autopilot within policy:** Optional auto-heal when all 5 pre-conditions pass and confidence is `high`.
- **One-click "Load a drifting order" button:** Pre-seeded demo button in the DEMO popover.
- **WooCommerce and Shopify adapters:** Plug-in connectors for merchant order tables beyond local SQLite.
- **Slack and email alerts:** Push notifications when `checkOrderDrift` detects money at risk.
- **Daily reconciliation sweep & more event types:** Scheduled background checks and support for refunds, disputes, and subscriptions.

## License

Released under the [MIT License](LICENSE).
