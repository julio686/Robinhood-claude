// send_email.mjs — send an email via the Resend HTTP API (no SMTP, no npm deps).
//
// The API key is read at RUNTIME from a private file the routine downloads from
// Google Drive (trader_secrets.json). NEVER hardcode or commit the key — this script
// only reads it from the path you pass. The repo stays secret-free.
//
// Usage:
//   node scripts/send_email.mjs --key-file <path> --to <addr> --subject <s> \
//        (--html-file <path> | --text-file <path>) [--from <addr>]
// The key file may be raw "re_..." or JSON {"resend_api_key":"re_..."}.
// Sandbox sender onboarding@resend.dev can email the Resend account owner without
// any domain verification. Exit 0 on success (prints SENT id=...), nonzero on failure.

import { readFileSync } from "node:fs";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : def;
}
const keyFile = arg("key-file");
const to = arg("to");
const subject = arg("subject");
const htmlFile = arg("html-file");
const textFile = arg("text-file");
const from = arg("from", "Dip Buyer <onboarding@resend.dev>");

if (!keyFile || !to || !subject || (!htmlFile && !textFile)) {
  console.error(
    "usage: send_email.mjs --key-file F --to A --subject S (--html-file F | --text-file F) [--from A]"
  );
  process.exit(2);
}

let key = readFileSync(keyFile, "utf8").trim();
try {
  const j = JSON.parse(key);
  key = j.resend_api_key || j.api_key || key;
} catch {
  /* raw key string */
}

const body = { from, to, subject };
if (htmlFile) body.html = readFileSync(htmlFile, "utf8");
if (textFile) body.text = readFileSync(textFile, "utf8");

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const out = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`SEND FAILED ${res.status}: ${JSON.stringify(out)}`);
  process.exit(1);
}
console.log(`SENT id=${out.id || "?"} to=${to}`);
