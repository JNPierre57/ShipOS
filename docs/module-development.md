# Module development

Register internal compiled modules explicitly in `apps/core/src/modules.ts`. Module code lives in modules/<name>/src/index.ts. Public SDK types are in packages/module-sdk. Do not import Core, Node servers, SQL, process.env or OBS; architecture checks enforce this boundary.

Implement manifest (id/version/name/eventType), Zod configSchema, policy, detect and present. `detect(source, previous, next, ctx)` returns deterministic Candidate[]; `present(event, profile)` returns a declarative title/subtitle/accent/duration/slot/layers/audioAsset. Public event types are a closed V1 contract. No runtime plugin marketplace.

ctx.storage prefixes keys with the module ID. ctx.records compares finite numeric candidates atomically, records only improvements and adds a deterministic milestone. Both services are bound to the current RunContext store. WorldState copies are recursively frozen. ctx.logger adds source-correlated Inspector diagnostics. Never mutate source payloads or store arbitrary external resources.

Hooks are synchronous V1 code. Wrapper savepoints roll back partial writes on exception. Recoverable errors isolate the module and increment its failure count; the configurable `moduleFailureThreshold` defaults to 3 consecutive failures before disablement. Successful execution resets the count. A mistaken Promise return/rejection is contained as a hook contract failure, not an unhandled rejection. Infinite CPU loops are not sandboxed.

Use source IDs and stable semantic keys; Core EventFactory supplies IDs. Do not assign random business-event IDs, sequences or presentation IDs. Add unit, golden and module boundary tests. Presentation assets must use stable catalogue IDs. Audio cues here are original synthesized tones, no Frontier assets.
