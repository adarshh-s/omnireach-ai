import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Send,
  MessageSquare,
  Mail,
  CheckCircle2,
  Clock,
  ExternalLink,
  Sparkles,
  Settings,
  Layers,
  ChevronRight,
  AlertCircle,
  FileSpreadsheet,
  Upload,
  Zap,
} from 'lucide-react';
import {
  Lead,
  CalendarSlot,
  CampaignSettings,
  MessageTemplate,
  ChannelApiSettings,
  OutreachDispatchLog,
} from '../types';
import {
  generateAIPersonalizedMessage,
  interpolateTemplate,
  resolveTemplateVariables,
  generateWhatsAppLink,
  generateMailtoLink,
} from '../utils/outreachEngine';
import { sendEmailDirectOrBackend } from '../services/emailService';
import { DEFAULT_TEMPLATES } from '../data/sampleTemplates';

interface BatchCampaignRunnerProps {
  leads: Lead[];
  availableSlots: CalendarSlot[];
  campaignSettings: CampaignSettings;
  channelSettings: ChannelApiSettings;
  templates: MessageTemplate[];
  onUpdateLead: (lead: Lead) => void;
  onUpdateSettings?: (settings: CampaignSettings) => void;
  onResetAllLeadsToPending?: () => void;
  onBookCalendarSlot?: (slotId: string, lead: Lead, notes: string) => void;
  onOpenChannelConfig: () => void;
  onOpenExcelUpload: () => void;
  onSelectLeadForSimulator?: (leadId: string) => void;
}

