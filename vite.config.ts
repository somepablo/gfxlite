import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  // Root folder for the dev server
  root: 'examples', 
  
  build: {    
    outDir: '../dist',
    lib: {      
      entry: resolve(__dirname, 'src/index.ts'),      
      name: 'GFXLite',      
      fileName: (format) => `gfxlite.${format}.js`,
    }
  },
  plugins: [
    // Generate declaration files (.d.ts)
    dts({
      outDir: '../dist/types',
      insertTypesEntry: true,
    }),
  ],
});