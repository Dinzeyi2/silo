import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createApp } from "./src/app.mjs";

export const app = createApp({
  root: fileURLToPath(new URL("./", import.meta.url)),
  databasePath: process.env.SILO_DATABASE || fileURLToPath(new URL("./data/silo.db", import.meta.url)),
});
export const server = createServer(app.handler);

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = Number(process.env.PORT || 4173);
  server.listen(port, () => console.log(`SILO is running at http://localhost:${port}`));
}

function shutdown() {
  server.close(() => { app.close(); process.exit(0); });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
