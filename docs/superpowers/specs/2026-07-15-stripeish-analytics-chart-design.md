# Stripeish analytics chart design

## Goal

Refine the analytics chart into a calm, Stripe-inspired trend display: a smooth
line with no persistent point markers and a restrained tidepool gradient beneath
the trend. The existing textual analytics summary remains the accessible source
of every chart value.

## Chosen direction

Use a smooth monotone curve. It is polished while avoiding overshoot that would
misrepresent daily activity. The chart retains its quiet baseline and adds a
vertical area fill that begins softly at the line and fades to transparent at the
baseline.

## Implementation boundaries

- Add shared framework-neutral helpers to derive a smooth SVG path and its
  baseline-closed area path from `analyticsChartPoints`.
- Replace React and Vue `polyline` and marker circles with a gradient definition,
  an area path, and the smooth line path.
- Use a 1.7px rounded Tidepool line, preserving the existing draw-in motion,
  SVG assistive-technology hiding, and all textual chart summaries.
- Remove marker markup and the `.wave-chart__point` CSS from both packages.
- Keep React and Vue DOM/CSS behavior visually equivalent.

## Tests and verification

- Client tests cover deterministic smooth-line and area-path generation,
  including single-point and flat data.
- React and Vue component tests assert the area/line chart structure and absence
  of persistent point markers.
- Run focused client, React, and Vue test suites, followed by the repository
  check.

## Out of scope

Interactive point inspection, tooltips, new analytics values, changes to window
math, or changes to accessible analytics copy.
