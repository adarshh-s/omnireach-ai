import React, { useState } from 'react';
import {
  X,
  Settings,
  MessageSquare,
  Mail,
  Network,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Shield,
  Zap,
  Send,
  Loader2,
  Bot,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { ChannelApiSettings, CampaignSettings, CalendarSlot } from '../types';
import { sendEmailDirectOrBackend } from '../services/emailService';
import { sendWhatsAppDirectOrBackend } from '../services/whatsappService';
import { resolveTemplateVariables } from '../utils/outreachEngine';
import { useGoogleCalendarConnection } from '../hooks/useGoogleCalendarConnection';

interface ChannelConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ChannelApiSettings;
  onSaveSettings: (settings: ChannelApiSettings) => void;
  campaignSettings?: CampaignSettings;
  availableSlots?: CalendarSlot[];
  userId?: string | null;
  accessToken?: string | null;
}

export const ChannelConfigModal: React.FC<ChannelConfigModalProps> = ({
  isOpen,
  onClose,
  settings,
  campaignSettings,
  availableSlots = [],
  onSaveSettings,
  userId = null,
  accessToken = null,
}) => {
  const [formData, setFormData] = useState<ChannelApiSettings>(settings);
  const [activeSubTab, setActiveSubTab] = useState<'whatsapp' | 'email' | 'bot' | 'n8n'>('email');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const googleCalendar = useGoogleCalendarConnection(userId, accessToken);
  
  // Test email state
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [testResultMsg, setTestResultMsg] = useState('');

  // Test WhatsApp state
  const [testWaTo, setTestWaTo] = useState('');
  const [testWaStatus, setTestWaStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [testWaResultMsg, setTestWaResultMsg] = useState('');

  if (!isOpen) return null;

  const handleSendTestWhatsApp = async () => {
    if (!testWaTo.trim()) {
      setTestWaStatus('error');
      setTestWaResultMsg('Enter a phone number (with country code) to send the test to first');
      return;
    }
    if (formData.whatsAppProvider === 'twilio' && (!formData.twilioAccountSid || !formData.twilioAuthToken)) {
      setTestWaStatus('error');
      setTestWaResultMsg('Please enter your Twilio Account SID and Auth Token first');
      return;
    }
    if (formData.whatsAppProvider === 'cloud_api' && (!formData.whatsappCloudApiKey || !formData.whatsappCloudPhoneId)) {
      setTestWaStatus('error');
      setTestWaResultMsg('Please enter your WhatsApp Cloud API access token and Phone Number ID first');
      return;
    }
    if (formData.whatsAppProvider === 'webhook' && !formData.n8nWebhookUrl) {
      setTestWaStatus('error');
      setTestWaResultMsg('Please set a webhook URL under n8n / Webhook first');
      return;
    }
    const useTemplate = formData.whatsappMessageMode === 'template';
    if (useTemplate && formData.whatsAppProvider === 'twilio' && !formData.twilioContentSid) {
      setTestWaStatus('error');
      setTestWaResultMsg('Please enter your Twilio Content SID first');
      return;
    }
    if (useTemplate && formData.whatsAppProvider === 'cloud_api' && !formData.whatsappTemplateName) {
      setTestWaStatus('error');
      setTestWaResultMsg('Please enter your approved template name first');
      return;
    }
    setTestWaStatus('sending');
    setTestWaResultMsg('');
    try {
      const sampleLead = { id: 'test-lead', name: 'Jane Doe', company: 'Sample Company LLC', phone: testWaTo, email: 'jane.doe@example.com' };
      const fallbackSettings: CampaignSettings = campaignSettings || {
        channelMode: 'whatsapp',
        selectedTemplateId: '',
        delayBetweenMessagesSeconds: 2,
        autoAdvance: false,
        companyName: '',
        senderName: '',
        senderEmail: '',
        senderPhone: '',
        serviceDescription: '',
        defaultCountryCode: '+971',
        includeBookingLink: true,
      };
      const templateParams = useTemplate
        ? resolveTemplateVariables(
            (formData.whatsAppProvider === 'twilio' ? formData.twilioContentVariables : formData.whatsappTemplateVariables) || [],
            sampleLead as any,
            fallbackSettings,
            availableSlots
          )
        : undefined;

      const data = await sendWhatsAppDirectOrBackend({
        lead: sampleLead,
        messageText: 'Hello! This is a live test from your OmniReach AI outreach system — your WhatsApp connection is active. 🎉',
        channelSettings: formData,
        templateParams,
        accessToken,
      });

      if (data.delivered) {
        setTestWaStatus('success');
        setTestWaResultMsg(
          formData.whatsAppProvider === 'cloud_api'
            ? `Message accepted by Meta for ${testWaTo}. Check the phone — if nothing arrives in a minute, see the troubleshooting notes above (test-recipient verification, token expiry, quality hold).`
            : `WhatsApp message sent to ${testWaTo}! Check the phone.`
        );
      } else {
        setTestWaStatus('error');
        setTestWaResultMsg(data.errorDetail || 'Failed to deliver WhatsApp message. Please check your credentials.');
      }
    } catch (err: any) {
      setTestWaStatus('error');
      setTestWaResultMsg(err.message || 'Connection failed');
    }
  };

  type TemplateVarKey = 'whatsappTemplateVariables' | 'twilioContentVariables';

  const addTemplateVariable = (key: TemplateVarKey) => {
    setFormData({ ...formData, [key]: [...(formData[key] || []), ''] });
  };
  const updateTemplateVariable = (key: TemplateVarKey, idx: number, value: string) => {
    const arr = [...(formData[key] || [])];
    arr[idx] = value;
    setFormData({ ...formData, [key]: arr });
  };
  const removeTemplateVariable = (key: TemplateVarKey, idx: number) => {
    const arr = [...(formData[key] || [])];
    arr.splice(idx, 1);
    setFormData({ ...formData, [key]: arr });
  };

  const renderTemplateVariableEditor = (key: TemplateVarKey) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-semibold text-[#8C847C]">
          Body Variables (in order — fill {'{{1}}'}, {'{{2}}'}, ... in your approved template)
        </label>
        <button
          type="button"
          onClick={() => addTemplateVariable(key)}
          className="text-[10px] font-semibold text-[#128C7E] hover:underline"
        >
          + Add Variable
        </button>
      </div>
      {(formData[key] || []).length === 0 ? (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          ⚠️ 0 variables configured. If your approved template has any {'{{n}}'} placeholders in its body, you must add one row per placeholder here — otherwise Meta will reject the send with "number of parameters does not match" (error 132000).
        </p>
      ) : (
        <p className="text-[10px] text-[#8C847C]">
          {(formData[key] || []).length} variable{(formData[key] || []).length === 1 ? '' : 's'} configured — must exactly match the number of {'{{n}}'} placeholders in your approved template's body. Type a <strong>plain value</strong> (e.g. <code className="bg-[#EFECE6] px-1 rounded">TEST-001</code>) or a single token (e.g. <code className="bg-[#EFECE6] px-1 rounded">{'{{name}}'}</code>) — no quotes, no extra braces around your answer.
        </p>
      )}
      {(formData[key] || []).map((val, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-[#8C847C] w-14 shrink-0">Slot #{idx + 1}</span>
          <input
            type="text"
            placeholder="e.g. TEST-001 or {{name}} — no quotes/braces around the whole value"
            value={val}
            onChange={(e) => updateTemplateVariable(key, idx, e.target.value)}
            className="flex-1 bg-white border border-[#DDD6CB] rounded-lg px-2.5 py-1 text-xs font-mono"
          />
          <button
            type="button"
            onClick={() => removeTemplateVariable(key, idx)}
            className="p-1 text-[#8C847C] hover:text-red-600"
            title="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );

  const handleSendTestEmail = async () => {
    if (!testEmailTo.trim()) {
      setTestStatus('error');
      setTestResultMsg('Enter an email address to send the test to first');
      return;
    }
    if (formData.emailProvider === 'smtp') {
      if (!formData.smtpHost || !formData.smtpUser || !formData.smtpPass) {
        setTestStatus('error');
        setTestResultMsg('Please enter SMTP host, username, and password first');
        return;
      }
    } else if (formData.emailProvider === 'mailgun') {
      if (!formData.emailApiKey || !formData.mailgunDomain) {
        setTestStatus('error');
        setTestResultMsg('Please enter your Mailgun API key and domain first');
        return;
      }
    } else if (!formData.emailApiKey) {
      setTestStatus('error');
      setTestResultMsg('Please enter an API Key first');
      return;
    }
    setTestStatus('sending');
    setTestResultMsg('');
    try {
      const data = await sendEmailDirectOrBackend({
        lead: {
          id: 'test-lead',
          name: 'there',
          email: testEmailTo,
        },
        subject: 'OmniReach AI Live Test: Automated Email Successful!',
        body: 'Hello!\n\nThis is a verified live test from your OmniReach AI outreach system.\n\nYour email connection is active. All automated outreach emails in your batch will be delivered directly to prospective client inboxes.\n\nBest regards,\nOmniReach AI Engine',
        channelSettings: formData,
        senderName: 'OmniReach AI',
      });

      if (data.delivered) {
        setTestStatus('success');
        setTestResultMsg(`Email sent directly to ${testEmailTo}! Check your inbox.`);
      } else {
        setTestStatus('error');
        setTestResultMsg(data.errorDetail || 'Failed to deliver email. Please check your API key.');
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestResultMsg(err.message || 'Connection failed');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  const testEmailBox = (
    <div className="pt-2 border-t border-[#EAE5DC]">
      <label className="block text-[11px] font-semibold text-[#2D2926] mb-1">
        Test Live Email Delivery (Instant)
      </label>
      <div className="flex items-center gap-2">
        <input
          type="email"
          placeholder="your-email@gmail.com"
          value={testEmailTo}
          onChange={(e) => setTestEmailTo(e.target.value)}
          className="flex-1 bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={handleSendTestEmail}
          disabled={testStatus === 'sending'}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-[#128C7E] hover:bg-[#0E6D62] disabled:opacity-50 transition-colors shadow-xs shrink-0"
        >
          {testStatus === 'sending' ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <Send className="w-3 h-3" />
              <span>Send Live Test</span>
            </>
          )}
        </button>
      </div>

      {testStatus === 'success' && (
        <div className="mt-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>{testResultMsg}</span>
        </div>
      )}

      {testStatus === 'error' && (
        <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
          <span>{testResultMsg}</span>
        </div>
      )}
    </div>
  );

  const testWhatsAppBox = (
    <div className="pt-2 border-t border-[#EAE5DC]">
      <label className="block text-[11px] font-semibold text-[#2D2926] mb-1">
        Test Live WhatsApp Delivery (Instant)
      </label>
      <div className="flex items-center gap-2">
        <input
          type="tel"
          placeholder="+971501234567"
          value={testWaTo}
          onChange={(e) => setTestWaTo(e.target.value)}
          className="flex-1 bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
        />
        <button
          type="button"
          onClick={handleSendTestWhatsApp}
          disabled={testWaStatus === 'sending'}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-[#128C7E] hover:bg-[#0E6D62] disabled:opacity-50 transition-colors shadow-xs shrink-0"
        >
          {testWaStatus === 'sending' ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <Send className="w-3 h-3" />
              <span>Send Live Test</span>
            </>
          )}
        </button>
      </div>

      {testWaStatus === 'success' && (
        <div className="mt-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>{testWaResultMsg}</span>
        </div>
      )}

      {testWaStatus === 'error' && (
        <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
          <span>{testWaResultMsg}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-[#E8E4DF] shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E4DF] bg-[#FAF8F5]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#25D366]/20 text-[#128C7E] flex items-center justify-center">
              <Zap className="w-4 h-4 fill-[#25D366]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#2D2926]">
                Automated Dispatch & API Configuration
              </h2>
              <p className="text-[11px] text-[#7A7269]">
                Configure real automated sending via Twilio WhatsApp, Resend Email, or Webhooks
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[#8C847C] hover:text-[#2D2926] rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub Navigation */}
        <div className="flex border-b border-[#F0ECE6] px-6 bg-white">
          <button
            type="button"
            onClick={() => setActiveSubTab('whatsapp')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeSubTab === 'whatsapp'
                ? 'border-[#25D366] text-[#0F5132]'
                : 'border-transparent text-[#6C635B] hover:text-[#2D2926]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>WhatsApp Dispatch</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('email')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeSubTab === 'email'
                ? 'border-[#4285F4] text-[#1967D2]'
                : 'border-transparent text-[#6C635B] hover:text-[#2D2926]'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email Dispatch</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('bot')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeSubTab === 'bot'
                ? 'border-[#4285F4] text-[#1967D2]'
                : 'border-transparent text-[#6C635B] hover:text-[#2D2926]'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>AI Booking Bot</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('n8n')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeSubTab === 'n8n'
                ? 'border-[#2D2926] text-[#2D2926]'
                : 'border-transparent text-[#6C635B] hover:text-[#2D2926]'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>n8n / Webhook</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {activeSubTab === 'whatsapp' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2D2926] mb-1.5">
                  WhatsApp Dispatch Method
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, whatsAppProvider: 'web_direct' })
                    }
                    className={`p-3 rounded-xl border text-left text-xs transition-all ${
                      formData.whatsAppProvider === 'web_direct'
                        ? 'bg-[#E8F5E9] border-[#25D366] text-[#0F5132] font-semibold shadow-xs'
                        : 'bg-[#FAF8F5] border-[#DDD6CB] text-[#5D554D]'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1">
                      <span>WhatsApp Web / App</span>
                    </div>
                    <div className="text-[11px] text-[#7A7269] mt-0.5">
                      Zero setup. Direct 1-click links opening your WhatsApp.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, whatsAppProvider: 'twilio' })
                    }
                    className={`p-3 rounded-xl border text-left text-xs transition-all ${
                      formData.whatsAppProvider === 'twilio'
                        ? 'bg-[#E8F5E9] border-[#25D366] text-[#0F5132] font-semibold shadow-xs'
                        : 'bg-[#FAF8F5] border-[#DDD6CB] text-[#5D554D]'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1">
                      <span>⚡ Twilio WhatsApp API</span>
                    </div>
                    <div className="text-[11px] text-[#7A7269] mt-0.5">
                      Automated background delivery via Twilio Sandbox or API.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, whatsAppProvider: 'cloud_api' })
                    }
                    className={`p-3 rounded-xl border text-left text-xs transition-all ${
                      formData.whatsAppProvider === 'cloud_api'
                        ? 'bg-[#E8F5E9] border-[#25D366] text-[#0F5132] font-semibold shadow-xs'
                        : 'bg-[#FAF8F5] border-[#DDD6CB] text-[#5D554D]'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1">
                      <span>⚡ WhatsApp Cloud API (Meta)</span>
                    </div>
                    <div className="text-[11px] text-[#7A7269] mt-0.5">
                      Official Meta WhatsApp Business Platform. No middleman markup — direct from Meta.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, whatsAppProvider: 'webhook' })
                    }
                    className={`p-3 rounded-xl border text-left text-xs transition-all ${
                      formData.whatsAppProvider === 'webhook'
                        ? 'bg-[#E8F5E9] border-[#25D366] text-[#0F5132] font-semibold shadow-xs'
                        : 'bg-[#FAF8F5] border-[#DDD6CB] text-[#5D554D]'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1">
                      <span>⚡ Custom Webhook / BSP</span>
                    </div>
                    <div className="text-[11px] text-[#7A7269] mt-0.5">
                      Route sends through your own n8n workflow or WhatsApp BSP (360dialog, Gupshup, etc.).
                    </div>
                  </button>
                </div>
              </div>

              {formData.whatsAppProvider === 'twilio' && (
                <div className="space-y-3 p-4 bg-[#FAF9F6] rounded-xl border border-[#E8E4DF]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#2D2926]">Twilio WhatsApp Credentials</span>
                    <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Live Server Sending
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                      Twilio Account SID
                    </label>
                    <input
                      type="text"
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={formData.twilioAccountSid || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, twilioAccountSid: e.target.value })
                      }
                      className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                      Twilio Auth Token
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••••••••••••••••••••••••••"
                      value={formData.twilioAuthToken || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, twilioAuthToken: e.target.value })
                      }
                      className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                      Twilio WhatsApp Sender Number (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="+14155238886 (Default Twilio Sandbox)"
                      value={formData.twilioFromNumber || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, twilioFromNumber: e.target.value })
                      }
                      className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                    />
                    <p className="text-[10px] text-[#8C847C] mt-1">
                      💡 Tip: For free Twilio Sandbox testing, join the sandbox by sending the code to <code className="bg-[#EFECE6] px-1 rounded">+1 415 523 8886</code> on WhatsApp.
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[#EAE5DC] space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#2D2926] mb-1.5">
                        Message Mode
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, whatsappMessageMode: 'text' })}
                          className={`p-2 rounded-lg border text-[11px] font-medium transition-all ${
                            (formData.whatsappMessageMode || 'text') === 'text'
                              ? 'bg-[#E8F5E9] border-[#25D366] text-[#0F5132] font-semibold'
                              : 'bg-white border-[#DDD6CB] text-[#5D554D]'
                          }`}
                        >
                          Free-form Text
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, whatsappMessageMode: 'template' })}
                          className={`p-2 rounded-lg border text-[11px] font-medium transition-all ${
                            formData.whatsappMessageMode === 'template'
                              ? 'bg-[#E8F5E9] border-[#25D366] text-[#0F5132] font-semibold'
                              : 'bg-white border-[#DDD6CB] text-[#5D554D]'
                          }`}
                        >
                          Approved Template
                        </button>
                      </div>
                      <p className="text-[10px] text-[#8C847C] mt-1">
                        Free-form text only works within 24h of the recipient last messaging you. For <strong>cold outreach</strong> (first contact), you must use an approved template — otherwise sends will fail with a "re-engagement" error.
                      </p>
                    </div>

                    {formData.whatsappMessageMode === 'template' && (
                      <div className="space-y-3 p-3 bg-white rounded-lg border border-[#E8E4DF]">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                            Twilio Content SID
                          </label>
                          <input
                            type="text"
                            placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            value={formData.twilioContentSid || ''}
                            onChange={(e) => setFormData({ ...formData, twilioContentSid: e.target.value })}
                            className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                          />
                          <p className="text-[10px] text-[#8C847C] mt-1">
                            Create a WhatsApp Content Template in the{' '}
                            <a
                              href="https://console.twilio.com/us1/develop/sms/content-template-builder"
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#1967D2] font-medium hover:underline"
                            >
                              Twilio Content Template Builder
                            </a>
                            , submit it for WhatsApp approval, then paste its Content SID (starts with "HX") here once approved.
                          </p>
                        </div>
                        {renderTemplateVariableEditor('twilioContentVariables')}
                      </div>
                    )}
                  </div>

                  {testWhatsAppBox}
                </div>
              )}

              {formData.whatsAppProvider === 'cloud_api' && (
                <div className="space-y-3 p-4 bg-[#FAF9F6] rounded-xl border border-[#E8E4DF]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#2D2926]">WhatsApp Cloud API Credentials</span>
                    <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Live Server Sending
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                      Temporary or Permanent Access Token
                    </label>
                    <input
                      type="password"
                      placeholder="EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={formData.whatsappCloudApiKey || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, whatsappCloudApiKey: e.target.value })
                      }
                      className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                      Phone Number ID
                    </label>
                    <input
                      type="text"
                      placeholder="1234567890123456"
                      value={formData.whatsappCloudPhoneId || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, whatsappCloudPhoneId: e.target.value })
                      }
                      className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                    />
                  </div>

                  <p className="text-[10px] text-[#8C847C] leading-relaxed">
                    💡 Create a Meta app and WhatsApp Business Platform product at{' '}
                    <a
                      href="https://developers.facebook.com/apps"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#1967D2] font-medium hover:underline"
                    >
                      developers.facebook.com/apps
                    </a>
                    . The Access Token and Phone Number ID are shown on the WhatsApp → API Setup page.
                  </p>

                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-900 leading-relaxed space-y-1">
                    <p className="font-semibold text-amber-950">⚠️ "Sent" but nothing arrives on the phone? Meta's API accepting the request isn't the same as delivering it. Check:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>The recipient number is added as a <strong>verified test recipient</strong> under your app's WhatsApp → API Setup page (test/dev apps can only message up to 5 verified numbers).</li>
                      <li>Your <strong>access token hasn't expired</strong> — the default temporary token from API Setup lasts only 24 hours; generate a permanent one via a System User for real use.</li>
                      <li>Meta isn't <strong>holding the message for quality assessment</strong> — brand-new test numbers/business accounts often have no quality rating yet, so Meta silently queues messages without delivering them. This app now detects that case and reports it as failed with an explanation, instead of a false "delivered."</li>
                      <li>You're inside the <strong>24-hour customer service window</strong> (the recipient messaged your number recently) — outside it, only pre-approved message templates can be delivered, not free-form text.</li>
                    </ul>
                  </div>

                  <div className="pt-3 border-t border-[#EAE5DC] space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#2D2926] mb-1.5">
                        Message Mode
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, whatsappMessageMode: 'text' })}
                          className={`p-2 rounded-lg border text-[11px] font-medium transition-all ${
                            (formData.whatsappMessageMode || 'text') === 'text'
                              ? 'bg-[#E8F5E9] border-[#25D366] text-[#0F5132] font-semibold'
                              : 'bg-white border-[#DDD6CB] text-[#5D554D]'
                          }`}
                        >
                          Free-form Text
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, whatsappMessageMode: 'template' })}
                          className={`p-2 rounded-lg border text-[11px] font-medium transition-all ${
                            formData.whatsappMessageMode === 'template'
                              ? 'bg-[#E8F5E9] border-[#25D366] text-[#0F5132] font-semibold'
                              : 'bg-white border-[#DDD6CB] text-[#5D554D]'
                          }`}
                        >
                          Approved Template
                        </button>
                      </div>
                      <p className="text-[10px] text-[#8C847C] mt-1">
                        Free-form text only works within 24h of the recipient last messaging you. For <strong>cold outreach</strong> (first contact), you must use an approved template — otherwise sends will fail with error 131047 ("re-engagement message").
                      </p>
                    </div>

                    {formData.whatsappMessageMode === 'template' && (
                      <div className="space-y-3 p-3 bg-white rounded-lg border border-[#E8E4DF]">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                              Approved Template Name
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. outreach_intro"
                              value={formData.whatsappTemplateName || ''}
                              onChange={(e) => setFormData({ ...formData, whatsappTemplateName: e.target.value })}
                              className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                              Language Code
                            </label>
                            <input
                              type="text"
                              placeholder="en_US"
                              value={formData.whatsappTemplateLanguage || ''}
                              onChange={(e) => setFormData({ ...formData, whatsappTemplateLanguage: e.target.value })}
                              className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-[#8C847C]">
                          Create and submit a template for approval under WhatsApp Manager → Message Templates in{' '}
                          <a
                            href="https://business.facebook.com/wa/manage/message-templates/"
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#1967D2] font-medium hover:underline"
                          >
                            business.facebook.com/wa/manage/message-templates
                          </a>
                          . Use the exact template name and language code once approved (usually within minutes to a day).
                        </p>
                        {renderTemplateVariableEditor('whatsappTemplateVariables')}
                      </div>
                    )}
                  </div>

                  {testWhatsAppBox}
                </div>
              )}

              {formData.whatsAppProvider === 'webhook' && (
                <div className="space-y-3 p-4 bg-[#FAF9F6] rounded-xl border border-[#E8E4DF]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#2D2926]">Custom Webhook / BSP</span>
                    <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Live Server Sending
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5D554D] leading-relaxed">
                    Each WhatsApp send will POST the lead and message text to the webhook URL configured under the <strong>n8n / Webhook</strong> tab. Point that at an n8n workflow (or any endpoint) that actually delivers the message through your BSP of choice — e.g. 360dialog, Gupshup, Infobip, or WATI — and returns a success status.
                  </p>
                  {!formData.n8nWebhookUrl && (
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>No webhook URL set yet — switch to the n8n / Webhook tab to add one.</span>
                    </div>
                  )}

                  {testWhatsAppBox}
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'email' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2D2926] mb-1.5">
                  Email Dispatch Method
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, emailProvider: 'mailto_direct' })
                    }
                    className={`p-3 rounded-xl border text-left text-xs transition-all ${
                      formData.emailProvider === 'mailto_direct'
                        ? 'bg-[#E8F0FE] border-[#4285F4] text-[#1967D2] font-semibold shadow-xs'
                        : 'bg-[#FAF8F5] border-[#DDD6CB] text-[#5D554D]'
                    }`}
                  >
                    <div className="font-bold">Default Mail Client</div>
                    <div className="text-[11px] text-[#7A7269] mt-0.5">
                      Direct 1-click mailto links.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, emailProvider: 'smtp' })
                    }
                    className={`p-3 rounded-xl border text-left text-xs transition-all ${
                      formData.emailProvider === 'smtp'
                        ? 'bg-[#E8F0FE] border-[#4285F4] text-[#1967D2] font-semibold shadow-xs'
                        : 'bg-[#FAF8F5] border-[#DDD6CB] text-[#5D554D]'
                    }`}
                  >
                    <div className="font-bold">⚡ SMTP (Gmail, Zoho, Outlook...)</div>
                    <div className="text-[11px] text-[#7A7269] mt-0.5">
                      Use any mailbox you already own — Gmail App Password, Zoho Mail, Office 365, or custom business email.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, emailProvider: 'resend' })
                    }
                    className={`p-3 rounded-xl border text-left text-xs transition-all ${
                      formData.emailProvider === 'resend'
                        ? 'bg-[#E8F0FE] border-[#4285F4] text-[#1967D2] font-semibold shadow-xs'
                        : 'bg-[#FAF8F5] border-[#DDD6CB] text-[#5D554D]'
                    }`}
                  >
                    <div className="font-bold">⚡ Resend API</div>
                    <div className="text-[11px] text-[#7A7269] mt-0.5">
                      Automated background inbox delivery. Free 100/day.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, emailProvider: 'sendgrid' })
                    }
                    className={`p-3 rounded-xl border text-left text-xs transition-all ${
                      formData.emailProvider === 'sendgrid'
                        ? 'bg-[#E8F0FE] border-[#4285F4] text-[#1967D2] font-semibold shadow-xs'
                        : 'bg-[#FAF8F5] border-[#DDD6CB] text-[#5D554D]'
                    }`}
                  >
                    <div className="font-bold">⚡ SendGrid API</div>
                    <div className="text-[11px] text-[#7A7269] mt-0.5">
                      Transactional high-volume delivery.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, emailProvider: 'mailgun' })
                    }
                    className={`p-3 rounded-xl border text-left text-xs transition-all ${
                      formData.emailProvider === 'mailgun'
                        ? 'bg-[#E8F0FE] border-[#4285F4] text-[#1967D2] font-semibold shadow-xs'
                        : 'bg-[#FAF8F5] border-[#DDD6CB] text-[#5D554D]'
                    }`}
                  >
                    <div className="font-bold">⚡ Mailgun API</div>
                    <div className="text-[11px] text-[#7A7269] mt-0.5">
                      Pay-as-you-go transactional delivery, EU or US region.
                    </div>
                  </button>
                </div>
              </div>

              {formData.emailProvider === 'smtp' && (
                <div className="p-4 bg-[#FAF9F6] rounded-xl border border-[#E8E4DF] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#2D2926]">SMTP Credentials</span>
                    <span className="text-[10px] text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      Live Server Sending
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                        SMTP Host
                      </label>
                      <input
                        type="text"
                        placeholder="smtp.gmail.com / smtp.zoho.com / smtp.office365.com"
                        value={formData.smtpHost || ''}
                        onChange={(e) => setFormData({ ...formData, smtpHost: e.target.value })}
                        className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                        Port
                      </label>
                      <input
                        type="number"
                        placeholder="587"
                        value={formData.smtpPort ?? ''}
                        onChange={(e) =>
                          setFormData({ ...formData, smtpPort: e.target.value ? Number(e.target.value) : undefined })
                        }
                        className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                      />
                    </div>

                    <div className="flex items-end pb-1.5">
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#5D554D]">
                        <input
                          type="checkbox"
                          checked={!!formData.smtpSecure}
                          onChange={(e) => setFormData({ ...formData, smtpSecure: e.target.checked })}
                          className="accent-[#4285F4]"
                        />
                        Use SSL (port 465)
                      </label>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                        Username
                      </label>
                      <input
                        type="text"
                        placeholder="you@gmail.com"
                        value={formData.smtpUser || ''}
                        onChange={(e) => setFormData({ ...formData, smtpUser: e.target.value })}
                        className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                        Password / App Password
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••••••••••"
                        value={formData.smtpPass || ''}
                        onChange={(e) => setFormData({ ...formData, smtpPass: e.target.value })}
                        className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                        From Email (optional, defaults to Username)
                      </label>
                      <input
                        type="email"
                        placeholder="alex@yourbusiness.com"
                        value={formData.smtpFromEmail || ''}
                        onChange={(e) => setFormData({ ...formData, smtpFromEmail: e.target.value })}
                        className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-[#8C847C] leading-relaxed">
                    💡 Gmail: you need an <strong>App Password</strong>, not your normal Gmail password (Gmail requires 2-Step Verification to be turned on first). Generate one at{' '}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#1967D2] font-medium hover:underline"
                    >
                      myaccount.google.com/apppasswords
                    </a>{' '}
                    → name it (e.g. "OmniReach"), copy the 16-character password into the field above. Host <code className="bg-[#EFECE6] px-1 rounded">smtp.gmail.com</code>, port <code className="bg-[#EFECE6] px-1 rounded">587</code>.
                    <br />
                    💡 Zoho Mail: enable an app-specific password at{' '}
                    <a
                      href="https://accounts.zoho.com/home#security/app-password"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#1967D2] font-medium hover:underline"
                    >
                      accounts.zoho.com → Security → App Passwords
                    </a>
                    . Host <code className="bg-[#EFECE6] px-1 rounded">smtp.zoho.com</code> (or <code className="bg-[#EFECE6] px-1 rounded">smtp.zoho.eu</code> for EU accounts), port <code className="bg-[#EFECE6] px-1 rounded">587</code>.
                    <br />
                    💡 Outlook/Office 365: host <code className="bg-[#EFECE6] px-1 rounded">smtp.office365.com</code>, port <code className="bg-[#EFECE6] px-1 rounded">587</code>. If your organization enforces MFA, generate an app password under Microsoft Account → Security instead of using your normal password.
                  </p>

                  {testEmailBox}
                </div>
              )}

              {(formData.emailProvider === 'resend' || formData.emailProvider === 'sendgrid' || formData.emailProvider === 'mailgun') && (
                <div className="p-4 bg-[#FAF9F6] rounded-xl border border-[#E8E4DF] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#2D2926]">
                      {formData.emailProvider === 'resend'
                        ? 'Resend API Key'
                        : formData.emailProvider === 'sendgrid'
                          ? 'SendGrid API Key'
                          : 'Mailgun API Key'}
                    </span>
                    <span className="text-[10px] text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      Live Server Sending
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                      API Key
                    </label>
                    <input
                      type="password"
                      placeholder={
                        formData.emailProvider === 'resend'
                          ? 're_1234567890abcdef...'
                          : formData.emailProvider === 'sendgrid'
                            ? 'SG.xxxxxxxxxxxxxxxx...'
                            : 'key-xxxxxxxxxxxxxxxx... or a Mailgun Private API key'
                      }
                      value={formData.emailApiKey || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, emailApiKey: e.target.value })
                      }
                      className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                    />
                    <p className="text-[10px] text-[#8C847C] mt-1">
                      {formData.emailProvider === 'resend'
                        ? '💡 Free tier: Grab an API key from resend.com to send automated emails directly to inboxes.'
                        : formData.emailProvider === 'sendgrid'
                          ? '💡 Obtain your API key from app.sendgrid.com with Mail Send permissions.'
                          : '💡 Obtain your Private API key from app.mailgun.com → Settings → API Keys.'}
                    </p>
                  </div>

                  {formData.emailProvider === 'mailgun' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                          Sending Domain
                        </label>
                        <input
                          type="text"
                          placeholder="mg.yourdomain.com"
                          value={formData.mailgunDomain || ''}
                          onChange={(e) => setFormData({ ...formData, mailgunDomain: e.target.value })}
                          className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                          Region
                        </label>
                        <select
                          value={formData.mailgunRegion || 'us'}
                          onChange={(e) =>
                            setFormData({ ...formData, mailgunRegion: e.target.value as 'us' | 'eu' })
                          }
                          className="w-full bg-white border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs"
                        >
                          <option value="us">US</option>
                          <option value="eu">EU</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {testEmailBox}
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'bot' && (
            <div className="space-y-4">
              <div className="p-4 bg-[#FAF9F6] rounded-xl border border-[#E8E4DF] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2D2926]">Google Calendar Connection</span>
                  {googleCalendar.status.connected && (
                    <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Connected
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-[#7A7269] leading-relaxed">
                  When a WhatsApp prospect confirms a meeting time with the AI booking bot, it creates a real event with a
                  Google Meet link on this calendar. Requires WhatsApp Cloud API to be configured above (the bot replies via
                  the same phone number).
                </p>

                {!userId ? (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Sign in to a workspace to connect Google Calendar for the AI booking bot.
                  </p>
                ) : googleCalendar.status.connected ? (
                  <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-[#E8E4DF]">
                    <span className="text-xs text-[#4A443F]">{googleCalendar.status.connectedEmail || 'Connected'}</span>
                    <button
                      type="button"
                      onClick={googleCalendar.connect}
                      className="text-[11px] text-[#8C847C] hover:text-[#2D2926] underline"
                    >
                      Reconnect
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={googleCalendar.connect}
                    disabled={googleCalendar.connecting}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl text-white bg-[#4285F4] hover:bg-[#3367D6] shadow-sm transition-all disabled:opacity-60"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {googleCalendar.connecting ? 'Redirecting to Google…' : 'Connect Google Calendar'}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}

                {googleCalendar.error && (
                  <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    {googleCalendar.error}
                  </p>
                )}
              </div>

              <div className="p-4 bg-[#FAF9F6] rounded-xl border border-[#E8E4DF] space-y-2">
                <span className="text-xs font-bold text-[#2D2926]">WhatsApp Webhook (one-time Meta setup)</span>
                <p className="text-[11px] text-[#7A7269] leading-relaxed">
                  In your Meta App Dashboard → WhatsApp → Configuration, set the webhook callback URL to{' '}
                  <code className="bg-white px-1 py-0.5 rounded border border-[#E8E4DF] text-[10px]">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/api/whatsapp/webhook
                  </code>{' '}
                  and subscribe to the <strong>messages</strong> field. The verify token is set once by whoever deploys this
                  app (server's <code className="bg-white px-1 py-0.5 rounded border border-[#E8E4DF] text-[10px]">WHATSAPP_VERIFY_TOKEN</code>).
                </p>
              </div>
            </div>
          )}

          {activeSubTab === 'n8n' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2D2926] mb-1">
                  Live n8n / Webhook URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://n8n.yourdomain.com/webhook/outreach-trigger"
                  value={formData.n8nWebhookUrl || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, n8nWebhookUrl: e.target.value })
                  }
                  className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-2 text-xs text-[#2D2926] font-mono"
                />
                <p className="text-[11px] text-[#8C847C] mt-1.5 leading-relaxed">
                  When configured, every automated batch message, calendar booking, and lead interaction will automatically post an HTTP payload to your n8n workflow or Zapier webhook.
                </p>
              </div>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#F0ECE6]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-[#6C635B] hover:bg-[#FAF8F5] rounded-xl border border-[#DDD6CB] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-xl text-white bg-[#2D2926] hover:bg-[#1A1817] shadow-sm transition-all"
            >
              {savedSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#25D366]" />
                  <span>Settings Saved!</span>
                </>
              ) : (
                <span>Save Channel Settings</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
