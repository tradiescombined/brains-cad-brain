// Imported first by every self-hosting script so an old Node gets a plain-English message.
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(
    `✘ TC Quoting Estimate needs Node.js 22 or newer, but this computer has Node ${process.versions.node}.\n` +
      "  Install the current LTS from https://nodejs.org (or run: nvm install --lts), open a new terminal, and try again.",
  );
  process.exit(1);
}
