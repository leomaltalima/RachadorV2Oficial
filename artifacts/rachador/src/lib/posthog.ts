import posthog from 'posthog-js';

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost =
  import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com';

export const posthogEnabled = Boolean(posthogKey);

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    autocapture: true,
    capture_pageview: false,
    capture_pageleave: true,
    session_recording: {
      // Inputs include passwords, Pix keys, card data, and other form values.
      maskAllInputs: true,
      // Use data-sensitive or ph-mask for sensitive text rendered outside inputs.
      maskTextSelector: '[data-sensitive], .ph-mask',
      // Never collect request headers or bodies in replay.
      recordHeaders: false,
      recordBody: false,
    },
    property_denylist: [
      'password',
      'token',
      'access_token',
      'refresh_token',
      'authorization',
      'card_number',
      'cvv',
      'chavePix',
    ],
  });
}

/**
 * Captures a route view without forwarding query strings or fragments, which
 * could contain invitation codes or other sensitive values.
 */
export function capturePageview(path: string): void {
  if (!posthogEnabled) {
    return;
  }

  const pageUrl = new URL(path, window.location.origin);
  pageUrl.search = '';
  pageUrl.hash = '';

  posthog.capture('$pageview', {
    $current_url: pageUrl.toString(),
  });
}