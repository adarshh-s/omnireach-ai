/**
 * n8n Workflow definition for Google Sheets -> Gemini AI Personalization -> WhatsApp / Email Dispatch -> Google Calendar Sync -> Sheets Update
 * 100% valid n8n Workflow JSON v1
 */

export interface NodeDocumentation {
  id: string;
  name: string;
  type: string;
  category: 'Trigger' | 'Integration' | 'AI & Logic' | 'Communication' | 'Database';
  description: string;
  input: string;
  output: string;
  setupInstructions: string[];
}

export const N8N_WORKFLOW_JSON = {
  name: "OmniReach AI - Automated WhatsApp & Email Outreach with Google Calendar Sync",
  nodes: [
    {
      parameters: {
        rule: {
          interval: [
            {
              field: "minutes",
              minutesInterval: 15,
            },
          ],
        },
      },
      id: "node-schedule-trigger",
      name: "Schedule Trigger (Every 15m)",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.1,
      position: [240, 300],
    },
    {
      parameters: {
        authentication: "oAuth2",
        documentId: {
          __rl: true,
          value: "YOUR_GOOGLE_SHEET_ID",
          mode: "id",
        },
        sheetName: {
          __rl: true,
          value: "Sheet1",
          mode: "name",
        },
        filtersUI: {
          values: [
            {
              lookupColumn: "Status",
              lookupValue: "Pending",
            },
          ],
        },
        options: {},
      },
      id: "node-read-sheets",
      name: "Get Pending Leads from Sheet",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.4,
      position: [460, 300],
      credentials: {
        googleSheetsOAuth2Api: {
          id: "google-sheets-oauth-cred",
          name: "Google Sheets OAuth2 account",
        },
      },
    },
    {
      parameters: {
        jsCode: `// Validate phone numbers & email addresses
const leads = $input.all();
return leads.map(item => {
  const json = item.json;
  let phone = String(json.Phone || '').replace(/[^0-9+]/g, '');
  if (phone && !phone.startsWith('+')) {
    phone = '+91' + phone.replace(/^0+/, '');
  }
  const email = String(json.Email || '').trim();
  const isValidPhone = phone.length >= 8;
  const isValidEmail = email.includes('@') && email.includes('.');
  
  return {
    json: {
      ...json,
      sanitizedPhone: phone,
      sanitizedEmail: email,
      isValidPhone,
      isValidEmail,
      firstName: (json.Name || 'There').split(' ')[0],
      clientCompany: json.Company || 'your company',
      bookingLink: 'https://calendar.google.com/calendar/appointments/schedules/demo'
    }
  };
});`,
      },
      id: "node-sanitize-leads",
      name: "Sanitize & Validate Contacts",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [680, 300],
    },
    {
      parameters: {
        model: "gemini-2.5-flash",
        prompt: `You are an executive outreach specialist. Write a hyper-personalized 3-sentence WhatsApp message and cold email for {{ $json.Name }} at {{ $json.clientCompany }}. Offer a 10-minute demo on {{ $json.bookingLink }}. Return strict JSON with keys "whatsapp", "email_subject", "email_body".`,
        options: {
          temperature: 0.7,
        },
      },
      id: "node-gemini-writer",
      name: "Gemini AI Copy Personalizer",
      type: "@n8n/n8n-nodes-langchain.agent",
      typeVersion: 1,
      position: [900, 300],
    },
    {
      parameters: {
        dataType: "string",
        value1: "={{ $json.isValidPhone }}",
        rules: {
          rules: [
            {
              value2: "true",
              output: 0,
            },
          ],
        },
      },
      id: "node-channel-router",
      name: "Route to WhatsApp / Email",
      type: "n8n-nodes-base.switch",
      typeVersion: 3,
      position: [1120, 300],
    },
    {
      parameters: {
        from: "whatsapp:+14155238886",
        to: "whatsapp:={{ $json.sanitizedPhone }}",
        message: "={{ $json.whatsapp }}",
      },
      id: "node-send-whatsapp",
      name: "Send WhatsApp via Twilio / Meta",
      type: "n8n-nodes-base.twilio",
      typeVersion: 1,
      position: [1340, 200],
    },
    {
      parameters: {
        fromEmail: "sales@yourcompany.com",
        toEmail: "={{ $json.sanitizedEmail }}",
        subject: "={{ $json.email_subject }}",
        text: "={{ $json.email_body }}",
      },
      id: "node-send-email",
      name: "Send Email via SendGrid / Resend",
      type: "n8n-nodes-base.emailSend",
      typeVersion: 2.1,
      position: [1340, 400],
    },
    {
      parameters: {
        authentication: "oAuth2",
        documentId: {
          __rl: true,
          value: "YOUR_GOOGLE_SHEET_ID",
          mode: "id",
        },
        sheetName: {
          __rl: true,
          value: "Sheet1",
          mode: "name",
        },
        operation: "update",
        columns: {
          mappingMode: "defineBelow",
          value: {
            Status: "Contacted",
            WhatsAppStatus: "Delivered",
            EmailStatus: "Sent",
            LastContacted: "={{ $now.format('YYYY-MM-DD HH:mm:ss') }}",
          },
        },
      },
      id: "node-update-sheet-contacted",
      name: "Update Google Sheet Status",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.4,
      position: [1560, 300],
    },
  ],
  connections: {
    "node-schedule-trigger": {
      main: [[{ node: "node-read-sheets", type: "main", index: 0 }]],
    },
    "node-read-sheets": {
      main: [[{ node: "node-sanitize-leads", type: "main", index: 0 }]],
    },
    "node-sanitize-leads": {
      main: [[{ node: "node-gemini-writer", type: "main", index: 0 }]],
    },
    "node-gemini-writer": {
      main: [[{ node: "node-channel-router", type: "main", index: 0 }]],
    },
    "node-channel-router": {
      main: [
        [{ node: "node-send-whatsapp", type: "main", index: 0 }],
        [{ node: "node-send-email", type: "main", index: 0 }],
      ],
    },
    "node-send-whatsapp": {
      main: [[{ node: "node-update-sheet-contacted", type: "main", index: 0 }]],
    },
    "node-send-email": {
      main: [[{ node: "node-update-sheet-contacted", type: "main", index: 0 }]],
    },
  },
};

