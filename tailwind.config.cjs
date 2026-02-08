/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/client/*.html',
        './src/client/game/**/*.{ts,tsx}',
        './src/client/splash/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {},
    },
    plugins: [],
};
