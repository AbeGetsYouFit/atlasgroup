import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/montserrat/latin-600.css';
import '@fontsource/montserrat/latin-700.css';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root')!;
const app = <React.StrictMode><BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/,'')}><App /></BrowserRouter></React.StrictMode>;
if(root.hasChildNodes())ReactDOM.hydrateRoot(root,app);
else ReactDOM.createRoot(root).render(app);
