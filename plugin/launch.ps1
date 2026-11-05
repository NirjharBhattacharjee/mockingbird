# What launch.cmd runs when mockingbird isn't installed: an MCP server with
# one tool, install_mockingbird, that says how to install it, so the agent can
# help instead of seeing a server that failed to start (#141, #202).
# Windows PowerShell 5.1 reads this file as ANSI, so it stays ASCII.
$guide = "https://raw.githubusercontent.com/NirjharBhattacharjee/mockingbird/main/docs/AGENT_INSTALL.md"
$text = "mockingbird isn't installed on this computer, so its editing tools aren't available yet. To install it, follow $guide (it says what it downloads, about 1.1 GB, and how to check each step; ask the person before running it). Or they can run, in PowerShell: irm https://github.com/NirjharBhattacharjee/mockingbird/releases/latest/download/install.ps1 | iex. Then restart this agent."
$tool = @{
  name = "install_mockingbird"
  description = "mockingbird is not installed yet. Call this to learn how to install it."
  inputSchema = @{ type = "object"; properties = @{} }
}

function Send($message) {
  [Console]::Out.WriteLine(($message | ConvertTo-Json -Depth 10 -Compress))
  [Console]::Out.Flush()
}

while ($null -ne ($line = [Console]::In.ReadLine())) {
  try { $request = $line | ConvertFrom-Json } catch { continue }
  # A notification has no id and gets no reply.
  if ($null -eq $request.id) { continue }
  $reply = @{ jsonrpc = "2.0"; id = $request.id }
  switch ($request.method) {
    "initialize" {
      $version = $request.params.protocolVersion
      if ($version -notin @("2025-06-18", "2025-03-26", "2024-11-05")) { $version = "2025-06-18" }
      $reply.result = @{
        protocolVersion = $version
        capabilities = @{ tools = @{} }
        serverInfo = @{ name = "mockingbird"; version = "launcher" }
        instructions = $text
      }
    }
    "tools/list" { $reply.result = @{ tools = @($tool) } }
    "tools/call" {
      if ($request.params.name -eq "install_mockingbird") {
        $reply.result = @{ content = @(@{ type = "text"; text = $text }) }
      } else {
        $reply.error = @{ code = -32602; message = "no such tool" }
      }
    }
    "ping" { $reply.result = @{} }
    default { $reply.error = @{ code = -32601; message = "no such method" } }
  }
  Send $reply
}
