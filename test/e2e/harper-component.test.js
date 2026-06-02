"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

// Walk up from this file to the package root
function findRepoRoot(start) {
	let dir = start;
	while (!fs.existsSync(path.join(dir, "package.json"))) {
		const parent = path.dirname(dir);
		if (parent === dir) throw new Error("Could not locate package root");
		dir = parent;
	}
	return dir;
}

const REPO_ROOT = findRepoRoot(__dirname);
const { Platform } = require(path.join(REPO_ROOT, "dist", "platform.js"));
const { BinaryManager } = require(
	path.join(REPO_ROOT, "dist", "binary-manager.js")
);

const platform = Platform.current();
const platformName = platform.getName(); // e.g. linux-x86_64
const binaryName = platform.getBinaryName(); // datadog-agent[.exe]
const isWindows = process.platform === "win32";

// The optional platform package is resolved by `require()` from within
// dist/binary-manager.js, so it must live in this repo's node_modules — which
// is exactly where it would sit as a sibling dependency inside a Harper app's
// node_modules tree.
const platformPkgName = `@harperfast/datadog-agent-binary-${platformName}`;
const platformPkgDir = path.join(REPO_ROOT, "node_modules", platformPkgName);
const stubBinaryPath = path.join(platformPkgDir, "bin", binaryName);

const STUB_MARKER = "STUB_DATADOG_AGENT_OK";
// Marks the package dir as our throwaway fixture so we never delete a real one.
const SENTINEL = path.join(platformPkgDir, ".harper-test-fixture");

function safeRemoveFixture() {
	try {
		fs.rmSync(platformPkgDir, { recursive: true, force: true });
		const scopeDir = path.dirname(platformPkgDir);
		if (fs.existsSync(scopeDir) && fs.readdirSync(scopeDir).length === 0) {
			fs.rmdirSync(scopeDir);
		}
	} catch {
		// Some filesystems (e.g. certain CI/sandbox mounts) disallow unlink.
		// Leaving the fixture behind is harmless: node_modules is ephemeral and
		// createFakePlatformPackage() is idempotent on re-run.
	}
}

/**
 * Write a fake platform sub-package identical in shape to the output of
 * scripts/create-platform-packages.js: a package.json, an index.js exposing
 * getBinaryPath(), and bin/<binaryName>. The "binary" is a tiny script that
 * echoes a marker plus its args so we can prove it was actually executed.
 *
 * Idempotent: if our own fixture is already present it is overwritten; a real
 * installed package (no sentinel) is never touched.
 */
function createFakePlatformPackage() {
	if (fs.existsSync(platformPkgDir) && !fs.existsSync(SENTINEL)) {
		throw new Error(
			`Refusing to overwrite existing ${platformPkgName} in node_modules`
		);
	}

	fs.mkdirSync(path.join(platformPkgDir, "bin"), { recursive: true });
	fs.writeFileSync(SENTINEL, "");

	fs.writeFileSync(
		path.join(platformPkgDir, "package.json"),
		JSON.stringify(
			{
				name: platformPkgName,
				version: require(path.join(REPO_ROOT, "package.json")).version,
				main: "index.js",
				os: [platform.getOS()],
				cpu: [platform.getArch()],
			},
			null,
			"\t"
		)
	);

	fs.writeFileSync(
		path.join(platformPkgDir, "index.js"),
		`const path = require('path');\nmodule.exports = {\n  getBinaryPath() {\n    return path.join(__dirname, 'bin', ${JSON.stringify(binaryName)});\n  }\n};\n`
	);

	// Stub "agent" binary. A shebang'd Node script works as an executable on
	// Unix; on Windows we still create the file (resolution is tested) but skip
	// the execution assertions below.
	const stub = `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(
		STUB_MARKER
	)} + ' ' + process.argv.slice(2).join(' ') + '\\n');\nprocess.exit(0);\n`;
	fs.writeFileSync(stubBinaryPath, stub);
	fs.chmodSync(stubBinaryPath, 0o755);
}

