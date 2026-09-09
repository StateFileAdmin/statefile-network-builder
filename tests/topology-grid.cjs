const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('src/data/topologyGrid.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('exports', compiled)(mod.exports);
const { snapTopologyPosition: snap } = mod.exports;
for (const position of [{x:300,y:250},{x:-301,y:-251},{x:42.875,y:103.125},{x:0,y:0}]) {
 const placed = snap(position);
 assert.equal(Math.abs(placed.x % 24), 0);
 assert.equal(Math.abs(placed.y % 24), 0);
 assert.deepEqual(snap(placed), placed);
 assert.deepEqual(snap({ x: placed.x + 48, y: placed.y - 24 }), { x: placed.x + 48, y: placed.y - 24 });
 assert.deepEqual(snap({x: placed.x + 288, y: placed.y + 144}), {x: placed.x + 288, y: placed.y + 144});
}
assert.deepEqual(snap({x:300,y:250}), {x:312,y:240});
console.log('Topology grid checks passed');
