/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/ocr/:path*',
        destination: process.env.OCR_SERVICE_URL || 'http://localhost:8510/:path*',
      },
      {
        source: '/api/search/:path*',
        destination: process.env.SEARCH_SERVICE_URL || 'http://localhost:8520/:path*',
      },
      {
        source: '/api/graph/:path*',
        destination: process.env.GRAPH_SERVICE_URL || 'http://localhost:8530/:path*',
      },
      {
        source: '/api/automation/:path*',
        destination: process.env.AUTOMATION_SERVICE_URL || 'http://localhost:8540/:path*',
      },
      {
        source: '/api/storage/:path*',
        destination: process.env.STORAGE_SERVICE_URL || 'http://localhost:8550/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
