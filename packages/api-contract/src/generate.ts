import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import { openApiDocument } from "./openapi.js";

const outputPath = resolve(process.cwd(), "../../openapi.json");
const output = await format(JSON.stringify(openApiDocument), {
  filepath: outputPath,
});

await writeFile(outputPath, output);
