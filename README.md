# OmniReach AI — WhatsApp & Email Outreach Automation

Import a spreadsheet of contacts and automatically dispatch personalized WhatsApp messages and emails, with Google Calendar booking links and live delivery tracking.

## Features

- Excel/CSV lead import with column auto-detection and phone/email validation
- Batch campaign runner (WhatsApp, Email, or both) with live send status
- Message templates with variable interpolation, or optional AI-personalized copy (Gemini)
- Email delivery via **Resend**, **SendGrid**, **Mailgun**, or generic **SMTP** (Gmail, Zoho Mail, Outlook/Office 365, or any business mailbox)
- WhatsApp delivery via click-to-chat links or Twilio WhatsApp API
- Calendar booking slots, campaign analytics, and an n8n webhook bridge for further automation

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` (only needed if you enable AI-personalized copy — outreach works fine without it using your own templates).
3. Run the app:
   `npm run dev`
4. Open the app, go to **Channel Setup** (top right) and connect your WhatsApp/Email sending method.

## Deployment

Configured for Vercel out of the box (`vercel.json` + the `api/` serverless functions). `npm run build` also produces a standalone Node server (`dist/server.cjs`, via `npm start`) for any other host.
