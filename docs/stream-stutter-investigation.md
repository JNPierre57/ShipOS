# Stream stutter investigation — 2026-09-09

User reports brief stutters when ShipOS appears, including in the Shadow gameplay window itself. This is not sufficient evidence that Elite's remote frame rate drops: the local Shadow decoder/display can stall too. OBS was closed when investigated; no simultaneous OBS/Shadow/game FPS capture was possible.

## Observations from the completed stream

- OBS session 17:33–19:27 local Paris time, Apple M1 Pro, 16GB, 1080p30 output. Five VideoToolbox multitrack streaming encoders and a vertical replay-buffer encoder were active. This establishes concurrent work, not overload by itself.
- OBS reported 78 rendering misses out of192,721 attempted frames (about0.04%). The highest encoding-lag count was214/192,694 (about0.11%); do not add the counts of the separate encoders together.
- A persisted live ConsoleStrip started at19:08:55.003. At19:08:56.004 OBS logged an extra170ms audio buffer attributed to ShipOS (total405ms). Temporal association, not proof of causality or the duration of a video freeze.
- Shadow logs contain audio catch-up warnings. None falls within±2s of the11 live presentations examined during this stream. The logs do not provide continuous game/decoder FPS, so this does not rule out client, network or remote stalls.
- Existing synthetic idle/context benchmarks do not establish performance during real OBS compositing, hardware encoding and Shadow decoding together.

## Measured visual optimization

`scripts/profile-overlay.mjs` uses an isolated Chromium page with its WebSocket intercepted. It sends no events to Core or OBS and changes no stream settings. Three synthetic ConsoleStrips are shown per variant; CDP records paint events and task time. No audio is included. It explicitly compares the former animated clip mask, opacity/transform, then the mask again.

Before the CSS change, the A/B/A measurement was:

| Entry | Paint events | Paint duration | Browser task duration |
|---|---:|---:|---:|
| Original mask |114|6.502ms|99.414ms|
| Opacity + 8px translation |18|1.074ms|97.344ms|
| Original mask repeated |87|13.758ms|138.429ms|

This supports removing an avoidable repaint cost. It does **not** demonstrate a corresponding improvement in Shadow FPS; browser task time is noisy and headless Chromium is not OBS's embedded browser. The CSS change retains the260ms entry, line reveals, fatal sequence and reduced-motion override. No OBS encoding, Shadow quality or audio-routing setting was changed.

## Remaining discrimination

Reload the OBS browser source to use the lighter entry. A controlled test with Shadow displaying a steady scene and a synthetic ShipOS alert distinguishes alert-triggered contention from a scan/game transition that happens to trigger a real alert. During that test capture OBS Stats (rendering and encoding misses) alongside Shadow's client statistics and, if available, the remote game's FPS. A stable remote FPS with client display stutter points downstream of the game; missed OBS frames alone cannot identify the remote game as the cause. Audio should be tested separately by omitting audio generation, not merely reducing volume, if stutters persist.

No claim is made that the freeze has been fully reproduced or eliminated.

Validation: lint, production build and four Context/terminal browser tests passed. General reference for interpreting compositing/encoding workload: [OBS Encoding Performance Troubleshooting](https://obsproject.com/kb/encoding-performance-troubleshooting). No private raw logs are included in this repository.
