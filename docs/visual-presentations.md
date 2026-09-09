# Event-specific visual sequences — 2026-09-09

The previous production source is preserved in the annotated Git tag `v1.0.0-before-visuals` (commit 5c517d6), pushed before any visual edits. New visual delivery is tagged `visuals-2026-09-09`.

| Event | FULL sequence |
|---|---|
| High-value exobiology | Stylized biosignature scan, species reveal, estimated base credits, explicit exclusion of bonus. |
| Remarkable body | Orbital acquisition graphic, body name, readable reason labels, observed gravity when available. |
| Low fuel | Amber reserve dial, low-fuel flag threshold, scoop reminder. The dial depicts the threshold, not an invented exact fuel reading. |
| Hull critical | Brief displacement of the integrity instrument, last observed hull value, bounded edge pulses. |
| Ship destroyed | Signal trace collapses to a flat line, signal-loss message and offline status, edge effect fades. Only ShipOS graphics are affected; the game and other OBS sources are untouched. |

The illustrations are schematic graphics, not molecular analysis, measured orbits or ship-model diagrams. Modules supply semantic display data to a shared SVG/CSS renderer. The renderer never interprets Frontier fields. Existing synthesized audio cues, event detection, attention policies and presentation durations are retained.

COMPACT reduces the layout, shortens the reveal and removes global effects. SILENT continues to be owned by the Director. All animation sequences are finite and attached to the presentation DOM; cancellation removes visual/audio effects immediately. Natural completion fades the panel before expiry. Reduced-motion preference removes movement and shows the final readable content directly.

An additive `startedAt` timestamp travels with overlay.show and active snapshots. Replay/simulation translate both start and end to wall time at the selected speed. Reconnecting resumes the elapsed visual timeline, without replaying the audio cue or expired runs. Older presentation definitions without visual metadata still render a fallback.

## Validation

`npm run verify:final`: PASS on macOS / Node24.20.0, including lint, typecheck, builds, 26 unit tests, 20 integration tests, 9 golden fixtures and 4 Chromium tests. The new browser test renders all five real module presentations, checks timeline progress after reconnect, COMPACT, reduced motion, cancellation and no surviving animation. Six screenshots were inspected at1920×1080. No new package dependencies or database migrations.

## Activate in OBS

Core has to run the new Node build and the Browser Source must load the new Overlay bundle. On this Mac the deployment uses the existing launchd service. Refresh the cache of the ShipOS Browser Source in OBS after deployment, then test each event using Control Panel → Simulation → Presentation only. No Shadow Agent update is needed for this visual change.

## Return to the previous visuals

Retain any uncommitted work before switching. From a clean checkout, stop the local Core service, switch to the baseline, build, then reload the service:

```sh
cd /Users/jnbiere/Projects/ShipOS
launchctl bootout gui/$(id -u) "$HOME/Library/LaunchAgents/local.shipos.core.plist"
git switch --detach v1.0.0-before-visuals
PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm run build
launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/local.shipos.core.plist"
```

Refresh the OBS Browser Source. The database and private configuration stay in their existing external locations. To return to the new visuals, repeat with `git switch main`. Do not reset or delete the live database.
