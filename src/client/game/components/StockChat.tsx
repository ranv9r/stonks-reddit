import { useState, useEffect, useRef } from 'react';
import { connectRealtime, navigateTo } from '@devvit/web/client';
import { ChatConsentModal } from './ChatConsentModal';
import { CHAT_MAX_MESSAGES } from '../../../shared/config';
import type { ChatMessage, ChatResponse } from '../../../shared/types/stonks';

interface StockChatProps {
    stonkId: string;
    className?: string; // Support custom styling/layout
}

export function StockChat({ stonkId, className = '' }: StockChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);

    // Consent state
    const [chatConsent, setChatConsent] = useState<boolean | null>(null); // null = loading
    const [showConsentModal, setShowConsentModal] = useState(false);
    const [declined, setDeclined] = useState(false);

    // Thread URL for edit/delete link
    const [threadUrl, setThreadUrl] = useState<string | null>(null);

    // Ref for chat container to manage scrolling manually
    const chatContainerRef = useRef<HTMLDivElement>(null);
    // Ref to track previous messages length for smart scrolling
    const prevMessagesLenRef = useRef(0);
    // Realtime connection ref
    const realtimeRef = useRef<{ disconnect: () => Promise<void> } | null>(null);
    const realtimeDeleteRef = useRef<{ disconnect: () => Promise<void> } | null>(null);
    const realtimeEditRef = useRef<{ disconnect: () => Promise<void> } | null>(null);

    // Fetch consent status and thread URL on mount
    useEffect(() => {
        /** Fetches whether user has already accepted chat consent. */
        const fetchConsent = async () => {
            try {
                const res = await fetch('/api/chat/consent');
                if (res.ok) {
                    const data = await res.json();
                    setChatConsent(data.chatConsent === true);
                }
            } catch (err) {
                console.error('[Chat] Failed to check consent:', err);
                setChatConsent(false);
            }
        };

        /** Fetches the discussion thread URL for the Edit/Delete link. */
        const fetchThreadUrl = async () => {
            try {
                const res = await fetch(`/api/chat/${stonkId}/thread`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.url) setThreadUrl(data.url);
                }
            } catch {
                // Thread may not exist yet, that's fine
            }
        };

        fetchConsent();
        fetchThreadUrl();
    }, [stonkId]);

    // Initial fetch and realtime setup
    useEffect(() => {
        // Reset state when stonkId changes
        setMessages([]);
        setLoading(true);
        prevMessagesLenRef.current = 0;

        /** Fetches initial messages from Reddit discussion thread. */
        const fetchMessages = async () => {
            try {
                const res = await fetch(`/api/chat/${stonkId}`);
                if (!res.ok) throw new Error('Failed to fetch messages');

                const data: ChatResponse = await res.json();
                setMessages(data.messages);
            } catch (error) {
                console.error('Error fetching chat:', error);
            } finally {
                setLoading(false);
            }
        };

        /** Sets up realtime WebSocket for instant message updates. */
        const setupRealtime = async () => {
            try {
                // Listen for new messages
                const chatConn = await connectRealtime({
                    channel: 'chat',
                    onMessage: (data: unknown) => {
                        const newMsg = data as ChatMessage & { stonkId: string };
                        // Filter by stonkId
                        if (newMsg.stonkId === stonkId) {
                            setMessages(prev => {
                                // Prevent duplicates
                                if (prev.some(m => m.id === newMsg.id)) return prev;
                                const updated = [...prev, newMsg].sort((a, b) => a.time - b.time);
                                // Sliding window: keep only the latest N messages
                                if (updated.length > CHAT_MAX_MESSAGES) {
                                    return updated.slice(-CHAT_MAX_MESSAGES);
                                }
                                return updated;
                            });
                        }
                    },
                });
                realtimeRef.current = chatConn;
                console.log('[StockChat] ✅ Connected to chat channel');

                // Listen for deletions (instant via Devvit trigger)
                const deleteConn = await connectRealtime({
                    channel: 'chat_delete',
                    onMessage: (data: unknown) => {
                        const { commentId } = data as { commentId: string; threadId: string };
                        console.log(`[Chat] 🗑️ Received delete event for: ${commentId}`);

                        // Remove deleted comment from state
                        setMessages(prev => {
                            const filtered = prev.filter(m => m.id !== commentId);
                            if (filtered.length === prev.length) {
                                console.log(`[Chat] ⚠️ Comment ${commentId} not found in messages (IDs: ${prev.map(m => m.id).join(', ')})`);
                            }
                            return filtered;
                        });
                    },
                });
                realtimeDeleteRef.current = deleteConn;
                console.log('[StockChat] ✅ Connected to chat_delete channel');

                // Listen for edits (instant via Devvit trigger)
                const editConn = await connectRealtime({
                    channel: 'chat_edit',
                    onMessage: (data: unknown) => {
                        const { commentId, newText } = data as { commentId: string; newText: string; stonkId: string };
                        console.log(`[Chat] ✏️ Received edit event for: ${commentId}`);

                        // Update edited comment text in-place
                        setMessages(prev => prev.map(m =>
                            m.id === commentId ? { ...m, text: newText } : m
                        ));
                    },
                });
                realtimeEditRef.current = editConn;
                console.log('[StockChat] ✅ Connected to chat_edit channel');
            } catch (err) {
                console.error('[StockChat] Realtime connection failed:', err);
            }
        };

        // Initial load + realtime subscription
        fetchMessages();
        setupRealtime();

        return () => {
            // Disconnect ALL realtime channels on cleanup
            realtimeRef.current?.disconnect();
            realtimeDeleteRef.current?.disconnect();
            realtimeEditRef.current?.disconnect();
            realtimeRef.current = null;
            realtimeDeleteRef.current = null;
            realtimeEditRef.current = null;
            console.log('[StockChat] 🔌 Disconnected all realtime channels');
        };
    }, [stonkId]);

    // Smart auto-scroll: scroll to bottom if initial load OR if user was already near bottom
    useEffect(() => {
        const container = chatContainerRef.current;
        if (!container) return;

        const isInitialLoad = prevMessagesLenRef.current === 0 && messages.length > 0;

        // Check if user is near bottom (within 100px)
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

        if (isInitialLoad || isNearBottom) {
            container.scrollTop = container.scrollHeight;
        }

        prevMessagesLenRef.current = messages.length;
    }, [messages]);

    /** Handles send attempt — shows consent modal if not yet opted in. */
    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || sending) return;

        // If not consented (explicitly false, not loading), show modal instead of sending
        if (chatConsent === false) {
            setShowConsentModal(true);
            return;
        }

        // Still loading consent status — wait, don't send yet
        if (chatConsent === null) return;

        setSending(true);
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stonkId, text: newMessage }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to send message');
            }

            // Clear input immediately - message will come back via realtime
            setNewMessage('');

            // Force scroll to bottom when user sends a message
            if (chatContainerRef.current) {
                chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
            }
        } catch (error) {
            console.error('Error sending message:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
            alert(errorMessage);
        } finally {
            setSending(false);
        }
    };

    /** Handles consent acceptance — persists flag and allows sending. */
    const handleConsentAccept = async () => {
        try {
            const res = await fetch('/api/chat/consent', { method: 'POST' });
            if (res.ok) {
                setChatConsent(true);
                setShowConsentModal(false);
                setDeclined(false);
            }
        } catch (err) {
            console.error('[Chat] Failed to save consent:', err);
        }
    };

    /** Handles consent decline — disables input, can re-show modal. */
    const handleConsentDecline = () => {
        setShowConsentModal(false);
        setDeclined(true);
    };

    /** Re-show consent modal if user clicks disabled input after declining. */
    const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        if (declined || chatConsent === false) {
            e.target.blur();
            setShowConsentModal(true);
            return;
        }
        // Scroll input into view when mobile keyboard opens
        setTimeout(() => {
            e.target.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 300);
    };

    /** Formats a Unix timestamp to a human-readable time string. */
    const formatTime = (ts: number) => {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className={`flex flex-col h-full bg-slate-900/50 rounded-lg border border-slate-700/50 backdrop-blur-sm overflow-hidden ${className}`}>
            {/* Header */}
            <div className="p-3 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/30">
                <div className="flex flex-col">
                    <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">Live Chat</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">Posted as Reddit comments</p>
                </div>
                <div className="flex items-center gap-3">
                    {threadUrl && (
                        <button
                            onClick={() => navigateTo(threadUrl)}
                            className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors underline underline-offset-2 bg-transparent border-none cursor-pointer p-0"
                        >
                            View Thread
                        </button>
                    )}
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="text-xs text-slate-400">Live</span>
                    </div>
                </div>
            </div>

            {/* Messages List */}
            <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
            >
                {loading && messages.length === 0 ? (
                    <div className="flex justify-center items-center h-full text-slate-500 text-sm">
                        Loading comments...
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex justify-center items-center h-full text-slate-500 text-sm text-center px-4">
                        No comments yet. Be the first to say something!
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id} className="group animate-in fade-in slide-in-from-bottom-2 duration-300 relative">
                            <div className="flex items-baseline gap-2 mb-0.5">
                                <span className="font-bold text-sm text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer">
                                    {msg.username}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                    {formatTime(msg.time)}
                                </span>
                                {/* Per-message action link — visible on hover */}
                                {msg.permalink && (
                                    <button
                                        onClick={() => navigateTo(`https://www.reddit.com${msg.permalink}`)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto text-[10px] text-emerald-400 hover:text-emerald-300 bg-transparent border-none cursor-pointer p-0 underline underline-offset-2 whitespace-nowrap"
                                    >
                                        Edit/Delete/Report
                                    </button>
                                )}
                            </div>
                            <p className="text-sm text-slate-300 break-words leading-relaxed">
                                {msg.text}
                            </p>
                        </div>
                    ))
                )}
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-3 bg-slate-800/30 border-t border-slate-700/50">
                {declined && (
                    <p className="text-[10px] text-slate-500 mb-1.5 text-center">
                        Chat is read-only. <button type="button" onClick={() => setShowConsentModal(true)} className="text-emerald-400 underline">Enable sending</button>
                    </p>
                )}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onFocus={handleInputFocus}
                        placeholder={declined ? 'Accept terms to chat...' : 'Say something...'}
                        className={`flex-1 bg-slate-950/50 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors ${declined ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={sending}
                        readOnly={declined}
                        maxLength={280}
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim() || sending || declined}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded transition-colors"
                    >
                        {sending ? (
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg className="w-5 h-5 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        )}
                    </button>
                </div>
            </form>

            {/* Consent Modal */}
            {showConsentModal && (
                <ChatConsentModal
                    onAccept={handleConsentAccept}
                    onDecline={handleConsentDecline}
                />
            )}
        </div>
    );
}
