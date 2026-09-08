# Event model

SourceEvent: strict version1 envelope, original permissive payload. Stable identity from installation, source kind, filename, byte offsets and SHA256 of content. Monotone Agent sequence, live/bootstrap mode, observation/source timestamps and file provenance. Unknown Frontier properties survive validation. Unknown events update only supported state and never crash the pipeline.

DomainEvent: version1, stable deterministic ID from module/type/sourceIDs/semantic family/revision, monotone Core sequence, occurred/emitted times, semanticKey, payload and provenance. Quality is source-observed, derived, estimated or inferred. Associated session/expedition when available. Public types are restricted to the five-event catalogue. Immutable remarkable-body revisions share a semantic family and carry accumulated reasons/sourceIDs.

PresentationAction: id, presentationRunId, type, target, issuedAt and payload. Overlay show/hide/effect, audio play/stop and optional OBS actions are presentation concerns only. Renderer does not understand Frontier records.

Bootstrap populates WorldState only; it does not emit public events, records, milestones or presentations. Simulation/replay carry distinct provenance and use isolated stores. No true network exactly-once guarantee is claimed.
