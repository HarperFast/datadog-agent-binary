# Deploying the Datadog Agent (verbose-logging build)

This build adds startup logging so you can see, in the container logs, whether the agent resolves, spawns, and connects to Datadog — or exactly where it stops.

- **Package:** `@harperfast/datadog-agent-binary`
- **Version:** `7.75.5-next.2` (npm dist-tag `next`)
- **Target:** `eu-www-development` (Harper v5 / Lincoln)

## 1. Update the package

In the `ralph-lauren-digital-composable-web` component, point the dependency at the prerelease and reinstall:

```bash
npm install @harperfast/datadog-agent-binary@next
# or pin it explicitly:
npm install @harperfast/datadog-agent-binary@7.75.5-next.2
```

The correct platform binary (e.g. `linux-x86_64`) installs automatically via `optionalDependencies` — no install scripts or extra flags needed.

## 2. Allowlist the binary path (Harper v5)

Harper v5 only lets a component spawn an executable whose **exact absolute path** is listed in `applications.allowedSpawnCommands`. Resolve the path the same way the package does at runtime:

```bash
node -e "const {BinaryManager}=require('@harperfast/datadog-agent-binary'); new BinaryManager().ensureBinary().then(console.log)"
# e.g. /app/node_modules/@harperfast/datadog-agent-binary-linux-x86_64/bin/datadog-agent
```

Add that exact path to `harperdb-config.yaml`:

```yaml
applications:
  allowedSpawnCommands:
    - /app/node_modules/@harperfast/datadog-agent-binary-linux-x86_64/bin/datadog-agent
```

A bare command name won't match — it must be the full absolute path.

## 3. Set the Datadog environment

These must be present in the process that spawns the agent (or set in the component's `datadog.yaml`):

| Variable | Required | Notes |
|---|---|---|
| `DD_API_KEY` | Yes | Without it the agent starts but **disables** its connection — nothing reaches Datadog. |
| `DD_SITE` | Yes | EU org: `datadoghq.eu`. |
| `DD_ENV` | Yes | `development` for this deploy. |
| `DD_LOGS_ENABLED` | Yes (for logs) | Defaults to `false`. Application logs only forward when this is `true`. |
| `DD_LOG_TO_CONSOLE` | Optional | Defaults to `true`; the agent's own logs already go to the container console. |

## 4. Redeploy

Redeploy / restart `eu-www-development` so the component picks up the new package and config.

## 5. Verify from the logs

After restart, the container logs will show the new lines (at `warn`/`info` — visible under Harper's default `warn` level, no `DEBUG` flag required):

- **Resolution** — detected platform/arch and the resolved binary path, or a warning if the platform package isn't installed.
- **Spawn** — the path and args spawned, the child PID, and the exit code/signal if it dies. A spawn rejected by the allowlist prints the exact path that needs allowlisting.
- **Datadog env** — whether `DD_API_KEY` is `set` or `MISSING`, plus `DD_SITE`, `DD_ENV`, `DD_LOGS_ENABLED`, `DD_LOG_TO_CONSOLE`. (The API key value is never logged.)

### Quick troubleshooting

| Log line | Meaning | Fix |
|---|---|---|
| `DD_API_KEY=MISSING` | Agent will disable / "still disabling". | Make sure the key is exported into the spawning process or set in `datadog.yaml`. |
| `Failed to execute datadog-agent` + a path | Harper blocked the spawn. | Add that exact path to `allowedSpawnCommands`. |
| `No packaged binary resolved...` | Platform package not installed. | Confirm the optional dependency for this os/cpu installed. |
| No agent lines at all | The agent is never being invoked. | Check the component is actually calling the agent on startup. |
| Agent runs but no logs in Datadog | Connected, but log collection off. | Set `DD_LOGS_ENABLED=true` and configure a logs source. |

## Rollback

Pin back to the last stable release:

```bash
npm install @harperfast/datadog-agent-binary@7.75.4
```

Then redeploy.
