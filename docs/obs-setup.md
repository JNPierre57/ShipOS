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

Optional OBS websocket v5 adapter is off by default. Enable through Core config, supply SHIPOS_OBS_PASSWORD privately, and explicitly list ShipOS-owned input names in allowedInputs. V1 only supports SetInputMute for allowed names via local API. It never edits scenes, transforms or foreign sources. Adapter unavailability is DEGRADED and leaves Browser Source functional.
