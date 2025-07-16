import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'chart-vendor': ['recharts'],
          'date-vendor': ['date-fns'],
          'icon-vendor': ['lucide-react'],
          
          // UI components chunk
          'ui-components': [
            './src/components/ui/button.tsx',
            './src/components/ui/card.tsx',
            './src/components/ui/input.tsx'
          ],
          
          // Trading components chunk
          'trading-components': [
            './src/components/TradingInterface.tsx',
            './src/components/TradingDashboard.tsx'
          ],
          
          // Portfolio components chunk
          'portfolio-components': [
            './src/components/PortfolioOverview.tsx',
            './src/components/PortfolioPerformance.tsx',
            './src/components/PositionsList.tsx'
          ],
          

        }
      }
    },
    // Increase chunk size warning limit to 1000kb
    chunkSizeWarningLimit: 1000,
    // Enable source maps for better debugging
    sourcemap: false, // Disable in production for smaller builds
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'recharts',
      'date-fns',
      'lucide-react'
    ]
  }
})
