# OBS Browser Source

Start Core, then add a Browser Source in OBS. URL `http://127.0.0.1:48100/overlay`; recommended width1920 and height1080. The page background is transparent and transient cards occupy the lower-left primary slot. One source handles the five modules. The Core serves production assets; no Vite process needed.

Open Control Panel Overlay preview, then preview a presentation. For audio, enable the Browser Source audio control option if using OBS's mixer, and choose the appropriate monitoring/output mode in Advanced Audio Properties. Avoid simultaneously monitoring multiple preview tabs if testing actual output: each connected Overlay is a renderer and can play its own cue.

WebAudio state is reported as READY, SUSPENDED, DEGRADED or DISCONNECTED. In a normal browser a user gesture may be needed; click the Overlay page once. Do not assume OBS autoplay equals browser autoplay. Use Audio → Play test cue, inspect the OBS mixer meter and an actual short recording.

## Real OBS smoke test (requires local OBS)

1. Confirm health and open the configured Browser Source.
2. Run Everything Goes Wrong; inspect interruption, readable cards and final exclusive destruction.
3. Play a test cue. Confirm meter activity and recorded output, then adjust buses.
4. Cancel a long preview; verify visual/audio stop and no delayed second cue.
5. Refresh the Browser Source while a run is active: recover only active visual state, no duplicate transient sound. Refresh after expiry: no card returns.
6. Stop/restart Core; disconnected Overlay clears, then reconnects. Browser-source refresh/cache controls may be used after a new build.

Automated Chromium tests verify rendered cards, audio oscillator creation, cancellation, missing-asset degradation and reconnect. Native OBS smoke is not claimed executed by these tests.

Optional OBS websocket v5 adapter is off by default. For `!screen`, enable it in the private Core config, supply `SHIPOS_OBS_PASSWORD` privately, and keep OBS's websocket server on its local port 4455. ShipOS 1.0 uses the configured Program scene **Relay - In-Game (Purple)** by default; change it in Modules → `chat-screen` if the scene name changes. The capture mode is `program`: OBS returns a JPEG of the composed scene at up to 1280 px wide, so crops and transforms are those actually visible in Program. An optional `requiredSource` can require a named source to be enabled through nested scenes/groups.

The chat bridge accepts the exact `!screen` command through the same local token as `!ship` and `!loadout`. It requires an active OBS stream, the configured scene to be the current Program scene, a visible target chain, a 60-second cooldown and at most 30 captures per live. Captures go under `<dataDir>/screens/<session>/` as local JPEG files; the active manifest is outside SQLite. A new OBS stream starts a new session. The confirmation is a silent, low-priority thumbnail in the existing ShipOS Browser Source. OBS disconnection, preview-only mode, source absence, scene transitions, invalid data, quota or disk failures reject without a confirmation.

The Control Panel → System page keeps a preview of the latest capture and links to the local Stream Memory page. For an intermission, add a separate OBS Browser Source with URL `http://127.0.0.1:48100/screens` to the intermission scene; it displays the latest session as a silent cross-faded slideshow. Use `http://127.0.0.1:48100/screens?mode=mosaic` for a 3-column mosaic. Set the source to 1920×1080, enable **Shutdown source when not visible**, and let the existing OBS theme frame it. The source is local, reads only ShipOS-managed session files and does not change scenes automatically.

This adapter still supports the existing `SetInputMute` operation for explicitly allowlisted input names. It never edits scenes, transforms or foreign sources. Adapter unavailability is DEGRADED and leaves Browser Source functional. A desktop capture can contain anything that is visible in the authorized OBS composition; do not put private windows in `Relay - In-Game (Purple)` while using `!screen`.

## Static overlay with macOS Reduce Motion

ShipOS follows `prefers-reduced-motion` by default. If macOS Reduce Motion is enabled, OBS may request this accessible static rendering too. To explicitly enable the broadcast animations while retaining the user's OS preference, set the ShipOS Browser Source URL to:

```text
http://127.0.0.1:48100/overlay/?motion=full
```

Refresh the Browser Source. This override applies only to that page; other overlay clients still follow the system preference. Removing the parameter restores automatic reduced-motion behavior. A Chromium regression test reproduces reduced motion and verifies that the explicit override restores progressing animations and still cleans up on cancellation.
