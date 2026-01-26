/**
 * Splash Screen UI Configuration
 * All customizable parameters for the splash screen layout
 */

// ============================================
// LAYOUT CONFIGURATION
// ============================================

/** Max width of the splash container (centers on desktop) */
export const SPLASH_MAX_WIDTH = 800; // px

/** Breakpoint for compact mobile layout adjustments */
export const MOBILE_BREAKPOINT = 500; // px

// ============================================
// STONKS GUY CONFIGURATION
// ============================================

/** Default stonks guy image size (width in px) */
export const STONKS_GUY_SIZE_DESKTOP = 280; // px

/** Stonks guy size on mobile */
export const STONKS_GUY_SIZE_MOBILE = 200; // px

// ============================================
// LOGO / ARROW CONFIGURATION
// ============================================

/** Logo chart icon size in the splash header */
export const LOGO_ICON_SIZE = 36; // px

/** Trend arrow icon size (appears behind stonks guy) */
export const TREND_ARROW_SIZE_DESKTOP = 120; // px
export const TREND_ARROW_SIZE_MOBILE = 80; // px

// ============================================
// TYPOGRAPHY CONFIGURATION
// ============================================

/** Logo text sizes */
export const LOGO_TEXT_SIZE_DESKTOP = '2.75rem';
export const LOGO_TEXT_SIZE_MOBILE = '2rem';

/** Net worth value text sizes */
export const NETWORTH_SIZE_DESKTOP = '2.5rem';
export const NETWORTH_SIZE_MOBILE = '1.75rem';

// ============================================
// CTA BUTTON CONFIGURATION
// ============================================

/** CTA button width percentage */
export const CTA_BUTTON_WIDTH = '70%';

/** CTA button max width */
export const CTA_BUTTON_MAX_WIDTH = 220; // px

/** CTA button padding */
export const CTA_BUTTON_PADDING = '0.875rem 1.5rem';

// ============================================
// MARKET CARDS CONFIGURATION
// ============================================

/** Number of stonks to show in preview */
export const MARKET_PREVIEW_COUNT = 5;

/** Market card padding desktop */
export const CARD_PADDING_DESKTOP = '0.75rem 1rem';

/** Market card padding mobile (more compact) */
export const CARD_PADDING_MOBILE = '0.5rem 0.75rem';

/** Gap between market cards */
export const CARD_GAP_DESKTOP = '0.5rem';
export const CARD_GAP_MOBILE = '0.375rem';

// ============================================
// COLORS (reference - defined in CSS vars)
// ============================================
export const COLORS = {
    background: '#0f0f0f',
    cardBackground: 'rgba(31, 31, 35, 0.6)',
    accent: '#FF4500',
    accentHover: '#ff5722',
    textPrimary: '#ffffff',
    textMuted: '#71717a',
    success: '#22c55e',
    danger: '#ef4444',
};
