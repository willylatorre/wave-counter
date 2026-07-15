# Fresh analytics with animated period changes

## Goal

Statistics must reflect a newly recorded event when the visitor opens the
statistics popover, including when the analytics request races the event
request. Existing statistics should remain visible while a fresh request is in
flight. Changes to the displayed event total should animate when motion is
permitted.

## Design

`WaveCounterController` remains the sole owner of analytics freshness. Opening
statistics always starts a fetch for the currently selected analytics window.
It retains the last successful analytics payload while reporting
`analyticsLoading`. After a successful increment, it starts a refresh whenever
statistics are open.

Analytics requests receive a monotonically increasing request token. Only the
latest request for the controller may update analytics, loading, or analytics
error state. This prevents an analytics response that started before an event
was persisted from overwriting a later, post-increment response.

React and Vue retain their current initial loading UI only when no analytics
payload exists. While a cached payload exists and a refresh is pending, they
continue showing the current summary and chart and expose a concise accessible
"Refreshing activity" status.

The React package adds `@number-flow/react`; the Vue package adds
`@number-flow/vue`. Each default popover uses its framework wrapper only for
the analytics event total. Number Flow's default reduced-motion behavior is
retained. No animation code enters the framework-neutral browser client.

## Error handling

A refresh failure retains the last successful analytics payload and records the
error for the existing retry control. A new refresh clears the previous error.
Disabled statistics still issue no analytics requests.

## Tests

Controller tests cover: revalidation on every open, refresh after a successful
increment while open, and last-request-wins behavior for racing analytics
responses. React and Vue tests cover retaining rendered analytics during a
refresh and using the animated total component for a period switch.

## Scope

This does not add a time-based cache TTL, alter server cache headers, change
the analytics HTTP contract, or animate chart geometry.
