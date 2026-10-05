#!/usr/bin/env node
// Prints which database the local app (.env.local) will talk to.
// Run via: npm run env:which

const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", ".env.local");
const txt = fs.readFileSync(file, "utf8");
const url = ((txt.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/) || [])[1] || "unknown").trim();

const STAGING_REF = "noyegdgrfzopfrwjunot";
const PRODUCTION_REF = "iojiahkehnijxxczrgft";

let label;
if (url.includes(STAGING_REF)) {
  label = "STAGING — safe for testing ✅";
} else if (url.includes(PRODUCTION_REF)) {
  label = "PRODUCTION — real school data, be careful ⚠️";
} else {
  label = "UNKNOWN — check .env.local ⚠️";
}

console.log(`.env.local points to: ${url}`);
console.log(`This app will talk to: ${label}`);
