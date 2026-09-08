# Event catalogue

| Domain type | Evidence | Default attention policy |
|---|---|---|
| elite.ship.destroyed | Died plus recent pre-state mainShip; foot, SRV, fighter, taxi, multicrew, unknown excluded | importance100 urgency100 cost10 exclusive FULL |
| elite.ship.hull.critical | HullDamage Health≤0.2, PlayerPilot true, Fighter false, coherent mainShip; one episode |90/100 cost7 always interrupts nonexclusive |
| elite.ship.fuel.low | Status Flags bit19 false→true; unknown→true only initializes |65/80 cost4 interrupt lower priority |
| elite.exobiology.highValueDiscovery | ScanOrganic ScanType Analyse, exact stable species ID found in versioned post-U14 catalogue, estimate above configured threshold |75/30 cost4 |
| elite.exploration.remarkableBody | accumulated Scan and SAASignalsFound by SystemAddress:BodyID |70/20 cost4; semantic coalescing |

Remarkable reasons: star.black_hole (H/SupermassiveBlackHole), star.neutron (N), planet.earth_like (Earthlike body), planet.ammonia_world (Ammonia world), planet.terraformable (Terraformable), planet.high_gravity (SurfaceGravity÷9.80665), planet.many_biological_signals ($SAA_SignalType_Biological;), record.new. Missing Scan fields remain unknown or retain prior observations.

WasFootfalled true/false/absent is retained in the body inspector. False means unfootfalled as observed at Scan, never a guaranteed achievement for this commander. WasLogged remains raw and does not guarantee a bonus. SellOrganicData.BioData Value/Bonus are stored separately as actual sale observations with catalogue variance; prior estimates are not rewritten.

Died ambiguity and catalogue misses appear in source diagnostics. Hull episode resets on observed healthier hull, RepairAll, Loadout/ship changes and lifecycle boundaries. No continuous hull telemetry is promised.

Director sequence: TTL → existing decision → semantic coalescing → cooldown → score → sliding budget → profile → queue/interruption. Score0.6×importance+0.4×urgency+age boost capped10. FULL costs attentionCost; COMPACT40%; SILENT0. Budget10 per30s, queue5. Urgent≥90 and exclusive may bypass budget, with explicit trace. Every decision is persisted.
