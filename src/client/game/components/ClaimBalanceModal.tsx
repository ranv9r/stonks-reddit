/**
 * Claim Balance Modal - Celebratory modal shown at end of tour.
 * Allows users to "claim" their initial $10,000 balance.
 */

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import './ClaimBalanceModal.css';

interface ClaimBalanceModalProps {
    onClaim: () => void;
}

export const ClaimBalanceModal: React.FC<ClaimBalanceModalProps> = ({ onClaim }) => {
    useEffect(() => {
        // Fire confetti when modal appears
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 20000 };

        function randomInRange(min: number, max: number) {
            return Math.random() * (max - min) + min;
        }

        const interval: any = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);

            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
            });
            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
            });
        }, 250);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="claim-modal-overlay">
            <div className="claim-modal">
                <div className="claim-header">
                    <div className="claim-icon">🎉</div>
                    <h2>Welcome to Stonks!</h2>
                </div>

                <div className="claim-content">
                    <div className="claim-balance">
                        <div className="balance-label">Your Starting Balance</div>
                        <div className="balance-amount">$10,000.00</div>
                    </div>

                    <div className="claim-features">
                        <div className="feature-item">
                            <span className="feature-icon">📊</span>
                            <span className="feature-text">Live market with real prices</span>
                        </div>
                        <div className="feature-item">
                            <span className="feature-icon">⚡</span>
                            <span className="feature-text">Instant trade execution</span>
                        </div>
                        <div className="feature-item">
                            <span className="feature-icon">🏆</span>
                            <span className="feature-text">Compete on the leaderboard</span>
                        </div>
                    </div>

                    <p className="claim-reminder">
                        You're all set! Start trading to climb the ranks and prove you're the ultimate meme stock trader.
                    </p>
                </div>

                <button className="claim-button" onClick={onClaim}>
                    <span className="claim-button-text">Claim Balance & Start Trading</span>
                    <span className="claim-button-icon">🚀</span>
                </button>
            </div>
        </div>
    );
};
