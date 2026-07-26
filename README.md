# Nautilus

A desktop app for managing Linux servers over SSH. Connect to a server and you get a live dashboard, a multi-tab terminal, an SFTP file browser with a built-in editor, plus process, cron and snippet management — all in one window.

Built with Tauri, React and a Node.js sidecar that handles the SSH/SFTP heavy lifting.

<img src="./01.png" width="49%" alt="Dashboard" /> <img src="./02.png" width="49%" alt="Terminal and SFTP" />

## Features

- **Dashboard** — live CPU, memory, disk and network metrics, uptime, and systemd service status
- **Terminal** — full xterm.js terminal with multiple tabs and one-click snippets
- **Files** — browse the remote filesystem, drag & drop uploads, edit files in place with CodeMirror
- **Processes** — list, filter and kill processes
- **Cron** — view, create and edit scheduled jobs, with log viewing
- **Snippets** — save frequently used commands and run them with a click

Passwords never touch disk in plain text — they go into the OS credential vault (Windows Credential Manager, GNOME Keyring, macOS Keychain). Private keys are read only at connection time; only their path is stored. Nothing is sent anywhere except your servers.

## Running it

You'll need Node.js 18+, Rust ([rustup](https://rustup.rs/)) and your platform's Tauri build tools.

```bash
git clone https://github.com/ricardoborges/Nautilus.git
cd Nautilus
npm install
cd backend && npm install && cd ..

npm run tauri:dev
```

To build installers for your platform:

```bash
npm run tauri:build
```

Output lands in `src-tauri/target/release/bundle/` (`.msi`, `.deb`/`.AppImage` or `.dmg`, depending on the OS you build on).

## How it works

The Tauri shell launches a packaged Node.js backend as a sidecar. The React frontend talks to it over local HTTP, and the backend manages the SSH/SFTP sessions with [ssh2](https://github.com/mscdex/ssh2). Connections and snippets are stored as JSON in the app data directory; credentials go to the system vault via keytar.

The target server just needs SSH plus the usual tools (`ps`, `free`, `df`, `systemctl`...) for the dashboard and process views to work.

## Contributing

Issues and pull requests are welcome. If you're reporting a bug, include your OS and steps to reproduce.

## License

MIT — see [LICENSE](LICENSE).
