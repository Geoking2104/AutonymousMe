# Self-hosted network infrastructure

Production hApps should **not** rely on the Holochain Foundation's public
`dev-test-bootstrap2.holochain.org` servers: they are rate-limited test
servers with no uptime guarantee. This directory contains the kit to run
your own discovery/bootstrap (and signal/relay) infrastructure for
Autonymous.me.

Adapted from the official howto:
<https://developer.holochain.org/resources/howtos/running-network-infrastructure>

## Components

| Service | Purpose | Conductor config key |
|---|---|---|
| `kitsune2-bootstrap-srv` | Peer discovery + WebSocket signalling (+ relay fallback) | `bootstrap_url`, `signal_url` |
| iroh relay (optional) | QUIC relay for peers that cannot hole-punch | `relay_url` |

## Deploy the bootstrap server

Requirements: a Linux server with Docker (or Podman) + docker compose v2,
a DNS record (e.g. `bootstrap.example.org`) pointing at it, and TLS
certificates (Let's Encrypt via certbot is the common choice).

```bash
sudo mkdir -p /opt/kitsune2-bootstrap
sudo cp docker-compose.yaml /opt/kitsune2-bootstrap/
# edit the TLS paths and domain in the copied file
cd /opt/kitsune2-bootstrap
docker compose up            # watch for: #kitsune2_bootstrap_srv#listening#[::]:443#
docker compose up --detach
```

Certificates must be readable by the container (mounted read-only under
`/etc/letsencrypt` in the example). Renewal is handled by certbot on the
host; `docker compose restart bootstrap` after renewal if the files are not
symlinked transparently.

## Point the conductor at your servers

In `conductor-config.yaml` (or your kangaroo-electron config for the
distributed app), replace the dev-test URLs:

```yaml
network:
  bootstrap_url: https://bootstrap.example.org/
  signal_url: wss://bootstrap.example.org/
  relay_url: wss://bootstrap.example.org/   # if you also run an iroh relay there
  target_arc_factor: 1
```

> Note on the iroh relay: Holochain 0.6 defaults to the iroh/QUIC transport
> and needs a `relay_url`. The public `use1-1.relay.n0.iroh-canary.iroh.link`
> relay used by sandboxes is fine for development. To self-host one, build
> the Holochain-flavoured relay from the `iroh-relay-holochain` crate
> (published on crates.io) and front it with TLS. For local non-TLS testing
> you must also allow plaintext relaying in the conductor config:
>
> ```yaml
> network:
>   advanced:
>     irohTransport:
>       relayAllowPlainText: true
> ```

## Use a network seed for testing

If the same server hosts production and test traffic, isolate the test DHT
with a network seed (e.g. `hc-spin --network-seed ...` or the `network_seed`
DNA modifier at install time) so test data never lands in the production DHT.

## Production hardening (non-exhaustive)

- The compose file above is an open relay without authentication; expect
  freeloading and consider the `--sbd-limit-clients` tuning flags documented
  on the `sbd_server` crate.
- Bootstrap server state is ephemeral and can be disposed of safely;
  peers re-announce automatically (brief disruption for newcomers).
- Monitor bandwidth/uptime; size for peak concurrent peers (a couple hundred
  relayed connections per instance is the documented ballpark).
- Run bootstrap and signal/relay as separate instances to spread load.
