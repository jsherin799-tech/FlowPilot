/** @type {import('next').NextStepConfig} */
const nextConfig = {
    output: 'standalone',
    reactStrictMode: true,
    turbopack: {
        root: __dirname,
    },
};

module.exports = nextConfig;