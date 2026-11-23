## System Architecture

```text
[Browser / Next.js App Router]
       │                 ▲
       │ (Clerk Auth)    │ (Real-time Queries / Mutations)
       ▼                 ▼
   [Clerk]        [Convex Cloud]
                  ├── Queries & Mutations (loans, tools, users, automationEvents)
                  ├── Internal Actions ('use node') ──► HMAC-SHA256 Webhook ──► [n8n] (via HTTPS Tunnel)
                  └── HTTP Routes (/api/n8n/*)     ◄── HMAC-SHA256 Auth   ◄── [n8n] (Scheduled Overdue Reminders)
```

# Prerequisites

Node.js (v18+ or v20+) and npm

Docker and Docker Compose (for running n8n locally)

Convex CLI (npx convex) and a Convex deployment

Clerk application configured with a Convex JWT template

Cloudflare Tunnel (cloudflared) or ngrok if you want Convex Cloud to reach a local n8n instance on http://localhost:5678

Note: 2 JSON workflow file setups for n8n has been provided in n8n-workflows-json folder.

# Project Setup Guide

Follow these steps to set up and run the project locally.

## 1. Install Dependencies

Install the required npm packages:

```bash
npm install
```

## 2. Configure Environment Variables

Create a `.env` file in the project's root directory and add the following variables:

```env
LENDLOOP_N8N_WEBHOOK_SECRET=sk_key...
LENDLOOP_CONVEX_API_SECRET=api_key...
LENDLOOP_CONVEX_SITE_URL=https://<your-deployment>.convex.site
```

## 3. Docker compose up to run n8n server on your machine

```bash
docker compose up -d
```

Note: Alternatively you can also use n8n cloud version and skip this process, make sure the env variables are well configured.

## 4. Configure Environment Variables

Create a `.env.local` file in the project's root directory and add the following variables:

```env
NEXT_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://<your-deployment>.convex.site

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

Replace the placeholder values with your actual Clerk and Convex credentials.

## 5. Configure Convex Environment Variables

Run the following commands to configure the required secrets and webhook URL for your active Convex deployment.

**Webhook secret:**

```bash
npx convex env set N8N_WEBHOOK_SECRET "your-strong-random-webhook-secret"
```

**n8n webhook URL:**

```bash
npx convex env set N8N_WEBHOOK_URL "https://<your-tunnel>.trycloudflare.com/webhook/lendloop-loan-event"
```

Replace the URL with your actual n8n webhook URL.
Important note on URLs: Convex’s cloud backend (convex.cloud / convex.site) cannot reach http://localhost:5678 or [http://host.docker.internal:5678](http://host.docker.internal:5678) directly over the public internet unless your machine exposes n8n via a tunnel (such as Cloudflare Tunnel or ngrok) during live end-to-end tests—or you use n8n Cloud / trigger a test call from your machine.

**Convex API secret:**

```bash
npx convex env set CONVEX_N8N_API_SECRET "your-strong-random-api-secret"
```

These environment variables are used to securely communicate between Convex and n8n.

## 6. Start the Development Servers

You need two terminal windows to run the application.

**Terminal 1: Start Convex**

```bash
npx convex dev
```

This command deploys your schema, functions, and HTTP routes to your Convex development deployment.

**Terminal 2: Start Next.js**

```bash
npm run dev
```

This starts the Next.js development server.

## 7. Access the Application

Once both servers are running, open the following URL in your browser:

```text
http://localhost:3000
```

Your application should now be running locally.

# Security & Data-Minimization Decisions

Server-Only Secrets & Client Bundle Isolation: Sensitive credentials (CLERK*SECRET_KEY, N8N_WEBHOOK_SECRET, CONVEX_N8N_API_SECRET) never use the NEXT_PUBLIC* prefix and are never passed into client components or serialized into UI state.

Role & Ownership Authorization on Mutations/Queries: User identity and permissions are enforced server-side in Convex (requireUser, ownership checks, and role === "admin" checks for admin moderation), rather than relying solely on frontend UI hiding.

Signed Requests, Replay Protection & Constant-Time Comparison:

Outbound webhooks to n8n and inbound /api/n8n/\* HTTP requests include X-LendLoop-Timestamp and X-LendLoop-Signature (HMAC-SHA256 over ${timestamp}.${rawBody}, or ${timestamp}. for empty-body GET requests).

Idempotency & Safe Retries: automationEvents enforces deduplication by idempotencyKey (by_idempotencyKey), ensuring retries from Convex scheduling or n8n HTTP retry policies do not duplicate event logs or over-increment reminder counters.

# Data Minimization:

Webhook payloads include only the identifiers, loan/tool metadata, timestamps, and recipient/actor fields required for workflow routing and notifications—avoiding unnecessary PII or unrelated account fields.

Always include updatedAt: Date.now() when updating records so audit/recency state stays accurate without storing extraneous diagnostic dumps.

# Short note on what I would change to run this in production

1. I would have introduced tool count for the tools.
2. UI would have been made much more better and responsive.
3. For now mock console is triggered for request notification workflow, in product, email to the respective loan and admin would have been made.
