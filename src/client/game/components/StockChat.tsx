import { useState, useEffect, useRef } from 'react';
import { connectRealtime } from '@devvit/web/client';
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

    // Ref for auto-scrolling
    const messagesEndRef = useRef<HTMLDivElement>(null);
    // Realtime connection ref
    const realtimeRef = useRef<{ disconnect: () => Promise<void> } | null>(null);

    // Initial fetch and subscription setup
    useEffect(() => {
        // Reset state when stonkId changes
        setMessages([]);
        setLoading(true);

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

        const setupRealtime = async () => {
            try {
                realtimeRef.current = await connectRealtime({
                    channel: 'chat',
                    onMessage: (data: unknown) => {
                        const newMsg = data as ChatMessage & { stonkId: string };
                        // Filter by stonkId
                        if (newMsg.stonkId === stonkId) {
                            setMessages(prev => {
                                // Prevent duplicates
                                if (prev.some(m => m.id === newMsg.id)) return prev;
                                return [...prev, newMsg].sort((a, b) => a.time - b.time);
                            });
                        }
                    },
                });
            } catch (err) {
                console.error('[StockChat] Realtime connection failed:', err);
            }
        };

        // Initial load and sub
        fetchMessages();
        setupRealtime();

        return () => {
            realtimeRef.current?.disconnect();
        };
    }, [stonkId]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || sending) return;

        setSending(true);
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stonkId, text: newMessage }),
            });

            if (!res.ok) throw new Error('Failed to send message');

            // The message will come back via realtime, so we don't strictly need to add it here,
            // but adding it optimistically feels faster. 
            // However, to avoid complexity with duplicates before the socket event arrives,
            // we'll just wait for the socket or the response.
            // Actually, let's just clear input and wait. Realtime is fast enough.
            setNewMessage('');
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message. Are you logged in?');
        } finally {
            setSending(false);
        }
    };

    const formatTime = (ts: number) => {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className={`flex flex-col h-full bg-slate-900/50 rounded-lg border border-slate-700/50 backdrop-blur-sm overflow-hidden ${className}`}>
            {/* Header */}
            <div className="p-3 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/30">
                <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">Live Chat</h3>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs text-slate-400">Live</span>
                </div>
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
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
                        <div key={msg.id} className="group animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="flex items-baseline gap-2 mb-0.5">
                                <span className="font-bold text-sm text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer">
                                    {msg.username}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                    {formatTime(msg.time)}
                                </span>
                            </div>
                            <p className="text-sm text-slate-300 break-words leading-relaxed">
                                {msg.text}
                            </p>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-3 bg-slate-800/30 border-t border-slate-700/50">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Say something..."
                        className="flex-1 bg-slate-950/50 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                        disabled={sending}
                        maxLength={280}
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim() || sending}
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
        </div>
    );
}