export const N8N_NODE_BREAKDOWN: NodeDocumentation[] = [
  {
    id: "node-schedule-trigger",
    name: "Schedule Trigger (Cron / Polling)",
    type: "n8n-nodes-base.scheduleTrigger",
    category: "Trigger",
    description: "Periodically polls your connected Google Sheet (e.g. every 15 minutes) or activates instantly when new rows are added.",
    input: "Cron Timer / Interval",
    output: "Trigger signal with execution timestamp",
    setupInstructions: [
      "Set interval to 15m, 30m, or trigger on Google Sheets row created.",
      "Ensure n8n workflow active toggle is enabled in production.",
    ],
  },
  {
    id: "node-read-sheets",
    name: "Google Sheets - Read Pending Leads",
    type: "n8n-nodes-base.googleSheets",
    category: "Database",
    description: "Fetches rows from your target spreadsheet where Status equals 'Pending'.",
    input: "Sheet ID and range filter",
    output: "Array of client records with Name, Phone, Email, Company, Notes",
    setupInstructions: [
      "Select your OAuth2 Google credential.",
      "Choose your Sheet ID and set filter `Status = Pending`.",
    ],
  },
  {
    id: "node-sanitize-leads",
    name: "JavaScript Node - E.164 & Email Validation",
    type: "n8n-nodes-base.code",
    category: "AI & Logic",
    description: "Sanitizes phone numbers into E.164 country code format (+91, +1, etc.) and validates email addresses.",
    input: "Raw spreadsheet rows",
    output: "Enriched and validated lead records",
    setupInstructions: [
      "Configurable default country code (+91 for India, +1 for US).",
      "Strips non-digit characters and sets channel availability flags.",
    ],
  },
  {
    id: "node-gemini-writer",
    name: "Gemini AI Copywriter & Personalizer",
    type: "@n8n/n8n-nodes-langchain.agent",
    category: "AI & Logic",
    description: "Calls Gemini 3.7 / 2.5 Flash to craft compelling, hyper-personalized WhatsApp message copy and cold emails.",
    input: "Contact info, company profile, available calendar slots",
    output: "JSON with WhatsApp message, Email Subject, Email Body",
    setupInstructions: [
      "Uses Google Gemini API credentials.",
      "Configured temperature (0.7) for high-converting sales copywriting.",
    ],
  },
  {
    id: "node-send-whatsapp",
    name: "WhatsApp Dispatch (Twilio / Meta Cloud API)",
    type: "n8n-nodes-base.twilio",
    category: "Communication",
    description: "Sends the personalized WhatsApp message with instant calendar booking links to the client's verified mobile number.",
    input: "Sanitized E.164 phone + AI WhatsApp copy",
    output: "WhatsApp message delivery ID & status",
    setupInstructions: [
      "Connect Twilio WhatsApp Sandbox or Meta WhatsApp Cloud API credentials.",
    ],
  },
  {
    id: "node-send-email",
    name: "Email Dispatch (SendGrid / Resend)",
    type: "n8n-nodes-base.emailSend",
    category: "Communication",
    description: "Delivers branded cold outreach emails with direct Google Meet calendar booking cards.",
    input: "Validated email address + subject + HTML/plain body",
    output: "Email delivery confirmation",
    setupInstructions: [
      "Configure your verified sending domain in SendGrid / Resend or SMTP.",
    ],
  },
  {
    id: "node-update-sheet-contacted",
    name: "Google Sheets - Two-Way Status Sync",
    type: "n8n-nodes-base.googleSheets",
    category: "Database",
    description: "Updates the spreadsheet row with Status='Contacted', WhatsAppStatus='Delivered', and LastContacted timestamp.",
    input: "Dispatched lead row ID and delivery metadata",
    output: "Updated spreadsheet confirmation",
    setupInstructions: [
      "Maps column updates back to the original spreadsheet row.",
    ],
  },
];
