#!/usr/bin/env node
/**
 * Claude Meter - Beautiful CLI for Claude Code usage stats
 * by Maciej Grabek
 */

import { readFileSync, existsSync, watchFile, writeFileSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline';

const VERSION = '0.2.1';

// ANSI codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  // Colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  // Bright colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  // Background
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  // Control
  clear: '\x1b[2J\x1b[H',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  saveCursor: '\x1b[s',
  restoreCursor: '\x1b[u',
  clearLine: '\x1b[2K',
  moveUp: (n) => `\x1b[${n}A`,
  moveToColumn: (n) => `\x1b[${n}G`,
};

// Spinner frames for watch mode
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;
let lastRefreshTime = Date.now();
let progressInterval = null;

const STATS_FILE = join(homedir(), '.claude', 'stats-cache.json');
const GOALS_FILE = join(homedir(), '.claude', 'claude-meter-goals.json');
const AUTH_FILE = join(homedir(), '.claude', 'claude-meter-auth.json');

// Parse args
const args = process.argv.slice(2);

// Commands
const showHelp = args.includes('-h') || args.includes('--help');
const showVersion = args.includes('-v') || args.includes('--version');
const jsonOutput = args.includes('--json');
const compactOutput = args.includes('--compact');
const filterToday = args.includes('--today');
const filterWeek = args.includes('--week');
const filterMonth = args.includes('--month');
const watchMode = args.includes('-w') || args.includes('--watch');

// Export handling
const exportIndex = args.findIndex(a => a === '--export');
const exportFile = exportIndex !== -1 ? args[exportIndex + 1] : null;

// Goals handling
const goalsIndex = args.findIndex(a => a === '--goals');
const goalsArg = goalsIndex !== -1;
const goalsClear = args.includes('--goals-clear');

// Auth handling
const authArg = args.includes('--auth');
const authLogout = args.includes('--logout');

// Popup window
const popupArg = args.includes('--popup');

// Watch interval
const intervalArg = args.find(a => !a.startsWith('-') && !isNaN(a) && args.indexOf(a) !== exportIndex + 1);
const refreshInterval = intervalArg ? parseInt(intervalArg) * 1000 : 30000;

function printHelp() {
  console.log(`
${c.brightCyan}Claude Meter${c.reset} ${c.dim}v${VERSION}${c.reset}
${c.dim}by Maciej Grabek${c.reset}

${c.bold}USAGE${c.reset}
  claude-meter [options]

${c.bold}OPTIONS${c.reset}
  ${c.cyan}-h, --help${c.reset}        Show this help message
  ${c.cyan}-v, --version${c.reset}     Show version number
  ${c.cyan}-w, --watch${c.reset}       Watch mode (auto-refresh)
  ${c.cyan}-w <seconds>${c.reset}      Watch mode with custom interval (default: 30)

${c.bold}OUTPUT FORMATS${c.reset}
  ${c.cyan}--json${c.reset}            Output raw JSON data
  ${c.cyan}--compact${c.reset}         Minimal one-line summary

${c.bold}FILTERS${c.reset}
  ${c.cyan}--today${c.reset}           Show only today's stats
  ${c.cyan}--week${c.reset}            Show last 7 days stats
  ${c.cyan}--month${c.reset}           Show this month's stats

${c.bold}GOALS${c.reset}
  ${c.cyan}--goals <daily> <weekly>${c.reset}   Set message goals (e.g., --goals 1000 5000)
  ${c.cyan}--goals-clear${c.reset}             Clear all goals

${c.bold}EXPORT${c.reset}
  ${c.cyan}--export <file>${c.reset}   Export stats to JSON file

${c.bold}AUTHENTICATION${c.reset}
  ${c.cyan}--auth${c.reset}            Link to Claude CLI OAuth (or use API key as fallback)
  ${c.cyan}--logout${c.reset}          Remove stored credentials

${c.bold}WINDOW${c.reset}
  ${c.cyan}--popup${c.reset}           Open in a new terminal window (cross-platform)

${c.bold}WATCH MODE CONTROLS${c.reset}
  ${c.cyan}q${c.reset}                 Quit watch mode
  ${c.cyan}r${c.reset}                 Force refresh
  ${c.cyan}g${c.reset}                 Toggle goals display

${c.bold}EXAMPLES${c.reset}
  ${c.dim}$${c.reset} claude-meter                    ${c.dim}# Show full stats${c.reset}
  ${c.dim}$${c.reset} claude-meter -w 10              ${c.dim}# Watch, refresh every 10s${c.reset}
  ${c.dim}$${c.reset} claude-meter --popup            ${c.dim}# Open in new terminal window${c.reset}
  ${c.dim}$${c.reset} claude-meter --compact          ${c.dim}# Quick summary${c.reset}
  ${c.dim}$${c.reset} claude-meter --today --json     ${c.dim}# Today's stats as JSON${c.reset}
  ${c.dim}$${c.reset} claude-meter --goals 500 3000   ${c.dim}# Set daily/weekly goals${c.reset}
  ${c.dim}$${c.reset} claude-meter --export stats.json${c.reset}
`);
}

