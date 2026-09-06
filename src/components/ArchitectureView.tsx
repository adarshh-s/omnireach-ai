import React, { useState } from 'react';
import {
  Layers,
  CheckCircle2,
  Key,
  Table,
  Calendar,
  MessageSquare,
  Mail,
  Zap,
  Shield,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Network,
} from 'lucide-react';

export const ArchitectureView: React.FC = () => {
  const [activeSection, setActiveSection] = useState<number>(0);

  const sections = [
    {
      title: '1. OmniReach System Architecture & Flow',
      icon: Layers,
      content: (
        <div className="space-y-4 text-xs sm:text-sm text-[#4A443F]">
          <p className="leading-relaxed">
            OmniReach AI is an automated client outreach engine that connects <strong>Google Sheets / Excel</strong>, <strong>Gemini 3.7 Flash</strong>, <strong>WhatsApp Web / Twilio / Meta Cloud API</strong>, <strong>SendGrid / Resend Email</strong>, and <strong>Google Calendar</strong> for 1-click meeting bookings.
          </p>

          <div className="bg-[#FAF9F6] p-4 rounded-2xl border border-[#E8E4DF] font-mono text-xs text-[#2D2926] space-y-2">
            <div className="text-[#128C7E] font-bold mb-1">// End-to-End Outreach Pipeline</div>
            <div>[Client Excel / Sheet] → (Parses rows with Name, Company, Phone, Email)</div>
            <div className="pl-4 text-[#8C847C]">↓</div>
            <div>[Validation Engine] → (E.164 phone sanitization, email verification, slot matching)</div>
            <div className="pl-4 text-[#8C847C]">↓</div>
            <div>[Gemini 3.7 Flash AI] → (Generates hyper-personalized WhatsApp message & cold email)</div>
            <div className="pl-4 text-[#8C847C]">↓</div>
            <div>[Dispatch Engine] → (1-click WhatsApp Web link / Twilio API + Email Mailto / SendGrid)</div>
            <div className="pl-4 text-[#8C847C]">↓</div>
            <div>[Google Calendar Sync] → (Prospect clicks embedded slot to book 10-min Google Meet)</div>
            <div className="pl-4 text-[#8C847C]">↓</div>
            <div>[Two-Way Sheet Sync] → (Updates Status, WhatsAppStatus, EmailStatus, Meeting Time)</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div className="p-4 rounded-2xl bg-[#FAF9F6] border border-[#E8E4DF] space-y-1">
              <span className="font-semibold text-[#128C7E]">Zero Setup Direct Mode</span>
              <p className="text-xs text-[#5C5651] mt-1">
                • WhatsApp: Direct <code>wa.me</code> click-to-chat links with pre-filled AI copy<br />
                • Email: Direct <code>mailto:</code> links opening native Gmail/Outlook<br />
                • No credit card or third-party paid accounts required
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[#FAF9F6] border border-[#E8E4DF] space-y-1">
              <span className="font-semibold text-[#2D2926]">Enterprise Automated Mode</span>
              <p className="text-xs text-[#5C5651] mt-1">
                • WhatsApp: Twilio / Meta WhatsApp Business Cloud API<br />
                • Email: SendGrid / Resend transactional delivery<br />
                • n8n: Full webhook automation & cron schedule trigger
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: '2. Required API Credentials & Setup',
      icon: Key,
      content: (
        <div className="space-y-4 text-xs sm:text-sm text-[#4A443F]">
          <p>
            To deploy automated background sending via n8n or cloud webhooks, configure these credentials:
          </p>

          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-[#FAF9F6] border border-[#E8E4DF] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#2D2926] text-xs">1. Gemini API Key</span>
                <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full font-mono font-medium">AI Intelligence</span>
              </div>
              <p className="text-xs text-[#5C5651]">
                Obtain your Gemini API key from <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-[#128C7E] font-semibold underline">Google AI Studio</a> to power dynamic copy generation and smart replies.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#FAF9F6] border border-[#E8E4DF] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#2D2926] text-xs">2. WhatsApp (Twilio or Meta Cloud API)</span>
                <span className="text-[10px] bg-[#25D366]/15 text-[#128C7E] border border-[#25D366]/30 px-2.5 py-0.5 rounded-full font-mono font-medium">WhatsApp API</span>
              </div>
              <p className="text-xs text-[#5C5651]">
                Twilio Account SID & Auth Token (for Twilio WhatsApp sandbox/production) or Meta Cloud API System Token.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#FAF9F6] border border-[#E8E4DF] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#2D2926] text-xs">3. Email Provider (SendGrid / Resend)</span>
                <span className="text-[10px] bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full font-mono font-medium">Email Delivery</span>
              </div>
              <p className="text-xs text-[#5C5651]">
                API key with verified sending domain for high-inbox-rate cold outreach.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: '3. Google Sheet & Excel Format Guide',
      icon: Table,
      content: (
        <div className="space-y-4 text-xs sm:text-sm text-[#4A443F]">
          <p>
            You can upload any Excel (.xlsx, .xls) or CSV file with the following column structure:
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border border-[#E8E4DF] rounded-2xl overflow-hidden">
              <thead className="bg-[#FAF9F6] text-[#8C847C]">
                <tr>
                  <th className="p-2.5 border-b border-[#E8E4DF]">Name</th>
                  <th className="p-2.5 border-b border-[#E8E4DF]">Company</th>
                  <th className="p-2.5 border-b border-[#E8E4DF]">Phone</th>
                  <th className="p-2.5 border-b border-[#E8E4DF]">Email</th>
                  <th className="p-2.5 border-b border-[#E8E4DF]">Status</th>
                  <th className="p-2.5 border-b border-[#E8E4DF]">WhatsApp Status</th>
                  <th className="p-2.5 border-b border-[#E8E4DF]">Email Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E4DF] text-[#5C5651] bg-white">
                <tr>
                  <td className="p-2.5 font-bold text-[#2D2926]">Alex Morgan</td>
                  <td className="p-2.5">Acme AI Solutions</td>
                  <td className="p-2.5">+919876543211</td>
                  <td className="p-2.5">alex@acme.com</td>
                  <td className="p-2.5 text-amber-700 font-semibold">Pending</td>
                  <td className="p-2.5">Pending</td>
                  <td className="p-2.5">Pending</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-[#E8E4DF] rounded-2xl p-6 shadow-xs">
        <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-[#8C847C] mb-1">
          <Sparkles className="w-3.5 h-3.5 text-[#25D366]" />
          <span>System Architecture & Integration Manual</span>
        </div>
        <h2 className="text-xl font-bold text-[#2D2926]">
          OmniReach AI Architecture & Outreach Blueprint
        </h2>
        <p className="text-xs sm:text-sm text-[#5C5651] mt-0.5">
          Comprehensive documentation for WhatsApp, Email, Google Calendar, and n8n workflow integration.
        </p>
      </div>

      {/* Tabs / Accordion */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-4 space-y-2">
          {sections.map((sec, idx) => {
            const Icon = sec.icon;
            const isActive = activeSection === idx;
            return (
              <button
                key={idx}
                onClick={() => setActiveSection(idx)}
                className={`w-full text-left p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between transition-all ${
                  isActive
                    ? 'bg-[#25D366] text-white shadow-xs'
                    : 'bg-white border border-[#E8E4DF] text-[#5C5651] hover:bg-[#FAF8F5]'
                }`}
              >
                <div className="flex items-center space-x-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{sec.title}</span>
                </div>
                <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-[#8C847C]'}`} />
              </button>
            );
          })}
        </div>

        <div className="md:col-span-8 bg-white border border-[#E8E4DF] rounded-2xl p-6 shadow-xs">
          <h3 className="text-base font-bold text-[#2D2926] pb-3 mb-4 border-b border-[#F0ECE6] flex items-center gap-2">
            {sections[activeSection].title}
          </h3>
          {sections[activeSection].content}
        </div>
      </div>
    </div>
  );
};
