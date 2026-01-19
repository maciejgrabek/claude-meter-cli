# claude-meter

Beautiful CLI dashboard to view your Claude Code usage stats.

> **Disclaimer**: This is one of my few (if not the only) public repositories. It proudly runs under the *"Works on My Machine"* certification program. Feel free to use it as yet another geek's tool in your arsenal. No warranties, no guarantees, just vibes.

```
╭─────────────────────────╮
│  claude         v0.2.1  │
│  █▄ ▄█ █▀▀ ▀█▀ █▀▀ █▀▄  │
│  █ ▀ █ █▀▀  █  █▀▀ █▀▄  │
│  █   █ ▀▀▀  ▀  ▀▀▀ ▀ ▀  │
│  by Maciej Grabek       │
╰─────────────────────────╯

Good afternoon · Updated 2:15:32 PM
Cache: 2026-01-19  ● API connected

🔥 25 day streak!

Quota (live)
  5-hour  ████████░░░░░░░░░░░░ 42% resets in 3h 21m
  7-day   ██████░░░░░░░░░░░░░░ 31% resets in 5d 2h

           Today      Last 7d ↑    Jan  ↑      All Time
───────────────────────────────────────────────────────────
Messages   6.7K       50.1K        102.7K      186.0K
Sessions   3          36           130         289
Tools      534        6.3K         21.1K       45.2K
Tokens     12M        156M         412M        1.2B
```

## Requirements

- **Node.js 18+**
- **Claude Code CLI** installed and used at least once
- macOS, Windows, or Linux

## Installation

### Option 1: Install from GitHub (recommended)

```bash
npm install -g github:maciejgrabek/claude-meter-cli
```

### Option 2: Clone and link

```bash
git clone https://github.com/maciejgrabek/claude-meter-cli.git
cd claude-meter-cli
npm link
```

### Option 3: npm registry

```bash
npm install -g claude-meter
```

> *Not published yet - coming soon maybe, if I get around to it*

## Usage

### Basic Commands

```bash
# Show stats once
claude-meter

# Watch mode - auto-refresh every 30s
claude-meter -w

# Watch mode with custom interval (10 seconds)
claude-meter -w 10

# Open in a separate terminal window
claude-meter --popup

# My favorite: popup + watch mode + 60s refresh (perfect desk companion)
claude-meter --popup -w 60

# Show help
claude-meter --help
```

### Output Formats

```bash
# Compact one-line summary
claude-meter --compact
# Output: Today: 6.7K │ 7d: 50.1K │ All: 186.0K │ 🔥25

# JSON output (great for scripting)
claude-meter --json

# Export to file
claude-meter --export stats.json
```

### Filters

```bash
# Show only today's stats
claude-meter --today

# Show last 7 days
claude-meter --week

# Show this month
claude-meter --month
```

### Goals

Set daily and weekly message goals to track your productivity:

```bash
# Set goals (daily: 500, weekly: 3000)
claude-meter --goals 500 3000

# Clear goals
claude-meter --goals-clear
```

Goals display as progress bars in the dashboard when set.

### Authentication (for live quota)

Link to your Claude CLI OAuth session to see real-time quota information:

```bash
# Link to Claude CLI credentials (recommended)
claude-meter --auth

# Remove stored credentials
claude-meter --logout
```

This reuses the OAuth token from Claude Code CLI (stored in your system keychain). No API key needed!

### Watch Mode Controls

When running in watch mode (`-w`), use these keyboard shortcuts:

| Key | Action |
|-----|--------|
| `q` | Quit |
| `r` | Force refresh |
| `g` | Toggle goals display |

### Popup Window

Open claude-meter in a dedicated terminal window:

```bash
claude-meter --popup
```

**Supported terminals:**
- **macOS**: Terminal.app, iTerm2
- **Windows**: Windows Terminal, PowerShell, Command Prompt
- **Linux**: gnome-terminal, konsole, xfce4-terminal, xterm

## All Options

