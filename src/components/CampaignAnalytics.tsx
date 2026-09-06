import React from 'react';
import {
  BarChart3,
  TrendingUp,
  CheckCircle2,
  Calendar,
  Clock,
  MessageSquare,
  Mail,
  AlertTriangle,
  Users,
  Download,
  Percent,
  Sparkles,
} from 'lucide-react';
import { Lead } from '../types';
import { exportLeadsToExcel } from '../utils/excelParser';

interface CampaignAnalyticsProps {
  leads: Lead[];
}

export const CampaignAnalytics: React.FC<CampaignAnalyticsProps> = ({ leads }) => {
  const total = leads.length;
  const pending = leads.filter((l) => l.status === 'Pending').length;
  const scheduled = leads.filter((l) => l.status === 'Meeting Scheduled').length;
  const contacted = leads.filter((l) => l.status === 'Contacted' || l.status === 'Interested').length;
  const notInterested = leads.filter(
    (l) => l.status === 'Not Interested' || l.status === 'Do Not Contact'
  ).length;

  // WhatsApp specific metrics
  const waSent = leads.filter((l) => l.whatsAppStatus !== 'Pending').length;
  const waDelivered = leads.filter(
    (l) => l.whatsAppStatus === 'Delivered' || l.whatsAppStatus === 'Replied'
  ).length;
  const waReplied = leads.filter((l) => l.whatsAppStatus === 'Replied').length;

  // Email specific metrics
  const emailSent = leads.filter((l) => l.emailStatus !== 'Pending').length;
  const emailOpened = leads.filter(
    (l) => l.emailStatus === 'Opened' || l.emailStatus === 'Clicked' || l.emailStatus === 'Replied'
  ).length;
  const emailReplied = leads.filter((l) => l.emailStatus === 'Replied').length;

  const totalDispatched = leads.filter(
    (l) => l.whatsAppStatus !== 'Pending' || l.emailStatus !== 'Pending'
  ).length;

  const demoConversionRate =
    totalDispatched > 0 ? Math.round((scheduled / totalDispatched) * 100) : 0;
  const overallReplyRate =
    totalDispatched > 0
      ? Math.round(((waReplied + emailReplied) / totalDispatched) * 100)
      : 0;

  const handleExport = () => {
    exportLeadsToExcel(
      leads,
      `Outreach_Campaign_Analytics_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-[#E8E4DF] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-[#8C847C] mb-1">
            <BarChart3 className="w-3.5 h-3.5 text-[#25D366]" />
            <span>Outreach Performance & Conversion Funnel</span>
          </div>
          <h2 className="text-xl font-bold text-[#2D2926]">
            WhatsApp & Email Campaign Analytics
          </h2>
          <p className="text-xs sm:text-sm text-[#5C5651] mt-0.5">
            Real-time delivery rates, prospect responses, and Google Meet demo conversion KPIs.
          </p>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white font-bold text-xs shadow-xs transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Analytics Excel</span>
        </button>
      </div>

      {/* 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-[#E8E4DF] shadow-xs space-y-1">
          <div className="flex items-center justify-between text-[#8C847C]">
            <span className="text-xs font-bold uppercase tracking-wider">Demo Conversion Rate</span>
            <TrendingUp className="w-4 h-4 text-[#25D366]" />
          </div>
          <div className="text-2xl font-bold text-[#2D2926]">{demoConversionRate}%</div>
          <p className="text-[11px] text-[#128C7E] font-medium">
            {scheduled} demo bookings from {totalDispatched} dispatched
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-[#E8E4DF] shadow-xs space-y-1">
          <div className="flex items-center justify-between text-[#8C847C]">
            <span className="text-xs font-bold uppercase tracking-wider">Total Meetings Booked</span>
            <Calendar className="w-4 h-4 text-[#4285F4]" />
          </div>
          <div className="text-2xl font-bold text-[#1967D2]">{scheduled}</div>
          <p className="text-[11px] text-[#8C847C]">Synced with Google Calendar</p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-[#E8E4DF] shadow-xs space-y-1">
          <div className="flex items-center justify-between text-[#8C847C]">
            <span className="text-xs font-bold uppercase tracking-wider">WhatsApp Engagement</span>
            <MessageSquare className="w-4 h-4 text-[#25D366]" />
          </div>
          <div className="text-2xl font-bold text-[#2D2926]">
            {waSent > 0 ? Math.round((waReplied / waSent) * 100) : 0}%
          </div>
          <p className="text-[11px] text-[#8C847C]">
            {waReplied} replies from {waDelivered} delivered
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-[#E8E4DF] shadow-xs space-y-1">
          <div className="flex items-center justify-between text-[#8C847C]">
            <span className="text-xs font-bold uppercase tracking-wider">Email Response Rate</span>
            <Mail className="w-4 h-4 text-[#4285F4]" />
          </div>
          <div className="text-2xl font-bold text-[#2D2926]">
            {emailSent > 0 ? Math.round((emailReplied / emailSent) * 100) : 0}%
          </div>
          <p className="text-[11px] text-[#8C847C]">
            {emailReplied} replies • {emailOpened} opened
          </p>
        </div>
      </div>

      {/* Outcome Distribution Bar & Breakdown */}
      <div className="bg-white border border-[#E8E4DF] rounded-2xl p-6 shadow-xs space-y-5">
        <h3 className="font-bold text-sm text-[#2D2926]">Overall Lead Status Distribution</h3>

        {/* Multi-segment Progress Bar */}
        <div className="w-full bg-[#FAF9F6] h-4 rounded-full overflow-hidden flex border border-[#E8E4DF]">
          {total > 0 && (
            <>
              <div
                style={{ width: `${(scheduled / total) * 100}%` }}
                className="bg-[#25D366] h-full"
                title={`Meeting Scheduled: ${scheduled}`}
              />
              <div
                style={{ width: `${(contacted / total) * 100}%` }}
                className="bg-[#4285F4] h-full"
                title={`Interested / Contacted: ${contacted}`}
              />
              <div
                style={{ width: `${(pending / total) * 100}%` }}
                className="bg-amber-400 h-full"
                title={`Pending: ${pending}`}
              />
              <div
                style={{ width: `${(notInterested / total) * 100}%` }}
                className="bg-slate-300 h-full"
                title={`Not Interested: ${notInterested}`}
              />
            </>
          )}
        </div>

        {/* Legend Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-[#25D366]" />
            <span className="text-[#5C5651]">
              <strong>{scheduled}</strong> Meeting Scheduled ({total > 0 ? Math.round((scheduled / total) * 100) : 0}%)
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-[#4285F4]" />
            <span className="text-[#5C5651]">
              <strong>{contacted}</strong> Contacted / Interested
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="text-[#5C5651]">
              <strong>{pending}</strong> Pending ({total > 0 ? Math.round((pending / total) * 100) : 0}%)
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-slate-300" />
            <span className="text-[#5C5651]">
              <strong>{notInterested}</strong> Declined / Unsubscribed
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
