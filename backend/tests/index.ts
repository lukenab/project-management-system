import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Quét toàn bộ các file *.test.ts trong thư mục tests (trừ file index hiện tại)
const currentFileName = path.basename(fileURLToPath(import.meta.url));
const testFiles = fs
  .readdirSync(__dirname)
  .filter((file) => file.endsWith(".test.ts") && file !== currentFileName)
  .sort();

if (testFiles.length === 0) {
  console.log(
    "⚠️ Không tìm thấy file test nào trong thư mục tests/ (yêu cầu định dạng *.test.ts).",
  );
  process.exit(0);
}

console.log("===============================================================");
console.log(`🚀 AUTOMATED TEST RUNNER`);
console.log(`📁 Tìm thấy ${testFiles.length} file test:`);
testFiles.forEach((file, index) => {
  console.log(`   ${index + 1}. ${file}`);
});
console.log("===============================================================\n");

let hasFailed = false;
let passedSuites = 0;
let failedSuites = 0;

for (const file of testFiles) {
  const filePath = path.join(__dirname, file);
  console.log(`\n▶ ĐANG CHẠY SUITE: ${file}`);
  console.log(
    "---------------------------------------------------------------",
  );

  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", filePath],
    { stdio: "inherit" },
  );

  if (result.status === 0) {
    passedSuites++;
  } else {
    failedSuites++;
    hasFailed = true;
  }
}

console.log("\n===============================================================");
console.log("🏁 TỔNG KẾT TẤT CẢ TEST SUITES:");
console.log(`   Tổng số file test: ${testFiles.length}`);
console.log(`   Thành công (PASS): ${passedSuites}`);
console.log(`   Thất bại   (FAIL): ${failedSuites}`);
console.log("===============================================================");

if (hasFailed) {
  console.error("\n❌ Có test suite bị thất bại!");
  process.exit(1);
} else {
  console.log("\n✨ Tất cả các test suites đều thành công!");
  process.exit(0);
}

