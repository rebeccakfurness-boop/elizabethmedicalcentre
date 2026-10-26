/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server actions carry uploaded statements, bills and proofs of payment.
  experimental: {
    serverActions: { bodySizeLimit: '5mb' },
  },
};

export default nextConfig;
