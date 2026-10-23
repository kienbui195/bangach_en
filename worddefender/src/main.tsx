import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { loadRemoteContent } from './config/remoteContent';

loadRemoteContent().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
