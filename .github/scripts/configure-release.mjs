// Stamps the release version — and, if a code-signing certificate was
// imported, its thumbprint — into src-tauri/tauri.conf.json and
// src-tauri/Cargo.toml for this CI build only (nothing here is committed
// back to the repo). Invoked from .github/workflows/main.yml's
// "Configure build" step.
//
// Plain JSON.parse/JSON.stringify round-trips tauri.conf.json exactly —
// this replaced a PowerShell ConvertFrom-Json | ConvertTo-Json pipeline,
// which is a known source of subtle JSON corruption (number precision,
// array handling, depth limits) in other Tauri CI setups.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.env.VERSION;
const thumbprint = process.env.CERT_THUMBPRINT ?? "";

if (!version) {
  throw new Error("VERSION env var is required");
}

const confPath = "src-tauri/tauri.conf.json";
const conf = JSON.parse(readFileSync(confPath, "utf8"));
conf.version = version;
if (thumbprint) {
  conf.bundle.windows.digestAlgorithm = "sha256";
  conf.bundle.windows.certificateThumbprint = thumbprint;
}
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");

const cargoPath = "src-tauri/Cargo.toml";
const cargo = readFileSync(cargoPath, "utf8");
const stamped = cargo.replace(/^version = "[^"]*"/m, `version = "${version}"`);
writeFileSync(cargoPath, stamped);

console.log(
  `Stamped version ${version}${thumbprint ? " + cert thumbprint" : ""} into tauri.conf.json / Cargo.toml`,
);
