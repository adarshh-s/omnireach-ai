// A message starting with one of these opts the client out of all future automated
// outreach — checked before any AI/Gemini call, on both WhatsApp and Email, per the
// platform's opt-out requirement (never let the AI "talk someone out of" unsubscribing).
export const OPT_OUT_PATTERN = /^\s*(stop|unsubscribe|opt\s*out|do\s*not\s*contact|cancel)\b/i;

export const OPT_OUT_REPLY =
  "You've been unsubscribed and won't receive further automated messages from us. Reply anytime if you'd like to reconnect.";
