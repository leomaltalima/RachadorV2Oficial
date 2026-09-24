---
name: PostHog wizard and basic analytics
description: The official wizard's self-driving mode is an interactive, authenticated workflow separate from basic browser analytics.
---

The PostHog `self-driving` wizard requires a personal API key and an interactive terminal; it is intended to configure PostHog's self-driving agent, not to add basic pageview tracking. Basic Rachador analytics should use the browser SDK directly, with the project key and host supplied through `VITE_*` environment variables.

**Why:** Running the wizard without a TTY exits without changes, and accepting its prompts can connect external repositories and enable unrelated agent features.

**How to apply:** For pageviews, navigation tracking, and Session Replay privacy, keep the integration scoped to `posthog-js`; only run `self-driving` when the user explicitly wants that separate feature and can review its interactive prompts.