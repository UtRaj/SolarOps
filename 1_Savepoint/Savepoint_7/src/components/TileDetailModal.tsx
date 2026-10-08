import React from 'react';
import { X, Info, CheckCircle, AlertTriangle, Battery, Zap, MapPin, Truck as TruckIcon, Sun } from 'lucide-react';
import { DetailModalContent } from '../types';

interface TileDetailModalProps {
  content: DetailModalContent | null;
  onClose: () => void;
}

export const TileDetailModal: React.FC<TileDetailModalProps> = ({ content, onClose }) => {
  if (!content) return null;

  const getIcon = () => {
    switch (content.type) {
      case 'truck':
        return <TruckIcon className="w-5 h-5 text-blue-600" />;
      case 'solar-farm':
        return <Sun className="w-5 h-5 text-amber-500" />;
      case 'grid-station':
        return <Zap className="w-5 h-5 text-purple-600" />;
      case 'battery-pack':
      case 'super-battery':
        return <Battery className="w-5 h-5 text-emerald-600" />;
      case 'delivery-point':
        return <MapPin className="w-5 h-5 text-rose-600" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-2xs">
              {getIcon()}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{content.title}</h3>
              <p className="text-xs text-slate-500">{content.subtitle}</p>
            </div>
          </div>
          <button
            id="modal-close-btn"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Telemetry Key-Value Grid */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          <div className="flex items-center gap-2 p-2.5 bg-blue-50/70 border border-blue-100 rounded-lg text-blue-800">
            <Info className="w-4 h-4 shrink-0 text-blue-600" />
            <span>SCADA live telemetry stream synchronized with simulation engine.</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {Object.entries(content.data).map(([key, value]) => (
              <div key={key} className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <span className="text-[11px] font-medium text-slate-500 block uppercase tracking-wider mb-1">
                  {key}
                </span>
                <span className="text-sm font-semibold text-slate-800 break-words">
                  {typeof value === 'boolean' ? (value ? 'True / Yes' : 'False / No') : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            id="modal-dismiss-btn"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium text-xs shadow-2xs transition-colors"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};
