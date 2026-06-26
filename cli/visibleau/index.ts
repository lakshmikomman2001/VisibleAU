#!/usr/bin/env tsx
const command = process.argv[2];

async function main() {
  switch (command) {
    case "config:validate": {
      const mod = await import("./config-validate");
      await mod.run();
      break;
    }
    case "config:coverage": {
      const mod = await import("./config-coverage");
      await mod.run();
      break;
    }
    case "config:diff": {
      const mod = await import("./config-diff");
      await mod.run();
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Available commands: config:validate, config:coverage, config:diff");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
