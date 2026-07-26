# Changelog

All notable changes to Nautilus are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-07-25

This release closes several security holes in how Nautilus talks to remote
servers and how it exposes its own local API. Two of those fixes change
behaviour you will notice on first launch, which is why this is a major
version. Version 1.5.0 was never published — everything below lands on top of
[v1.4.0].

### Breaking changes

- **The first connection to each server now asks you to verify its key.** SSH
  host keys are pinned on first use, so every connection you already had saved
  prompts once for confirmation. Compare the fingerprint shown against the
  server before accepting it.
- **The local backend API now requires an authentication token.** Any external
  script or tool that was talking directly to the backend port will be rejected
  until it sends the `X-Nautilus-Auth` header.
- **A Content Security Policy is now enforced.** Inline `<script>` and `<style>`
  tags in `index.html` no longer run. If you maintain a fork, move pre-mount
  styles into a stylesheet — Tauri stamps a nonce onto inline styles at build
  time, which makes the browser ignore `unsafe-inline` and leaves Ant Design's
  runtime styles unapplied.

### Security

- **SSH host key verification (Trust On First Use).** Previously the SSH client
  accepted any host key silently, which let anyone in a position to intercept
  the network impersonate a server and capture the password sent during
  authentication. Keys are now pinned in a `known_hosts` table and compared on
  every connect, with an OpenSSH-style SHA-256 fingerprint shown for
  confirmation. Applies to terminal, SFTP and metrics sessions alike. Trusted
  hosts can be listed and revoked from the app.
- **Authentication on the local backend API.** The backend listens on a local
  port that any process on the machine — and, through a CORS preflight, any web
  page — could previously reach, and that API hands out stored SSH passwords
  and shell access to every configured server. Access is now gated by a 256-bit
  token drawn from the operating system's cryptographic random source and
  generated fresh per app launch.
- **Command injection hardening.** Container, image, volume, network and process
  identifiers are validated against an allowlist of safe characters, and
  arguments interpolated into remote shell commands are properly quoted.
- **Content Security Policy enabled** in the Tauri configuration, replacing the
  previous `null` (unrestricted) policy.

### Added

- **Environment files manager.** A new *Env* tab finds every `.env` file under
  the SSH user's home directory on the remote server and lets you edit or delete
  them. The editor presents variables as fields with masked values, filtering and
  duplicate-key warnings, and writes the file back faithfully: comments, blank
  lines, ordering, `export` prefixes and quoting style are all preserved, and any
  line that cannot be parsed with confidence is carried through untouched.
- **Connection organization.** Connections can be classified by environment
  (Production, Staging, Development, Other) and freely tagged. The list can be
  filtered by environment — with a count per environment — and searched across
  name, host, tags and environment at once.
- **Docker exec terminal.** Open an interactive shell inside a running container
  directly from the Docker dashboard.
- **Live Docker container stats** in the dashboard.
- **Backup and restore.** Export the full database to a `.ndb` file through a
  native save dialog and import it back. The schema is re-applied on import, so
  backups taken from older versions are upgraded rather than rejected.
- **Version badge** in the application header.

### Changed

- **Database writes no longer block the event loop.** Saves are debounced at
  100 ms and performed asynchronously, with a synchronous flush reserved for
  shutdown. Bursts of writes previously stalled the backend.
- **Schema creation and migration are now idempotent** and centralized, which is
  what makes importing an older backup safe.
- **Faster metrics collection.** System metrics were gathered through six or more
  separate SSH commands plus one per monitored service; they are now batched into
  a single delimited call per refresh.
- **Terminal sessions accept an initial command and an initial size**, so panes
  open already sized correctly instead of resizing after the fact, and request a
  `xterm-256color` PTY.
- **More reliable backend sidecar startup.** The binary is now searched across
  several candidate locations, covering both installed builds and development
  runs.
- **Translations updated** for all nine supported languages: English,
  Portuguese (Brazil), Spanish, French, German, Italian, Japanese, Korean and
  Chinese.

### Fixed

- Connection handling issues when opening and switching between servers.
- Several fixes in the environment files tab following its introduction.

[2.0.0]: https://github.com/ricardoborges/Nautilus/releases/tag/v2.0.0
[v1.4.0]: https://github.com/ricardoborges/Nautilus/releases/tag/v1.4.0
