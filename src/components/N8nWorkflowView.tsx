import React, { useState } from 'react';
import {
  Network,
  Download,
  Copy,
  Check,
  Code2,
  Settings,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  PlayCircle,
  FileJson,
  Layers,
  Info,
} from 'lucide-react';
import { N8N_WORKFLOW_JSON, N8N_NODE_BREAKDOWN, NodeDocumentation } from '../data/n8nWorkflowData';

export const N8nWorkflowView: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'visual' | 'json' | 'live_bridge' | 'managed_saas'>('visual');
  const [webhookUrl, setWebhookUrl] = useState(() => {
    return localStorage.getItem('n8n_live_webhook_url') || '';
  });
  const [testPayload, setTestPayload] = useState({
    event: 'lead_campaign_trigger',
    campaignId: 'camp-test-01',
    lead: {
      name: 'Test Lead',
      company: 'Test Company',
      phone: '+15551234567',
      email: 'test-lead@example.com',
      status: 'Pending',
    },
    companyName: 'Your Company',
    timestamp: new Date().toISOString(),
  });
  const [isSending, setIsSending] = useState(false);
  const [webhookResponse, setWebhookResponse] = useState<string | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSaveWebhookUrl = (url: string) => {
    setWebhookUrl(url);
    localStorage.setItem('n8n_live_webhook_url', url);
  };

  const handleSendTestWebhook = async () => {
    setIsSending(true);
    setWebhookResponse(null);
    setWebhookStatus('idle');

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });

      const text = await res.text();
      let formatted = text;
      try {
        formatted = JSON.stringify(JSON.parse(text), null, 2);
      } catch {}

      if (res.ok) {
        setWebhookStatus('success');
        setWebhookResponse(`Status: ${res.status} OK\n\nResponse:\n${formatted}`);
      } else {
        setWebhookStatus('error');
        setWebhookResponse(`HTTP ${res.status}: ${res.statusText}\n\n${formatted}`);
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      setWebhookStatus('error');
      setWebhookResponse(`Connection Failed: ${error.message || 'Check your n8n CORS settings or verify the webhook is active.'}`);
    } finally {
      setIsSending(false);
    }
  };

  const jsonString = JSON.stringify(N8N_WORKFLOW_JSON, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'omnireach_ai_n8n_workflow.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentNodeDoc: NodeDocumentation = N8N_NODE_BREAKDOWN[selectedNodeIndex] || N8N_NODE_BREAKDOWN[0];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-[#E8E4DF] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-[#8C847C] mb-1">
            <Network className="w-3.5 h-3.5 text-[#25D366]" />
            <span>n8n All-In-One Automation Hub</span>
          </div>
          <h2 className="text-xl font-bold text-[#2D2926]">Managed n8n Workflow & Live Webhook Bridge</h2>
          <p className="text-xs sm:text-sm text-[#5C5651] mt-0.5">
            Ingest Excel spreadsheets, personalize messages using Gemini AI, dispatch via WhatsApp & Email, and sync Google Calendar demo bookings automatically.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="btn-copy-n8n-json"
            onClick={handleCopy}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white font-medium text-xs shadow-xs transition-all"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied to Clipboard!' : 'Copy Workflow JSON'}</span>
          </button>

          <button
            id="btn-download-n8n-json"
            onClick={handleDownload}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#FAF9F6] hover:bg-[#F0EDE9] border border-[#E8E4DF] text-[#4A443F] font-medium text-xs transition-all"
          >
            <Download className="w-3.5 h-3.5 text-[#8C847C]" />
            <span>Download JSON</span>
          </button>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex items-center space-x-2 border-b border-[#E8E4DF] pb-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setViewMode('managed_saas')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
            viewMode === 'managed_saas'
              ? 'bg-[#8BA888] text-white shadow-sm'
              : 'text-[#5C5651] hover:text-[#2D2926] hover:bg-[#F0EDE9]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>How It Works</span>
        </button>

        <button
          onClick={() => setViewMode('live_bridge')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
            viewMode === 'live_bridge'
              ? 'bg-[#8BA888] text-white shadow-sm'
              : 'text-[#5C5651] hover:text-[#2D2926] hover:bg-[#F0EDE9]'
          }`}
        >
          <PlayCircle className="w-3.5 h-3.5" />
          <span>Live n8n Webhook Bridge & Tester</span>
        </button>

        <button
          onClick={() => setViewMode('visual')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
            viewMode === 'visual'
              ? 'bg-[#8BA888] text-white shadow-sm'
              : 'text-[#5C5651] hover:text-[#2D2926] hover:bg-[#F0EDE9]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Node Inspector</span>
        </button>

        <button
          onClick={() => setViewMode('json')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
            viewMode === 'json'
              ? 'bg-[#8BA888] text-white shadow-sm'
              : 'text-[#5C5651] hover:text-[#2D2926] hover:bg-[#F0EDE9]'
          }`}
        >
          <FileJson className="w-3.5 h-3.5" />
          <span>Raw Workflow JSON</span>
        </button>
      </div>

      {viewMode === 'managed_saas' ? (
        <div className="space-y-6">
          {/* Architecture Card */}
          <div className="bg-white border border-[#E8E4DF] rounded-[24px] p-6 shadow-sm space-y-5">
            <h3 className="text-base font-bold text-[#2D2926] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#8BA888]" />
              <span>How the End-to-End Automation Works</span>
            </h3>
            <p className="text-xs sm:text-sm text-[#5C5651] leading-relaxed">
              This dashboard already dispatches WhatsApp and Email directly. Connecting it to n8n adds an external automation layer on top — useful if you want scheduled batch triggers, custom approval steps, or to hand campaign events to other tools (CRM, Slack, spreadsheets) without touching this app's code.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="bg-[#FAF9F6] border border-[#E8E4DF] rounded-2xl p-4.5 space-y-2.5">
                <div className="w-8 h-8 rounded-full bg-[#8BA888]/15 text-[#537050] font-bold flex items-center justify-center text-xs">
                  1
                </div>
                <h4 className="font-bold text-sm text-[#2D2926]">Import Leads</h4>
                <p className="text-xs text-[#5C5651] leading-relaxed">
                  Upload an Excel/CSV of contacts on the Spreadsheet & Leads tab, or trigger a campaign from this dashboard.
                </p>
              </div>

              <div className="bg-[#FAF9F6] border border-[#E8E4DF] rounded-2xl p-4.5 space-y-2.5">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                  2
                </div>
                <h4 className="font-bold text-sm text-[#2D2926]">n8n Webhook (Optional)</h4>
                <p className="text-xs text-[#5C5651] leading-relaxed">
                  Each dispatch can also POST an event payload to your n8n webhook, so your own workflow can log it, notify your team, or trigger further automation.
                </p>
              </div>

              <div className="bg-[#FAF9F6] border border-[#E8E4DF] rounded-2xl p-4.5 space-y-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">
                  3
                </div>
                <h4 className="font-bold text-sm text-[#2D2926]">Calendar & Status Sync</h4>
                <p className="text-xs text-[#5C5651] leading-relaxed">
                  Booked meetings show up on the Calendar tab, and every lead's WhatsApp/Email status updates live — exportable back to Excel at any time.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : viewMode === 'live_bridge' ? (
        /* Live n8n Webhook Bridge & Tester */
        <div className="space-y-6">
          <div className="bg-white border border-[#E8E4DF] rounded-[24px] p-6 shadow-sm space-y-5">
            <div>
              <h3 className="text-base font-bold text-[#2D2926] flex items-center gap-2">
                <PlayCircle className="w-5 h-5 text-[#8BA888]" />
                <span>Live n8n Webhook Endpoint Connector</span>
              </h3>
              <p className="text-xs sm:text-sm text-[#5C5651] mt-1">
                Enter your live n8n Production or Test Webhook URL below. When your clients upload spreadsheets or launch campaigns, the dashboard can dispatch leads directly to this webhook.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#4A443F]">n8n Webhook URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => handleSaveWebhookUrl(e.target.value)}
                  placeholder="https://your-n8n-instance.com/webhook/outreach-trigger"
                  className="flex-1 bg-[#FAF9F6] border border-[#E8E4DF] rounded-xl px-3.5 py-2.5 text-xs font-mono text-[#2D2926] focus:outline-none focus:ring-2 focus:ring-[#8BA888]/30"
                />
                <button
                  onClick={handleSendTestWebhook}
                  disabled={isSending || !webhookUrl}
                  className="px-5 py-2.5 rounded-xl bg-[#8BA888] hover:bg-[#799676] text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                >
                  {isSending ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Dispatching...</span>
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4" />
                      <span>Test Dispatch to n8n</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Test Payload Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#4A443F]">Outbound Payload (Sent to n8n)</span>
                  <span className="text-[10px] font-mono text-[#8C847C]">POST JSON</span>
                </div>
                <pre className="bg-[#FAF9F6] border border-[#E8E4DF] rounded-xl p-3.5 text-[11px] font-mono text-[#2D2926] overflow-x-auto max-h-60 leading-relaxed">
                  {JSON.stringify(testPayload, null, 2)}
                </pre>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#4A443F]">n8n Webhook Response</span>
                  {webhookStatus === 'success' && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      200 OK
                    </span>
                  )}
                  {webhookStatus === 'error' && (
                    <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                      Error
                    </span>
                  )}
                </div>
                <pre
                  className={`border rounded-xl p-3.5 text-[11px] font-mono overflow-x-auto max-h-60 leading-relaxed ${
                    webhookStatus === 'success'
                      ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                      : webhookStatus === 'error'
                      ? 'bg-rose-50/50 border-rose-200 text-rose-950'
                      : 'bg-[#FAF9F6] border-[#E8E4DF] text-[#8C847C]'
                  }`}
                >
                  {webhookResponse || '// Click "Test Dispatch to n8n" to trigger your live webhook and view the response here.'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : viewMode === 'visual' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Node Pipeline List (Left) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-white border border-[#E8E4DF] rounded-[24px] p-5 shadow-sm">
              <h3 className="font-semibold text-xs uppercase tracking-wider text-[#8C847C] mb-3 flex items-center justify-between">
                <span>Workflow Node Sequence</span>
                <span className="text-[10px] text-[#8BA888] font-semibold">Click node to inspect</span>
              </h3>

              <div className="space-y-2">
                {N8N_NODE_BREAKDOWN.map((node, idx) => {
                  const isSelected = selectedNodeIndex === idx;
                  return (
                    <button
                      key={idx}
                      id={`n8n-node-btn-${idx}`}
                      onClick={() => setSelectedNodeIndex(idx)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between group ${
                        isSelected
                          ? 'bg-[#8BA888]/15 border-[#8BA888]/50 shadow-sm'
                          : 'bg-[#FAF9F6] border-[#E8E4DF] hover:bg-[#F0EDE9]'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isSelected
                              ? 'bg-[#8BA888] text-white'
                              : 'bg-[#E8E4DF] text-[#4A443F]'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <div>
                          <div className={`text-xs font-semibold ${isSelected ? 'text-[#2D2926]' : 'text-[#4A443F]'}`}>
                            {node.name}
                          </div>
                          <div className="text-[10px] text-[#8C847C] font-mono">{node.type}</div>
                        </div>
                      </div>
                      <ArrowRight className={`w-3.5 h-3.5 ${isSelected ? 'text-[#8BA888]' : 'text-[#8C847C]'}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Node Detail Inspector (Right) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white border border-[#E8E4DF] rounded-[24px] p-6 shadow-sm space-y-5">
              <div className="flex items-start justify-between pb-4 border-b border-[#E8E4DF]">
                <div>
                  <span className="text-[10px] font-bold text-[#537050] uppercase tracking-wider bg-[#8BA888]/15 px-2.5 py-0.5 rounded-full border border-[#8BA888]/30">
                    Node #{selectedNodeIndex + 1} Configuration
                  </span>
                  <h3 className="text-lg font-bold text-[#2D2926] mt-1.5">{currentNodeDoc.name}</h3>
                  <p className="text-xs font-mono text-[#8C847C] mt-0.5">{currentNodeDoc.type}</p>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-[#2D2926] flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-[#25D366]" />
                  Functional Purpose
                </h4>
                <p className="text-xs text-[#5C5651] leading-relaxed bg-[#FAF9F6] p-3.5 rounded-2xl border border-[#E8E4DF]">
                  {currentNodeDoc.description}
                </p>
              </div>

              {/* Input / Output */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-3 bg-[#FAF9F6] rounded-xl border border-[#E8E4DF]">
                  <span className="font-semibold text-[#8C847C] uppercase text-[10px] block mb-1">
                    Input Data
                  </span>
                  <span className="text-[#2D2926]">{currentNodeDoc.input}</span>
                </div>
                <div className="p-3 bg-[#FAF9F6] rounded-xl border border-[#E8E4DF]">
                  <span className="font-semibold text-[#8C847C] uppercase text-[10px] block mb-1">
                    Output Data
                  </span>
                  <span className="text-[#2D2926]">{currentNodeDoc.output}</span>
                </div>
              </div>

              {/* Setup Instructions */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-[#2D2926] flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 text-[#128C7E]" />
                  Setup & Parameter Configuration
                </h4>
                <ul className="space-y-1 bg-[#FAF9F6] p-3.5 rounded-2xl border border-[#E8E4DF] text-xs text-[#5C5651]">
                  {currentNodeDoc.setupInstructions.map((inst, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-[#25D366] font-bold">•</span>
                      <span>{inst}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Raw JSON Viewer */
        <div className="bg-white border border-[#E8E4DF] rounded-[24px] p-5 shadow-sm relative">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E8E4DF] text-xs text-[#8C847C]">
            <span>n8n Workflow JSON Export (Standard v1 format)</span>
            <button
              onClick={handleCopy}
              className="text-[#8BA888] hover:text-[#799676] font-semibold"
            >
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
          </div>
          <pre className="text-xs font-mono text-[#2D2926] bg-[#FAF9F6] border border-[#E8E4DF] rounded-2xl overflow-x-auto max-h-[500px] p-4 select-all leading-relaxed">
            {jsonString}
          </pre>
        </div>
      )}
    </div>
  );
};
