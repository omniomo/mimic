// Prints icon entries for src/ui/icons.tsx, taken from react-icons' Ionicons 5 (MIT) or Lucide (ISC) sets.
// No brand logos: those stay out of the repo on purpose.
//
//   npm i --no-save react-icons
//   node tools/icons.mjs io5 bulb=IoBulbOutline tv=IoTvOutline      → paste into IO
//   node tools/icons.mjs lu  hash=LuHash                             → paste into LU
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'react-icons')

function table(set) {
  const src = fs.readFileSync(`${base}/${set}/index.mjs`, 'utf8')
  const out = {}
  const re = /export function (\w+) \(props\) \{\n  return GenIcon\((\{.*\})\)\(props\);/g
  let m
  while ((m = re.exec(src))) out[m[1]] = JSON.parse(m[2])
  return out
}
const kebab = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase())
function markup(nodes) {
  return nodes.map(n => {
    const attrs = Object.entries(n.attr).map(([k, v]) => `${kebab(k)}="${v}"`).join(' ')
    const inner = markup(n.child || [])
    return inner ? `<${n.tag} ${attrs}>${inner}</${n.tag}>` : `<${n.tag} ${attrs}/>`
  }).join('')
}

const [setName, ...pairs] = process.argv.slice(2)
if (!setName || !pairs.length) {
  console.error('usage: node tools/icons.mjs <io5|lu> key=ExportName ...')
  process.exit(1)
}
const icons = table(setName)
const missing = []
for (const pair of pairs) {
  const [key, name] = pair.split('=')
  const data = icons[name]
  if (!data) { missing.push(name); continue }
  const { viewBox, ...rest } = data.attr
  const root = Object.entries(rest).map(([k, v]) => `${kebab(k)}="${v}"`).join(' ')
  console.log(`  ${JSON.stringify(key)}: [${JSON.stringify(viewBox)}, ${JSON.stringify(root)}, ${JSON.stringify(markup(data.child))}],`)
}
if (missing.length) { console.error('not found:', missing.join(' ')); process.exit(1) }
