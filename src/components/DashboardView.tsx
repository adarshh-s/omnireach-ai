import React, { useEffect, useState } from 'react';
import { Users, Send, MessageCircle, CalendarCheck2, Clock, TrendingUp } from 'lucide-react';
import { Lead } from '../types';
import { supabase, isSupabaseBrowserConfigured } from '../lib/supabaseClient';

interface DashboardViewProps {
  leads: Lead[];
  userId?: string | null;
  onOpenExcelUpload: () => void;
}

interface CloudCounts {
  activeCampaigns: number;
  activeConversations: number;
  meetingsBookedCloud: number;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ leads, userId, onOpenExcelUpload }) => {
  const [cloud, setCloud] = useState<CloudCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isSupabaseBrowserConfigured || !supabase || !userId) {
      setCloud(null);
      return;
    }

    const load = async () => {
      const [
        { count: activeCampaigns },
        { count: activeWaConversations },
        { count: activeEmConversations },
        { count: bookedWa },
        { count: bookedEm },
      ] = await Promise.all([
        supabase!.from('campaigns').select('id', { count: 'exact', head: true }).eq('org_id', userId).eq('status', 'running'),
        supabase!.from('whatsapp_conversations').select('id', { count: 'exact', head: true }).eq('org_id', userId).eq('status', 'active'),
        supabase!.from('email_conversations').select('id', { count: 'exact', head: true }).eq('org_id', userId).eq('status', 'active'),
        supabase!.from('whatsapp_conversations').select('id', { count: 'exact', head: true }).eq('org_id', userId).eq('status', 'confirmed'),
        supabase!.from('email_conversations').select('id', { count: 'exact', head: true }).eq('org_id', userId).eq('status', 'confirmed'),
      ]);
      if (cancelled) return;
      setCloud({
        activeCampaigns: activeCampaigns || 0,
        activeConversations: (activeWaConversations || 0) + (activeEmConversations || 0),
        meetingsBookedCloud: (bookedWa || 0) + (bookedEm || 0),
      });
    };

    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId]);

  const totalClients = leads.length;
  const contactedCount = leads.filter((l) => l.status !== 'Pending').length;
  const meetingsBookedLocal = leads.filter((l) => l.status === 'Meeting Scheduled').length;
  const failedCount = leads.filter((l) => l.whatsAppStatus === 'Failed' || l.emailStatus === 'Failed').length;

  const tiles = [
    {
      label: 'Total Clients',
      value: totalClients,
      icon: Users,
      accent: 'text-[#4285F4] bg-[#4285F4]/10',
    },
    {
      label: 'Active Campaigns',
      value: cloud ? cloud.activeCampaigns : '—',
      icon: Send,
      accent: 'text-[#25D366] bg-[#25D366]/10',
    },
    {
      label: 'Active Conversations',
      value: cloud ? cloud.activeConversations : '—',
      icon: MessageCircle,
      accent: 'text-[#128C7E] bg-[#128C7E]/10',
    },
    {
      label: 'Meetings Booked',
      value: cloud ? cloud.meetingsBookedCloud : meetingsBookedLocal,
      icon: CalendarCheck2,
      accent: 'text-[#8BA888] bg-[#8BA888]/15',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E8E4DF] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-[#8C847C] mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-[#4285F4]" />
            <span>Overview</span>
          </div>
          <h2 className="text-xl font-bold text-[#2D2926]">Control Center</h2>
          <p className="text-xs sm:text-sm text-[#5C5651] mt-0.5">
            How many clients need attention, how campaigns are performing, and how many meetings are booked.
          </p>
        </div>
        {totalClients === 0 && (
          <button
            onClick={onOpenExcelUpload}
            className="px-4 py-2 rounded-full bg-[#2D2926] hover:bg-[#1A1817] text-white text-xs font-semibold shadow-sm transition-all"
          >
            Import your first clients
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} className="bg-white border border-[#E8E4DF] rounded-2xl p-5 shadow-xs">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${tile.accent}`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <div className="text-2xl font-bold text-[#2D2926]">{tile.value}</div>
              <div className="text-xs text-[#8C847C] mt-0.5">{tile.label}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E8E4DF] rounded-2xl p-6 shadow-xs">
          <h3 className="font-semibold text-sm text-[#2D2926] mb-3">Client Pipeline</h3>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#5C5651]">Contacted</span>
              <span className="font-semibold text-[#2D2926]">{contactedCount} / {totalClients}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#5C5651]">Meetings booked</span>
              <span className="font-semibold text-[#537050]">{meetingsBookedLocal}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#5C5651]">Failed dispatches</span>
              <span className="font-semibold text-rose-600">{failedCount}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#E8E4DF] rounded-2xl p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-[#8C847C]" />
            <h3 className="font-semibold text-sm text-[#2D2926]">Pending Follow-ups</h3>
          </div>
          <p className="text-xs text-[#8C847C] leading-relaxed">
            Automated multi-day follow-up sequences aren't built yet — this will populate once the automation engine
            (scheduled follow-ups, reminders) ships. For now, replies are handled live by the AI booking bot the moment
            a client messages back.
          </p>
        </div>
      </div>

      {!isSupabaseBrowserConfigured && (
        <p className="text-[11px] text-[#8C847C] text-center">
          Running in local/standalone mode — connect Supabase for org-wide campaign and conversation metrics.
        </p>
      )}
    </div>
  );
};