/**
 * A minimal stand-in for Harper v5's spawn enforcement. Harper rejects any
 * spawn whose absolute command is not in allowedSpawnCommands, and requires a
 * `name` option. This lets us assert our usage satisfies that contract.
 */
function harperGuardedSpawn(command, args, options, allowedSpawnCommands) {
	if (!options || typeof options.name !== "string" || options.name === "") {
		throw new Error("Harper v5: spawn requires a non-empty `name` option");
	}
	if (!allowedSpawnCommands.includes(command)) {
		throw new Error(
			`Harper v5: '${command}' is not in applications.allowedSpawnCommands`
		);
	}
	return spawn(command, args, options);
}

function runToCompletion(child) {
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		if (child.stdout) child.stdout.on("data", (d) => (stdout += d));
		if (child.stderr) child.stderr.on("data", (d) => (stderr += d));
		child.on("error", reject);
		child.on("exit", (code) => resolve({ code, stdout, stderr }));
	});
}

before(() => {
	createFakePlatformPackage();
});

after(() => {
	safeRemoveFixture();
});

test("BinaryManager resolves the binary from the installed platform package (no network, no build)", async () => {
	const resolved = await new BinaryManager().ensureBinary();
	assert.equal(
		resolved,
		stubBinaryPath,
		"ensureBinary() should return the platform package's getBinaryPath()"
	);
	assert.ok(path.isAbsolute(resolved), "resolved path must be absolute");
	assert.ok(fs.existsSync(resolved), "resolved binary must exist on disk");
});

test("Harper allowlist accepts the absolute resolved path, rejects a bare command name", async () => {
	const binaryPath = await new BinaryManager().ensureBinary();
	const allowedSpawnCommands = [binaryPath]; // what the app registers in harperdb-config.yaml

	// A bare command name does not match Harper's absolute-path allowlist.
	assert.throws(
		() =>
			harperGuardedSpawn(
				"datadog-agent",
				["status"],
				{ name: "datadog-agent" },
				allowedSpawnCommands
			),
		/not in applications\.allowedSpawnCommands/
	);

	// The exact absolute path is allowed.
	assert.doesNotThrow(() => {
		const child = harperGuardedSpawn(
			binaryPath,
			["status"],
			{ name: "datadog-agent", stdio: "ignore" },
			allowedSpawnCommands
		);
		child.kill();
	});
});

test("Harper requires a `name` option on spawn", async () => {
	const binaryPath = await new BinaryManager().ensureBinary();
	assert.throws(
		() => harperGuardedSpawn(binaryPath, [], { stdio: "ignore" }, [binaryPath]),
		/requires a non-empty `name` option/
	);
});

test("end-to-end: the datadog-agent shim resolves and executes the agent", async (t) => {
	if (isWindows) {
		t.skip("stub executable is not runnable as a .exe on Windows");
		return;
	}
	const shim = path.join(REPO_ROOT, "bin", "datadog-agent");
	const child = spawn(process.execPath, [shim, "version"], {
		stdio: ["ignore", "pipe", "pipe"],
		env: process.env,
	});
	const { code, stdout, stderr } = await runToCompletion(child);
	assert.equal(code, 0, `shim should exit 0 (stderr: ${stderr})`);
	assert.match(
		stdout,
		new RegExp(STUB_MARKER),
		"the resolved agent binary should have actually run"
	);
	assert.match(stdout, /version/, "user args should be forwarded to the agent");
});

test("shipped wrappers pass the Harper-required `name` option", () => {
	// Regression guard: the spawn call inside the bin shim and the generated
	// wrappers must keep the `name: "datadog-agent"` option.
	const shimSrc = fs.readFileSync(
		path.join(REPO_ROOT, "bin", "datadog-agent"),
		"utf8"
	);
	assert.match(shimSrc, /name:\s*["']datadog-agent["']/);

	const mgrSrc = fs.readFileSync(
		path.join(REPO_ROOT, "dist", "binary-manager.js"),
		"utf8"
	);
	assert.match(
		mgrSrc,
		/name:\s*['"]datadog-agent['"]/,
		"BinaryManager-generated wrappers must spawn with a name option"
	);
});
