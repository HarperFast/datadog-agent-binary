# Datadog Agent Binary

[![Datadog Agent Binaries](https://github.com/HarperFast/datadog-agent-binary/actions/workflows/build-release.yml/badge.svg)](https://github.com/HarperFast/datadog-agent-binary/actions/workflows/build-release.yml)

An NPM package that provides pre-built Datadog Agent binaries.

Additionally this repo provides tools to build from source for Linux, Windows, and macOS on both arm64 and amd64 architectures (or at least the working subset of those).

## Installation

```bash
npm install @harperfast/datadog-agent-binary
```

Or install globally:

```bash
npm install -g @harperfast/datadog-agent-binary
```

When you install this package, it automatically downloads the appropriate pre-built Datadog Agent binary for your platform.

## Usage

### Using the Datadog Agent

Once installed, you can run the Datadog Agent directly:

```bash
# Run the agent
datadog-agent run

# Check agent status
datadog-agent status

# Show agent version
datadog-agent version
```

### Building from Source

If you need to build from source or want to build for multiple platforms:

```bash
# Build for current platform
datadog-agent-build build

# Specify version and output directory
datadog-agent-build build --version 7.50.0 --output ~/my-datadog-agent-build
```

### Management Commands

```bash
# Install or reinstall binary
datadog-agent-build install

# List supported platforms
datadog-agent-build platforms

# Get latest version
datadog-agent-build version
```

### Programmatic Usage

```typescript
import { DatadogAgentBuilder, BinaryManager } from '@harperfast/datadog-agent-binary';

// Use pre-built binaries
const manager = new BinaryManager();
const binaryPath = await manager.ensureBinary(); // Downloads if needed
console.log(`Datadog Agent at: ${binaryPath}`);

// Build from source
const builder = new DatadogAgentBuilder();

// Build for current platform
const result = await builder.buildForCurrentPlatform({
  version: '7.50.0',
  outputDir: './build'
});
```

## Supported Platforms

| OS | Architecture | Status |
|----|-------------|--------|
| Linux | x86_64 | ✅ |
| Linux | arm64 | ✅ |
| Windows | x86_64 | ✅ |
| Windows | arm64 | 🚫 |
| macOS | x86_64 | ✅ |
| macOS | arm64 | ✅ |

Windows arm64 support is blocked by [Chocolatey](https://chocolatey.org) not supporting arm64 natively.

## Build Requirements

### Linux
- Go 1.23
- Node 18+
- Python 3.12
- GCC
- CMake
- Git

### macOS
- Go 1.23
- Node 18+
- Python 3.12
- Xcode Command Line Tools
- CMake
- Git

### Windows
- Go 1.23
- Node 18+
- Python 3.12
- MinGW-w64 GCC
- CMake
- Git

## API Reference

### DatadogAgentBuilder

Main class for building Datadog Agent binaries.

#### Methods

- `buildForCurrentPlatform(options?)`: Build for the current platform

#### Options

```typescript
interface BuildOptions {
  version?: string;      // Datadog Agent version (default: latest)
  outputDir?: string;    // Output directory (default: ./build)
  sourceDir?: string;    // Source directory (default: downloads source)
  buildArgs?: string[];  // Additional build arguments
}
```

### Platform Detection

```typescript
import { detectPlatform, getAllSupportedPlatforms } from '@harperfast/datadog-agent-binary';

const currentPlatform = detectPlatform();
const allPlatforms = getAllSupportedPlatforms();
```

## How It Works

1. **Pre-built Binaries**: When you install this package, it automatically downloads the appropriate Datadog Agent binary for your platform from GitHub releases.

3. **Release Process**:
   - GitHub Actions builds binaries for all platforms from Datadog Agent source
   - Binaries are packaged and uploaded to GitHub releases
   - npm install downloads the right binary for your platform

## Development

```bash
# Install dependencies
npm install

# Build the TypeScript package
npm run build

# Run type checking
npm run typecheck

# Build a single platform for testing
npm run build-platform
```

## Harper v5 (Lincoln) compatibility

This package is compatible with Harper v5. A few notes for consumers running
Harper v5 applications:

### Spawning the agent from a Harper component

Harper v5 tightens `node:child_process` semantics for code running inside an
application. Any `spawn` / `exec` / `execFile` may only target an executable
listed in `applications.allowedSpawnCommands`, and must include a `name`
option so Harper can dedupe the child across worker threads.

The `datadog-agent` CLI shim and the `BinaryManager`-generated wrapper
already pass `name: "datadog-agent"`, so the only thing the consuming
application needs to do is register the resolved binary path in
`harperdb-config.yaml`:

```yaml
applications:
  allowedSpawnCommands:
    - datadog-agent
```

(Use the full resolved path returned by
`BinaryManager.ensureBinary()` if your deployment requires an absolute
match.)

### Install scripts

Harper v5 installs packages with `--ignore-scripts` by default. This package
and its platform sub-packages **do not** rely on install scripts — the
correct platform binary is selected automatically through
`optionalDependencies`. You do **not** need to set
`applications.allowInstallScripts: true` in `harperdb-config.yaml` to
install this package.

### Build-time tooling

`DatadogAgentBuilder` (the source-build path that shells out to `dda`, `go`,
`pipx`, `pip`, etc.) is intended for use from a developer shell or CI runner,
not from inside a Harper-managed process. The runtime entry point —
`BinaryManager.ensureBinary()` plus the `datadog-agent` wrapper — is the
supported way to use this package from a Harper component.

## License

Apache License 2.0

The binaries this package downloads, builds, and distributes are licensed and distributed under the Apache License 2.0 as specified in the [Datadog Agent repository](https://github.com/DataDog/datadog-agent). The datadog-agent source code is copyrighted by Datadog, Inc.
