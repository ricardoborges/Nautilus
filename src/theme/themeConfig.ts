/**
 * Ant Design Theme Configuration
 * 
 * Configures the theme tokens for the Nautilus application.
 * Supports both light and dark themes.
 */

import type { ThemeConfig } from 'antd';
import { theme as antdTheme } from 'antd';

export type ThemeMode = 'light' | 'dark';

export const getThemeConfig = (mode: ThemeMode): ThemeConfig => {
    const isDark = mode === 'dark';

    return {
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
            // Primary brand color - Professional blue
            colorPrimary: '#1677ff',

            // Border radius
            borderRadius: 6,

            // Typography
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
        components: {
            Layout: {
                // Sidebar styling based on theme
                siderBg: isDark ? '#001529' : '#ffffff',
                headerBg: isDark ? '#001529' : '#ffffff',
                bodyBg: isDark ? '#141414' : '#f5f5f5',
                triggerBg: isDark ? '#002140' : '#f0f0f0',
                triggerColor: isDark ? '#ffffff' : '#000000',
            },
            Menu: {
                // Menu styling based on theme
                itemBg: isDark ? '#001529' : '#ffffff',
                subMenuItemBg: isDark ? '#000c17' : '#fafafa',
                itemSelectedBg: isDark ? '#1677ff' : '#e6f4ff',
                itemSelectedColor: isDark ? '#ffffff' : '#1677ff',
                itemHoverBg: isDark ? '#002140' : '#f5f5f5',
            },
        },
    };
};

// Default export for backward compatibility
export default getThemeConfig('light');
