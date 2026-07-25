const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Count total commits on current branch — this auto-increments on every push
let count = 1;
try {
  count = parseInt(execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim(), 10) || 1;
} catch {
  count = 1;
}

// Pad to 2 digits: 1→01, 47→47, 103→03 (only last 2 digits)
const minor = String(count).padStart(2, "0").slice(-2);

const templatePath = path.join(__dirname, "..", "src", "lib", "build-id.ts.template");
const outputPath = path.join(__dirname, "..", "src", "lib", "build-id.ts");

let content = fs.readFileSync(templatePath, "utf8");
content = content.replace("__BUILD_ID__", minor);
fs.writeFileSync(outputPath, content);

console.log(`Version: v1.${minor}  (commit #${count})`);
