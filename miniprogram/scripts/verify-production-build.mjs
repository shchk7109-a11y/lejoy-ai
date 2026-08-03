import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const productionApiHost = "api.hxzhineng.xyz";
const localApiHost = "127.0.0.1";
const defaultDistDirectory = fileURLToPath(new URL("../dist/", import.meta.url));
const distDirectory = resolve(process.argv[2] || defaultDistDirectory);

function collectFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function countOccurrences(contents, searchText) {
  let count = 0;
  let offset = 0;
  while ((offset = contents.indexOf(searchText, offset)) !== -1) {
    count += 1;
    offset += searchText.length;
  }
  return count;
}

if (!statSync(distDirectory).isDirectory()) {
  throw new Error(`产物路径不是目录: ${distDirectory}`);
}

let productionApiCount = 0;
let localApiCount = 0;
for (const filePath of collectFiles(distDirectory)) {
  const contents = readFileSync(filePath, "utf8");
  productionApiCount += countOccurrences(contents, productionApiHost);
  localApiCount += countOccurrences(contents, localApiHost);
}

console.log(`生产 API 地址命中次数: ${productionApiCount}`);
console.log(`127.0.0.1 命中次数: ${localApiCount}`);

const failures = [];
if (productionApiCount === 0) {
  failures.push(`未找到 ${productionApiHost}`);
}
if (localApiCount > 0) {
  failures.push(`产物仍包含 ${localApiHost}`);
}

if (failures.length > 0) {
  console.error(`生产小程序 API 地址校验失败：${failures.join("；")}`);
  process.exitCode = 1;
} else {
  console.log("生产小程序 API 地址校验通过");
}
