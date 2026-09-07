# OmniReach AI — WhatsApp & Email Outreach Automation

Import a spreadsheet of contacts and automatically dispatch personalized WhatsApp messages and emails, with an AI WhatsApp booking bot, real Google Calendar meetings, and live delivery tracking. Supports multiple organizations, each with their own login and their own WhatsApp/Email/Calendar credentials configured through the in-app dashboard.

## Features

- Excel/CSV lead import with column auto-detection and phone/email validation
- Batch campaign runner (WhatsApp, Email, or both) with live send status
- Message templates with variable interpolation, or optional AI-personalized copy (Gemini)
- Email delivery via **Resend**, **SendGrid**, **Mailgun**, or generic **SMTP** (Gmail, Zoho Mail, Outlook/Office 365, or any business mailbox)
- WhatsApp delivery via click-to-chat links, Twilio WhatsApp API, or Meta WhatsApp Cloud API (text or approved templates)
- AI WhatsApp booking bot — replies to inbound messages, negotiates a meeting time, and books a real Google Calendar event with a Meet link
- Calendar booking slots, campaign analytics, and an n8n webhook bridge for further automation
- Multi-tenant: each organization signs up, logs in, and manages its own credentials via **Settings → Channel Setup** — nothing is shared between orgs (enforced by Postgres Row Level Security)

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` (only needed if you enable AI-personalized copy — outreach works fine without it using your own templates).
3. Run the app:
   `npm run dev`
4. Open the app, go to **Channel Setup** (top right) and connect your WhatsApp/Email sending method.

To enable multiple organizations, the AI booking bot, and real Google Calendar meetings, see the **Multi-tenant platform** section in `.env.example` (Supabase + Meta webhook + Google OAuth setup) and run `supabase/schema.sql` in your Supabase project. Without that, the app still runs standalone for a single business, unchanged.

## Deployment

Configured for Vercel out of the box (`vercel.json` + the `api/` serverless functions). `npm run build` also produces a standalone Node server (`dist/server.cjs`, via `npm start`) for any other host.
