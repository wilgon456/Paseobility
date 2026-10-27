import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
export async function preview(port=0) {
  const out=path.join(root,'.preview'); await mkdir(out,{recursive:true});
  await build({absWorkingDir:root,entryPoints:[path.join(root,'tests/preview/entry.tsx')],bundle:true,outfile:path.join(out,'app.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"',global:'globalThis'},
    alias:{'react-native':'react-native-web','@getpaseo/plugin/client/ui':path.join(root,'tests/preview/ui.tsx'),'@getpaseo/plugin/client':path.join(root,'tests/preview/sdk.mjs'),'@getpaseo/plugin':path.join(root,'tests/preview/sdk.mjs')}});
  await writeFile(path.join(out,'index.html'),'<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paseo 봇 · 오프라인 테스트</title><style>html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}body{font-family:"Apple SD Gothic Neo","Malgun Gothic",sans-serif;word-break:keep-all;overflow-wrap:break-word}*{box-sizing:border-box}button:focus-visible,input:focus-visible,textarea:focus-visible,[role=button]:focus-visible{outline:2px solid #3577ce;outline-offset:2px}</style><div id="root"></div><script src="/app.js"></script></html>');
  const server=createServer(async(req,res)=>{ try{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html; charset=utf-8');res.end(await readFile(path.join(out,req.url==='/app.js'?'app.js':'index.html')));}catch{res.writeHead(500);res.end();} });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  return {server,url:`http://127.0.0.1:${server.address().port}`};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) { const p=await preview(Number(process.argv[2]||4178)); console.log(`Offline fixture: ${p.url}`); }
