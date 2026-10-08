import React, { useState } from 'react';
import { Clock, Filter, ChevronDown, CheckCircle2, AlertTriangle, Info, Zap } from 'lucide-react';
import { OperationalLog } from '../types';

interface ActivityLogProps {
  logs: OperationalLog[];
  onClearLogs: () => void;
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ logs, onClearLogs }) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const filteredLogs = logs.filter((log) => {
    if (categoryFilter !== 'all' && log.category !== categoryFilter) return false;
    if (severityFilter !== 'all' && log.severity !== severityFilter) return false;
    return true;
  });

  const getSeverityBadge = (severity: OperationalLog['severity']) => {
    switch (severity) {
      case 'success':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'warning':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'alert':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'info':
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
      {/* Header & Filter Dropdowns */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-600" />
            <span>Operational SCADA &amp; Fleet Activity Logs</span>
          </h2>
          <p className="text-xs text-slate-500">
            Real-time event stream: solar infeed, charger handoffs, battery swaps, and multi-stop deliveries
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Category Dropdown */}
          <div className="relative">
            <select
              id="log-category-filter-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-2.5 py-1.5 pr-7 hover:bg-white focus:outline-none cursor-pointer"
            >
              <option value="all">📂 All Categories</option>
              <option value="solar">☀️ Solar Arrays</option>
              <option value="grid">⚡ Grid Stations</option>
              <option value="fleet">🚚 Fleet &amp; Chargers</option>
              <option value="dispatch">🛣️ Delivery Dispatch</option>
              <option value="battery">🔋 Battery &amp; Super BESS</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Severity Dropdown */}
          <div className="relative">
            <select
              id="log-severity-filter-select"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-2.5 py-1.5 pr-7 hover:bg-white focus:outline-none cursor-pointer"
            >
              <option value="all">🏷️ All Severities</option>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            id="clear-logs-btn"
            onClick={onClearLogs}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Logs Table / List */}
      <div className="max-h-[520px] overflow-y-auto space-y-2 text-xs">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            No events match the selected criteria.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl flex items-start justify-between gap-3 transition-colors"
            >
              <div className="flex items-start gap-2.5">
                <span className="font-mono text-[11px] font-bold text-slate-400 mt-0.5 whitespace-nowrap">
                  {log.timestamp}
                </span>
                <span
                  className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap ${getSeverityBadge(
                    log.severity
                  )}`}
                >
                  {log.category}
                </span>
                <p className="text-slate-700 font-medium leading-relaxed">{log.message}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
