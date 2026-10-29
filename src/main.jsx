import '@ant-design/v5-patch-for-react-19';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import App from './App.jsx';
import './style.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><ConfigProvider theme={{ token: { colorPrimary: '#315b65', borderRadius: 8 } }}><AntApp><BrowserRouter><App /></BrowserRouter></AntApp></ConfigProvider></React.StrictMode>);
