/**
 * Main App Component
 * 
 * This is the root component that manages the application lifecycle,
 * showing a splash screen during initialization and the main app after.
 * Now uses Ant Design Pro for UI components with theme switching.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ConfigProvider, App as AntApp } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import { useTranslation } from 'react-i18next';

// Ant Design locales
import enUS from 'antd/locale/en_US';
import ptBR from 'antd/locale/pt_BR';
import esES from 'antd/locale/es_ES';
import deDE from 'antd/locale/de_DE';
import frFR from 'antd/locale/fr_FR';
import itIT from 'antd/locale/it_IT';
import jaJP from 'antd/locale/ja_JP';
import zhCN from 'antd/locale/zh_CN';
import koKR from 'antd/locale/ko_KR';

import { ConnectionProvider } from './context/ConnectionContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { SplashScreen } from './components/SplashScreen';
import { MainLayout } from './layouts/MainLayout';
import { getThemeConfig } from './theme/themeConfig';

// Import Ant Design styles
import 'antd/dist/reset.css';

type AppState = 'splash' | 'ready';

// Map i18n language to Ant Design locale
const antdLocales: Record<string, typeof enUS> = {
    'en': enUS,
    'pt-BR': ptBR,
    'es': esES,
    'de': deDE,
    'fr': frFR,
    'it': itIT,
    'ja': jaJP,
    'zh': zhCN,
    'ko': koKR,
};

// Inner component that uses theme context
const AppContent: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { themeMode } = useTheme();
    const [appState, setAppState] = useState<AppState>('splash');
    const [loadingMessage, setLoadingMessage] = useState('');
    const [loadingProgress, setLoadingProgress] = useState<number | undefined>(undefined);

    // Get current Ant Design locale
    const antdLocale = antdLocales[i18n.language] || enUS;

    // Sync theme mode to body class for CSS styling
    useEffect(() => {
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(`${themeMode}-theme`);
    }, [themeMode]);

    // Initialize the application
    const initializeApp = useCallback(async () => {
        try {
            // Step 1: Wait for the SSM API to be ready
            setLoadingMessage(t('splash.connecting_backend'));
            setLoadingProgress(20);

            // Wait for ssm-ready event or check if already ready
            await new Promise<void>((resolve) => {
                // Check if backend is already ready (ssm exists and has methods)
                if (window.ssm && typeof window.ssm.listConnections === 'function') {
                    // Try a simple call to verify backend is actually responding
                    window.ssm.listConnections()
                        .then(() => resolve())
                        .catch(() => {
                            // Wait for the event
                            const handleReady = () => {
                                window.removeEventListener('ssm-ready', handleReady);
                                resolve();
                            };
                            window.addEventListener('ssm-ready', handleReady);
                        });
                } else {
                    // Wait for the event
                    const handleReady = () => {
                        window.removeEventListener('ssm-ready', handleReady);
                        resolve();
                    };
                    window.addEventListener('ssm-ready', handleReady);
                }
            });

            setLoadingProgress(50);
            setLoadingMessage(t('splash.loading_settings'));

            // Brief delay for visual feedback
            await new Promise(resolve => setTimeout(resolve, 300));

            setLoadingProgress(80);
            setLoadingMessage(t('splash.preparing_interface'));

            // Another brief delay
            await new Promise(resolve => setTimeout(resolve, 200));

            setLoadingProgress(100);
            setLoadingMessage(t('splash.ready'));

            // Short delay before transition
            await new Promise(resolve => setTimeout(resolve, 300));

            setAppState('ready');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            setLoadingMessage(t('splash.error_starting'));
        }
    }, [t]);

    // Run initialization on mount
    useEffect(() => {
        // Set initial loading message
        setLoadingMessage(t('splash.starting'));
        initializeApp();
    }, [initializeApp, t]);

    const themeConfig = getThemeConfig(themeMode);

    // Show splash screen during loading
    if (appState === 'splash') {
        return (
            <StyleProvider hashPriority="high">
                <ConfigProvider theme={themeConfig} locale={antdLocale}>
                    <SplashScreen
                        message={loadingMessage}
                        progress={loadingProgress}
                    />
                </ConfigProvider>
            </StyleProvider>
        );
    }

    // Show main application with Ant Design providers
    return (
        <StyleProvider hashPriority="high">
            <ConfigProvider theme={themeConfig} locale={antdLocale}>
                <AntApp>
                    <ConnectionProvider>
                        <MainLayout />
                    </ConnectionProvider>
                </AntApp>
            </ConfigProvider>
        </StyleProvider>
    );
};

// Main App wrapped with ThemeProvider
const App: React.FC = () => {
    return (
        <ThemeProvider>
            <AppContent />
        </ThemeProvider>
    );
};

export default App;
