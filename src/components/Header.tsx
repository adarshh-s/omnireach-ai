import React from 'react';
import {
  Send,
  Table,
  Calendar,
  Network,
  BookOpen,
  Settings2,
  Sparkles,
  BarChart3,
  FileSpreadsheet,
  Upload,
  MessageSquare,
  Mail,
  Zap,
} from 'lucide-react';

export type ActiveTab =
  | 'campaign'
  | 'sheets'
  | 'simulator'
  | 'templates'
  | 'calendar'
  | 'analytics'
  | 'n8n'
  | 'architecture';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  pendingCount: number;
  scheduledCount: number;
  onOpenExcelUpload: () => void;
  onOpenChannelConfig: () => void;
}

interface TabItem {
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  isSpecial?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  pendingCount,
  scheduledCount,
  onOpenExcelUpload,
  onOpenChannelConfig,
}) => {
  const tabs: TabItem[] = [
    {
      id: 'campaign',
      label: 'Batch Outreach',
      icon: Send,
      badge: pendingCount > 0 ? `${pendingCount} Ready` : undefined,
      isSpecial: true,
    },
    {
      id: 'sheets',
      label: 'Spreadsheet & Leads',
      icon: Table,
    },
    {
      id: 'simulator',
      label: 'Chat & Email Preview',
      icon: MessageSquare,
    },
    {
      id: 'templates',
      label: 'AI Copy & Templates',
      icon: Settings2,
    },
    {
      id: 'calendar',
      label: 'Google Calendar',
      icon: Calendar,
      badge: scheduledCount > 0 ? `${scheduledCount} Booked` : undefined,
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: BarChart3,
    },
    {
      id: 'n8n',
      label: 'n8n & Webhooks',
      icon: Network,
    },
    {
      id: 'architecture',
      label: 'Setup Guide',
      icon: BookOpen,
    },
  ];

  return (
    <header className="border-b border-[#E8E4DF] bg-white/95 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Branding */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#25D366] via-[#128C7E] to-[#4285F4] flex items-center justify-center text-white shadow-sm ring-2 ring-[#25D366]/20">
              <Zap className="w-5 h-5 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base text-[#2D2926] tracking-tight">
                  OmniReach AI
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse"></span>
                  WhatsApp + Email
                </span>
              </div>
              <p className="text-[11px] text-[#8C847C] hidden sm:block">
                Excel Spreadsheet Ingestion • AI Personalization • Automated Dispatch
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              id="header-channel-config-btn"
              onClick={onOpenChannelConfig}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-[#5D554D] bg-[#F5F2EB] hover:bg-[#EAE5DC] border border-[#DDD6CB] transition-colors"
              title="Configure WhatsApp & Email API keys"
            >
              <Settings2 className="w-3.5 h-3.5 text-[#8C847C]" />
              <span className="hidden md:inline">Channel Setup</span>
            </button>

            <button
              id="header-import-excel-btn"
              onClick={onOpenExcelUpload}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg text-white bg-[#2D2926] hover:bg-[#1A1817] shadow-sm transition-all active:scale-[0.98]"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Excel / CSV</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-2 -mb-px border-t border-[#F0ECE6]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? tab.isSpecial
                      ? 'bg-[#25D366]/10 text-[#0F5132] font-semibold border border-[#25D366]/30 shadow-xs'
                      : 'bg-[#2D2926] text-white shadow-xs'
                    : 'text-[#6C635B] hover:text-[#2D2926] hover:bg-[#F2EFE9]'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 ${
                    isActive
                      ? tab.isSpecial
                        ? 'text-[#128C7E]'
                        : 'text-white'
                      : 'text-[#8C847C]'
                  }`}
                />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
                      isActive
                        ? tab.isSpecial
                          ? 'bg-[#25D366] text-white'
                          : 'bg-white/20 text-white'
                        : 'bg-[#EAE5DC] text-[#5D554D]'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
