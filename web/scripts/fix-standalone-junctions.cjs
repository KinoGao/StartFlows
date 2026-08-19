/* 把 standalone 产物里指向目录的 Windows 文件型符号链接（Node stat 会 EPERM）转换为 junction。 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.argv[2] || ".next/standalone");
let converted = 0;
let failed = 0;

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) {
            const target = fs.readlinkSync(full);
            const abs = path.resolve(dir, target);
            if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue;
            fs.unlinkSync(full);
            try {
                fs.symlinkSync(abs, full, "junction");
                converted += 1;
            } catch (error) {
                failed += 1;
                console.error("FAIL", full, error.message);
            }
        } else if (entry.isDirectory()) {
            walk(full);
        }
    }
}

walk(root);
console.log(`converted=${converted} failed=${failed}`);
process.exit(failed ? 1 : 0);
