/**
 * Admin View - Moderator-only panel for managing stocks and game data.
 */

import { useState, useEffect, useCallback } from 'react';
import { showForm } from '@devvit/web/client';
import { PlusIcon, TrashIcon, RefreshIcon } from '../components/Icons';
import type { StonkState } from '../../../shared/types/stonks';

export const AdminView = () => {
    const [stocks, setStocks] = useState<StonkState[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // Fetch all stocks
    const fetchStocks = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/mod/stonks?t=${Date.now()}`);
            const data = await response.json();
            if (data.stonks) {
                setStocks(data.stonks);
            }
            setError(null);
        } catch (err) {
            console.error('Failed to fetch stocks:', err);
            setError('Failed to load stocks');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStocks();
    }, [fetchStocks]);

    // Create new stock using Devvit form
    const handleCreateStock = async () => {
        try {
            const result = await showForm({
                title: 'Create New Stock',
                fields: [
                    { name: 'name', type: 'string', label: 'Stock Name', required: true },
                    { name: 'ticker', type: 'string', label: 'Ticker Symbol (e.g., TSLA)', required: true },
                    { name: 'icon', type: 'string', label: 'Emoji Icon (optional)', required: false },
                    { name: 'logo', type: 'image', label: 'Stock Logo (optional)', required: false },
                ],
            });

            if (result && result.action === 'SUBMITTED') {
                setActionLoading(true);
                const values = result.values;
                const name = values.name as string;
                const ticker = values.ticker as string;
                const icon = values.icon as string | undefined;
                const logo = values.logo as string | undefined;

                const response = await fetch('/api/mod/stonks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        ticker,
                        icon: icon || '📈',
                        imageUrl: logo,
                    }),
                });

                const data = await response.json();
                if (data.success) {
                    await fetchStocks();
                } else {
                    setError(data.error || 'Failed to create stock');
                }
            }
        } catch (err) {
            console.error('Create stock error:', err);
            setError('Failed to create stock');
        } finally {
            setActionLoading(false);
        }
    };

    // Delete stock
    const handleDeleteStock = async (stockId: string, ticker: string) => {
        try {
            const result = await showForm({
                title: `Delete ${ticker}?`,
                fields: [
                    {
                        name: 'confirm',
                        type: 'string',
                        label: `Type "DELETE" to confirm removal of ${ticker}:`,
                        required: true
                    }
                ],
            });

            if (result && result.action === 'SUBMITTED' && result.values.confirm === 'DELETE') {
                setActionLoading(true);
                const response = await fetch(`/api/mod/stonks/${stockId}`, {
                    method: 'DELETE',
                });

                const data = await response.json();
                if (data.success) {
                    await fetchStocks();
                    alert(`✅ Successfully deleted ${ticker}`);
                } else {
                    alert(`❌ Error: ${data.error || 'Failed to delete stock'}`);
                    setError(data.error || 'Failed to delete stock');
                }
            } else if (result && result.action === 'SUBMITTED') {
                alert('Cancelled: You must type "DELETE" exactly.');
            }
        } catch (err) {
            console.error('Delete stock error:', err);
            alert(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setActionLoading(false);
        }
    };

    // Reset game data
    const handleResetGame = async () => {
        try {
            const result = await showForm({
                title: 'RESET GAME?',
                fields: [
                    {
                        name: 'confirmation',
                        type: 'string',
                        label: 'Type "RESET" to confirm full wipe:',
                        required: true,
                    }
                ],
            });

            if (result && result.action === 'SUBMITTED' && result.values.confirmation === 'RESET') {
                setActionLoading(true);
                const response = await fetch('/api/mod/reset-game', {
                    method: 'POST',
                });

                const data = await response.json();
                if (data.success) {
                    // Update stocks list after reset
                    await fetchStocks();
                    alert(data.message || 'Game reset successful');
                } else {
                    setError(data.error || 'Failed to reset game');
                }
            } else if (result && result.action === 'SUBMITTED' && result.values.confirmation) {
                alert('Reset cancelled. You must type "RESET" exactly.');
            }
        } catch (err) {
            console.error('Reset game error:', err);
            setError('Failed to reset game');
        } finally {
            setActionLoading(false);
        }
    };

    // Format price from cents to dollars
    const formatPrice = (cents: number) => {
        return `$${(cents / 100).toFixed(2)}`;
    };

    return (
        <div className="p-4 lg:p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl lg:text-2xl font-bold text-white">Admin Panel</h2>
                    <p className="text-sm text-[#71717a]">Manage stocks and game settings</p>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                    {error}
                    <button
                        onClick={() => setError(null)}
                        className="ml-2 text-red-300 hover:text-red-100"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
                <button
                    onClick={handleCreateStock}
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#FF4500] hover:bg-[#ff5722] text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                    <PlusIcon size={18} />
                    Create Stock
                </button>
                <button
                    onClick={handleResetGame}
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#27272a] hover:bg-[#3f3f46] text-white font-medium rounded-lg border border-red-500/30 transition-colors disabled:opacity-50"
                >
                    <RefreshIcon size={18} />
                    Reset Game
                </button>
            </div>

            {/* Stocks List */}
            <div className="bg-[#18181b] rounded-xl border border-[#27272a] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#27272a]">
                    <h3 className="font-semibold text-white">Stocks ({stocks.length})</h3>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-[#71717a]">Loading stocks...</div>
                ) : stocks.length === 0 ? (
                    <div className="p-8 text-center text-[#71717a]">
                        No stocks created yet. Click "Create Stock" to add one.
                    </div>
                ) : (
                    <div className="divide-y divide-[#27272a]">
                        {stocks.map((stock) => (
                            <div
                                key={stock.id}
                                className="p-4 flex items-center justify-between hover:bg-[#1f1f23] transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    {stock.imageUrl ? (
                                        <img
                                            src={stock.imageUrl}
                                            alt={stock.ticker}
                                            className="w-10 h-10 rounded-lg object-cover"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-lg bg-[#27272a] flex items-center justify-center text-xl">
                                            {stock.icon}
                                        </div>
                                    )}
                                    <div>
                                        <div className="font-medium text-white">{stock.ticker}</div>
                                        <div className="text-sm text-[#71717a]">{stock.name}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="font-medium text-white">
                                            {formatPrice(stock.currentPrice)}
                                        </div>
                                        <div className="text-xs text-[#71717a]">
                                            Vol: {formatPrice(stock.totalVolume)}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteStock(stock.id, stock.ticker)}
                                        disabled={actionLoading}
                                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                                        title="Delete stock"
                                    >
                                        <TrashIcon size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Info Section */}
            <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-4">
                <h3 className="font-semibold text-white mb-2">Admin Actions</h3>
                <ul className="text-sm text-[#a1a1aa] space-y-1">
                    <li>• <strong>Create Stock</strong>: Add a new tradeable stock with optional logo</li>
                    <li>• <strong>Delete Stock</strong>: Remove a stock (users lose their holdings)</li>
                    <li>• <strong>Reset Game</strong>: Reset all wallets to $10,000 and stocks to $100</li>
                </ul>
            </div>
        </div>
    );
};
