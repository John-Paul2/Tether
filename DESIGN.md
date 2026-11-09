---
version: alpha
name: Tether-design-system
description: Design language for Tether, a PayPal webhook doctor. Adapted from a fintech design analysis (heavy display sans, rounded 24px cards, pill buttons, cool-tinted canvas) with PayPal-style blue as the single brand accent. Optimised for a dense dashboard, not a marketing page.

colors:
  primary: "#0070E0"
  on-primary: "#FFFFFF"
  primary-active: "#003087"
  primary-light: "#66B2FF"
  primary-neutral: "#B9D6F7"
  primary-pale: "#E3EFFC"
  ink: "#0B1426"
  ink-deep: "#003087"
  body: "#454B55"
  mute: "#6B7380"
  canvas: "#FFFFFF"
  canvas-soft: "#E9EEF5"
  positive: "#2EAD4B"
  positive-deep: "#054D28"
  positive-bg: "#E3F6E8"
  warning: "#FFD11A"
  warning-deep: "#B86700"
  warning-content: "#4A3B1C"
  warning-bg: "#FFF6CC"
  negative: "#D03238"
  negative-deep: "#A72027"
  negative-bg: "#320707"
  chart-1: "#0070E0"
  chart-2: "#003087"
  chart-3: "#009CDE"
  chart-4: "#8FB8E8"
  chart-5: "#FFC091"

typography:
  display-lg:
    fontFamily: Manrope, Inter, system-ui, sans-serif
    fontSize: 56px
    fontWeight: 800
    lineHeight: 60px
  display-md:
    fontFamily: Manrope, Inter, system-ui, sans-serif
    fontSize: 40px
    fontWeight: 800
    lineHeight: 44px
  display-sm:
    fontFamily: Manrope, Inter, system-ui, sans-serif
    fontSize: 28px
    fontWeight: 800
    lineHeight: 34px
  heading:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.2px
  body-md:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-md-strong:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 16px
    fontWeight: 600
    lineHeight: 24px
  body-sm:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  body-sm-strong:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
  caption:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  button-md:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 16px
    fontWeight: 600
    lineHeight: 24px

rounded:
  none: 0px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px

components:
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm-strong}"
    padding: "{spacing.md} {spacing.xl}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    hoverBackgroundColor: "{colors.primary-active}"
    typography: "{typography.button-md}"
    rounded: "{rounded.xl}"
    padding: "{spacing.md} {spacing.xl}"
  button-secondary:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.xl}"
    padding: "{spacing.md} {spacing.xl}"
  button-tertiary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.xl}"
    padding: "{spacing.md} {spacing.xl}"
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.md} {spacing.lg}"
  card-content:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  card-feature-sage:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  card-feature-blue:
    backgroundColor: "{colors.primary-pale}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  card-feature-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.primary-light}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  kpi-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    numberTypography: "{typography.display-md}"
    labelTypography: "{typography.body-sm}"
    labelColor: "{colors.mute}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  step-card:
    description: "One agent tool call in the live trace: tool name, short result, duration, model used."
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.canvas-soft}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md} {spacing.lg}"
  diagnosis-card:
    description: "Final agent diagnosis: root cause badge, plain-English summary, evidence list, confidence, approve button."
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  demo-controls-banner:
    description: "Labelled demo fault-injection controls. Must be visibly marked as a demo."
    backgroundColor: "{colors.warning-bg}"
    textColor: "{colors.warning-content}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg} {spacing.xl}"
  badge-positive:
    backgroundColor: "{colors.positive-bg}"
    textColor: "{colors.positive-deep}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.pill}"
    padding: "{spacing.xs} {spacing.md}"
  badge-info:
    backgroundColor: "{colors.primary-pale}"
    textColor: "{colors.primary-active}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.pill}"
    padding: "{spacing.xs} {spacing.md}"
  badge-warning:
    backgroundColor: "{colors.warning-bg}"
    textColor: "{colors.warning-content}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.pill}"
    padding: "{spacing.xs} {spacing.md}"
  badge-negative:
    backgroundColor: "{colors.negative-bg}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.pill}"
    padding: "{spacing.xs} {spacing.md}"
  data-table:
    headerBackground: "{colors.canvas-soft}"
    headerTypography: "{typography.caption}"
    bodyTypography: "{typography.body-sm}"
    cellPadding: "{spacing.md} {spacing.lg}"
    rowBorder: "{colors.canvas-soft}"
---

## Overview

Tether is a payment-event doctor, and its interface should feel calm, clear and trustworthy, like a modern fintech product. The look is built from three decisions:

1. **One brand accent: PayPal-style blue** (`{colors.primary}`, `#0070E0`). Every primary action uses it. Nothing else is brand-coloured.
2. **Cool-tinted surfaces.** Pages sit on a pale blue-grey canvas (`{colors.canvas-soft}`), and white cards (`{colors.canvas}`) sit on top. The contrast between page and card is the elevation. No drop shadows.
3. **Friendly geometry.** 24px radius on cards and buttons, pill-shaped badges, generous whitespace.

This file adapts a design analysis of a fintech brand's visual language. Use only the structure and tokens defined here. Do not use that brand's name, logo, wordmark or proprietary fonts anywhere in the UI.

## Dashboard adaptation

