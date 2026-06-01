#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const { getAllSupportedPlatforms } = require("../dist/platform.js");
const platforms = getAllSupportedPlatforms();

// Update optionalDependencies to use the same version as the main package
packageJson.optionalDependencies = {};
platforms.forEach((platform) => {
	packageJson.optionalDependencies[
		`@harperfast/datadog-agent-binary-${platform}`
	] = packageJson.version;
});

fs.writeFileSync(
	packageJsonPath,
	JSON.stringify(packageJson, null, "\t") + "\n"
);

console.log(`Updated optionalDependencies to version ${packageJson.version}`);
