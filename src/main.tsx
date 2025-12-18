/**
 * React Entry Point for Nautilus
 * 
 * This is the main entry point for the React application.
 * It waits for the backend to be ready before rendering.
 */

import './index.css';
import './i18n/config';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './tauri-bridge'; // Initialize the ssm API bridge

// Wait for DOM and backend to be ready
const initApp = (): void => {
    const rootElement = document.getElementById('root');

    if (!rootElement) {
        console.error('Root element not found');
        return;
    }

    ReactDOM.createRoot(rootElement).render(<App />);
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
