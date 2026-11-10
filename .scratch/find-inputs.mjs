import { readFileSync } from 'node:fs'
const t = readFileSync(process.argv[2], 'utf8')
const re = /textbox "([^"]+)"\s*\[ref=(e\d+)\]/g
let m
while ((m = re.exec(t))) console.log(m[2], '|', m[1])