function printVersion() {
  console.log(`claude-meter v${VERSION}`);
}

function loadGoals() {
  try {
    if (existsSync(GOALS_FILE)) {
      return JSON.parse(readFileSync(GOALS_FILE, 'utf8'));
    }
  } catch {}
  return null;
}

function saveGoals(goals) {
  writeFileSync(GOALS_FILE, JSON.stringify(goals, null, 2));
}

function clearGoals() {
  try {
    if (existsSync(GOALS_FILE)) {
      unlinkSync(GOALS_FILE);
      console.log(`${c.green}✓${c.reset} Goals cleared`);
    } else {
      console.log(`${c.dim}No goals set${c.reset}`);
    }
  } catch (err) {
    console.error(`${c.red}Error clearing goals: ${err.message}${c.reset}`);
  }
}

function setGoals() {
  const dailyArg = args[goalsIndex + 1];
  const weeklyArg = args[goalsIndex + 2];

  if (!dailyArg || isNaN(dailyArg)) {
    console.error(`${c.red}Error: Please provide daily goal${c.reset}`);
    console.log(`${c.dim}Usage: claude-meter --goals <daily> [weekly]${c.reset}`);
    process.exit(1);
  }

  const goals = {
    daily: parseInt(dailyArg),
    weekly: weeklyArg && !isNaN(weeklyArg) ? parseInt(weeklyArg) : parseInt(dailyArg) * 7,
    setAt: new Date().toISOString(),
  };

  saveGoals(goals);
  console.log(`${c.green}✓${c.reset} Goals set!`);
  console.log(`  ${c.bold}Daily:${c.reset}  ${formatNumber(goals.daily)} messages`);
  console.log(`  ${c.bold}Weekly:${c.reset} ${formatNumber(goals.weekly)} messages`);
}

let showGoals = true; // Toggle for watch mode

// API constants
const USAGE_API = 'https://api.anthropic.com/api/oauth/usage';
const ANTHROPIC_BETA = 'oauth-2025-04-20';

// Auth functions
function loadAuth() {
  try {
    if (existsSync(AUTH_FILE)) {
      return JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
    }
  } catch {}
  return null;
}

function saveAuth(auth) {
  writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 });
}

async function getClaudeCliCredentials() {
  // Try to get credentials from Claude CLI's keychain entry (macOS)
  const { execSync } = await import('child_process');

  try {
    const result = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
      { encoding: 'utf8' }
    ).trim();

    if (result) {
      return JSON.parse(result);
    }
  } catch {
    // Not on macOS or no credentials stored
  }

  return null;
}

