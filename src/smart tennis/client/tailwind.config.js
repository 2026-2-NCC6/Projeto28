/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sport: {
          navy: '#142B3D',
          navyDeep: '#0D1C28',
          navyLight: '#1C3A52',
          navyHeading: '#142B3D',

          // Dark Theme Palette
          darkBg: '#101820',
          darkBgSec: '#18242E',
          darkCard: '#22313D',
          darkHeader: '#0D1B2A',
          darkBorder: '#344653',
          darkText: '#F1F5F9',
          darkTextSec: '#A8BAC8',
          darkBlue: '#60A5FA',

          bgLight: '#DCE3E8',
          surfaceAlt: '#C9D4DC',
          surfaceCard: '#F4F6F8',
          surfaceInput: '#E8EDF1',
          borderLight: '#B8C6D0',
          borderInput: '#B8C6D0',
          textDark: '#142B3D',
          textMuted: '#475569',
          ice: '#DCE3E8',

          
          lime: '#B8F044',
          limeHover: '#A4DE2D',
          blue: '#2563EB',
          blueHover: '#1D4ED8',
          orange: '#FF7548',
          orangeHover: '#F05F30',
          slate: '#475569',
          slateLight: '#64748B',
          border: '#B8C6D0',
          card: '#F4F6F8',
          text: '#142B3D',
        },
        tennis: {
          bg: '#07110B',
          panel: '#0C1A11',
          card: '#102216',
          cardHover: '#152C1D',
          border: '#1B3624',
          borderBright: '#295437',
          neon: '#39FF88',
          secondary: '#16C96B',
          white: '#F5F7F5',
          gray: '#8C9891',
          darkGray: '#47544C',
          accentRed: '#FF4D6D',
          accentGold: '#FFD166',
          accentBlue: '#00F0FF'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        sport: ['"Barlow Condensed"', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Rajdhani', 'Impact', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace']
      },
      boxShadow: {
        'sport-card': '0 4px 20px -2px rgba(16, 24, 32, 0.12), 0 2px 6px -1px rgba(16, 24, 32, 0.08)',
        'sport-card-hover': '0 12px 28px -4px rgba(16, 24, 32, 0.20), 0 4px 10px -2px rgba(16, 24, 32, 0.12)',
        'sport-lime': '0 4px 14px 0 rgba(184, 240, 68, 0.40)',
        'sport-blue': '0 4px 14px 0 rgba(37, 99, 235, 0.30)',
        'sport-orange': '0 4px 14px 0 rgba(255, 117, 72, 0.30)',
        'neon': '0 0 15px rgba(57, 255, 136, 0.25)',
        'neon-strong': '0 0 25px rgba(57, 255, 136, 0.45)',
        'neon-sm': '0 0 8px rgba(57, 255, 136, 0.2)',
        'target': '0 0 30px rgba(57, 255, 136, 0.3), inset 0 0 30px rgba(57, 255, 136, 0.15)'
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'scan': 'scan 3s linear infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(1000%)' }
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(57, 255, 136, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(57, 255, 136, 0.6)' }
        }
      }
    },
  },
  plugins: [],
}
