import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const bytes = readFileSync('../../_enrich_verify/simple_fix/360003071742500.pdf');
const raw = bytes.toString('latin1');

function scan(label: string, t: string) {
  const checks = [
    ['Pedido', /Pedido/i],
    ['hex Pedido', /50656469646f/i],
    ['(Pedido', /\(Pedido/i],
    ['AMA-ish', /DS Telar/i],
    ['3444b701', /3444b701/i],
  ] as const;
  for (const [name, re] of checks) {
    const n = (t.match(re) || []).length;
    if (n) console.log(label, name, n);
  }
}

scan('raw', raw);
const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
let m: RegExpExecArray | null;
let i = 0;
while ((m = re.exec(raw))) {
  i += 1;
  try {
    const bin = Buffer.from(m[1], 'latin1');
    if (bin[0] === 0x78) {
      const t = inflateSync(bin).toString('latin1');
      scan(`stream${i}`, t);
    }
  } catch {
    /* */
  }
}