async function doAuth() {
  console.log(`${c.brightCyan}Claude Meter Authentication${c.reset}\n`);

  // First, try to reuse Claude CLI credentials
  console.log(`${c.dim}Checking for Claude CLI credentials...${c.reset}`);

  const cliCreds = await getClaudeCliCredentials();

  if (cliCreds && cliCreds.claudeAiOauth) {
    const oauth = cliCreds.claudeAiOauth;
    console.log(`${c.green}✓${c.reset} Found Claude CLI OAuth token`);

    saveAuth({
      type: 'oauth',
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken,
      expiresAt: oauth.expiresAt,
      savedAt: new Date().toISOString(),
      source: 'claude-cli'
    });

    console.log(`${c.green}✓${c.reset} Linked to Claude CLI credentials`);
    console.log(`${c.dim}Your Claude CLI OAuth session will be used${c.reset}`);
    return;
  }

  // No CLI credentials, offer alternatives
  console.log(`${c.yellow}!${c.reset} Claude CLI credentials not found\n`);
  console.log(`Options:`);
  console.log(`  1. Run ${c.cyan}claude${c.reset} and use ${c.cyan}/login${c.reset} first, then retry`);
  console.log(`  2. Use an API key instead:\n`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  console.log(`To get an API key:`);
  console.log(`  Go to ${c.cyan}https://console.anthropic.com/settings/keys${c.reset}\n`);

  const apiKey = await question(`${c.bold}API Key (or press Enter to cancel):${c.reset} `);
  rl.close();

  if (!apiKey) {
    console.log(`\n${c.dim}Cancelled${c.reset}`);
    return;
  }

  if (!apiKey.startsWith('sk-ant-')) {
    console.error(`\n${c.red}Invalid API key format${c.reset}`);
    console.log(`${c.dim}API keys should start with 'sk-ant-'${c.reset}`);
    process.exit(1);
  }

  saveAuth({
    type: 'api-key',
    apiKey,
    savedAt: new Date().toISOString()
  });
  console.log(`\n${c.green}✓${c.reset} API key saved`);
}

async function fetchQuota(auth) {
  if (!auth || auth.type !== 'oauth') return null;

  try {
    const response = await fetch(USAGE_API, {
      headers: {
        'Authorization': `Bearer ${auth.accessToken}`,
        'anthropic-beta': ANTHROPIC_BETA,
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      return await response.json();
    }
  } catch {}

  return null;
}

function formatTimeUntil(isoDate) {
  if (!isoDate) return '';
  const now = new Date();
  const reset = new Date(isoDate);
  const diffMs = reset - now;

  if (diffMs <= 0) return 'now';

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function openPopupWindow() {
  const { execSync } = await import('child_process');
  const { fileURLToPath } = await import('url');
  const { writeFileSync, unlinkSync, chmodSync } = await import('fs');
  const { tmpdir, platform } = await import('os');
  const scriptPath = fileURLToPath(import.meta.url);

  // Build the command without --popup to avoid infinite loop
  const newArgs = args.filter(a => a !== '--popup');
  if (!newArgs.includes('-w') && !newArgs.includes('--watch')) {
    newArgs.push('-w'); // Default to watch mode in popup
  }

  const os = platform();

  // ============ WINDOWS ============
  if (os === 'win32') {
    const cmd = `node "${scriptPath}" ${newArgs.join(' ')}`;

    // Try Windows Terminal first (modern, best experience)
    try {
      execSync(`wt -w 0 nt --title "Claude Meter" cmd /k "cls && ${cmd}"`, { stdio: 'ignore' });
      console.log(`${c.green}✓${c.reset} Opened in Windows Terminal`);
      return;
    } catch {}

    // Try PowerShell (common on modern Windows)
    try {
      execSync(`start powershell -NoExit -Command "Clear-Host; ${cmd}"`, { stdio: 'ignore', shell: true });
      console.log(`${c.green}✓${c.reset} Opened in PowerShell`);
      return;
    } catch {}

    // Fallback to cmd.exe (always available)
    try {
      execSync(`start "Claude Meter" cmd /k "cls && ${cmd}"`, { stdio: 'ignore', shell: true });
      console.log(`${c.green}✓${c.reset} Opened in Command Prompt`);
      return;
    } catch {}

    console.error(`${c.red}Error:${c.reset} Could not open terminal window`);
    process.exit(1);
  }

  // ============ MACOS ============
  if (os === 'darwin') {
    // Create a temporary launcher script to avoid escaping issues
    const tmpScript = join(tmpdir(), `claude-meter-${Date.now()}.sh`);
    const scriptContent = `#!/bin/bash
clear
exec node "${scriptPath}" ${newArgs.join(' ')}
`;
    writeFileSync(tmpScript, scriptContent);
    chmodSync(tmpScript, '755');

    // Window size
    const width = 560;
    const height = 620;

    // Try Terminal.app with AppleScript to set size
    const terminalScript = `
tell application "Terminal"
  activate
  do script "${tmpScript}"
  delay 0.3
  set bounds of front window to {100, 50, ${100 + width}, ${50 + height}}
end tell`;

    try {
      execSync(`osascript -e '${terminalScript.replace(/'/g, "'\\''")}'`, { stdio: 'ignore' });
      console.log(`${c.green}✓${c.reset} Opened in Terminal.app`);
      setTimeout(() => { try { unlinkSync(tmpScript); } catch {} }, 2000);
      return;
    } catch {}

    // Try iTerm2 as fallback
    const itermScript = `
tell application "iTerm2"
  activate
  set newWindow to (create window with default profile command "${tmpScript}")
  tell newWindow
    set bounds to {100, 50, ${100 + width}, ${50 + height}}
  end tell
end tell`;

    try {
      execSync(`osascript -e '${itermScript.replace(/'/g, "'\\''")}'`, { stdio: 'ignore' });
      console.log(`${c.green}✓${c.reset} Opened in iTerm2`);
      setTimeout(() => { try { unlinkSync(tmpScript); } catch {} }, 2000);
      return;
    } catch {}

    // Cleanup on failure
    try { unlinkSync(tmpScript); } catch {}
  }

  // ============ LINUX ============
  if (os === 'linux') {
    const cmd = `node "${scriptPath}" ${newArgs.join(' ')}`;

    // Try common Linux terminals
    const terminals = [
      `gnome-terminal -- bash -c "clear && ${cmd}; exec bash"`,
      `konsole -e bash -c "clear && ${cmd}; exec bash"`,
      `xfce4-terminal -e "bash -c 'clear && ${cmd}; exec bash'"`,
      `xterm -e "bash -c 'clear && ${cmd}; exec bash'"`,
    ];

    for (const termCmd of terminals) {
      try {
        execSync(termCmd, { stdio: 'ignore' });
        console.log(`${c.green}✓${c.reset} Opened in new terminal`);
        return;
      } catch {}
    }
  }

  console.error(`${c.red}Error:${c.reset} Could not open terminal window`);
  console.log(`${c.dim}Supported: macOS (Terminal/iTerm2), Windows (Terminal/cmd), Linux (gnome-terminal/konsole/xterm)${c.reset}`);
  process.exit(1);
}

function doLogout() {
  try {
    if (existsSync(AUTH_FILE)) {
      unlinkSync(AUTH_FILE);
      console.log(`${c.green}✓${c.reset} Logged out successfully`);
    } else {
      console.log(`${c.dim}Not authenticated${c.reset}`);
    }
  } catch (err) {
    console.error(`${c.red}Error:${c.reset} ${err.message}`);
  }
}

async function main() {
  // Handle special commands first
  if (showHelp) {
    printHelp();
    return;
  }

  if (showVersion) {
    printVersion();
    return;
  }

  if (goalsClear) {
    clearGoals();
    return;
  }

  if (goalsArg) {
    setGoals();
    return;
  }

  if (authArg) {
    await doAuth();
    return;
  }

  if (authLogout) {
    doLogout();
    return;
  }

  if (popupArg) {
    await openPopupWindow();
    return;
  }

  // Check stats file exists
  if (!existsSync(STATS_FILE)) {
    console.error(`${c.red}Error: Stats file not found.${c.reset}`);
    console.error(`Make sure Claude Code CLI is installed and has been used.`);
    process.exit(1);
  }

  if (watchMode) {
    process.stdout.write(c.hideCursor);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Setup keyboard input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', handleKeypress);
    }

    render();
    lastRefreshTime = Date.now();

    // Main refresh timer
    setInterval(() => {
      render();
      lastRefreshTime = Date.now();
    }, refreshInterval);

    watchFile(STATS_FILE, { interval: 5000 }, () => {
      render();
      lastRefreshTime = Date.now();
    });

    // Progress bar + spinner animation (updates every 100ms)
    setInterval(() => {
      spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
      updateProgressBar();
    }, 100);
  } else {
    render();
  }
}

function handleKeypress(key) {
  const char = key.toString();

  // q or Ctrl+C to quit
  if (char === 'q' || char === '\u0003') {
    cleanup();
  }

  // r to refresh
  if (char === 'r') {
    render();
  }

  // g to toggle goals
  if (char === 'g') {
    const goals = loadGoals();
    if (!goals) {
      // Show temporary message
      process.stdout.write(c.clear);
      render();
      console.log(`\n${c.yellow}No goals set. Use: claude-meter --goals <daily> <weekly>${c.reset}`);
    } else {
      showGoals = !showGoals;
      render();
    }
  }
}

function updateProgressBar() {
  const elapsed = Date.now() - lastRefreshTime;
  const seconds = Math.max(0, Math.ceil((refreshInterval - elapsed) / 1000));

  // Simple \r to overwrite current line (footer has no trailing newline)
  const spinner = spinnerFrames[spinnerIndex];
  const status = `${c.cyan}${spinner}${c.reset} ${c.dim}Next refresh in ${seconds}s${c.reset} ${c.cyan}${spinner}${c.reset} ${c.dim}q=quit r=refresh g=goals${c.reset}`;

  process.stdout.write('\r' + c.clearLine + status);
}

function cleanup() {
  process.stdout.write(c.showCursor);
  process.stdout.write('\n');
  console.log(`${c.dim}Goodbye!${c.reset}`);
  process.exit(0);
}

async function render() {
  try {
    const data = JSON.parse(readFileSync(STATS_FILE, 'utf8'));
    const auth = loadAuth();
    const quota = auth?.type === 'oauth' ? await fetchQuota(auth) : null;

    if (jsonOutput) {
      printJSON(data);
    } else if (compactOutput) {
      printCompact(data);
    } else if (exportFile) {
      exportStats(data);
    } else {
      if (watchMode) process.stdout.write(c.clear);
      printStats(data, quota);
    }
  } catch (err) {
    console.error(`${c.red}Error: ${err.message}${c.reset}`);
    if (!watchMode) process.exit(1);
  }
}

function printJSON(data) {
  const activity = data.dailyActivity || [];
  const now = new Date();

  let filtered = activity;
  if (filterToday) {
    const todayStr = formatDate(now);
    filtered = activity.filter(d => d.date === todayStr);
  } else if (filterWeek) {
    filtered = getLast7Days(activity);
  } else if (filterMonth) {
    filtered = getThisMonth(activity, now);
  }

  const stats = aggregateStats(filtered);
  const output = {
    period: filterToday ? 'today' : filterWeek ? 'week' : filterMonth ? 'month' : 'all',
    generated: now.toISOString(),
    stats: {
      messages: stats.messages,
      sessions: stats.sessions,
      toolCalls: stats.toolCalls,
      activeDays: stats.activeDays,
    },
    dailyActivity: filtered,
  };

  console.log(JSON.stringify(output, null, 2));
}

function printCompact(data) {
  const activity = data.dailyActivity || [];
  const now = new Date();
  const todayStr = formatDate(now);
  const todayData = activity.find(d => d.date === todayStr) || { messageCount: 0 };
  const last7Stats = aggregateStats(getLast7Days(activity));
  const allTime = aggregateStats(activity);
  const streak = calculateStreak(activity);

  const parts = [
    `${c.bold}Today:${c.reset} ${formatNumber(todayData.messageCount)}`,
    `${c.bold}7d:${c.reset} ${formatNumber(last7Stats.messages)}`,
    `${c.bold}All:${c.reset} ${formatNumber(allTime.messages)}`,
  ];

  if (streak > 1) {
    parts.push(`${c.brightYellow}🔥${streak}${c.reset}`);
  }

  console.log(parts.join(' │ '));
}

function exportStats(data) {
  const activity = data.dailyActivity || [];
  const now = new Date();

  const output = {
    exported: now.toISOString(),
    stats: {
      today: aggregateStats([activity.find(d => d.date === formatDate(now)) || {}]),
      last7Days: aggregateStats(getLast7Days(activity)),
      thisMonth: aggregateStats(getThisMonth(activity, now)),
      allTime: aggregateStats(activity),
    },
    streak: calculateStreak(activity),
    dailyActivity: activity,
  };

  writeFileSync(exportFile, JSON.stringify(output, null, 2));
  console.log(`${c.green}✓${c.reset} Stats exported to ${c.cyan}${exportFile}${c.reset}`);
}

function aggregateTokens(tokenData, dates) {
  const dateSet = new Set(dates.map(d => d.date));
  const filtered = tokenData.filter(d => dateSet.has(d.date));
  const totals = {};

  for (const day of filtered) {
    for (const [model, tokens] of Object.entries(day.tokensByModel || {})) {
      totals[model] = (totals[model] || 0) + tokens;
    }
  }

  return {
    total: Object.values(totals).reduce((a, b) => a + b, 0),
    byModel: totals
  };
}

function printStats(data, quota = null) {
  const activity = data.dailyActivity || [];
  const tokenData = data.dailyModelTokens || [];
  const now = new Date();
  const lastComputed = data.lastComputedDate || 'unknown';

  // Calculate periods
  const todayStr = formatDate(now);
  const todayEntry = activity.find(d => d.date === todayStr);
  const todayPending = !todayEntry;
  const todayData = todayEntry || { messageCount: 0, sessionCount: 0, toolCallCount: 0 };

  const last7 = getLast7Days(activity);
  const prev7 = getPrev7Days(activity);
  const thisMonth = getThisMonth(activity, now);
  const lastMonth = getLastMonth(activity, now);
  const allTime = aggregateStats(activity);

  // Token stats
  const todayTokens = aggregateTokens(tokenData, todayEntry ? [todayEntry] : []);
  const last7Tokens = aggregateTokens(tokenData, last7);
  const thisMonthTokens = aggregateTokens(tokenData, thisMonth);
  const allTimeTokens = aggregateTokens(tokenData, activity);

  const last7Stats = aggregateStats(last7);
  const prev7Stats = aggregateStats(prev7);
  const thisMonthStats = aggregateStats(thisMonth);
  const lastMonthStats = aggregateStats(lastMonth);

  // Calculate streak
  const streak = calculateStreak(activity);

  // Load goals
  const goals = loadGoals();

  // Header
  printHeader();
  console.log();

  // Greeting
  const greeting = getGreeting();
  const spinner = watchMode ? ` ${c.cyan}${spinnerFrames[spinnerIndex]}${c.reset}` : '';
  console.log(`${c.dim}${greeting} · Updated ${now.toLocaleTimeString()}${spinner}${c.reset}`);

  // Cache status
  const auth = loadAuth();
  const authStatus = auth ? `${c.green}●${c.reset} API connected` : `${c.dim}○ API not connected (--auth)${c.reset}`;
  if (todayPending) {
    console.log(`${c.dim}Cache: ${lastComputed} · Today pending${c.reset}  ${authStatus}`);
  } else {
    console.log(`${c.dim}Cache: ${lastComputed}${c.reset}  ${authStatus}`);
  }
  console.log();

  // Streak & highlights
  if (streak > 1) {
    console.log(`${c.brightYellow}🔥 ${streak} day streak!${c.reset}`);
    console.log();
  }

  // Goals progress (if set and enabled)
  if (goals && showGoals) {
    printGoalsProgress(todayData.messageCount, last7Stats.messages, goals);
    console.log();
  }

  // Quota display (if authenticated with OAuth)
  if (quota) {
    printQuota(quota);
    console.log();
  }

  // Filter mode display
  if (filterToday || filterWeek || filterMonth) {
    const filterName = filterToday ? 'Today' : filterWeek ? 'Last 7 Days' : 'This Month';
    const filtered = filterToday ? [todayData] : filterWeek ? last7 : thisMonth;
    const stats = aggregateStats(filtered);

    console.log(`${c.bold}${filterName}${c.reset}`);
    console.log(`${c.dim}─────────────────────${c.reset}`);
    console.log(`${c.bold}Messages${c.reset}    ${c.yellow}${formatNumber(stats.messages)}${c.reset}`);
    console.log(`${c.bold}Sessions${c.reset}    ${c.dim}${stats.sessions}${c.reset}`);
    console.log(`${c.bold}Tools${c.reset}       ${c.dim}${formatNumber(stats.toolCalls)}${c.reset}`);
    console.log();
  } else {
    // Main stats table
    const monthName = now.toLocaleString('default', { month: 'short' });
    const trend7 = getTrend(last7Stats.messages, prev7Stats.messages);
    const trendMonth = getTrend(thisMonthStats.messages, lastMonthStats.messages);

    console.log(`${c.bold}           Today      Last 7d ${trend7}    ${monthName}  ${trendMonth}      All Time${c.reset}`);
    console.log(`${c.dim}───────────────────────────────────────────────────────────${c.reset}`);

    // Messages row with colors
    const week7Color = getActivityColor(last7Stats.messages, 30000);
    const monthColor = getActivityColor(thisMonthStats.messages, 100000);

    let todayMsgCell;
    if (todayPending) {
      todayMsgCell = `${c.yellow}⏳ pending ${c.reset}`;
    } else {
      const todayColor = getActivityColor(todayData.messageCount, 5000);
      todayMsgCell = `${todayColor}${pad(formatNumber(todayData.messageCount), 10)}${c.reset}`;
    }

    console.log(
      `${c.bold}Messages${c.reset}   ` +
      todayMsgCell +
      `${week7Color}${pad(formatNumber(last7Stats.messages), 14)}${c.reset}` +
      `${monthColor}${pad(formatNumber(thisMonthStats.messages), 14)}${c.reset}` +
      `${c.yellow}${formatNumber(allTime.messages)}${c.reset}`
    );

    console.log(
      `${c.bold}Sessions${c.reset}   ` +
      `${c.dim}${pad(todayPending ? '-' : todayData.sessionCount, 11)}${c.reset}` +
      `${c.dim}${pad(last7Stats.sessions, 14)}${c.reset}` +
      `${c.dim}${pad(thisMonthStats.sessions, 14)}${c.reset}` +
      `${c.dim}${allTime.sessions}${c.reset}`
    );

    console.log(
      `${c.bold}Tools${c.reset}      ` +
      `${c.dim}${pad(todayPending ? '-' : formatNumber(todayData.toolCallCount), 11)}${c.reset}` +
      `${c.dim}${pad(formatNumber(last7Stats.toolCalls), 14)}${c.reset}` +
      `${c.dim}${pad(formatNumber(thisMonthStats.toolCalls), 14)}${c.reset}` +
      `${c.dim}${formatNumber(allTime.toolCalls)}${c.reset}`
    );

    console.log(
      `${c.bold}Tokens${c.reset}     ` +
      `${c.magenta}${pad(todayPending ? '-' : formatTokens(todayTokens.total), 11)}${c.reset}` +
      `${c.magenta}${pad(formatTokens(last7Tokens.total), 14)}${c.reset}` +
      `${c.magenta}${pad(formatTokens(thisMonthTokens.total), 14)}${c.reset}` +
      `${c.magenta}${formatTokens(allTimeTokens.total)}${c.reset}`
    );

    console.log();

    // Activity heatmap (last 21 days, 3 weeks)
    printHeatmap(activity, 21);
    console.log();

    // Daily chart
    printDailyChart(activity, 10);
  }

  // Footer - no newline at end so updateProgressBar can overwrite with \r
  if (watchMode) {
    console.log();
    const spinner = spinnerFrames[spinnerIndex];
    const seconds = Math.ceil(refreshInterval / 1000);
    process.stdout.write(`${c.cyan}${spinner}${c.reset} ${c.dim}Next refresh in ${seconds}s${c.reset} ${c.cyan}${spinner}${c.reset} ${c.dim}q=quit r=refresh g=goals${c.reset}`);
  }
}

function printGoalsProgress(todayMsgs, weekMsgs, goals) {
  console.log(`${c.bold}Goals${c.reset}`);

  // Daily progress
  const dailyPct = Math.min((todayMsgs / goals.daily) * 100, 100);
  const dailyBar = makeProgressBar(dailyPct, 20);
  const dailyStatus = todayMsgs >= goals.daily ? `${c.green}✓${c.reset}` : `${Math.round(dailyPct)}%`;
  console.log(`  Daily   ${dailyBar} ${formatNumber(todayMsgs)}/${formatNumber(goals.daily)} ${dailyStatus}`);

  // Weekly progress
  const weeklyPct = Math.min((weekMsgs / goals.weekly) * 100, 100);
  const weeklyBar = makeProgressBar(weeklyPct, 20);
  const weeklyStatus = weekMsgs >= goals.weekly ? `${c.green}✓${c.reset}` : `${Math.round(weeklyPct)}%`;
  console.log(`  Weekly  ${weeklyBar} ${formatNumber(weekMsgs)}/${formatNumber(goals.weekly)} ${weeklyStatus}`);
}

function printQuota(quota) {
  console.log(`${c.bold}Quota${c.reset} ${c.dim}(live)${c.reset}`);

  // 5-hour limit
  if (quota.five_hour) {
    const pct = quota.five_hour.utilization || 0;
    const bar = makeQuotaBar(pct, 20);
    const resetTime = formatTimeUntil(quota.five_hour.resets_at);
    const resetLabel = resetTime ? `${c.dim}resets in ${resetTime}${c.reset}` : '';
    console.log(`  5-hour  ${bar} ${pct}% ${resetLabel}`);
  }

  // 7-day limit
  if (quota.seven_day) {
    const pct = quota.seven_day.utilization || 0;
    const bar = makeQuotaBar(pct, 20);
    const resetTime = formatTimeUntil(quota.seven_day.resets_at);
    const resetLabel = resetTime ? `${c.dim}resets in ${resetTime}${c.reset}` : '';
    console.log(`  7-day   ${bar} ${pct}% ${resetLabel}`);
  }
}

function makeQuotaBar(percent, width) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  let color = c.green;
  if (percent >= 90) color = c.brightRed;
  else if (percent >= 75) color = c.red;
  else if (percent >= 50) color = c.yellow;
  else if (percent >= 25) color = c.cyan;

  return `${color}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset}`;
}

function makeProgressBar(percent, width) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  let color = c.red;
  if (percent >= 100) color = c.green;
  else if (percent >= 75) color = c.yellow;
  else if (percent >= 50) color = c.cyan;
  else if (percent >= 25) color = c.blue;

  return `${color}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset}`;
}

function printHeader() {
  const art = `${c.brightCyan}╭─────────────────────────╮
│  ${c.dim}claude${c.reset}${c.brightCyan}         ${c.dim}v${VERSION}${c.reset}${c.brightCyan}  │
│  ${c.bold}${c.white}█▄ ▄█ █▀▀ ▀█▀ █▀▀ █▀▄${c.reset}${c.brightCyan}  │
│  ${c.bold}${c.white}█ ▀ █ █▀▀  █  █▀▀ █▀▄${c.reset}${c.brightCyan}  │
│  ${c.bold}${c.white}█   █ ▀▀▀  ▀  ▀▀▀ ▀ ▀${c.reset}${c.brightCyan}  │
│  ${c.dim}by Maciej Grabek${c.reset}${c.brightCyan}       │
╰─────────────────────────╯${c.reset}`;
  console.log(art);
}

function printHeatmap(activity, days) {
  console.log(`${c.bold}Activity Heatmap${c.reset} ${c.dim}(last ${days} days)${c.reset}`);

  const recent = activity.slice(-days);
  const maxMsgs = Math.max(...recent.map(d => d.messageCount), 1);

  // Build heatmap row
  let heatmap = '';
  const blocks = ['░', '▒', '▓', '█'];

  for (const day of recent) {
    const intensity = day.messageCount / maxMsgs;
    const blockIndex = Math.min(Math.floor(intensity * 4), 3);
    const color = getHeatColor(intensity);
    heatmap += `${color}${blocks[blockIndex]}${c.reset}`;
  }

  // Day labels
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days + 1);

  console.log(heatmap);
  console.log(`${c.dim}${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).padEnd(days - 6)}${'today'.padStart(5)}${c.reset}`);
}

