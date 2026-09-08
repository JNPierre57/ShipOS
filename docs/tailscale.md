# Tailscale

Revalidated 2026-09-08 against https://tailscale.com/docs/reference/tailscale-cli/serve and https://tailscale.com/kb/1080/cli . ShipOS never runs Tailscale commands or edits the tailnet.

Both machines must already be in the same tailnet. Run `tailscale status` and `tailscale ping YOUR-MAC-HOST` on Shadow. MagicDNS hostname can be used in the Agent URL when enabled; otherwise use the Mac Tailscale IP.

Preferred: Gateway bound to `127.0.0.1:48101`, then manually on Mac:

```sh
tailscale serve --bg --tcp=48101 tcp://127.0.0.1:48101
tailscale serve status
```

Agent URL is `ws://YOUR-MAC-HOST:48101/agent/v1/ws`. This is raw TCP forwarding within the encrypted tailnet. No HTTPS reverse-proxy path rewrite is required. The Agent token is sent in Authorization, never in the URL. macOS app variants can share ports through Serve; file-serving limitations do not affect this design.

Restrict tailnet access to Shadow → Mac TCP48101. Example grants fragment to adapt to your device tags (do not overwrite an existing policy):

```json
{"grants":[{"src":["tag:shipos-shadow"],"dst":["tag:shipos-mac"],"ip":["tcp:48101"]}]}
```

Assign/authorize tags with your tailnet administrator. Broader existing allow rules must also be reviewed because an additional restrictive grant does not revoke other access. Control port48100 must remain local.

Alternative: explicitly set gatewayHost to the Mac Tailscale IP in Core JSON. Do not also serve the same port. Verify local firewall and tailnet permissions. Never use 0.0.0.0 by default. No Funnel or public relay configuration.

If ping works but Agent cannot connect: inspect Serve status, Core listening address, ACL/grants and port48101. A token error is distinct from a TCP connection error. See troubleshooting.md.
