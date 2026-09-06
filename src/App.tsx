import React, { useState, useEffect } from 'react';
import { Header, ActiveTab } from './components/Header';
import { BatchCampaignRunner } from './components/BatchCampaignRunner';
import { MessageSimulator } from './components/MessageSimulator';
import { SheetsView } from './components/SheetsView';
import { CalendarView } from './components/CalendarView';
import { CampaignAnalytics } from './components/CampaignAnalytics';
import { N8nWorkflowView } from './components/N8nWorkflowView';
import { ArchitectureView } from './components/ArchitectureView';
import { TemplateManagerView } from './components/TemplateManagerView';
import { ExcelUploadModal } from './components/ExcelUploadModal';
import { ChannelConfigModal } from './components/ChannelConfigModal';
import {
  Lead,
  CalendarSlot,
  CampaignSettings,
  ChannelApiSettings,
  MessageTemplate,
} from './types';
import { INITIAL_LEADS, INITIAL_CALENDAR_SLOTS } from './data/sampleLeads';
import { DEFAULT_TEMPLATES, DEFAULT_CAMPAIGN_SETTINGS } from './data/sampleTemplates';

const DEFAULT_CHANNEL_SETTINGS: ChannelApiSettings = {
  whatsAppProvider: 'web_direct',
  emailProvider: 'resend',
  twilioAccountSid: '',
  twilioAuthToken: '',
  emailApiKey: '',
  n8nWebhookUrl: '',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('campaign');

  // Leads State with LocalStorage Persistence
  const [leads, setLeads] = useState<Lead[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('omnireach_leads_v1');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch {}
      }
    }
    return INITIAL_LEADS;
  });

  // Calendar Slots State
  const [calendarSlots, setCalendarSlots] = useState<CalendarSlot[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('omnireach_slots_v1');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return INITIAL_CALENDAR_SLOTS;
  });

  // Campaign Settings
  const [campaignSettings, setCampaignSettings] = useState<CampaignSettings>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('omnireach_campaign_settings_v1');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return DEFAULT_CAMPAIGN_SETTINGS;
  });

  // Templates
  const [templates, setTemplates] = useState<MessageTemplate[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('omnireach_templates_v1');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return DEFAULT_TEMPLATES;
  });

  // Channel API Settings
  const [channelSettings, setChannelSettings] = useState<ChannelApiSettings>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('omnireach_channels_v1');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return DEFAULT_CHANNEL_SETTINGS;
  });

  // Modals State
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);

  // Selected Lead for Simulator
  const [selectedLeadId, setSelectedLeadId] = useState<string>(leads[0]?.id || 'lead-1');

  // Sync to LocalStorage
  useEffect(() => {
    localStorage.setItem('omnireach_leads_v1', JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('omnireach_slots_v1', JSON.stringify(calendarSlots));
  }, [calendarSlots]);

  useEffect(() => {
    localStorage.setItem(
      'omnireach_campaign_settings_v1',
      JSON.stringify(campaignSettings)
    );
  }, [campaignSettings]);

  useEffect(() => {
    localStorage.setItem('omnireach_templates_v1', JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem('omnireach_channels_v1', JSON.stringify(channelSettings));
  }, [channelSettings]);

  // Lead CRUD handlers
  const handleUpdateLead = (updated: Lead) => {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  };

  const handleAddLead = (newLead: Lead) => {
    setLeads((prev) => [newLead, ...prev]);
  };

  const handleDeleteLead = (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    if (selectedLeadId === id && leads.length > 1) {
      setSelectedLeadId(leads.find((l) => l.id !== id)?.id || '');
    }
  };

  const handleResetLeads = () => {
    setLeads(INITIAL_LEADS);
    setCalendarSlots(INITIAL_CALENDAR_SLOTS);
    setSelectedLeadId(INITIAL_LEADS[0].id);
  };

  const handleResetAllLeadsToPending = () => {
    setLeads((prev) =>
      prev.map((l) => ({
        ...l,
        status: 'Pending',
        whatsAppStatus: 'Pending',
        emailStatus: 'Pending',
      }))
    );
  };

  const handleImportLeads = (importedLeads: Lead[], appendMode: boolean) => {
    if (appendMode) {
      setLeads((prev) => [...prev, ...importedLeads]);
    } else {
      setLeads(importedLeads);
    }
    if (importedLeads.length > 0) {
      setSelectedLeadId(importedLeads[0].id);
    }
    setActiveTab('campaign');
  };

  // Calendar Handlers
  const handleBookCalendarSlot = (slotId: string, lead: Lead, notes: string) => {
    setCalendarSlots((prev) =>
      prev.map((slot) =>
        slot.id === slotId
          ? {
              ...slot,
              available: false,
              bookedBy: lead.name,
              leadEmail: lead.email,
              leadPhone: lead.phone,
              title: `${lead.company || lead.name} Discovery Demo with ${campaignSettings.senderName}`,
              meetLink: `https://meet.google.com/${Math.random().toString(36).substring(2, 5)}-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 5)}`,
            }
          : slot
      )
    );
  };

  const handleAddCalendarSlot = (date: string, time: string) => {
    const newSlot: CalendarSlot = {
      id: `slot-${Date.now()}`,
      date,
      time,
      dateTimeIso: `${date}T${time.includes('PM') ? '15:00:00Z' : '10:00:00Z'}`,
      available: true,
    };
    setCalendarSlots((prev) => [...prev, newSlot]);
  };

  const handleCancelCalendarSlot = (id: string) => {
    setCalendarSlots((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              available: true,
              bookedBy: undefined,
              leadEmail: undefined,
              leadPhone: undefined,
              title: undefined,
              meetLink: undefined,
            }
          : s
      )
    );
  };

  const handleOpenLeadInSimulator = (leadId: string) => {
    setSelectedLeadId(leadId);
    setActiveTab('simulator');
  };

  const handleStartCampaignWithSelected = (selectedIds: string[]) => {
    const selected = leads.filter((l) => selectedIds.includes(l.id));
    const unselected = leads.filter((l) => !selectedIds.includes(l.id));
    setLeads([...selected, ...unselected]);
    setActiveTab('campaign');
  };

  const pendingCount = leads.filter((l) => l.status === 'Pending').length;
  const scheduledCount = leads.filter((l) => l.status === 'Meeting Scheduled').length;

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#4A443F] flex flex-col font-sans">
      {/* Global Modals */}
      <ExcelUploadModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        onImportLeads={handleImportLeads}
        defaultCountryCode={campaignSettings.defaultCountryCode || '+91'}
      />

      <ChannelConfigModal
        isOpen={isChannelModalOpen}
        onClose={() => setIsChannelModalOpen(false)}
        settings={channelSettings}
        onSaveSettings={setChannelSettings}
        campaignSettings={campaignSettings}
        availableSlots={calendarSlots}
      />

      {/* Main Header with Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingCount={pendingCount}
        scheduledCount={scheduledCount}
        onOpenExcelUpload={() => setIsExcelModalOpen(true)}
      />

      {/* Main View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'campaign' && (
          <BatchCampaignRunner
            leads={leads}
            availableSlots={calendarSlots}
            campaignSettings={campaignSettings}
            channelSettings={channelSettings}
            templates={templates}
            onUpdateLead={handleUpdateLead}
            onUpdateSettings={setCampaignSettings}
            onResetAllLeadsToPending={handleResetAllLeadsToPending}
            onBookCalendarSlot={handleBookCalendarSlot}
            onOpenChannelConfig={() => setIsChannelModalOpen(true)}
            onOpenExcelUpload={() => setIsExcelModalOpen(true)}
            onSelectLeadForSimulator={handleOpenLeadInSimulator}
          />
        )}

        {activeTab === 'sheets' && (
          <SheetsView
            leads={leads}
            onAddLead={handleAddLead}
            onUpdateLead={handleUpdateLead}
            onDeleteLead={handleDeleteLead}
            onResetLeads={handleResetLeads}
            onSelectLeadForSimulator={handleOpenLeadInSimulator}
            onOpenExcelUpload={() => setIsExcelModalOpen(true)}
            onStartCampaignWithSelected={handleStartCampaignWithSelected}
          />
        )}

        {activeTab === 'simulator' && (
          <MessageSimulator
            leads={leads}
            selectedLeadId={selectedLeadId}
            onSelectLead={setSelectedLeadId}
            availableSlots={calendarSlots}
            campaignSettings={campaignSettings}
            channelSettings={channelSettings}
            templates={templates}
            onUpdateLead={handleUpdateLead}
            onUpdateSettings={setCampaignSettings}
            onBookCalendarSlot={handleBookCalendarSlot}
          />
        )}

        {activeTab === 'templates' && (
          <TemplateManagerView
            templates={templates}
            onUpdateTemplates={setTemplates}
            campaignSettings={campaignSettings}
            onUpdateSettings={setCampaignSettings}
            leads={leads}
            availableSlots={calendarSlots}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarView
            slots={calendarSlots}
            onAddSlot={handleAddCalendarSlot}
            onCancelSlot={handleCancelCalendarSlot}
          />
        )}

        {activeTab === 'analytics' && <CampaignAnalytics leads={leads} />}

        {activeTab === 'n8n' && <N8nWorkflowView />}

        {activeTab === 'architecture' && <ArchitectureView />}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E8E4DF] bg-white/80 py-4 text-center text-xs text-[#8C847C]">
        OmniReach AI • Automated WhatsApp & Email Outreach Engine with Spreadsheet Ingestion & Google Calendar Sync • Powered by Gemini 3.7
      </footer>
    </div>
  );
}