function printDailyChart(activity, days) {
  console.log(`${c.bold}Daily Breakdown${c.reset}`);

  const recent = activity.slice(-days);
  const maxMsgs = Math.max(...recent.map(d => d.messageCount), 1);
  const peakDay = recent.reduce((max, d) => d.messageCount > max.messageCount ? d : max, recent[0]);
  const now = new Date();
  const todayStr = formatDate(now);

  for (const day of recent) {
    const date = new Date(day.date);
    const isToday = day.date === todayStr;
    const isPeak = day === peakDay && day.messageCount > 0;

    const dayLabel = isToday ? 'today' : date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    const bar = makeGradientBar(day.messageCount, maxMsgs, 25);
    const count = formatNumber(day.messageCount).padStart(6);

    const prefix = isToday ? c.brightGreen : c.dim;
    const suffix = isPeak ? ` ${c.brightYellow}★${c.reset}` : '';

    console.log(`${prefix}${dayLabel.padStart(9)}${c.reset} ${bar}${count}${suffix}`);
  }
}

function makeGradientBar(value, max, width) {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  const intensity = value / max;

  // Choose color based on intensity
  const color = getHeatColor(intensity);

  return `${color}${'█'.repeat(filled)}${c.dim}${'░'.repeat(width - filled)}${c.reset}`;
}

