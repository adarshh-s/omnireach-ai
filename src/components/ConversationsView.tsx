import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  MessageCircle,
  Phone,
  Mail,
  Video,
  CheckCircle2,
  XCircle,
  UserCog,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { Lead } from '../types';

interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

interface RawConversation {
  id: string;
  phone?: string;
  client_email?: string;
  subject?: string;
  lead_id?: string;
  client_id?: string;
  campaign_recipient_id?: string;
  lead_name?: string;
  lead_email?: string;
  lead_company?: string;
  status: 'active' | 'confirmed' | 'declined' | 'handoff';
  history: ConversationTurn[];
  meeting_date?: string;
  meeting_time?: string;
  meet_link?: string;
  last_message_at: string;
}

interface UnifiedConversation extends RawConversation {
  channel: 'whatsapp' | 'email';
  contact: string;
}

interface ConversationsViewProps {
  leads: Lead[];
  onUpdateLead: (lead: Lead) => void;
  accessToken?: string | null;
}

const STATUS_STYLES: Record<RawConversation['status'], { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  active: { label: 'In Conversation', className: 'bg-[#4285F4]/10 text-[#1E4FA6] border-[#4285F4]/30', icon: MessageCircle },
  confirmed: { label: 'Meeting Booked', className: 'bg-[#8BA888]/15 text-[#537050] border-[#8BA888]/30', icon: CheckCircle2 },
  declined: { label: 'Not Interested', className: 'bg-[#E8E4DF] text-[#8C847C] border-[#DDD6CB]', icon: XCircle },
  handoff: { label: 'Needs a Human', className: 'bg-amber-100 text-amber-800 border-amber-300', icon: UserCog },
};

