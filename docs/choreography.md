# Choreographed FULL presentations — 2026-09-09

Before editing, the previous illustrated-card release was saved and pushed as the annotated tag `before-choreography-2026-09-09` (commit 9014e0d). New delivery: `choreography-2026-09-09`.

The FULL presentation now starts with a large freestanding instrument, not an already populated card. At roughly 30–42% of its lifetime, the instrument docks to the left and the result area unfolds. Species/body identity resolves before value and reason labels. A readable result hold follows, with a final fade. Timings are proportional to the run lifetime so replay speeds and reconnect snapshots retain the correct phase.

| Event | FULL duration | Movement sequence |
|---|---|---|
| Exobiology | 10 s | Particles converge, two scan passes and biosignature construction; instrument moves and shrinks; species then estimated base value resolve. |
| Remarkable body | 11 s | Rings deploy, globe resolves, orbit rotates and observed characteristics receive successive callouts; instrument docks and final facts appear. |
| Low fuel | 7 s | Reserve segments assemble, warning arc resolves, instrument docks and the threshold warning appears. This does not simulate a measured drop from full fuel. |
| Hull critical | 8 s | Shock rings, propagating fracture, separation of schematic hull halves; damage instrument replaces the broken outline and docks beside the observed integrity. |
| Ship destroyed | 10.5 s | Trace deformation, frame fragments separate, signal collapses and graphics extinguish; short visual pause before the final signal-loss message. The game image is never blanked. |

COMPACT retains the shorter illustrated layout and durations. SILENT remains a Director decision. All visual tracks are finite CSS/SVG animations tied to the run's start/end. No idle rendering loop, physics engine, random telemetry or new dependency. Existing audio cues remain unchanged. Reduced-motion mode shows the final readable layout directly.

The full sequence footprint is larger: nominal 1000×430 in the lower-left region of a1920×1080 overlay, with a320px opening instrument. It should be reviewed against the user's OBS layout. Other configured slots still position the presentation. The dark background in the demonstration recording is injected by the browser test only; production Overlay remains transparent.

## Validation

`npm run verify:final` passes: lint, strict TypeScript, production builds,26 unit,20 integration,9 golden and5 browser tests. Browser checks sample actual motion at16%,42% and68%, verify instrument displacement, the destruction pause, resumed elapsed time, reduced motion, COMPACT, interruption cleanup and natural fade/expiry. The multi-event run is recorded as a silent WebM by Playwright. Native OBS rendering should be reviewed after refreshing its Browser Source; no claim of native OBS visual approval is made from browser tests.

## Activation / rollback

The Mac launchd Core service is restarted after building. Refresh ShipOS's Browser Source cache in OBS and use Simulation → Presentation only. No Agent update is required.

To restore the immediately preceding design, use the stop/build/start procedure in [visual-presentations](visual-presentations.md), substituting the tag `before-choreography-2026-09-09`. No data migration is included; do not delete the database. The still older original V1 is preserved as `v1.0.0-before-visuals`.