| Option | Description |
|--------|-------------|
| `-h, --help` | Show help message |
| `-v, --version` | Show version number |
| `-w, --watch` | Watch mode (auto-refresh) |
| `-w <seconds>` | Watch mode with custom interval |
| `--popup` | Open in new terminal window |
| `--json` | Output raw JSON data |
| `--compact` | Minimal one-line summary |
| `--today` | Show only today's stats |
| `--week` | Show last 7 days stats |
| `--month` | Show this month's stats |
| `--goals <d> <w>` | Set daily/weekly message goals |
| `--goals-clear` | Clear all goals |
| `--export <file>` | Export stats to JSON file |
| `--auth` | Link to Claude CLI OAuth |
| `--logout` | Remove stored credentials |

## How It Works

Claude Meter reads from two sources:

### 1. Local Stats Cache

Claude Code CLI maintains a local stats cache at `~/.claude/stats-cache.json`. This file contains:

- **Daily activity**: messages, sessions, tool calls per day
- **Token usage**: broken down by model (Opus, Sonnet, Haiku)
- **Historical data**: activity going back to when you started using Claude Code

Claude Meter simply reads this JSON file - no API calls needed for basic stats. The data updates as you use Claude Code CLI.

```
~/.claude/stats-cache.json
├── dailyActivity[]        # Per-day message/session/tool counts
├── dailyModelTokens[]     # Per-day token usage by model
└── lastComputedDate       # When cache was last updated
```

### 2. Live Quota via OAuth (optional)

For real-time quota information (the 5-hour and 7-day usage limits), Claude Meter can tap into the Anthropic API. But here's the clever bit - **you don't need an API key**.

When you run `claude-meter --auth`, it looks for Claude Code CLI's OAuth credentials stored in your system keychain:

**macOS**: Reads from Keychain Access
```bash
# Claude CLI stores credentials under this service name:
security find-generic-password -s "Claude Code-credentials" -w
```

**Windows**: Claude CLI uses the Windows Credential Manager. Claude Meter will attempt to read from there (implementation may vary - remember, "works on my machine").

**Linux**: Credentials may be stored in a keyring or config file depending on your setup.

**How the OAuth flow works:**
1. You've already authenticated Claude Code CLI (via `/login`)
2. Claude CLI stored an OAuth token in your system's secure keychain
3. Claude Meter reads that token (with your permission)
4. Uses it to call `https://api.anthropic.com/api/oauth/usage`
5. Returns your real-time quota utilization and reset times

This means:
- No separate login required
- No API keys to manage
- Uses the same session as Claude Code CLI
- Token refresh is handled by Claude CLI

**The magic header**: The quota endpoint requires a special beta header:
```
anthropic-beta: oauth-2025-04-20
```

Without this header, you'll get "OAuth not supported" errors. Ask me how I know.

## Data Storage

Claude Meter stores minimal data locally:

| File | Purpose |
|------|---------|
| `~/.claude/claude-meter-goals.json` | Your goal settings |
| `~/.claude/claude-meter-auth.json` | Cached OAuth reference |

## What About Costs?

This tool shows **activity metrics** (messages, tokens, etc.), not billing data. For cost information, visit the [Anthropic Console](https://console.anthropic.com/).

## Troubleshooting

### "Stats file not found"
Make sure Claude Code CLI is installed and you've used it at least once:
```bash
claude --version
```

### "API not connected"
Run `claude-meter --auth` to link your Claude CLI credentials. Make sure you're logged into Claude CLI first (`claude` then `/login`).

### Quota not showing
Quota requires OAuth authentication. Run:
```bash
claude-meter --auth
```

## Contributing

Found a bug? Want to add a feature? PRs welcome!

Just remember:
- This is a side project maintained in my spare time
- "It works on my machine" is a feature, not a bug
- If it breaks, you get to keep both pieces

## License

MIT - Do whatever you want with it.

## Author

**Maciej Grabek**

---

## The Meta Story

This entire project was built using [Claude Code](https://claude.ai/code) - yes, the very tool it's designed to monitor.

From the ASCII art logo, to the OAuth keychain integration, to the cross-platform popup windows - every line of code was pair-programmed with Claude. We debugged AppleScript escaping issues together, discovered the magic `anthropic-beta` header through trial and error, and celebrated when the spinners finally stopped duplicating.

*Building a Claude Code monitor with Claude Code. It doesn't get more meta than this.*