function getHeatColor(intensity) {
  if (intensity === 0) return c.dim;
  if (intensity < 0.2) return c.blue;
  if (intensity < 0.4) return c.cyan;
  if (intensity < 0.6) return c.green;
  if (intensity < 0.8) return c.yellow;
  return c.brightRed;
}

function getActivityColor(value, highThreshold) {
  const ratio = value / highThreshold;
  if (ratio < 0.1) return c.dim;
  if (ratio < 0.3) return c.blue;
  if (ratio < 0.5) return c.cyan;
  if (ratio < 0.7) return c.green;
  if (ratio < 0.9) return c.yellow;
  return c.brightRed;
}

function getTrend(current, previous) {
  if (previous === 0) return ' ';
  const diff = ((current - previous) / previous) * 100;
  if (diff > 10) return `${c.green}↑${c.reset}`;
  if (diff < -10) return `${c.red}↓${c.reset}`;
  return `${c.dim}→${c.reset}`;
}

function calculateStreak(activity) {
  const sorted = [...activity].sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  const today = formatDate(new Date());

  for (let i = 0; i < sorted.length; i++) {
    const expected = new Date();
    expected.setDate(expected.getDate() - i);
    const expectedStr = formatDate(expected);

    const day = sorted.find(d => d.date === expectedStr);
    if (day && day.messageCount > 0) {
      streak++;
    } else if (i === 0 && expectedStr === today) {
      // Today might not have activity yet, check yesterday
      continue;
    } else {
      break;
    }
  }

  return streak;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '🌙 Late night coding';
  if (hour < 12) return '☀️ Good morning';
  if (hour < 17) return '🌤️ Good afternoon';
  if (hour < 21) return '🌆 Good evening';
  return '🌙 Night owl mode';
}

function aggregateStats(data) {
  return {
    messages: data.reduce((sum, d) => sum + (d.messageCount || 0), 0),
    sessions: data.reduce((sum, d) => sum + (d.sessionCount || 0), 0),
    toolCalls: data.reduce((sum, d) => sum + (d.toolCallCount || 0), 0),
    activeDays: data.filter(d => d.messageCount > 0).length,
  };
}

function getLast7Days(activity) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return activity.filter(d => new Date(d.date) >= cutoff);
}

function getPrev7Days(activity) {
  const start = new Date();
  start.setDate(start.getDate() - 14);
  const end = new Date();
  end.setDate(end.getDate() - 7);
  return activity.filter(d => {
    const date = new Date(d.date);
    return date >= start && date < end;
  });
}

function getThisMonth(activity, now) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return activity.filter(d => new Date(d.date) >= monthStart);
}

function getLastMonth(activity, now) {
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  return activity.filter(d => {
    const date = new Date(d.date);
    return date >= lastMonthStart && date <= lastMonthEnd;
  });
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function formatNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatTokens(n) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function pad(str, len) {
  return String(str).padEnd(len);
}

main();
