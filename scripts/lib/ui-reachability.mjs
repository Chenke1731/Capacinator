import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';

// Conservative import closure: includes lazy and development-only imports,
// and CSS @imports that Vite inlines without leaving Rollup module records.
// A missing resolver or dynamic specifier fails closed; it is never evidence
// that a source file is unused.
export function uiReachability(root, entry='client/src/main.tsx') {
  const reached=new Set(), errors=[];
  const html=path.join(root,'index.html');
  if(fs.existsSync(html)) {
    const scripts=[...fs.readFileSync(html,'utf8').matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)].map(m=>m[1].replace(/^\//,''));
    if(scripts.length!==1||scripts[0]!==entry)errors.push('UI HTML entry changed; update reachability adapter before approving unused assets');
  }
  function resolve(from,specifier) {
    if(!specifier.startsWith('.')&&!specifier.startsWith('@/'))return null;
    const target=specifier.startsWith('@/')?`client/src/${specifier.slice(2)}`:path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier));
    for(const f of [target,...(/\.js$/.test(target)?[target.replace(/\.js$/,'.ts'),target.replace(/\.js$/,'.tsx')]:[]),...['.ts','.tsx','.js','.jsx','.css','/index.ts','/index.tsx'].map(x=>target+x)])if(fs.existsSync(path.join(root,f))&&fs.statSync(path.join(root,f)).isFile())return f;
    errors.push(`Unresolved local import ${from}: ${specifier}`);return null;
  }
  function visit(file) {
    if(reached.has(file))return;reached.add(file);
    const source=fs.readFileSync(path.join(root,file),'utf8');
    const imports=[];
    if(file.endsWith('.css')) {
      postcss.parse(source).walkAtRules('import',rule=>{
        const match=rule.params.match(/^(?:url\()?['"]([^'"]+)['"]/);
        if(match)imports.push(match[1]);else if(!rule.params.startsWith('url(http'))errors.push(`Unsupported CSS import ${file}: ${rule.params}`);
      });
    } else if(/\.[cm]?[jt]sx?$/.test(file)) {
      const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
      function walk(node) {
        if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier)imports.push(node.moduleSpecifier.text);
        if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||node.expression.getText(ast)==='require')) {
          if(node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]))imports.push(node.arguments[0].text);
          else errors.push(`Unresolved dynamic import ${file}`);
        }
        if(ts.isCallExpression(node)&&node.expression.getText(ast).startsWith('import.meta.glob'))errors.push(`Unsupported glob ${file}`);
        ts.forEachChild(node,walk);
      }walk(ast);
    }
    for(const specifier of imports){const dependency=resolve(file,specifier);if(dependency)visit(dependency);}
  }
  if(!fs.existsSync(path.join(root,entry)))return {files:[],errors:[`Missing UI entry ${entry}`]};
  visit(entry);return {files:[...reached].sort(),errors};
}
