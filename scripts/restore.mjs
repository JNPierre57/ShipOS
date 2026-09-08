import { copyFileSync, existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { validateBackup } from "../dist/apps/core/src/store.js";
const [backup, target, stopped] = process.argv.slice(2);
if (!backup || !target || stopped !== "--core-stopped")
  throw Error(
    "Usage: npm run restore -- BACKUP TARGET --core-stopped (stop Core first)",
  );
if (resolve(backup) === resolve(target))
  throw Error("Backup and target must differ");
validateBackup(resolve(backup));
const suffix = ".pre-restore-" + Date.now();
for (const file of [target, target + "-wal", target + "-shm"])
  if (existsSync(file)) renameSync(file, file + suffix);
copyFileSync(backup, target);
validateBackup(target);
console.log(
  "Restored with integrity check. Previous files retained with suffix " +
    suffix,
);
