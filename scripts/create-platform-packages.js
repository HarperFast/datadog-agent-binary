#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { argv } = require("process");
const { SUPPORTED_PLATFORMS, Platform } = require("../dist/platform.js");

function getParentVersion() {
	const parentPackageJson = JSON.parse(
		fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
	);
	return parentPackageJson.version;
}

function getSupportedPlatforms() {
	return SUPPORTED_PLATFORMS;
}

function getCurrentPlatform() {
	return Platform.current();
}

function getPackageDir(platform) {
	const platformName = platform.getName();
	return path.join(__dirname, "..", "npm", platformName);
}

function createPackageDir(platform) {
	const packageDir = getPackageDir(platform);
	fs.mkdirSync(packageDir, { recursive: true });
}

function copyPlatformBinary(platform) {
	const packageDir = getPackageDir(platform);
	fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });

	const binaryName = platform.getBinaryName();
	const binaryPath = path.join(
		__dirname,
		"..",
		"build",
		platform.getName(),
		"bin",
		binaryName
	);
	if (!fs.existsSync(binaryPath)) {
		throw new Error(`Binary not found at ${binaryPath}`);
	}
	fs.copyFileSync(binaryPath, path.join(packageDir, "bin", binaryName));
}

const version = getParentVersion();

let platforms;
let createDummyPackages = false;
const lastArg = argv[argv.length - 1];
switch (lastArg) {
	case "--all":
		platforms = getSupportedPlatforms();
		break;
	case "--dummy":
		platforms = getSupportedPlatforms();
		createDummyPackages = true;
		break;
	default:
		platforms = [getCurrentPlatform()];
}

const packageTemplate = {
	version: version,
	description: "",
	main: "index.js",
	repository: {
		type: "git",
		url: "https://github.com/HarperFast/datadog-agent-binary.git",
	},
	keywords: ["datadog", "agent", "binary"],
	author: "Harper",
	license: "Apache-2.0",
	files: ["bin/", "index.js"],
};

const indexTemplate = `const path = require('path');

module.exports = {
  getBinaryPath() {
    return path.join(__dirname, 'bin', 'BINARY_NAME');
  }
};`;

function writePlatformPackageJson(platform) {
	const os = platform.getOS();
	const arch = platform.getArch();
	const packageJson = {
		...packageTemplate,
		name: `@harperfast/datadog-agent-binary-${platform.getName()}`,
		description: `Datadog Agent binary for ${os} ${arch}`,
		os: [os],
		cpu: [arch],
		keywords: [...packageTemplate.keywords, os, arch],
	};

	fs.writeFileSync(
		path.join(getPackageDir(platform), "package.json"),
		JSON.stringify(packageJson, null, "\t")
	);

	return packageJson;
}

function writePlatformIndexJs(platform) {
	const binaryName = platform.getBinaryName();
	const indexContent = indexTemplate.replace("BINARY_NAME", binaryName);
	fs.writeFileSync(
		path.join(getPackageDir(platform), "index.js"),
		indexContent
	);
}

platforms.forEach((platform) => {
	createPackageDir(platform);
	if (!createDummyPackages) {
		copyPlatformBinary(platform);
	}
	const packageJson = writePlatformPackageJson(platform);
	writePlatformIndexJs(platform);
	console.log(`Created package: ${packageJson.name}`);
});

console.log("Platform packages created successfully!");