export const BatchCampaignRunner: React.FC<BatchCampaignRunnerProps> = ({
  leads,
  availableSlots,
  campaignSettings,
  channelSettings,
  templates,
  onUpdateLead,
  onUpdateSettings,
  onResetAllLeadsToPending,
  onOpenChannelConfig,
  onOpenExcelUpload,
  onSelectLeadForSimulator,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [channelMode, setChannelMode] = useState<'omnichannel' | 'whatsapp' | 'email'>(
    campaignSettings.channelMode || 'omnichannel'
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates[0]?.id || 'tpl-1'
  );
  const [delaySeconds, setDelaySeconds] = useState<number>(campaignSettings.delayBetweenMessagesSeconds || 2);
  const [autoOpenApps, setAutoOpenApps] = useState<boolean>(false);
  
  // Real-time live dispatch previews
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [currentWhatsAppText, setCurrentWhatsAppText] = useState<string>('');
  const [currentEmailSubject, setCurrentEmailSubject] = useState<string>('');
  const [currentEmailBody, setCurrentEmailBody] = useState<string>('');
  const [isProcessingStep, setIsProcessingStep] = useState<boolean>(false);
  const [dispatchLogs, setDispatchLogs] = useState<OutreachDispatchLog[]>([]);

  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const validLeads = leads.filter((l) => l.isValidPhone || l.isValidEmail);
  const pendingLeads = leads.filter(
    (l) => l.status === 'Pending' || (channelMode === 'whatsapp' && l.whatsAppStatus === 'Pending') || (channelMode === 'email' && l.emailStatus === 'Pending')
  );

  const completedWhatsAppCount = leads.filter((l) => l.whatsAppStatus !== 'Pending').length;
  const completedEmailCount = leads.filter((l) => l.emailStatus !== 'Pending').length;
  const bookedCount = leads.filter((l) => l.status === 'Meeting Scheduled').length;
  const totalLeadsCount = leads.length;

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  // Campaign Execution Loop
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const processNextLead = async () => {
      if (!isRunningRef.current || isPausedRef.current) return;

      // Find next pending lead
      const nextPendingIndex = leads.findIndex(
        (l, idx) =>
          idx >= currentIndex &&
          (l.status === 'Pending' ||
            (channelMode === 'whatsapp' && l.whatsAppStatus === 'Pending') ||
            (channelMode === 'email' && l.emailStatus === 'Pending') ||
            (channelMode === 'omnichannel' && (l.whatsAppStatus === 'Pending' || l.emailStatus === 'Pending')))
      );

      if (nextPendingIndex === -1) {
        setIsRunning(false);
        setIsProcessingStep(false);
        setCurrentLead(null);
        return;
      }

      const lead = leads[nextPendingIndex];
      setCurrentIndex(nextPendingIndex);
      setCurrentLead(lead);
      setIsProcessingStep(true);

      // 1. Build the outbound message: either AI-personalized, or the template exactly as typed
      const personalized = campaignSettings.useAiCopywriting
        ? await generateAIPersonalizedMessage(lead, campaignSettings, selectedTemplate, availableSlots)
        : {
            whatsApp: interpolateTemplate(selectedTemplate?.whatsAppContent || '', lead, campaignSettings, availableSlots),
            emailSubject: interpolateTemplate(selectedTemplate?.emailSubject || '', lead, campaignSettings, availableSlots),
            emailBody: interpolateTemplate(selectedTemplate?.emailBody || '', lead, campaignSettings, availableSlots),
          };

      setCurrentWhatsAppText(personalized.whatsApp);
      setCurrentEmailSubject(personalized.emailSubject);
      setCurrentEmailBody(personalized.emailBody);

      // 2. Dispatch according to channel mode
      const nowFormatted = new Date().toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      let updatedLead: Lead = {
        ...lead,
        status: 'Contacted',
        lastContacted: nowFormatted,
        channelUsed: channelMode,
        whatsAppMessage: personalized.whatsApp,
        emailSubject: personalized.emailSubject,
        emailBody: personalized.emailBody,
      };

      const newLogs: OutreachDispatchLog[] = [];

      // WhatsApp dispatch
      if (channelMode === 'omnichannel' || channelMode === 'whatsapp') {
        if (lead.isValidPhone && lead.phone) {
          const waLink = generateWhatsAppLink(lead.phone, personalized.whatsApp);

          if (autoOpenApps && typeof window !== 'undefined') {
            window.open(waLink, '_blank');
          }

          // Trigger backend relay
          const useTemplate =
            (channelMode === 'omnichannel' || channelMode === 'whatsapp') &&
            (channelSettings.whatsAppProvider === 'twilio' || channelSettings.whatsAppProvider === 'cloud_api') &&
            channelSettings.whatsappMessageMode === 'template';
          const templateParams = useTemplate
            ? resolveTemplateVariables(
                (channelSettings.whatsAppProvider === 'twilio'
                  ? channelSettings.twilioContentVariables
                  : channelSettings.whatsappTemplateVariables) || [],
                lead,
                campaignSettings,
                availableSlots
              )
            : undefined;

          let waDeliveryStatus = 'delivered';
          let waErrorDetail = '';
          try {
            const waRes = await fetch('/api/outreach/send-whatsapp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lead,
                messageText: personalized.whatsApp,
                channelSettings,
                webhookUrl: channelSettings.n8nWebhookUrl,
                templateParams,
              }),
            });
            const waData = await waRes.json();
            if (!waData.delivered) {
              waDeliveryStatus = 'failed';
              waErrorDetail = waData.errorDetail || 'Provider dispatch failed';
              updatedLead.whatsAppStatus = 'Failed';
            } else {
              updatedLead.whatsAppStatus = 'Delivered';
            }
          } catch (err: any) {
            waDeliveryStatus = 'failed';
            waErrorDetail = err?.message || 'Network error';
            updatedLead.whatsAppStatus = 'Failed';
          }

          newLogs.push({
            id: `log-wa-${Date.now()}`,
            leadId: lead.id,
            leadName: lead.name,
            recipient: lead.phone,
            channel: 'whatsapp',
            status: waDeliveryStatus as 'delivered' | 'failed',
            timestamp: nowFormatted,
            preview: personalized.whatsApp.substring(0, 80) + '...',
            directUrl: waLink,
            errorDetail: waErrorDetail,
          });
        } else {
          updatedLead.whatsAppStatus = 'Failed';
        }
      }

      // Email dispatch
      if (channelMode === 'omnichannel' || channelMode === 'email') {
        if (lead.isValidEmail && lead.email) {
          const mailLink = generateMailtoLink(
            lead.email,
            personalized.emailSubject,
            personalized.emailBody
          );
          updatedLead.emailStatus = 'Sent';

          if (autoOpenApps && channelMode === 'email' && typeof window !== 'undefined') {
            window.open(mailLink, '_blank');
          }

          // Trigger email relay (handles both Vercel client-direct and backend server)
          let emDeliveryStatus = 'delivered';
          let emErrorDetail = '';
          try {
            const resolvedSenderEmail = channelSettings.resendFromEmail || 
              (channelSettings.emailProvider === 'resend' && (!campaignSettings.senderEmail || campaignSettings.senderEmail.includes('.example'))
                ? 'onboarding@resend.dev'
                : campaignSettings.senderEmail || 'onboarding@resend.dev');

            const emRes = await sendEmailDirectOrBackend({
              lead,
              subject: personalized.emailSubject,
              body: personalized.emailBody,
              channelSettings,
              senderName: campaignSettings.senderName,
              senderEmail: resolvedSenderEmail,
            });
            if (!emRes.delivered) {
              emDeliveryStatus = 'failed';
              emErrorDetail = emRes.errorDetail || 'Provider dispatch failed';
              updatedLead.emailStatus = 'Failed';
            } else {
              updatedLead.emailStatus = 'Sent';
            }
          } catch (err: any) {
            emDeliveryStatus = 'failed';
            emErrorDetail = err?.message || 'Network error';
            updatedLead.emailStatus = 'Failed';
          }

          newLogs.push({
            id: `log-em-${Date.now()}`,
            leadId: lead.id,
            leadName: lead.name,
            recipient: lead.email,
            channel: 'email',
            status: emDeliveryStatus as 'delivered' | 'failed',
            timestamp: nowFormatted,
            subject: personalized.emailSubject,
            preview: personalized.emailBody.substring(0, 80) + '...',
            directUrl: mailLink,
            errorDetail: emErrorDetail,
          });
        } else {
          updatedLead.emailStatus = 'Failed';
        }
      }

      onUpdateLead(updatedLead);
      if (newLogs.length > 0) {
        setDispatchLogs((prev) => [...newLogs, ...prev].slice(0, 50));
      }

      setIsProcessingStep(false);

      // Wait for delay before next item
      if (isRunningRef.current && !isPausedRef.current) {
        timeoutId = setTimeout(() => {
          setCurrentIndex((prev) => prev + 1);
        }, delaySeconds * 1000);
      }
    };

    if (isRunning && !isPaused) {
      processNextLead();
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isRunning, isPaused, currentIndex]);

  const handleStart = () => {
    setIsRunning(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    setIsPaused(true);
  };

  const handleResume = () => {
    setIsPaused(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsPaused(false);
    setCurrentIndex(0);
    setCurrentLead(null);
    setIsProcessingStep(false);
  };

  const handleRestartAll = () => {
    setIsRunning(false);
    setIsPaused(false);
    setCurrentIndex(0);
    setCurrentLead(null);
    setIsProcessingStep(false);
    if (onResetAllLeadsToPending) {
      onResetAllLeadsToPending();
    }
    setTimeout(() => {
      setIsRunning(true);
    }, 150);
  };

  const progressPercent = totalLeadsCount > 0
    ? Math.round(((totalLeadsCount - pendingLeads.length) / totalLeadsCount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner / Configuration Card */}
      <div className="bg-white rounded-2xl border border-[#E8E4DF] p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-[#F0ECE6]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[#2D2926] tracking-tight">
                Automated WhatsApp & Email Campaign Engine
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#25D366]/15 text-[#128C7E]">
                <Zap className="w-3 h-3 fill-[#25D366]" />
                Gemini 3.7 Flash AI Copywriter
              </span>
            </div>
            <p className="text-xs text-[#7A7269] mt-1">
              Ingest contacts from Excel spreadsheets and automatically dispatch personalized WhatsApp messages & emails with Google Calendar booking links.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="campaign-restart-automation-top-btn"
              onClick={handleRestartAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#E8F5E9] hover:bg-[#C8E6C9] border border-[#A5D6A7] text-[#1B5E20] transition-colors"
              title="Reset all lead statuses and start sequence from beginning"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#2E7D32]" />
              <span>Start Automation Again</span>
            </button>
            <button
              id="campaign-upload-excel-btn"
              onClick={onOpenExcelUpload}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#FAF8F5] hover:bg-[#F2EFE9] border border-[#DDD6CB] text-[#4A443F] transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-[#8C847C]" />
              <span>Import Sheet</span>
            </button>
            <button
              id="campaign-config-channels-btn"
              onClick={onOpenChannelConfig}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#FAF8F5] hover:bg-[#F2EFE9] border border-[#DDD6CB] text-[#4A443F] transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-[#8C847C]" />
              <span>API Settings</span>
            </button>
          </div>
        </div>

        {/* Campaign Settings Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
          {/* Channel Mode Selector */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8C847C] mb-1.5">
              Outreach Channel
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#F5F2EB] rounded-lg border border-[#E8E4DF]">
              <button
                id="mode-omnichannel"
                onClick={() => setChannelMode('omnichannel')}
                className={`py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                  channelMode === 'omnichannel'
                    ? 'bg-white text-[#2D2926] shadow-xs font-semibold'
                    : 'text-[#6C635B] hover:text-[#2D2926]'
                }`}
              >
                Both
              </button>
              <button
                id="mode-whatsapp"
                onClick={() => setChannelMode('whatsapp')}
                className={`py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                  channelMode === 'whatsapp'
                    ? 'bg-[#25D366] text-white shadow-xs font-semibold'
                    : 'text-[#6C635B] hover:text-[#2D2926]'
                }`}
              >
                WhatsApp
              </button>
              <button
                id="mode-email"
                onClick={() => setChannelMode('email')}
                className={`py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                  channelMode === 'email'
                    ? 'bg-[#4285F4] text-white shadow-xs font-semibold'
                    : 'text-[#6C635B] hover:text-[#2D2926]'
                }`}
              >
                Email
              </button>
            </div>
          </div>

          {/* Template Selector */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#8C847C] mb-1.5">
              Sequence Template
            </label>
            <select
              id="campaign-template-select"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs text-[#2D2926] focus:ring-1 focus:ring-[#25D366] focus:border-[#25D366] font-medium"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
            <button
              id="campaign-toggle-ai-copywriting"
              type="button"
              onClick={() =>
                onUpdateSettings?.({
                  ...campaignSettings,
                  useAiCopywriting: !campaignSettings.useAiCopywriting,
                })
              }
              className={`mt-1.5 w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-colors ${
                campaignSettings.useAiCopywriting
                  ? 'bg-[#E8F5E9] border-[#A5D6A7] text-[#1B5E20]'
                  : 'bg-[#FAF8F5] border-[#DDD6CB] text-[#4A443F]'
              }`}
              title="When off, your template text is sent exactly as written (with {{variables}} filled in) — no AI rewrite."
            >
              <Sparkles className="w-3 h-3" />
              <span>{campaignSettings.useAiCopywriting ? 'AI Copywriting: On' : 'AI Copywriting: Off (send my text as-is)'}</span>
            </button>
          </div>

          {/* Dispatch Interval Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8C847C]">
                Pacing Interval
              </label>
              <span className="text-xs font-semibold text-[#2D2926]">{delaySeconds}s / contact</span>
            </div>
            <input
              id="campaign-delay-slider"
              type="range"
              min="1"
              max="10"
              step="0.5"
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(parseFloat(e.target.value))}
              className="w-full accent-[#25D366] cursor-pointer"
            />
          </div>

          {/* Execution Controls */}
          <div className="flex items-end gap-2">
            {!isRunning ? (
              pendingLeads.length > 0 ? (
                <button
                  id="campaign-start-btn"
                  onClick={handleStart}
                  disabled={leads.length === 0}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg text-white bg-gradient-to-r from-[#128C7E] to-[#25D366] hover:opacity-95 shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Launch Campaign ({pendingLeads.length})</span>
                </button>
              ) : (
                <button
                  id="campaign-restart-main-btn"
                  onClick={handleRestartAll}
                  disabled={leads.length === 0}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg text-white bg-gradient-to-r from-[#128C7E] to-[#25D366] hover:opacity-95 shadow-sm transition-all active:scale-[0.98]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Start Automation ({totalLeadsCount} Leads)</span>
                </button>
              )
            ) : isPaused ? (
              <button
                id="campaign-resume-btn"
                onClick={handleResume}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg text-white bg-[#25D366] hover:bg-[#1EBE5D] shadow-sm transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Resume</span>
              </button>
            ) : (
              <button
                id="campaign-pause-btn"
                onClick={handlePause}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg text-[#2D2926] bg-[#F5F2EB] hover:bg-[#EAE5DC] border border-[#DDD6CB] transition-all"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
            )}

            <button
              id="campaign-restart-icon-btn"
              onClick={handleRestartAll}
              className="p-2 rounded-lg text-[#128C7E] bg-[#E8F5E9] hover:bg-[#C8E6C9] border border-[#A5D6A7] transition-colors"
              title="Start automation again (re-send to all leads)"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#2E7D32]" />
            </button>

            <button
              id="campaign-reset-btn"
              onClick={handleReset}
              className="p-2 rounded-lg text-[#8C847C] hover:text-[#2D2926] hover:bg-[#F2EFE9] border border-[#DDD6CB] transition-colors"
              title="Reset campaign state"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Channel Status & Automation Diagnostics */}
        <div className="mt-4 p-3 bg-[#FAF8F5] rounded-xl border border-[#E8E4DF] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#8C847C]">WhatsApp Dispatch:</span>
              {(channelSettings.whatsAppProvider === 'twilio' && channelSettings.twilioAccountSid && channelSettings.twilioAuthToken) ||
              (channelSettings.whatsAppProvider === 'cloud_api' && channelSettings.whatsappCloudApiKey && channelSettings.whatsappCloudPhoneId) ||
              (channelSettings.whatsAppProvider === 'webhook' && channelSettings.n8nWebhookUrl) ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {channelSettings.whatsAppProvider === 'twilio'
                    ? 'Twilio API'
                    : channelSettings.whatsAppProvider === 'cloud_api'
                      ? 'WhatsApp Cloud API'
                      : 'Custom Webhook'}{' '}
                  (Pure Background)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#7A7269] bg-[#EFECE6] px-2 py-0.5 rounded-md">
                  Web Direct Mode (Click-to-chat)
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#8C847C]">Email Dispatch:</span>
              {((channelSettings.emailProvider === 'resend' || channelSettings.emailProvider === 'sendgrid' || channelSettings.emailProvider === 'mailgun') && channelSettings.emailApiKey) ||
              (channelSettings.emailProvider === 'smtp' && channelSettings.smtpHost && channelSettings.smtpUser && channelSettings.smtpPass) ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                  {channelSettings.emailProvider === 'resend'
                    ? 'Resend API'
                    : channelSettings.emailProvider === 'sendgrid'
                      ? 'SendGrid API'
                      : channelSettings.emailProvider === 'mailgun'
                        ? 'Mailgun API'
                        : 'SMTP'}{' '}
                  (Direct Inbox)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#7A7269] bg-[#EFECE6] px-2 py-0.5 rounded-md">
                  Mailto Mode (No API key set)
                </span>
              )}
            </div>
          </div>

          {((channelMode !== 'whatsapp' &&
              !(
                ((channelSettings.emailProvider === 'resend' || channelSettings.emailProvider === 'sendgrid' || channelSettings.emailProvider === 'mailgun') && channelSettings.emailApiKey) ||
                (channelSettings.emailProvider === 'smtp' && channelSettings.smtpHost && channelSettings.smtpUser && channelSettings.smtpPass)
              )) ||
            (channelMode !== 'email' &&
              !(
                (channelSettings.whatsAppProvider === 'twilio' && channelSettings.twilioAccountSid && channelSettings.twilioAuthToken) ||
                (channelSettings.whatsAppProvider === 'cloud_api' && channelSettings.whatsappCloudApiKey && channelSettings.whatsappCloudPhoneId) ||
                (channelSettings.whatsAppProvider === 'webhook' && channelSettings.n8nWebhookUrl)
              ))) && (
            <button
              onClick={onOpenChannelConfig}
              className="text-[11px] font-semibold text-[#128C7E] hover:underline flex items-center gap-1 shrink-0"
            >
              <Settings className="w-3 h-3" />
              <span>Connect API for 100% Background Sending →</span>
            </button>
          )}
        </div>

        {/* Resend Testing & Inbox Delivery Guidance Banner */}
        {channelSettings.emailProvider === 'resend' && (
          <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-950">
                📬 Why emails might not appear in Primary Inbox immediately:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-900">
                <li>
                  <strong>Check Gmail Spam & Promotions:</strong> Emails sent using the default free sandbox sender (<code className="bg-amber-100 px-1 rounded font-mono text-[10px]">onboarding@resend.dev</code>) often land in your <strong>Spam / Junk</strong> folder or <strong>Promotions</strong> tab.
                </li>
                <li>
                  <strong>Resend Free Sandbox Limitation:</strong> Without a custom verified domain on Resend.com, Resend <span className="underline">only allows delivering emails to the email address that owns your Resend account</span>. Attempts to send to other prospect addresses are blocked by Resend until your domain DNS is verified (Resend dashboard → Domains).
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Campaign Finished Notification Banner */}
        {!isRunning && pendingLeads.length === 0 && totalLeadsCount > 0 && (
          <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-[#E8F5E9] to-[#E0F2FE] border border-[#A5D6A7] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#25D366] text-white flex items-center justify-center font-bold text-sm shrink-0">
                ✓
              </div>
              <div>
                <div className="text-xs font-bold text-[#1B5E20]">
                  Campaign Cycle Complete ({totalLeadsCount} of {totalLeadsCount} Leads Engaged)
                </div>
                <div className="text-[11px] text-[#2E7D32]">
                  All contacts in your spreadsheet have been processed. You can start the automated sequence again or send another follow-up round anytime.
                </div>
              </div>
            </div>
            <button
              id="campaign-restart-banner-btn"
              onClick={handleRestartAll}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg text-white bg-[#128C7E] hover:bg-[#0E6D62] shadow-sm transition-all whitespace-nowrap active:scale-[0.98]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Start Automation One More Time</span>
            </button>
          </div>
        )}

        {/* Progress Bar & Status Line */}
        <div className="mt-5 pt-4 border-t border-[#F0ECE6]">
          <div className="flex items-center justify-between text-xs text-[#7A7269] mb-1.5">
            <span className="font-medium">
              Campaign Progress: {totalLeadsCount - pendingLeads.length} of {totalLeadsCount} Leads Contacted
            </span>
            <span className="font-semibold text-[#2D2926]">{progressPercent}%</span>
          </div>
          <div className="w-full bg-[#EAE5DC] h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#128C7E] via-[#25D366] to-[#4285F4] h-full transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-xl border border-[#E8E4DF] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#8C847C] font-medium">Total Ingested</span>
            <FileSpreadsheet className="w-4 h-4 text-[#8C847C]" />
          </div>
          <div className="text-2xl font-bold text-[#2D2926] mt-1">{totalLeadsCount}</div>
          <div className="text-[11px] text-[#8C847C] mt-0.5">{validLeads.length} Valid contacts</div>
        </div>

        <div className="bg-white rounded-xl border border-[#E8E4DF] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#128C7E] font-medium">WhatsApp Dispatched</span>
            <MessageSquare className="w-4 h-4 text-[#25D366]" />
          </div>
          <div className="text-2xl font-bold text-[#128C7E] mt-1">{completedWhatsAppCount}</div>
          <div className="text-[11px] text-[#8C847C] mt-0.5">High direct open rate</div>
        </div>

        <div className="bg-white rounded-xl border border-[#E8E4DF] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#1967D2] font-medium">Emails Sent</span>
            <Mail className="w-4 h-4 text-[#4285F4]" />
          </div>
          <div className="text-2xl font-bold text-[#1967D2] mt-1">{completedEmailCount}</div>
          <div className="text-[11px] text-[#8C847C] mt-0.5">Synced with Google Calendar</div>
        </div>

        <div className="bg-white rounded-xl border border-[#E8E4DF] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#B06000] font-medium">Meetings Booked</span>
            <CheckCircle2 className="w-4 h-4 text-[#F29900]" />
          </div>
          <div className="text-2xl font-bold text-[#B06000] mt-1">{bookedCount}</div>
          <div className="text-[11px] text-[#8C847C] mt-0.5">Google Meet invites sent</div>
        </div>
      </div>

      {/* Main Campaign Activity Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Active Lead & Message Personalization Stream */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl border border-[#E8E4DF] p-5 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-[#F0ECE6]">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#25D366] animate-pulse"></div>
                <h2 className="text-sm font-bold text-[#2D2926]">Live Outreach Personalization Stream</h2>
              </div>
              {isRunning && (
                <span className="text-[11px] font-semibold text-[#128C7E] bg-[#E8F5E9] px-2 py-0.5 rounded-md border border-[#C8E6C9]">
                  {isProcessingStep ? (campaignSettings.useAiCopywriting ? 'AI Formatting...' : 'Building Message...') : 'Dispatching...'}
                </span>
              )}
            </div>

            {currentLead ? (
              <div className="mt-4 space-y-4">
                {/* Active Lead Header */}
                <div className="p-3.5 bg-[#FAF9F6] rounded-xl border border-[#E8E4DF] flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm text-[#2D2926]">{currentLead.name}</div>
                    <div className="text-xs text-[#7A7269]">
                      {currentLead.company} • {currentLead.phone} • {currentLead.email}
                    </div>
                  </div>
                  <button
                    onClick={() => onSelectLeadForSimulator(currentLead.id)}
                    className="text-xs font-medium text-[#128C7E] hover:underline flex items-center gap-1"
                  >
                    <span>View in Simulator</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* WhatsApp Message Preview Bubble */}
                {(channelMode === 'omnichannel' || channelMode === 'whatsapp') && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#128C7E] flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-[#25D366]" />
                        WhatsApp Message Output ({currentLead.phone})
                      </span>
                      <a
                        href={generateWhatsAppLink(currentLead.phone, currentWhatsAppText)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-medium text-[#128C7E] hover:underline flex items-center gap-1"
                      >
                        <span>Open Chat</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="p-3.5 bg-[#E7F8E8] text-[#1E3A24] rounded-xl text-xs whitespace-pre-line border border-[#C8E6C9] font-sans">
                      {currentWhatsAppText || 'Generating personalized WhatsApp hook...'}
                    </div>
                  </div>
                )}

                {/* Email Subject & Body Preview */}
                {(channelMode === 'omnichannel' || channelMode === 'email') && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#1967D2] flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-[#4285F4]" />
                        Email Draft ({currentLead.email})
                      </span>
                      <a
                        href={generateMailtoLink(
                          currentLead.email,
                          currentEmailSubject,
                          currentEmailBody
                        )}
                        className="text-[11px] font-medium text-[#1967D2] hover:underline flex items-center gap-1"
                      >
                        <span>Open Mail Client</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="p-3.5 bg-[#F0F4F9] text-[#1F2937] rounded-xl text-xs space-y-2 border border-[#D2E3FC]">
                      <div className="font-semibold text-xs text-[#0F172A] pb-1.5 border-b border-[#D2E3FC]">
                        Subject: {currentEmailSubject || 'Generating subject...'}
                      </div>
                      <div className="whitespace-pre-line text-xs font-sans text-[#334155]">
                        {currentEmailBody || 'Generating personalized email body with Google Calendar booking link...'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 px-4">
                {pendingLeads.length === 0 && totalLeadsCount > 0 ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-[#E8F5E9] border border-[#A5D6A7] flex items-center justify-center mx-auto text-[#2E7D32] mb-3">
                      <CheckCircle2 className="w-6 h-6 text-[#25D366]" />
                    </div>
                    <h3 className="text-sm font-bold text-[#2D2926]">Campaign Complete</h3>
                    <p className="text-xs text-[#8C847C] max-w-md mx-auto mt-1 mb-4">
                      All {totalLeadsCount} contacts in your spreadsheet have been engaged via {channelMode === 'omnichannel' ? 'WhatsApp & Email' : channelMode}. Ready to run the automation again?
                    </p>
                    <button
                      id="campaign-restart-stream-btn"
                      onClick={handleRestartAll}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg text-white bg-gradient-to-r from-[#128C7E] to-[#25D366] hover:opacity-95 shadow-sm transition-all active:scale-[0.98]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Start Automation One More Time</span>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-[#FAF8F5] border border-[#DDD6CB] flex items-center justify-center mx-auto text-[#8C847C] mb-3">
                      <Send className="w-5 h-5 text-[#8C847C]" />
                    </div>
                    <h3 className="text-sm font-semibold text-[#2D2926]">Campaign Ready for Launch</h3>
                    <p className="text-xs text-[#8C847C] max-w-md mx-auto mt-1">
                      Click "Launch Campaign" to automatically cycle through your spreadsheet contacts, generate AI personalized copy, and dispatch WhatsApp and Email messages.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Dispatch Feed & Audit Logs */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-[#E8E4DF] p-5 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-[#F0ECE6]">
              <h2 className="text-sm font-bold text-[#2D2926] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#8C847C]" />
                Live Dispatch Activity
              </h2>
              <span className="text-xs text-[#8C847C]">{dispatchLogs.length} logs</span>
            </div>

            <div className="mt-3 divide-y divide-[#F0ECE6] max-h-[460px] overflow-y-auto no-scrollbar">
              {dispatchLogs.length > 0 ? (
                dispatchLogs.map((log) => (
                  <div key={log.id} className="py-2.5 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            log.channel === 'whatsapp'
                              ? 'bg-[#E8F5E9] text-[#25D366]'
                              : 'bg-[#E8F0FE] text-[#4285F4]'
                          }`}
                        >
                          {log.channel === 'whatsapp' ? (
                            <MessageSquare className="w-3.5 h-3.5" />
                          ) : (
                            <Mail className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-[#2D2926] flex items-center gap-1.5">
                            <span>{log.leadName}</span>
                            <span className="text-[10px] text-[#8C847C] font-normal">({log.recipient})</span>
                          </div>
                          <p className="text-[11px] text-[#7A7269] line-clamp-1 mt-0.5">
                            {log.preview}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {log.status === 'delivered' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#2E7D32] bg-[#E8F5E9] px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Delivered
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                            Failed
                          </span>
                        )}
                        <div className="text-[10px] text-[#A69F96] mt-0.5">{log.timestamp}</div>
                      </div>
                    </div>
                    {log.errorDetail && log.status === 'failed' && (
                      <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-1.5 ml-[34px]">
                        {log.errorDetail}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-[#8C847C]">
                  No dispatches yet in this session. Start the campaign to see real-time delivery logs.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
