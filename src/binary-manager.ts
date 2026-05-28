import * as fs from "fs/promises";
import * as path from "path";
import fetch from "node-fetch";
import { logger } from "./logger.js";
import { Platform } from "./platform.js";

export interface BinaryInfo {
	version: string;
	platform: Platform;
	downloadUrl: string;
	fileName: string;
	checksum?: string;
}

export class BinaryManager {
	private readonly buildDir: string;
	private readonly binDir: string;

	constructor() {
		this.buildDir = path.join(__dirname, "..", "build");
		this.binDir = path.join(__dirname, "..", "bin");
	}

	async ensureBinary(version?: string): Promise<string> {
		const platform = Platform.current();

		const targetVersion = version || (await this.getLatestVersion());
		const binaryPath = await this.getBinaryPath(platform, targetVersion);

		if (await this.binaryExists(binaryPath)) {
			logger.debug(`Found platform binary: ${binaryPath}`);
			return binaryPath;
		}

		throw new Error(`Binary not found for ${platform.getName()}`);
	}

	private async getBinaryPath(
		platform: Platform,
		version: string
	): Promise<string> {
		const fileName = platform.getBinaryName();
		return path.join(
			this.buildDir,
			`${version}-${platform.getName()}`,
			fileName
		);
	}

	private async binaryExists(binaryPath: string): Promise<boolean> {
		try {
			const stat = await fs.stat(binaryPath);
			return stat.isFile();
		} catch {
			return false;
		}
	}

	private async getLatestVersion(): Promise<string> {
		const response = await fetch(
			"https://api.github.com/repos/DataDog/datadog-agent/releases/latest"
		);
		if (!response.ok) {
			throw new Error(`Failed to fetch latest version: ${response.statusText}`);
		}

		const data = (await response.json()) as { tag_name: string };
		return data.tag_name;
	}

	async createBinaryWrapper(): Promise<void> {
		const wrapperPath = path.join(this.binDir, "datadog-agent");
		const platform = Platform.current();

		let wrapperContent: string;

		if (platform.getOS() === "windows") {
			wrapperContent = this.createWindowsWrapper();
			await fs.writeFile(wrapperPath + ".cmd", wrapperContent);
		} else {
			wrapperContent = this.createUnixWrapper();
			await fs.writeFile(wrapperPath, wrapperContent);
			await fs.chmod(wrapperPath, 0o755);
		}

		logger.debug(`Created binary wrapper: ${wrapperPath}`);
	}

	private createUnixWrapper(): string {
		return `#!/usr/bin/env node

const { BinaryManager } = require('../dist/binary-manager.js');
const { spawn } = require('child_process');
const path = require('path');

async function main() {
  try {
    const manager = new BinaryManager();
    const binaryPath = await manager.ensureBinary();

    // Harper v5 requires \`name\` on spawn options when invoked from inside a
    // Harper application — it lets Harper dedupe the child across worker
    // threads. The option is silently ignored by stock Node.js, so this is
    // safe outside Harper too.
    const child = spawn(binaryPath, process.argv.slice(2), {
      stdio: 'inherit',
      env: process.env,
      name: 'datadog-agent'
    });

    child.on('exit', (code) => {
      process.exit(code || 0);
    });

  } catch (error) {
    console.error('Failed to run datadog-agent:', error.message);
    process.exit(1);
  }
}

main();
`;
	}

	private createWindowsWrapper(): string {
		// The original cmd wrapper invoked `dist/binary-manager.js` directly,
		// but that file is a module — it has no top-level main and never
		// spawned the agent. Delegate to the same Node wrapper logic used on
		// Unix so the agent binary is actually launched (with the v5-required
		// `name` option).
		return `@echo off
node -e "(async()=>{const{BinaryManager}=require('%~dp0\\..\\dist\\binary-manager.js');const{spawn}=require('child_process');try{const m=new BinaryManager();const b=await m.ensureBinary();const c=spawn(b,process.argv.slice(1),{stdio:'inherit',env:process.env,name:'datadog-agent'});c.on('exit',code=>process.exit(code||0));}catch(e){console.error('Failed to run datadog-agent:',e.message);process.exit(1);}})()" %*
`;
	}

	async installForCurrentPlatform(): Promise<void> {
		const platform = Platform.current();
		logger.info(`Installing Datadog Agent binary for ${platform.getName()}...`);

		try {
			await this.ensureBinary();
			await this.createBinaryWrapper();
			logger.info("Installation completed successfully");
		} catch (error: any) {
			logger.error(`Installation failed: ${error.message}`);
			throw error;
		}
	}
}