export const ConversationsView: React.FC<ConversationsViewProps> = ({ leads, onUpdateLead, accessToken }) => {
  const [conversations, setConversations] = useState<UnifiedConversation[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const syncedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const fetchConversations = async () => {
      if (!accessToken) {
        if (!cancelled) {
          setConfigured(false);
          setLoading(false);
        }
        return;
      }
      try {
        const headers = { Authorization: `Bearer ${accessToken}` };
        const [waRes, emRes] = await Promise.all([
          fetch('/api/whatsapp/conversations', { headers }),
          fetch('/api/email/conversations', { headers }),
        ]);
        const [waData, emData] = await Promise.all([waRes.json(), emRes.json()]);
        if (cancelled) return;

        setConfigured(!!waData.configured || !!emData.configured);

        const waConvs: UnifiedConversation[] = (Array.isArray(waData.conversations) ? waData.conversations : []).map(
          (c: RawConversation) => ({ ...c, channel: 'whatsapp' as const, contact: c.phone || '' })
        );
        const emConvs: UnifiedConversation[] = (Array.isArray(emData.conversations) ? emData.conversations : []).map(
          (c: RawConversation) => ({ ...c, channel: 'email' as const, contact: c.client_email || '' })
        );

        const merged = [...waConvs, ...emConvs].sort(
          (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
        );
        setConversations(merged);
      } catch {
        if (!cancelled) setConfigured(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchConversations();
    const interval = setInterval(fetchConversations, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accessToken]);

  // Sync confirmed bookings back into the Leads table (matched by phone or email).
  useEffect(() => {
    conversations.forEach((conv) => {
      if (conv.status !== 'confirmed' || !conv.meeting_date) return;
      if (syncedIdsRef.current.has(conv.id)) return;

      const matchedLead =
        conv.channel === 'whatsapp'
          ? leads.find((l) => {
              const convDigits = conv.contact.replace(/\D/g, '');
              const leadDigits = l.phone.replace(/\D/g, '');
              return leadDigits.endsWith(convDigits) || convDigits.endsWith(leadDigits);
            })
          : leads.find((l) => l.email.toLowerCase() === conv.contact.toLowerCase());

      if (matchedLead && matchedLead.status !== 'Meeting Scheduled') {
        onUpdateLead({
          ...matchedLead,
          status: 'Meeting Scheduled',
          meetingDate: conv.meeting_date,
          meetingTime: conv.meeting_time,
          notes: conv.meet_link
            ? `${matchedLead.notes ? matchedLead.notes + '\n' : ''}Booked via AI ${conv.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} bot — Meet link: ${conv.meet_link}`
            : matchedLead.notes,
        });
      }
      syncedIdsRef.current.add(conv.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  if (loading) {
    return (
      <div className="bg-white border border-[#E8E4DF] rounded-[24px] p-10 shadow-sm text-center text-sm text-[#8C847C]">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#8BA888]" />
        Loading AI conversations…
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="bg-white border border-[#E8E4DF] rounded-[24px] p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-[#2D2926]">
              {accessToken ? 'AI Booking Bot not configured yet' : 'Sign in to view the AI Inbox'}
            </h3>
            <p className="text-xs text-[#5C5651] mt-1.5 leading-relaxed max-w-xl">
              This panel shows live WhatsApp and Email conversations the AI bot is handling — replying to prospects,
              gathering answers, and booking real Google Calendar meetings when a time is confirmed. It needs Supabase
              (to store conversation state) and Google Calendar (to create real events). See{' '}
              <code className="bg-[#F5F2EB] px-1 py-0.5 rounded text-[11px]">.env.example</code> for setup steps, then run{' '}
              <code className="bg-[#F5F2EB] px-1 py-0.5 rounded text-[11px]">supabase/schema.sql</code> in your Supabase
              project.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E8E4DF] rounded-[24px] p-6 shadow-sm flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-[#8C847C] mb-1">
            <Bot className="w-3.5 h-3.5 text-[#4285F4]" />
            <span>AI Booking Bot</span>
          </div>
          <h2 className="text-xl font-bold text-[#2D2926]">Unified Inbox</h2>
          <p className="text-xs sm:text-sm text-[#5C5651] mt-0.5">
            WhatsApp and Email replies in one place — the AI replies automatically, asks for a time, and books a real
            Google Calendar meeting when confirmed.
          </p>
        </div>
        <span className="text-xs text-[#8C847C] flex items-center gap-1.5 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" />
          Live — refreshes every 8s
        </span>
      </div>

      {conversations.length === 0 ? (
        <div className="bg-white border border-[#E8E4DF] rounded-[24px] p-10 shadow-sm text-center text-sm text-[#8C847C]">
          No conversations yet. Once a prospect replies to a WhatsApp or Email campaign message, it'll show up here.
        </div>
      ) : (
        <div className="space-y-3">
          {conversations.map((conv) => {
            const style = STATUS_STYLES[conv.status] || STATUS_STYLES.active;
            const StatusIcon = style.icon;
            const isExpanded = expandedId === conv.id;
            const lastTurn = conv.history?.[conv.history.length - 1];
            const ChannelIcon = conv.channel === 'whatsapp' ? Phone : Mail;

            return (
              <div
                key={`${conv.channel}-${conv.id}`}
                className="bg-white border border-[#E8E4DF] rounded-[20px] shadow-sm overflow-hidden hover:border-[#8BA888]/40 transition-all"
              >
                <button
                  className="w-full text-left p-4 flex items-start justify-between gap-4"
                  onClick={() => setExpandedId(isExpanded ? null : conv.id)}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        conv.channel === 'whatsapp' ? 'bg-[#25D366]/10' : 'bg-[#4285F4]/10'
                      }`}
                    >
                      <ChannelIcon className={`w-4 h-4 ${conv.channel === 'whatsapp' ? 'text-[#128C7E]' : 'text-[#4285F4]'}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-[#2D2926]">
                          {conv.lead_name || 'Unknown Contact'}
                        </span>
                        {conv.lead_company && <span className="text-xs text-[#8C847C]">• {conv.lead_company}</span>}
                        {conv.campaign_recipient_id && (
                          <span className="text-[10px] text-[#8C847C] bg-[#F5F2EB] border border-[#E8E4DF] px-1.5 py-0.5 rounded-full">
                            From campaign
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${style.className}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {style.label}
                        </span>
                      </div>
                      <div className="text-xs text-[#8C847C] mt-0.5 font-mono">
                        {conv.channel === 'whatsapp' ? `+${conv.contact}` : conv.contact}
                      </div>
                      {lastTurn && (
                        <p className="text-xs text-[#5C5651] mt-1.5 truncate max-w-lg">
                          <span className="font-medium">{lastTurn.role === 'user' ? 'Them: ' : 'Bot: '}</span>
                          {lastTurn.text}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {conv.status === 'confirmed' && conv.meeting_date && (
                      <div className="text-right text-xs">
                        <div className="flex items-center gap-1 text-[#537050] font-semibold justify-end">
                          <Clock className="w-3 h-3" />
                          {conv.meeting_date} {conv.meeting_time}
                        </div>
                        {conv.meet_link && (
                          <a
                            href={conv.meet_link}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-[#4285F4] hover:underline justify-end mt-0.5"
                          >
                            <Video className="w-3 h-3" />
                            Meet Link
                          </a>
                        )}
                      </div>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-[#8C847C]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#8C847C]" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-[#E8E4DF] bg-[#FAF9F6] p-4 space-y-2 max-h-80 overflow-y-auto">
                    {conv.subject && <p className="text-[11px] text-[#8C847C] font-medium mb-1">Subject: {conv.subject}</p>}
                    {(conv.history || []).map((turn, idx) => (
                      <div
                        key={idx}
                        className={`flex ${turn.role === 'user' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                            turn.role === 'user'
                              ? 'bg-white border border-[#E8E4DF] text-[#2D2926]'
                              : 'bg-[#25D366]/10 border border-[#25D366]/30 text-[#0F5132]'
                          }`}
                        >
                          {turn.text}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
