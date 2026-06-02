/**
 * Polls the running Harper instance's /AgentVersion/ endpoint and asserts that
 * the Datadog agent binary was resolved from the platform package and actually
 * executed under Harper's spawn enforcement.
 *
 * Env:
 *   HARPER_URL      base URL (default http://localhost:9926)
 *   HDB_ADMIN_USERNAME / HDB_ADMIN_PASSWORD  basic-auth creds
 *   POLL_TIMEOUT_MS how long to wait for Harper to come up (default 120000)
 */

const BASE = process.env.HARPER_URL || "http://localhost:9926";
const USER = process.env.HDB_ADMIN_USERNAME || "HDB_ADMIN";
const PASS = process.env.HDB_ADMIN_PASSWORD || "password";
const TIMEOUT = Number(process.env.POLL_TIMEOUT_MS || 120000);

const auth = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");
const url = `${BASE}/AgentVersion/`;

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function poll() {
	const deadline = Date.now() + TIMEOUT;
	let lastErr = "no attempts";
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url, {
				headers: { Authorization: auth, Accept: "application/json" },
			});
			if (res.ok) {
				return await res.json();
			}
			lastErr = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
		} catch (e) {
			lastErr = e.message;
		}
		await sleep(2000);
	}
	throw new Error(`Endpoint never became ready (${url}): ${lastErr}`);
}

function assert(cond, msg) {
	if (!cond) {
		console.error(`ASSERTION FAILED: ${msg}`);
		process.exit(1);
	}
}

const body = await poll();
console.log("Response from Harper /AgentVersion/:");
console.log(JSON.stringify(body, null, 2));

// 1. BinaryManager resolved a binary from the installed platform package.
assert(
	typeof body.binaryPath === "string" && body.binaryPath.length > 0,
	"response should include a resolved binaryPath"
);
assert(
	body.binaryPath.includes("datadog-agent-binary-"),
	"binaryPath should point inside the platform package"
);

// 2. Harper actually permitted the spawn and the agent ran successfully.
assert(
	body.exitCode === 0,
	`agent should exit 0 (got ${body.exitCode}); output: ${body.output}`
);
assert(
	typeof body.output === "string" && body.output.length > 0,
	"agent should produce version output"
);

console.log(
	"\nOK: agent resolved from platform package and executed under Harper v5 spawn enforcement."
);
