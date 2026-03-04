/**
 * Chat Consent Modal — Compact disclosure for Reddit User Actions compliance.
 * Shown once when user first tries to send a chat message. Uses a portal to
 * render at document.body level so it isn't clipped by parent overflow.
 */

import { createPortal } from 'react-dom';


interface ChatConsentModalProps {
    onAccept: () => void;
    onDecline: () => void;
}

export function ChatConsentModal({ onAccept, onDecline }: ChatConsentModalProps) {
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}>
            <div className="bg-[#1a1a1d] border border-[#333] rounded-xl max-w-sm w-full p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">💬</span>
                    <h3 className="text-base font-bold text-white">Live Chat Terms</h3>
                </div>

                {/* Body */}
                <div className="text-sm text-slate-300 space-y-2 mb-4">
                    <p>
                        Messages you send here are posted as <strong className="text-white">Reddit comments</strong> on a
                        separate discussion post for this stock, under <strong className="text-white">your username</strong>.
                    </p>
                    <p className="text-slate-400 text-xs">
                        Your username will be visible in the live chat and on the thread.
                    </p>
                    <p className="text-slate-400 text-xs">
                        ✏️ To <strong className="text-slate-300">edit, delete, or report</strong> a message,
                        hover over it and click the <em className="text-emerald-400">Edit/Delete/Report</em> link
                        to open it directly on Reddit.
                    </p>
                </div>

                {/* Buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={onAccept}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                    >
                        I Agree
                    </button>
                    <button
                        onClick={onDecline}
                        className="flex-1 bg-[#2a2a2d] hover:bg-[#333] text-slate-400 font-medium py-2 px-4 rounded-lg transition-colors text-sm border border-[#444]"
                    >
                        No Thanks
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
