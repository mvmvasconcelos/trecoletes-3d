/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            keyframes: {
                indeterminate: {
                    '0%':   { transform: 'translateX(-250%)' },
                    '100%': { transform: 'translateX(650%)' },
                },
            },
            animation: {
                indeterminate: 'indeterminate 1.6s ease-in-out infinite',
            },
        },
    },
    plugins: [],
}
