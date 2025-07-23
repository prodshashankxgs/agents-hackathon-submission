import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { checker } from 'vite-plugin-checker'
import compression from 'vite-plugin-compression'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'
  const isProd = mode === 'production'

  return {
    plugins: [
      react({
        // Enable SWC optimizations
        jsxImportSource: 'react',
      }),
      // Type checking in parallel to build (only in dev mode for faster prod builds)
      ...(isDev ? [checker({
        typescript: {
          buildMode: true,
          tsconfigPath: './tsconfig.app.json',
        },
        overlay: {
          initialIsOpen: false,
        },
      })] : []),
      // Compression for better performance (prod only)
      ...(isProd ? [compression({
        algorithm: 'gzip',
        ext: '.gz',
      })] : []),
      // Bundle analyzer (only when ANALYZE=true)
      ...(process.env.ANALYZE ? [visualizer({
        filename: 'dist/stats.html',
        open: true,
        gzipSize: true,
        brotliSize: true,
      })] : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 3000,
      host: true,
    },
    build: {
      // Performance optimizations
      chunkSizeWarningLimit: 1500,
      sourcemap: isDev,
      minify: isProd ? 'esbuild' : false,
      target: 'esnext',
      rollupOptions: {
        treeshake: {
          preset: 'smallest',
          moduleSideEffects: false,
        },
        output: {
          // Better compression
          compact: isProd,
          // Async chunk loading
          format: 'es',
          generatedCode: {
            preset: 'es2015',
            constBindings: true,
          },
          manualChunks: (id) => {
            // More efficient chunking strategy
            if (id.includes('node_modules')) {
              // Vendor chunks
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react-vendor'
              }
              if (id.includes('@tanstack/react-query')) {
                return 'query-vendor'
              }
              if (id.includes('recharts')) {
                return 'chart-vendor'
              }
              if (id.includes('date-fns')) {
                return 'date-vendor'
              }
              if (id.includes('lucide-react')) {
                return 'icon-vendor'
              }
              if (id.includes('framer-motion')) {
                return 'animation-vendor'
              }
              if (id.includes('@radix-ui')) {
                return 'radix-vendor'
              }
              // Other node_modules
              return 'vendor'
            }
            
            // Component-based chunking
            if (id.includes('/components/ui/')) {
              return 'ui-components'
            }
            if (id.includes('/components/') && (
              id.includes('Trading') || 
              id.includes('Options') ||
              id.includes('Strategy')
            )) {
              return 'trading-components'
            }
            if (id.includes('/components/') && (
              id.includes('Portfolio') || 
              id.includes('Performance') ||
              id.includes('Risk')
            )) {
              return 'portfolio-components'
            }
          }
        }
      },
    },
    // Aggressive dependency optimization
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        '@tanstack/react-query',
        'recharts',
        'date-fns',
        'lucide-react',
        'framer-motion',
        'zustand',
        'axios',
      ],
      force: true,
      // Use esbuild for faster processing
      esbuildOptions: {
        target: 'esnext',
      },
    },
    // Enhanced esbuild configuration
    esbuild: {
      target: 'esnext',
      drop: isProd ? ['console', 'debugger'] : [],
      // Faster transforms
      tsconfigRaw: {
        compilerOptions: {
          experimentalDecorators: true,
          useDefineForClassFields: false,
        },
      },
    },
    // Cache configuration for faster rebuilds
    cacheDir: 'node_modules/.vite',
    // Worker configuration for parallel processing
    worker: {
      format: 'es',
    },
  }
})
