# computer-use-mcp

Kitsune AI-specific macOS desktop orchestration MCP service.

## Why This Exists

This package exists because Kitsune AI already has many useful pieces in the monorepo —
providers, chat UX, MCP attachment, desktop app surfaces, browser integrations,
tool bridges, and workflow-related logic — but those pieces are still too easy to
use as isolated features instead of one coherent agent system.

`computer-use-mcp` is the missing execution substrate for that gap.

The current goal is not to add "another computer use demo". The goal is to give
Kitsune AI a unified way to:

- observe the current desktop or browser state
- choose the right execution surface for the task
- run deterministic actions through tools and terminal commands
- keep approvals, trace, and audit artifacts attached to the run
- compose those actions into repeatable workflows instead of one-off demos

In short:

- Kitsune AI remains the control plane and agent shell
- `computer-use-mcp` is the local execution and workflow substrate
- the value is in orchestration, not in cursor movement by itself

## What It Is

This package is no longer positioned as a generic remote computer-use experiment.
The current v1 shape is:

- Kitsune AI keeps the control plane:
  - MCP tool surface
  - approval queue protocol
  - audit log
  - trace history
  - screenshot persistence
- `computer-use-mcp` provides a local macOS execution layer:
  - window observation
  - screenshots
  - app open/focus
  - mouse/keyboard injection
  - background terminal command execution
- Kitsune AI desktop adds a native approval adapter:
  - `approval_required` still comes from MCP
  - Electron shows a native dialog
  - Kitsune AI automatically calls approve/reject on the user's behalf

The intended story is:

- Kitsune AI uses tools first
- visual observation is supplementary, not the primary execution path
- terminal commands are executed by a background shell runner, not by scripting Terminal tabs
- desktop/Electron/native apps and browser DOM are treated as different execution surfaces

## Current Executor Modes

- `dry-run`
  - default
  - never injects input
  - still captures best-effort local screenshots for debugging
- `macos-local`
  - current primary backend
  - window observation via `NSWorkspace + CGWindowList`
  - input injection via Swift + Quartz `CGEvent`
  - app open/focus via `open -a` and `activate`
- `linux-x11`
  - retained as a legacy experimental backend
  - not the main v1 story anymore

## Tool Surface

Desktop observation and control:

- `desktop_get_capabilities`
- `desktop_observe_windows`
- `desktop_screenshot`
- `desktop_open_app`
- `desktop_focus_app`
- `desktop_click`
- `desktop_type_text`
- `desktop_press_keys`
- `desktop_scroll`
- `desktop_wait`

Terminal orchestration:

- `terminal_exec`
- `terminal_get_state`
- `terminal_reset_state`

Clipboard bridge:

- `secret_read_env_value`
- `clipboard_read_text`
- `clipboard_write_text`

Browser DOM bridge:

- `browser_agent_get_status`
- `browser_agent_run`
- `browser_dom_get_bridge_status`
- `browser_dom_get_active_tab`
- `browser_dom_read_page`
- `browser_dom_find_elements`
- `browser_dom_click`
- `browser_dom_read_input_value`
- `browser_dom_set_input_value`
- `browser_dom_check_checkbox`
- `browser_dom_select_option`
- `browser_dom_wait_for_element`
- `browser_dom_get_element_attributes`
- `browser_dom_get_computed_styles`
- `browser_dom_trigger_event`

Approval and audit helpers:

- `desktop_list_pending_actions`
- `desktop_approve_pending_action`
- `desktop_reject_pending_action`
- `desktop_get_session_trace`

Workflow orchestration:

- `workflow_open_workspace`
- `workflow_validate_workspace`
- `workflow_run_tests`
- `workflow_inspect_failure`
- `workflow_browse_and_act`
- `workflow_resume`

## Environment Variables

Core:

- `COMPUTER_USE_EXECUTOR`
  - `dry-run`, `macos-local`, or `linux-x11`
- `COMPUTER_USE_APPROVAL_MODE`
  - `actions` (default), `all`, `never`
- `COMPUTER_USE_SESSION_ROOT`
  - local output directory for screenshots and `audit.jsonl`
- `COMPUTER_USE_TIMEOUT_MS`
- `COMPUTER_USE_DEFAULT_CAPTURE_AFTER`
- `COMPUTER_USE_MAX_OPERATIONS`
- `COMPUTER_USE_MAX_OPERATION_UNITS`
- `COMPUTER_USE_MAX_PENDING_ACTIONS`

macOS orchestration:

- `COMPUTER_USE_OPENABLE_APPS`
  - default `Terminal,Cursor,Google Chrome`
- `COMPUTER_USE_DENY_APPS`
  - default includes `1Password`, `Keychain`, `System Settings`, `Activity Monitor`, `Kitsune AI`
- `COMPUTER_USE_DENY_WINDOW_TITLES`
- `COMPUTER_USE_TERMINAL_SHELL`
  - default current shell, otherwise `/bin/zsh`
- `COMPUTER_USE_ALLOWED_BOUNDS`
  - optional global coordinate clamp

Browser DOM bridge:

- `COMPUTER_USE_BROWSER_DOM_BRIDGE_ENABLED`
  - default `true`
- `COMPUTER_USE_BROWSER_DOM_BRIDGE_HOST`
  - default `127.0.0.1`
- `COMPUTER_USE_BROWSER_DOM_BRIDGE_PORT`
  - default `8765`
- `COMPUTER_USE_BROWSER_DOM_BRIDGE_TIMEOUT_MS`
  - default `10000`

## Kitsune AI Integration

Kitsune AI still connects through `mcp.json`.
Example local macOS entry:

```json
{
  "mcpServers": {
    "computer_use": {
      "command": "pnpm",
      "args": [
        "-F",
        "@kitsune/computer-use-mcp",
        "start"
      ],
      "cwd": "/path/to/your/kitsune/repo",
      "env": {
        "COMPUTER_USE_EXECUTOR": "macos-local",
        "COMPUTER_USE_APPROVAL_MODE": "actions",
        "COMPUTER_USE_OPENABLE_APPS": "Terminal,Cursor,Google Chrome"
      }
    }
  }
}
```

On the Kitsune AI desktop side, approvals are handled like this:

1. model calls a `computer_use::*` tool
2. MCP returns `approval_required`
3. Electron shows a native approval dialog
4. Kitsune AI automatically calls `desktop_approve_pending_action` or `desktop_reject_pending_action`
5. terminal/app approvals can be reused for the current run only

## Validation Commands

- `pnpm -F @kitsune/computer-use-mcp typecheck`
- `pnpm -F @kitsune/computer-use-mcp test`
