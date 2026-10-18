import React from 'react';
import { X } from 'lucide-react';

interface InfoModalProps {
  onClose: () => void;
}

const InfoModal: React.FC<InfoModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-6 pointer-events-auto overflow-hidden">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-white/60 backdrop-blur-xl animate-in fade-in duration-500"
      />
      <div className="relative w-full max-w-xl bg-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] p-8 md:p-10 border border-zinc-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-zinc-300 hover:text-zinc-500 hover:bg-zinc-100 rounded-full transition-all active:scale-95"
        >
          <X size={20} strokeWidth={2.5} />
        </button>

        <div className="max-w-md mx-auto">
          <h2 className="text-3xl font-black text-darkDelegation leading-[1.2] mb-6 tracking-tight text-center">
            Your channel's agents, at work
          </h2>

          <div className="space-y-5 text-zinc-500 text-[15px] leading-relaxed">
            <p>
              Each character is one real AgentTube agent. When a video moves through the
              pipeline, the agent that owns the current stage takes a desk and starts working;
              a stage that fails sends its agent to the boardroom.
            </p>
            <p>
              This view only reads state. Approving, scheduling and publishing stay in the
              operator console, behind the review, media-rights and quality gates.
            </p>
          </div>

          <div className="mt-8 pt-5 border-t border-zinc-100 flex flex-col items-center gap-2">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em] text-center leading-loose">
              3D office and characters by{' '}
              <a
                href="https://unboring.net"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-600 hover:text-darkDelegation transition-colors underline decoration-zinc-200 underline-offset-4"
              >
                Arturo Paracuellos (unboring.net)
              </a>
            </p>
            <p className="text-[9px] font-medium text-zinc-300 uppercase tracking-[0.12em] text-center">
              CC BY-NC 4.0 · non-commercial use · simulation adapted from{' '}
              <a
                href="https://github.com/arturitu/the-delegation"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-zinc-500 transition-colors underline decoration-zinc-200 underline-offset-2"
              >
                The Delegation
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoModal;