The source analysis was written for a marketing site with 64 to 126px hero headlines. Tether is a dense dashboard, so:
- Do not use hero-scale type. The largest size is `{typography.display-lg}` (56px), reserved for an optional landing header. Page titles use `{typography.display-sm}`, and KPI figures use `{typography.display-md}`.
- Keep the heavy display weight (800) for titles and KPI numbers only. Everything else uses Inter at 400 or 600.
- Prefer sentence case. Avoid all-caps labels and decorative eyebrows.

## Colors

- **Primary blue** `{colors.primary}`: primary buttons, active nav indicator, links, focus accents, the first chart series.
- **Primary active** `{colors.primary-active}` (deep navy): hover and pressed states, and text on pale blue surfaces.
- **Primary light** `{colors.primary-light}`: use this instead of primary for text or icons on dark (`{colors.ink}`) surfaces. The main blue does not have enough contrast on dark.
- **Primary pale / neutral**: soft blue surface tints, selected rows, info badges.
- **Ink** `{colors.ink}`: headings and primary text. **Body** `{colors.body}`: secondary text. **Mute** `{colors.mute}`: captions and placeholders.
- **Semantic colors carry status, not the brand.** Green means success (verified, PAID, healed). Yellow means caution (demo controls, slow, unconfirmed). Red means failure (signature failed, drift unresolved). Since the brand is blue, green is free to mean success.
- **Charts** use the blue family first (`chart-1` to `chart-4`), with the peach `chart-5` only where a contrasting series is needed. Never rely on colour alone. Add labels or patterns.

On white text over primary blue, contrast is about 4.8:1, which passes AA. Never put dark text on the blue button.

## Typography

- **Display (titles, KPI numbers):** Manrope, weight 800.
- **Everything else:** Inter, 400 for body and 600 for emphasis and buttons.
- Load both with `next/font/google` (self-hosted at build time). Provide system-font fallbacks.
- Line lengths stay under about 80 characters. Numbers in tables and KPIs use tabular figures (`font-variant-numeric: tabular-nums`).

## Layout and shape

- Base spacing unit is 4px. Cards use 24px padding. Page sections are separated by 32 to 48px.
- Radius: `{rounded.xl}` (24px) for cards, panels and buttons. `{rounded.lg}` (16px) for dense items such as trace steps and grid widgets. `{rounded.md}` (12px) for inputs. `{rounded.pill}` for badges.
- Page background is `{colors.canvas-soft}`. Cards are `{colors.canvas}` with no border and no shadow. Use a 1px `{colors.canvas-soft}` border only inside cards to separate items.
- Responsive: usable down to a 375px width. Doctor panel stacks below the dashboard on mobile.

## Components

- **Primary button:** blue pill, white label. Used once per view for the main action, such as "Approve fix". Disabled state is `{colors.canvas-soft}` with `{colors.mute}` text, and it must explain why it is disabled.
- **Secondary and tertiary buttons:** sage fill, or white with a 1px ink border.
- **Step card:** one agent tool call. Shows tool name, one-line result, duration and model used. Steps appear live as they arrive, and the newest step has a subtle blue left accent.
- **Diagnosis card:** root-cause badge, plain-English summary, evidence items (each linked to its step), confidence, then the approve button.
- **Demo controls banner:** always visibly labelled "Demo controls" in warning colours, with a note that dropping webhooks is a simulated fault.
- **Badges:** positive (verified, PAID), info (CREATED, resent), warning (unconfirmed), negative (failed, drift).
- **Focus:** every interactive element has a visible 2px focus ring in `{colors.primary-active}` with a 2px offset. Never remove outlines.
- **Motion:** only motion that answers a user action (a step appearing, a status changing). No page-load animation sequences. Respect `prefers-reduced-motion`.

## AG Studio theme mapping

Define all colours once as CSS variables (in `app/globals.css`) and have the AG Studio theme reference those variables, so a later restyle means editing one place.

| AG Studio theme parameter | Token |
|---|---|
| `accentColor` | `{colors.primary}` |
| `textColor` | `{colors.ink}` |
| `backgroundColor` | `{colors.canvas}` |
| `borderColor` | `{colors.canvas-soft}` |
| `fontFamily` | Inter stack |
| `studioWidgetBorderRadius` | 16 |
| `studioWidgetTitleTextColor` | `{colors.ink}` |
| `gridHeaderTextColor` | `{colors.mute}` |
| `gridRowHeight` | 40 |
| `chartPaletteFills1Color` to `5Color` | `chart-1` to `chart-5` |

## Do

- Use blue only for primary actions, links, active states and the lead chart series.
- Put white cards on the soft blue-grey canvas, and let surface contrast be the elevation.
- Use green, yellow and red strictly for status.
- Keep copy plain and specific: "Approve fix", not "Submit". Errors say what went wrong and what to do next.
- Show real data states: empty ("No drift found. Your receipt log matches PayPal."), loading, slow model, PayPal timeout.

## Don't

- Don't add a second brand accent, gradients or decorative shadows.
- Don't use green for a primary button. Blue is the action colour.
- Don't set text in blue on dark surfaces without switching to `{colors.primary-light}`.
- Don't use PayPal logos or marks in the Tether brand. A plain-text note such as "Uses PayPal sandbox APIs" is fine.
- Don't use sharp-cornered buttons or cards.
- Don't hide the demo-fault label or make a simulated action look like a real production action.