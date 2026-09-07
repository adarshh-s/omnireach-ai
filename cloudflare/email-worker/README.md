# OmniReach inbound email — Cloudflare Email Routing (free, replaces SendGrid Inbound Parse)

SendGrid now requires a paid plan just to create an account. Cloudflare Email Routing is
free with no volume limits and does the same job: receive mail sent to your domain and
hand it to a small Worker, which forwards it to OmniReach's `/api/email/inbound` webhook.

## One-time setup

### 1. Add your domain to Cloudflare
1. Sign up at https://dash.cloudflare.com (free).
2. "Add a Site" → enter `quardlink.com` → choose the **Free** plan.
3. Cloudflare shows two nameservers (e.g. `xxx.ns.cloudflare.com`). Go to wherever
   `quardlink.com` is registered and replace its nameservers with those two.
4. Wait for Cloudflare to detect the change (usually minutes, can take a few hours) — the
   dashboard shows "Active" once it's done.

### 2. Enable Email Routing
1. In the Cloudflare dashboard for `quardlink.com`, go to **Email → Email Routing**.
2. Click **Enable Email Routing**. Cloudflare automatically adds the required MX/SPF
   records to your zone — no manual DNS editing needed.

### 3. Deploy the Worker
```bash
cd cloudflare/email-worker
npm install
npx wrangler login          # opens a browser to authorize the CLI with your Cloudflare account
npx wrangler secret put INBOUND_WEBHOOK_TOKEN
# paste the value of EMAIL_INBOUND_WEBHOOK_SECRET from the main app's .env.local when prompted
npm run deploy
```
This publishes a Worker named `omnireach-email-inbound`.

### 4. Route mail to the Worker
1. Back in **Email → Email Routing → Routing rules**.
2. Under **Catch-all address**, set the action to **Send to a Worker** and pick
   `omnireach-email-inbound`. This forwards *any* address at `quardlink.com` (including
   the dynamic `reply+cr_<id>@quardlink.com` tracking addresses OmniReach generates per
   campaign recipient) to the Worker.

### 5. Point the main app at the root domain
Cloudflare Email Routing works at the zone (root domain) level, so the tracking domain is
just `quardlink.com` — no `inbound.` subdomain needed. Confirm the main app's
`EMAIL_INBOUND_DOMAIN` env var (in `.env.local` and in Vercel) is set to `quardlink.com`.

### 6. Test
Send an email to `reply+test@quardlink.com` from any inbox. Check the Worker's logs
(`npx wrangler tail` from this folder) and the main app's Vercel logs
(`vercel logs <your-deployment-url>`) to confirm it was received and processed.

## Redeploying after changes
```bash
cd cloudflare/email-worker
npm run deploy
```
