/**
 * Tour Provider - Manages guided tour state and logic.
 * Wraps the application to provide tour functionality across all components.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import Joyride, { CallBackProps, STATUS, EVENTS, Step } from 'react-joyride';
import { tourSteps } from '../config/tourSteps';
import { ClaimBalanceModal } from '../components/ClaimBalanceModal';

interface TourContextValue {
    isTourActive: boolean;
    currentStep: number;
    startTour: () => void;
    skipTour: () => Promise<void>;
    completeTour: () => Promise<void>;
}

const TourContext = createContext<TourContextValue | undefined>(undefined);

export const useTour = () => {
    const context = useContext(TourContext);
    if (!context) {
        throw new Error('useTour must be used within TourProvider');
    }
    return context;
};

interface TourProviderProps {
    children: ReactNode;
}

export const TourProvider: React.FC<TourProviderProps> = ({ children }) => {
    const [isTourActive, setIsTourActive] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [showClaimModal, setShowClaimModal] = useState(false);
    const [tourCompleted, setTourCompleted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Check tour status on mount
    useEffect(() => {
        const checkTourStatus = async () => {
            try {
                const response = await fetch('/api/tour/status');
                if (response.ok) {
                    const data = await response.json();
                    setTourCompleted(data.tourCompleted);

                    // Auto-start tour if not completed
                    if (!data.tourCompleted) {
                        setIsTourActive(true);
                    }
                }
            } catch (error) {
                console.error('[Tour] Failed to check tour status:', error);
            } finally {
                setIsLoading(false);
            }
        };

        checkTourStatus();
    }, []);


    // Auto-advance when user navigates during tour (Steps 4→5, 8→9, 10→11)
    useEffect(() => {
        if (!isTourActive) return;

        let checkInterval: NodeJS.Timeout | null = null;
        let timeoutTimer: NodeJS.Timeout | null = null;

        // Step 4 → Step 5: Stock card to detail view
        if (currentStep === 3) {
            checkInterval = setInterval(() => {
                const priceChartElement = document.querySelector('#tour-price-chart');
                if (priceChartElement) {
                    console.log('[Tour] Detected navigation to stock detail view, advancing to Step 5');
                    setCurrentStep(4);
                    if (checkInterval) clearInterval(checkInterval);
                }
            }, 50); // Faster polling for better responsiveness

            timeoutTimer = setTimeout(() => {
                if (checkInterval) clearInterval(checkInterval);
            }, 10000);
        }

        // Step 8 → Step 9: Back button to market view
        if (currentStep === 7) {
            checkInterval = setInterval(() => {
                const marketOverview = document.querySelector('#tour-market-overview');
                if (marketOverview) {
                    console.log('[Tour] Detected navigation back to market view, advancing to Step 9');
                    setCurrentStep(8);
                    if (checkInterval) clearInterval(checkInterval);
                }
            }, 50);

            timeoutTimer = setTimeout(() => {
                if (checkInterval) clearInterval(checkInterval);
            }, 10000);
        }

        // Step 9 → Step 10: Portfolio tab to holdings view
        if (currentStep === 8) {
            checkInterval = setInterval(() => {
                const holdingsElement = document.querySelector('#tour-holdings');
                if (holdingsElement) {
                    console.log('[Tour] Detected navigation to portfolio view, advancing to Step 10');
                    setCurrentStep(9);
                    if (checkInterval) clearInterval(checkInterval);
                }
            }, 50);

            timeoutTimer = setTimeout(() => {
                if (checkInterval) clearInterval(checkInterval);
            }, 10000);
        }

        // Step 11 → Step 12: Leaderboard tab to leaderboard view  
        if (currentStep === 10) {
            checkInterval = setInterval(() => {
                const leaderboardElement = document.querySelector('#tour-leaderboard');
                if (leaderboardElement) {
                    console.log('[Tour] Detected navigation to leaderboard view, advancing to Step 12');
                    setCurrentStep(11);
                    if (checkInterval) clearInterval(checkInterval);
                }
            }, 50);

            timeoutTimer = setTimeout(() => {
                if (checkInterval) clearInterval(checkInterval);
            }, 10000);
        }

        return () => {
            if (checkInterval) clearInterval(checkInterval);
            if (timeoutTimer) clearTimeout(timeoutTimer);
        };
    }, [currentStep, isTourActive]);

    const startTour = useCallback(() => {
        setCurrentStep(0);
        setIsTourActive(true);
    }, []);

    const skipTour = useCallback(async () => {
        setIsTourActive(false);
        // Mark tour as completed when skipped
        try {
            await fetch('/api/tour/complete', { method: 'POST' });
            setTourCompleted(true);
        } catch (error) {
            console.error('[Tour] Failed to mark tour as completed:', error);
        }
    }, []);

    const completeTour = useCallback(async () => {
        try {
            await fetch('/api/tour/complete', { method: 'POST' });
            setTourCompleted(true);
            setShowClaimModal(false);
            console.log('[Tour] Tour completed successfully');
        } catch (error) {
            console.error('[Tour] Failed to complete tour:', error);
        }
    }, []);

    const handleTourCallback = useCallback((data: CallBackProps) => {
        const { status, type, index, action } = data;

        // Handle tour completion
        if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
            setIsTourActive(false);

            if (status === STATUS.FINISHED) {
                // Show claim modal instead of immediately completing
                setShowClaimModal(true);
            } else if (status === STATUS.SKIPPED) {
                skipTour();
            }
        }

        // Handle close button (ESC or X)
        if (action === 'close' && type === EVENTS.STEP_AFTER) {
            skipTour();
        }

        // Update current step
        if (type === EVENTS.STEP_AFTER && action === 'next') {
            setCurrentStep(index + 1);
        } else if (type === EVENTS.STEP_AFTER && action === 'prev') {
            setCurrentStep(Math.max(0, index - 1));
        }
    }, [skipTour]);

    const value: TourContextValue = {
        isTourActive,
        currentStep,
        startTour,
        skipTour,
        completeTour,
    };

    // Don't render tour until we've checked status
    if (isLoading) {
        return <>{children}</>;
    }

    return (
        <TourContext.Provider value={value}>
            {children}

            {/* Tour Component */}
            {!tourCompleted && (
                <Joyride
                    steps={tourSteps}
                    run={isTourActive}
                    stepIndex={currentStep}
                    continuous
                    showProgress
                    showSkipButton
                    disableOverlayClose
                    disableCloseOnEsc
                    callback={handleTourCallback}
                    styles={{
                        options: {
                            primaryColor: '#FF4500',
                            backgroundColor: '#18181b',
                            textColor: '#f4f4f5',
                            overlayColor: 'rgba(0, 0, 0, 0.7)',
                            zIndex: 10000,
                        },
                        tooltip: {
                            backgroundColor: '#18181b',
                            borderRadius: '12px',
                            padding: '20px',
                            fontSize: '15px',
                        },
                        tooltipContainer: {
                            textAlign: 'left',
                        },
                        tooltipContent: {
                            padding: '10px 0',
                        },
                        buttonNext: {
                            backgroundColor: '#FF4500',
                            borderRadius: '8px',
                            padding: '10px 20px',
                            fontSize: '14px',
                            fontWeight: 600,
                        },
                        buttonBack: {
                            color: '#a1a1aa',
                            marginRight: '10px',
                        },
                        buttonSkip: {
                            color: '#71717a',
                        },
                        beacon: {
                            inner: '#FF4500',
                            outer: '#FF4500',
                        },
                    }}
                    locale={{
                        back: 'Back',
                        close: 'Close',
                        last: 'Finish',
                        next: 'Next',
                        skip: 'Skip Tour',
                    }}
                />
            )}

            {/* Claim Balance Modal */}
            {showClaimModal && <ClaimBalanceModal onClaim={completeTour} />}
        </TourContext.Provider>
    );
};
