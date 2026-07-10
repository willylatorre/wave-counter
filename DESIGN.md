---
name: Wave Counter
description: A calm, tactile counter that keeps analytics one gesture away.
colors:
  deep-lake-ink: "oklch(28% 0.018 215)"
  quiet-lake-text: "oklch(52% 0.025 215)"
  morning-mist-surface: "oklch(97% 0.012 205)"
  lifted-mist-surface: "oklch(98.5% 0.008 205)"
  waterline-border: "oklch(84% 0.02 205)"
  tidepool-signal: "oklch(59% 0.12 194)"
  deep-tidepool-signal: "oklch(48% 0.12 194)"
  measured-error: "oklch(55% 0.17 25)"
typography:
  title:
    fontFamily: "inherit"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.012em"
  metric:
    fontFamily: "inherit"
    fontSize: "1.75rem"
    fontWeight: 720
    lineHeight: 1
    letterSpacing: "-0.035em"
  body:
    fontFamily: "inherit"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "inherit"
    fontSize: "0.6875rem"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "0.06em"
rounded:
  control: "0.875rem"
  popover: "1.125rem"
  inset: "0.75rem"
spacing:
  xs: "0.375rem"
  sm: "0.625rem"
  md: "1rem"
components:
  counter-button:
    backgroundColor: "{colors.morning-mist-surface}"
    textColor: "{colors.deep-lake-ink}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.75rem"
    height: "2.75rem"
  analytics-popover:
    backgroundColor: "{colors.lifted-mist-surface}"
    textColor: "{colors.deep-lake-ink}"
    rounded: "{rounded.popover}"
    padding: "1rem 1rem 0.875rem"
    width: "20rem"
---

# Design System: Wave Counter

## Overview

**Creative North Star: "The Pocket Instrument"**

Wave Counter is a small, precise instrument embedded in someone else's interface. It is immediately understandable, satisfying to press, and visually self-contained without becoming a card or dashboard. The component inherits its host font, uses familiar controls, and spends visual emphasis only on the event, focus, and chart.

Motion is responsive feedback plus spatial explanation. Pointer-down scale confirms contact, the analytics surface materializes from its trigger, and the line draws once to explain the seven-day shape. Keyboard openings are instant, exits are faster than entries, and accessibility preferences remove movement without removing information.

**Key Characteristics:**

- Compact 44px touch target
- Restrained cool-neutral surfaces with one tidepool accent
- Tabular numerals and host-inherited typography
- Quiet ambient depth only on the overlapping popover
- Complete pointer, touch, keyboard, and accessibility states

## Colors

The palette is a cool morning-water neutral system. It avoids coffee brown so the same component belongs equally to `likes`, `waves`, and `coffee` counters.

### Primary

- **Tidepool Signal:** Carries the icon, focus treatment, chart, and active hover border. Its rarity makes interaction legible.
- **Deep Tidepool Signal:** Supplies sufficient contrast for icon and line work on light surfaces.

### Neutral

- **Deep Lake Ink:** Primary text and structural high contrast.
- **Quiet Lake Text:** Secondary labels, comparisons, ranges, and close control.
- **Morning Mist Surface:** Resting button and hover mixing base.
- **Lifted Mist Surface:** Popover and chart-point fill.
- **Waterline Border:** Full component boundaries and chart baseline.

### Named Rules

**The One Signal Rule.** Tidepool is the only accent and appears only on action, focus, or data.

**The Host-Safe Rule.** Every public color is a CSS custom property; hosts may replace the system without rewriting selectors.

## Typography

**Display Font:** Host-inherited platform font
**Body Font:** Host-inherited platform font

**Character:** Native, compact, and numerically stable. The component adds no downloadable font and therefore does not impose a voice on its host.

### Hierarchy

- **Metric** (720, 1.75rem, 1): Analytics total with tabular figures and tight tracking.
- **Title** (700, 1rem, 1.25): Counter name inside the popover.
- **Body** (400, 0.75rem, 1.4): Comparison, range, loading, and explanatory text.
- **Label** (650, 0.6875rem, 0.06em): Short uppercase eyebrow only.

### Named Rules

**The Stable Number Rule.** Every changing total uses tabular figures; reconciliation never shifts neighboring content.

**The Host Voice Rule.** Inherit the host family and add only the weight, size, tracking, and numeric features the instrument needs.

## Elevation

The counter is flat at rest, defined by a full Waterline border and one near-flat contact shadow. The popover overlaps host content and therefore earns two ambient layers: a tight contact shadow and a broad low-opacity separation shadow.

### Shadow Vocabulary

- **Contact:** `0 1px 2px oklch(28% 0.018 215 / 0.08)` separates adjacent edges.
- **Ambient Popover:** `0 14px 34px oklch(28% 0.018 215 / 0.14)` establishes a quiet floating plane.

### Named Rules

**The Earned Depth Rule.** Only a surface that physically overlaps another surface receives an ambient shadow.

## Components

### Counter Button

- **Shape:** Gently rounded compact control (0.875rem), minimum 4.5rem wide and 2.75rem high.
- **Primary:** Morning Mist background, Deep Lake text, Waterline full border, 0.625rem by 0.75rem padding.
- **Hover / Focus:** Hover is limited to fine pointers and lightly mixes Tidepool into border and surface. Focus uses a 3px visible Tidepool ring.
- **Active:** Scales to 0.97 in 80ms and settles in 130ms; reduced motion removes the transform.

### Analytics Popover

- **Corner Style:** Soft instrument housing (1.125rem).
- **Background:** Solid Lifted Mist. It is not glass.
- **Shadow Strategy:** Contact plus Ambient Popover, as defined above.
- **Border:** One full Waterline boundary.
- **Internal Padding:** 1rem, reduced to 0.875rem at the bottom for optical balance.
- **Motion:** Pointer entry uses opacity and a 0.97 scale over 240ms from the top-left trigger origin; exit takes 160ms. Keyboard entry and reduced motion are instant.

### Analytics Line

- **Style:** One 2.25px Deep Tidepool stroke with seven small surface-filled points and a quiet Waterline baseline.
- **Motion:** Draws once in 240ms for pointer-opened analytics. It stays still for keyboard and reduced-motion users.
- **Accessibility:** SVG is hidden from assistive technology; a textual total, comparison, UTC range, and daily-count summary duplicate every value.

### Error Inset

- **Style:** Full measured-error border at low opacity, lightly tinted solid background, direct sentence, and underlined retry action.
- **State:** Remains inside the popover so analytics failure never displaces the primary counter.

## Do's and Don'ts

### Do:

- **Do** keep the primary target at least 2.75rem (44px) high.
- **Do** respond on pointer-down and reconcile optimistic totals without disabling the control.
- **Do** open from the trigger origin using only transform and opacity.
- **Do** preserve the browser context menu when analytics is disabled.
- **Do** provide textual total, comparison, UTC range, and daily counts beside every chart.
- **Do** retain visible focus, solid surfaces, and full borders under contrast and transparency preferences.

### Don't:

- **Don't** use casino counters, streak mechanics, confetti, badges, or other engagement-pressure patterns.
- **Don't** build a generic SaaS dashboard card or mini admin panel around the counter.
- **Don't** use neon-on-dark developer-tool styling, purple gradients, glassmorphism, or decorative glow.
- **Don't** use bouncy, elastic, slow, or non-interruptible motion.
- **Don't** use coffee-themed brown palettes that make the reusable library specific to one counter.
- **Don't** animate layout properties, keyboard-initiated opening, or motion under reduced-motion preferences.

