import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('twse_theme') || 'dark';
  });

  // Taiwan market mode: red is UP, green is DOWN (standard in Taiwan/Asia)
  const [colorMode, setColorMode] = useState(() => {
    return localStorage.getItem('twse_color_mode') || 'tw'; // 'tw' (red=up) | 'us' (green=up)
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('twse_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('twse_color_mode', colorMode);
  }, [colorMode]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const toggleColorMode = () => {
    setColorMode(prev => (prev === 'tw' ? 'us' : 'tw'));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'dark',
        toggleTheme,
        colorMode,
        toggleColorMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
