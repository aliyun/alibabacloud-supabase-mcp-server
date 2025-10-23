// packages/mcp-server-supabase/tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/transports/stdio.ts', 'src/platform/index.ts'],
    format: ['cjs', 'esm'],
    outDir: 'dist',
    sourcemap: true,
    dts: true,
    minify: true, // 建议在调试期间设为 false，更容易看懂打包后的代码
    splitting: false, // 禁用代码分割以避免相对路径问题
    loader: {
      '.sql': 'text',
    },
    // 移除 external，因为它没有生效
    // external: ['querystring'], 

    // --- 使用 banner 注入 require 的 shim ---
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
  },
]);
