/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude pdf-parse test files from build
      config.externals = config.externals || []
      config.externals.push({
        './test/data/05-versions-space.pdf': 'commonjs ./test/data/05-versions-space.pdf'
      })
      
      // Ignore test files in pdf-parse package
      config.module.rules.push({
        test: /\.pdf$/,
        use: 'null-loader'
      })
    }
    return config
  },
  serverExternalPackages: ['pdf-parse']
}

module.exports = nextConfig 