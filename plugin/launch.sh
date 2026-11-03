#!/bin/sh
# The plugin's MCP server (#141). With mockingbird installed, this becomes
# `mockingbird mcp`. Without it, it answers MCP itself with one tool,
# `install_mockingbird`, that says how to install it, so the agent can help
# instead of seeing a server that failed to start. POSIX sh and sed only:
# nothing else may be installed yet.
for mb in "$(command -v mockingbird 2>/dev/null)" "$HOME/.local/bin/mockingbird" \
  /opt/homebrew/bin/mockingbird /usr/local/bin/mockingbird; do
  if [ -n "$mb" ] && [ -x "$mb" ]; then exec "$mb" mcp; fi
done

guide="https://raw.githubusercontent.com/NirjharBhattacharjee/mockingbird/main/docs/AGENT_INSTALL.md"
text="mockingbird isn't installed on this computer, so its editing tools aren't available yet. To install it, follow $guide (it says what it downloads, about 1.1 GB, and how to check each step; ask the person before running it). Or they can run: brew install nirjharbhattacharjee/mockingbird/mockingbird && mockingbird setup. Then restart this agent."
tool='{"name":"install_mockingbird","description":"mockingbird is not installed yet. Call this to learn how to install it.","inputSchema":{"type":"object","properties":{}}}'

# A string field's value: the last `"$1": "..."` in $2.
field() { printf '%s' "$2" | sed -nE "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\\1/p"; }

while IFS= read -r line; do
  # A request has an id; a notification doesn't, and gets no reply.
  # ponytail: sed takes the last "id" in the line, fine while no request this
  # answers has an "id" inside its params; a JSON parser if one ever does.
  id=$(printf '%s' "$line" | sed -nE 's/.*"id"[[:space:]]*:[[:space:]]*("[^"]*"|[0-9]+).*/\1/p')
  [ -n "$id" ] || continue
  # The method from before "params" when it's there, so one inside the
  # params can't be taken for it.
  method=$(field method "${line%%\"params\"*}")
  [ -n "$method" ] || method=$(field method "$line")
  case "$method" in
    initialize)
      # The client's protocol version if it's one this speaks, else the newest.
      version=$(field protocolVersion "$line")
      case "$version" in 2025-06-18 | 2025-03-26 | 2024-11-05) ;; *) version=2025-06-18 ;; esac
      result='{"protocolVersion":"'"$version"'","capabilities":{"tools":{}},"serverInfo":{"name":"mockingbird","version":"launcher"},"instructions":"'"$text"'"}' ;;
    tools/list) result='{"tools":['"$tool"']}' ;;
    tools/call)
      if [ "$(field name "$line")" != install_mockingbird ]; then
        printf '{"jsonrpc":"2.0","id":%s,"error":{"code":-32602,"message":"no such tool"}}\n' "$id"
        continue
      fi
      result='{"content":[{"type":"text","text":"'"$text"'"}]}' ;;
    ping) result='{}' ;;
    *)
      printf '{"jsonrpc":"2.0","id":%s,"error":{"code":-32601,"message":"no such method"}}\n' "$id"
      continue ;;
  esac
  printf '{"jsonrpc":"2.0","id":%s,"result":%s}\n' "$id" "$result"
done
