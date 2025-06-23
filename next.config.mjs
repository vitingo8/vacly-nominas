/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable production optimizations
  swcMinify: true,
  compress: true,
  
  // Disable source maps in production for security
  productionBrowserSourceMaps: false,
  
  // Security headers - ACTUALIZADO para permitir acceso externo a APIs
  async headers() {
    return [
      {
        // Para rutas de API - permitir acceso externo
        source: '/api/(.*)',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, X-Requested-With',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
      {
        // Para el resto de rutas - mantener seguridad del código
        source: '/((?!api).*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.anthropic.com https://api.voyageai.com https://*.supabase.co;",
          },
        ],
      },
    ];
  },
  
  // Webpack configuration for additional security
  webpack: (config, { isServer, dev }) => {
    if (!dev) {
      // Production optimizations
      config.optimization = {
        ...config.optimization,
        minimize: true,
        // Additional obfuscation
        usedExports: true,
        sideEffects: false,
      };
      
      // Remove console logs in production
      config.module.rules.push({
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            plugins: [
              ['transform-remove-console', { exclude: ['error', 'warn'] }]
            ]
          }
        }
      });
    }
    
    return config;
  },
  
  // Experimental features for additional security
  experimental: {
    // Enable modern bundling
    esmExternals: 'loose',
  },
};

export default nextConfig; 