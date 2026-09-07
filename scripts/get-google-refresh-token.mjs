#!/usr/bin/env node
// One-time helper to get a Google Calendar refresh token for the WhatsApp booking bot.
//
// Usage:
//   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-google-refresh-token.mjs
//
// Prerequisite: in Google Cloud Console, create an OAuth 2.0 Client ID of type
// "Web application" with authorized redirect URI: http://localhost:53682/oauth2callback

import { google } from 'googleapis';
import http from 'node:http';
import { URL } from 'node:url';

const clientId = process.env.GOOGLE_CLIENT_ID || process.argv[2];
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.argv[3];

if (!clientId || !clientSecret) {
  console.error('Usage: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-google-refresh-token.mjs');
  process.exit(1);
}

const redirectUri = 'http://localhost:53682/oauth2callback';
const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/calendar.events'],
});

console.log('\n1. Open this URL in your browser and approve access:\n');
console.log(authUrl);
console.log('\n2. Waiting for you to complete sign-in...\n');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, redirectUri);
    if (url.pathname !== '/oauth2callback') {
      res.writeHead(404);
      res.end();
      return;
    }
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400);
      res.end('Missing authorization code');
      return;
    }

    const { tokens } = await oAuth2Client.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Success! You can close this tab and return to the terminal.</h2>');
    server.close();

    if (!tokens.refresh_token) {
      console.log(
        '\n⚠️  No refresh_token was returned (Google only issues one on first consent). Revoke access at https://myaccount.google.com/permissions and re-run this script.\n'
      );
      process.exit(1);
    }

    console.log('\n✅ Success! Add these to your .env.local file:\n');
    console.log(`GOOGLE_CLIENT_ID=${clientId}`);
    console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('');
    process.exit(0);
  } catch (err) {
    console.error('Failed to exchange code for tokens:', err);
    res.writeHead(500);
    res.end('Error — check the terminal');
    server.close();
    process.exit(1);
  }
});

server.listen(53682);
