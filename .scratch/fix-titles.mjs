/**
 * 修复 M2 票据(#12-#20)的乱码标题与正文。
 * 根因:create-m2-tickets.ps1 是 UTF-8,但 PowerShell 5.1 按 GBK 解析,
 * 中文在传给 gh 前已损坏。本脚本用 node 全程 UTF-8 读源文件并经 stdin PATCH。
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./create-m2-tickets.ps1', import.meta.url), 'utf8')
const re = /--title '([^']+)'[\s\S]*?--body @'\r?\n([\s\S]*?)\r?\n'@/g
const items = [...src.matchAll(re)].map((m) => ({ title: m[1].trim(), body: m[2] }))
const nums = [12, 13, 14, 15, 16, 17, 18, 19, 20]

if (items.length !== nums.length) {
  console.error(`parse mismatch: got ${items.length} tickets, expected ${nums.length}`)
  process.exit(1)
}

for (let i = 0; i < nums.length; i++) {
  const payload = JSON.stringify({ title: items[i].title, body: items[i].body })
  execSync(`gh api repos/Silencehuliang/dsh-market-watch/issues/${nums[i]} -X PATCH --input -`, {
    input: payload,
    encoding: 'utf8',
  })
  console.log(`fixed #${nums[i]}: ${items[i].title}`)
}
