export type LeadStatus =
  | 'Pending'
  | 'In Progress'
  | 'Contacted'
  | 'Interested'
  | 'Meeting Scheduled'
  | 'Not Interested'
  | 'Replied'
  | 'Do Not Contact'
  | 'Failed';

export type ChannelDeliveryStatus =
  | 'Pending'
  | 'Queued'
  | 'Sent'
  | 'Delivered'
  | 'Read'
  | 'Opened'
  | 'Clicked'
  | 'Replied'
  | 'Failed';

export interface Lead {
  id: string;
  name: string;
  company: string;
  phone: string;
  rawPhone?: string;
  email: string;
  status: LeadStatus;
  whatsAppStatus: ChannelDeliveryStatus;
  emailStatus: ChannelDeliveryStatus;
  whatsAppMessage?: string;
  emailSubject?: string;
  emailBody?: string;
  meetingDate?: string;
  meetingTime?: string;
  notes?: string;
  lastContacted?: string;
  channelUsed?: 'omnichannel' | 'whatsapp' | 'email' | 'none';
  isValidPhone: boolean;
  isValidEmail: boolean;
  customFields?: Record<string, string>;
}

export interface CalendarSlot {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // e.g. "11:00 AM", "3:00 PM"
  dateTimeIso: string;
  available: boolean;
  bookedBy?: string;
  leadEmail?: string;
  leadPhone?: string;
  title?: string;
  meetLink?: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  category: 'discovery' | 'followup' | 'meeting_invite' | 'product_demo' | 're_engagement' | 'custom';
  channel: 'omnichannel' | 'whatsapp' | 'email';
  whatsAppContent: string;
  emailSubject: string;
  emailBody: string;
}

export interface CampaignSettings {
  channelMode: 'omnichannel' | 'whatsapp' | 'email';
  selectedTemplateId: string;
  delayBetweenMessagesSeconds: number;
  autoAdvance: boolean;
  companyName: string;
  senderName: string;
  senderEmail: string;
  senderPhone: string;
  serviceDescription: string;
  defaultCountryCode: string; // e.g. '+91', '+1', '+44'
  includeBookingLink: boolean;
  customInstructions?: string;
  useAiCopywriting?: boolean;
}

export type WhatsAppProvider = 'web_direct' | 'twilio' | 'cloud_api' | 'webhook';
export type EmailProvider = 'mailto_direct' | 'sendgrid' | 'resend' | 'smtp' | 'mailgun' | 'webhook';

export type WhatsAppMessageMode = 'text' | 'template';

export interface ChannelApiSettings {
  whatsAppProvider: WhatsAppProvider;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  whatsappCloudApiKey?: string;
  whatsappCloudPhoneId?: string;

  // Free-form text (works only within the 24h customer-service window) vs
  // an approved Message Template (required to initiate cold outreach)
  whatsappMessageMode?: WhatsAppMessageMode;

  // Meta WhatsApp Cloud API approved template
  whatsappTemplateName?: string;
  whatsappTemplateLanguage?: string; // e.g. 'en_US'
  whatsappTemplateVariables?: string[]; // values for {{1}}, {{2}}... — may contain {{name}}/{{company}}/etc tokens

  // Twilio Content Template (WhatsApp)
  twilioContentSid?: string;
  twilioContentVariables?: string[]; // values for Twilio ContentVariables "1","2",...

  emailProvider: EmailProvider;
  emailApiKey?: string;

  // Generic SMTP (Gmail App Password, Zoho Mail, Outlook/Office 365, cPanel, custom)
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFromEmail?: string;

  // Mailgun (uses emailApiKey as its API key)
  mailgunDomain?: string;
  mailgunRegion?: 'us' | 'eu';

  n8nWebhookUrl?: string;
}

export interface CampaignState {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'paused' | 'completed';
  currentIndex: number;
  totalLeads: number;
  completedWhatsApp: number;
  completedEmail: number;
  meetingsBooked: number;
  failedDispatches: number;
  skippedInvalid: number;
  delaySeconds: number;
  startedAt?: string;
}

export interface ColumnMapping {
  name: string;
  phone: string;
  company: string;
  email: string;
  notes: string;
}

export interface OutreachDispatchLog {
  id: string;
  leadId: string;
  leadName: string;
  recipient: string;
  channel: 'whatsapp' | 'email';
  status: 'sent' | 'delivered' | 'failed';
  timestamp: string;
  subject?: string;
  preview: string;
  directUrl?: string;
  errorDetail?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'ai_agent' | 'client';
  channel: 'whatsapp' | 'email';
  content: string;
  subject?: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read';
}
