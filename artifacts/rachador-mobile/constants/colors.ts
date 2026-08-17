/**
 * Rachador design tokens — derived from the web app's Warm Terra-cotta & Sand theme.
 * Light: hsl-converted from index.css :root block.
 * Dark:  hsl-converted from index.css .dark block.
 */

const colors = {
  light: {
    text: '#32221B',
    tint: '#EE522B',

    background: '#FCFAF8',
    foreground: '#32221B',

    card: '#FFFFFF',
    cardForeground: '#32221B',

    primary: '#EE522B',
    primaryForeground: '#FFFFFF',

    secondary: '#F5E8D6',
    secondaryForeground: '#32221B',

    muted: '#F3EFED',
    mutedForeground: '#846D62',

    accent: '#FDF6ED',
    accentForeground: '#EE522B',

    destructive: '#E23636',
    destructiveForeground: '#FFFFFF',

    border: '#EBE4E0',
    input: '#EBE4E0',

    success: '#10B981',
    successForeground: '#FFFFFF',
  },

  dark: {
    text: '#FCFAF8',
    tint: '#F06542',

    background: '#1F1814',
    foreground: '#FCFAF8',

    card: '#241D1A',
    cardForeground: '#FCFAF8',

    primary: '#F06542',
    primaryForeground: '#FFFFFF',

    secondary: '#3F2F28',
    secondaryForeground: '#FCFAF8',

    muted: '#2B211D',
    mutedForeground: '#9D867B',

    accent: '#3F2F28',
    accentForeground: '#F06542',

    destructive: '#E23636',
    destructiveForeground: '#FFFFFF',

    border: '#3F2F28',
    input: '#3F2F28',

    success: '#10B981',
    successForeground: '#FFFFFF',
  },

  /** Border radius in px — matches web app's --radius: 0.75rem (12px) */
  radius: 12,
};

export default colors;
