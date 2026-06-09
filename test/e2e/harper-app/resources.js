import { spawn } from "node:child_process";
import { BinaryManager } from "@harperfast/datadog-agent-binary";

export class AgentVersion extends Resource {
	static async get() {
		// Resolve from the installed platform package — the npm-install path.
		const binaryPath = await new BinaryManager().ensureBinary();

		// Spawn the real agent under Harper's spawn enforcement. `name` is the
		// Harper v5 requirement; the absolute binaryPath must be allowlisted.
		const result = await new Promise((resolve, reject) => {
			let output = "";
			const child = spawn(binaryPath, ["version"], {
				name: "datadog-agent",
			});
			child.stdout.on("data", (d) => (output += d));
			child.stderr.on("data", (d) => (output += d));
			child.on("error", reject);
			child.on("exit", (code) => resolve({ code, output: output.trim() }));
		});

		return {
			binaryPath,
			exitCode: result.code,
			output: result.output,
		};
	}
}
