import React, { useState } from 'react';
import {
  Table,
  Plus,
  Send,
  MessageSquare,
  Mail,
  Download,
  RotateCcw,
  Search,
  Filter,
  CheckCircle2,
  Calendar,
  Sparkles,
  ExternalLink,
  Edit2,
  Trash2,
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  Layers,
  CheckSquare,
  Square,
  Clock,
} from 'lucide-react';
import { Lead, LeadStatus, ChannelDeliveryStatus } from '../types';
import { exportLeadsToExcel } from '../utils/excelParser';
import { generateWhatsAppLink, generateMailtoLink } from '../utils/outreachEngine';

interface SheetsViewProps {
  leads: Lead[];
  onAddLead: (lead: Lead) => void;
  onUpdateLead: (lead: Lead) => void;
  onDeleteLead: (id: string) => void;
  onResetLeads: () => void;
  onSelectLeadForSimulator: (leadId: string) => void;
  onOpenExcelUpload: () => void;
  onStartCampaignWithSelected?: (selectedIds: string[]) => void;
}

export const SheetsView: React.FC<SheetsViewProps> = ({
  leads,
  onAddLead,
  onUpdateLead,
  onDeleteLead,
  onResetLeads,
  onSelectLeadForSimulator,
  onOpenExcelUpload,
  onStartCampaignWithSelected,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterChannel, setFilterChannel] = useState<string>('ALL');
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  // New Lead Form State
  const [newLead, setNewLead] = useState({
    name: '',
    company: '',
    phone: '',
    email: '',
    country: '',
    notes: '',
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLead.name) return;

    const lead: Lead = {
      id: `lead-${Date.now()}`,
      name: newLead.name,
      company: newLead.company || 'Prospective Client',
      phone: newLead.phone.startsWith('+')
        ? newLead.phone
        : `+91${newLead.phone.replace(/\D/g, '')}`,
      rawPhone: newLead.phone,
      email: newLead.email,
      country: newLead.country || undefined,
      status: 'Pending',
      whatsAppStatus: 'Pending',
      emailStatus: 'Pending',
      notes: newLead.notes || '',
      lastContacted: '',
      isValidPhone: Boolean(newLead.phone && newLead.phone.length >= 7),
      isValidEmail: Boolean(newLead.email && newLead.email.includes('@')),
    };

    onAddLead(lead);
    setNewLead({ name: '', company: '', phone: '', email: '', country: '', notes: '' });
    setIsAddingLead(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLead) return;
    onUpdateLead(editingLead);
    setEditingLead(null);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredLeads.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredLeads.map((l) => l.id));
    }
  };

  const toggleSelectLead = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Direct single actions
  const handleQuickWhatsApp = (lead: Lead) => {
    const text = lead.whatsAppMessage || `Hi ${lead.name.split(' ')[0]}! Reaching out regarding a quick demo. Let me know if you'd like a quick overview!`;
    const url = generateWhatsAppLink(lead.phone, text);
    window.open(url, '_blank');

    onUpdateLead({
      ...lead,
      status: 'Contacted',
      whatsAppStatus: 'Delivered',
      channelUsed: 'whatsapp',
      lastContacted: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
  };

  const handleQuickEmail = (lead: Lead) => {
    const subject = lead.emailSubject || `Introduction & 10-min Demo for ${lead.company}`;
    const body = lead.emailBody || `Hi ${lead.name.split(' ')[0]},\n\nI hope you're doing well.\n\nI'm reaching out regarding automated client outreach solutions for ${lead.company}.\n\nBest regards`;
    const url = generateMailtoLink(lead.email, subject, body);
    window.open(url, '_blank');

    onUpdateLead({
      ...lead,
      status: 'Contacted',
      emailStatus: 'Sent',
      channelUsed: 'email',
      lastContacted: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
  };

  const filteredLeads = leads.filter((l) => {
    const matchesSearch =
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.phone.includes(searchTerm) ||
      l.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      filterStatus === 'ALL' ||
      (filterStatus === 'PENDING' && l.status === 'Pending') ||
      (filterStatus === 'CONTACTED' && (l.status === 'Contacted' || l.status === 'Interested')) ||
      (filterStatus === 'BOOKED' && l.status === 'Meeting Scheduled');

    const matchesChannel =
      filterChannel === 'ALL' ||
      (filterChannel === 'WA_SENT' && l.whatsAppStatus !== 'Pending') ||
      (filterChannel === 'EMAIL_SENT' && l.emailStatus !== 'Pending') ||
      (filterChannel === 'REPLIED' && (l.whatsAppStatus === 'Replied' || l.emailStatus === 'Replied'));

    return matchesSearch && matchesStatus && matchesChannel;
  });

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="bg-white rounded-2xl border border-[#E8E4DF] p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#2D2926]">
                Client Outreach Spreadsheet & Lead Records
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FAF8F5] border border-[#DDD6CB] text-[#6C635B]">
                {leads.length} Total Rows
              </span>
            </div>
            <p className="text-xs text-[#7A7269] mt-0.5">
              Live two-way synced contact records. Ingest Excel sheets, monitor WhatsApp & Email delivery status, and launch targeted sequences.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="sheet-add-lead-btn"
              onClick={() => setIsAddingLead(!isAddingLead)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#FAF8F5] hover:bg-[#F2EFE9] border border-[#DDD6CB] text-[#2D2926] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Lead</span>
            </button>

            <button
              id="sheet-import-excel-btn"
              onClick={onOpenExcelUpload}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#FAF8F5] hover:bg-[#F2EFE9] border border-[#DDD6CB] text-[#2D2926] transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-[#8C847C]" />
              <span>Import Sheet</span>
            </button>

            <button
              id="sheet-export-excel-btn"
              onClick={() => exportLeadsToExcel(leads)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#FAF8F5] hover:bg-[#F2EFE9] border border-[#DDD6CB] text-[#2D2926] transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#8C847C]" />
              <span>Export Excel</span>
            </button>

            <button
              id="sheet-reset-btn"
              onClick={onResetLeads}
              className="p-2 text-xs font-semibold rounded-lg text-[#8C847C] hover:text-[#2D2926] hover:bg-[#F2EFE9] border border-[#DDD6CB] transition-colors"
              title="Reset to initial sample leads"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filters & Search Row */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-4 pt-4 border-t border-[#F0ECE6]">
          {/* Search Box */}
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-[#8C847C] absolute left-3 top-2.5" />
            <input
              id="sheet-search-input"
              type="text"
              placeholder="Search by name, company, phone, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg pl-9 pr-3 py-2 text-xs text-[#2D2926] placeholder-[#A69F96] focus:ring-1 focus:ring-[#25D366] focus:border-[#25D366]"
            />
          </div>

          {/* Status Filter */}
          <div className="sm:col-span-3">
            <select
              id="sheet-status-filter"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-2 text-xs text-[#2D2926]"
            >
              <option value="ALL">All Lead Statuses</option>
              <option value="PENDING">Pending Outreach</option>
              <option value="CONTACTED">Contacted / Interested</option>
              <option value="BOOKED">Meeting Booked</option>
            </select>
          </div>

          {/* Channel Status Filter */}
          <div className="sm:col-span-3">
            <select
              id="sheet-channel-filter"
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value)}
              className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-2 text-xs text-[#2D2926]"
            >
              <option value="ALL">All Delivery Statuses</option>
              <option value="WA_SENT">WhatsApp Delivered</option>
              <option value="EMAIL_SENT">Email Sent</option>
              <option value="REPLIED">Client Replied</option>
            </select>
          </div>
        </div>

        {/* Batch Selected Actions Bar */}
        {selectedIds.length > 0 && (
          <div className="mt-3 p-2.5 bg-[#E8F5E9] border border-[#C8E6C9] rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-[#128C7E]">
              {selectedIds.length} leads selected
            </span>
            <div className="flex items-center gap-2">
              {onStartCampaignWithSelected && (
                <button
                  onClick={() => onStartCampaignWithSelected(selectedIds)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#25D366] text-white font-semibold text-xs shadow-xs hover:bg-[#1EBE5D]"
                >
                  <Send className="w-3 h-3" />
                  <span>Launch Sequence for Selected</span>
                </button>
              )}
              <button
                onClick={() => setSelectedIds([])}
                className="px-2.5 py-1.5 rounded-lg bg-white text-[#5D554D] font-medium text-xs hover:bg-[#F2EFE9] border border-[#C8E6C9]"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inline Add Lead Form */}
      {isAddingLead && (
        <form
          onSubmit={handleAddSubmit}
          className="bg-white rounded-2xl border border-[#25D366]/40 p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#2D2926]">Add New Client Contact</h3>
            <button
              type="button"
              onClick={() => setIsAddingLead(false)}
              className="text-xs text-[#8C847C] hover:text-[#2D2926]"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                Full Name *
              </label>
              <input
                required
                type="text"
                placeholder="e.g. John Doe"
                value={newLead.name}
                onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs text-[#2D2926]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                Company Name
              </label>
              <input
                type="text"
                placeholder="e.g. Acme Corp"
                value={newLead.company}
                onChange={(e) => setNewLead({ ...newLead, company: e.target.value })}
                className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs text-[#2D2926]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                WhatsApp Phone (E.164) *
              </label>
              <input
                required
                type="text"
                placeholder="e.g. +919876543210"
                value={newLead.phone}
                onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs text-[#2D2926]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                Email Address
              </label>
              <input
                type="email"
                placeholder="e.g. john@acme.com"
                value={newLead.email}
                onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs text-[#2D2926]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">
                Country
              </label>
              <input
                type="text"
                placeholder="e.g. United Arab Emirates"
                value={newLead.country}
                onChange={(e) => setNewLead({ ...newLead, country: e.target.value })}
                className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs text-[#2D2926]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddingLead(false)}
              className="px-3 py-1.5 text-xs text-[#6C635B] hover:bg-[#FAF8F5] rounded-lg border border-[#DDD6CB]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold text-white bg-[#25D366] hover:bg-[#1EBE5D] rounded-lg shadow-xs"
            >
              Save Contact
            </button>
          </div>
        </form>
      )}

      {/* Edit Lead Modal / Form */}
      {editingLead && (
        <form
          onSubmit={handleEditSubmit}
          className="bg-white rounded-2xl border border-[#4285F4]/40 p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#2D2926]">Edit Lead: {editingLead.name}</h3>
            <button
              type="button"
              onClick={() => setEditingLead(null)}
              className="text-xs text-[#8C847C] hover:text-[#2D2926]"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">Name</label>
              <input
                type="text"
                value={editingLead.name}
                onChange={(e) => setEditingLead({ ...editingLead, name: e.target.value })}
                className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">Company</label>
              <input
                type="text"
                value={editingLead.company}
                onChange={(e) => setEditingLead({ ...editingLead, company: e.target.value })}
                className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">Phone</label>
              <input
                type="text"
                value={editingLead.phone}
                onChange={(e) => setEditingLead({ ...editingLead, phone: e.target.value })}
                className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">Email</label>
              <input
                type="email"
                value={editingLead.email}
                onChange={(e) => setEditingLead({ ...editingLead, email: e.target.value })}
                className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">Country</label>
              <input
                type="text"
                value={editingLead.country || ''}
                onChange={(e) => setEditingLead({ ...editingLead, country: e.target.value })}
                className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#8C847C] mb-1">Notes / Remarks</label>
            <input
              type="text"
              value={editingLead.notes || ''}
              onChange={(e) => setEditingLead({ ...editingLead, notes: e.target.value })}
              className="w-full bg-[#FAF8F5] border border-[#DDD6CB] rounded-lg px-3 py-1.5 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingLead(null)}
              className="px-3 py-1.5 text-xs text-[#6C635B] hover:bg-[#FAF8F5] rounded-lg border border-[#DDD6CB]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold text-white bg-[#2D2926] hover:bg-[#1A1817] rounded-lg shadow-xs"
            >
              Update Lead
            </button>
          </div>
        </form>
      )}

      {/* Main Leads Table */}
      <div className="bg-white rounded-2xl border border-[#E8E4DF] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAF8F5] border-b border-[#E8E4DF] text-[#7A7269] font-semibold">
                <th className="py-3 px-3.5 w-10 text-center">
                  <button
                    onClick={toggleSelectAll}
                    className="text-[#8C847C] hover:text-[#2D2926]"
                    title="Select All"
                  >
                    {selectedIds.length === filteredLeads.length && filteredLeads.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-[#25D366]" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-3">Contact & Company</th>
                <th className="py-3 px-3">WhatsApp Number</th>
                <th className="py-3 px-3">Email Address</th>
                <th className="py-3 px-3">WhatsApp Status</th>
                <th className="py-3 px-3">Email Status</th>
                <th className="py-3 px-3">Lead Status</th>
                <th className="py-3 px-3">Last Contacted</th>
                <th className="py-3 px-3 text-right">Quick Dispatch & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0ECE6]">
              {filteredLeads.length > 0 ? (
                filteredLeads.map((lead) => {
                  const isSelected = selectedIds.includes(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      className={`hover:bg-[#FAF9F6] transition-colors ${
                        isSelected ? 'bg-[#25D366]/5' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3.5 text-center">
                        <button
                          onClick={() => toggleSelectLead(lead.id)}
                          className="text-[#8C847C] hover:text-[#2D2926]"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-[#25D366]" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Name & Company */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-[#2D2926]">{lead.name}</div>
                        <div className="text-[11px] text-[#7A7269]">
                          {lead.company}
                          {lead.country && <span className="text-[#A69F96]"> · {lead.country}</span>}
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-3">
                        <div className="font-mono text-[#2D2926] flex items-center gap-1">
                          <span>{lead.phone}</span>
                          {lead.isValidPhone ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#25D366]" title="Valid E.164"></span>
                          ) : (
                            <span className="text-[10px] text-[#D93025]">Invalid</span>
                          )}
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3 px-3">
                        <div className="text-[#4A443F] truncate max-w-[180px]">{lead.email}</div>
                      </td>

                      {/* WhatsApp Status */}
                      <td className="py-3 px-3">
                        {lead.whatsAppStatus === 'Pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#F5F2EB] text-[#7A7269] border border-[#DDD6CB]">
                            <Clock className="w-2.5 h-2.5" /> Pending
                          </span>
                        )}
                        {lead.whatsAppStatus === 'Queued' && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
                            title={lead.scheduledFor ? `Scheduled for ${new Date(lead.scheduledFor).toLocaleString()}` : undefined}
                          >
                            <Clock className="w-2.5 h-2.5" /> Scheduled
                          </span>
                        )}
                        {lead.whatsAppStatus === 'Delivered' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#E8F5E9] text-[#128C7E] border border-[#C8E6C9]">
                            <CheckCircle2 className="w-2.5 h-2.5 text-[#25D366]" /> Delivered
                          </span>
                        )}
                        {lead.whatsAppStatus === 'Replied' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD]">
                            <MessageSquare className="w-2.5 h-2.5" /> Replied
                          </span>
                        )}
                        {lead.whatsAppStatus === 'Failed' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FDE8E8] text-[#9B1C1C] border border-[#F8B4B4]">
                            <AlertTriangle className="w-2.5 h-2.5" /> Failed
                          </span>
                        )}
                      </td>

                      {/* Email Status */}
                      <td className="py-3 px-3">
                        {lead.emailStatus === 'Pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#F5F2EB] text-[#7A7269] border border-[#DDD6CB]">
                            <Clock className="w-2.5 h-2.5" /> Pending
                          </span>
                        )}
                        {lead.emailStatus === 'Queued' && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
                            title={lead.scheduledFor ? `Scheduled for ${new Date(lead.scheduledFor).toLocaleString()}` : undefined}
                          >
                            <Clock className="w-2.5 h-2.5" /> Scheduled
                          </span>
                        )}
                        {(lead.emailStatus === 'Sent' || lead.emailStatus === 'Delivered') && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#E8F0FE] text-[#1967D2] border border-[#D2E3FC]">
                            <Mail className="w-2.5 h-2.5 text-[#4285F4]" /> Sent
                          </span>
                        )}
                        {(lead.emailStatus === 'Opened' || lead.emailStatus === 'Clicked') && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                            <Sparkles className="w-2.5 h-2.5" /> {lead.emailStatus}
                          </span>
                        )}
                        {lead.emailStatus === 'Failed' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FDE8E8] text-[#9B1C1C] border border-[#F8B4B4]">
                            <AlertTriangle className="w-2.5 h-2.5" /> Failed
                          </span>
                        )}
                      </td>

                      {/* Lead Status */}
                      <td className="py-3 px-3">
                        {lead.status === 'Meeting Scheduled' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]">
                            <Calendar className="w-2.5 h-2.5" /> {lead.meetingTime || 'Booked'}
                          </span>
                        ) : lead.status === 'Contacted' ? (
                          <span className="text-[11px] font-medium text-[#128C7E]">Contacted</span>
                        ) : (
                          <span className="text-[11px] text-[#8C847C]">{lead.status}</span>
                        )}
                      </td>

                      {/* Last Contacted */}
                      <td className="py-3 px-3 text-[#7A7269] text-[11px]">
                        {lead.lastContacted || '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {/* Quick WhatsApp Send */}
                          <button
                            id={`quick-wa-${lead.id}`}
                            onClick={() => handleQuickWhatsApp(lead)}
                            className="p-1.5 text-[#128C7E] hover:bg-[#E8F5E9] rounded-md transition-colors"
                            title="Direct Send via WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-[#25D366]" />
                          </button>

                          {/* Quick Email Send */}
                          <button
                            id={`quick-em-${lead.id}`}
                            onClick={() => handleQuickEmail(lead)}
                            className="p-1.5 text-[#1967D2] hover:bg-[#E8F0FE] rounded-md transition-colors"
                            title="Direct Send via Email"
                          >
                            <Mail className="w-3.5 h-3.5 text-[#4285F4]" />
                          </button>

                          {/* Open in Simulator */}
                          <button
                            id={`sim-${lead.id}`}
                            onClick={() => onSelectLeadForSimulator(lead.id)}
                            className="p-1.5 text-[#8C847C] hover:text-[#2D2926] hover:bg-[#FAF8F5] rounded-md transition-colors"
                            title="Open in Chat & Email Previewer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => setEditingLead(lead)}
                            className="p-1.5 text-[#8C847C] hover:text-[#2D2926] hover:bg-[#FAF8F5] rounded-md transition-colors"
                            title="Edit Contact"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => onDeleteLead(lead.id)}
                            className="p-1.5 text-[#8C847C] hover:text-[#D93025] hover:bg-[#FDE8E8] rounded-md transition-colors"
                            title="Delete Contact"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-xs text-[#8C847C]">
                    No contacts found matching the search filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
