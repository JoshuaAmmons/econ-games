import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Home } from './pages/Home';
import { AdminDashboard } from './pages/AdminDashboard';
import { CreateSession } from './pages/CreateSession';
import { JoinSession } from './pages/JoinSession';
import { Lobby } from './pages/Lobby';
import { Market } from './pages/Market';
import { SessionMonitor } from './pages/SessionMonitor';
import { Results } from './pages/Results';
import { Analytics } from './pages/Analytics';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/admin',
    element: <AdminDashboard />,
  },
  {
    path: '/admin/create',
    element: <CreateSession />,
  },
  {
    path: '/join',
    element: <JoinSession />,
  },
  {
    path: '/session/:code/lobby',
    element: <Lobby />,
  },
  {
    path: '/session/:code/market',
    element: <Market />,
  },
  {
    path: '/session/:code/monitor',
    element: <SessionMonitor />,
  },
  {
    path: '/session/:code/results',
    element: <Results />,
  },
  {
    path: '/session/:code/analytics',
    element: <Analytics />,
  },
]);

function App() {
  return (
    <>
      {/* Subtle animated water backdrop */}
      <div className="water-backdrop" aria-hidden="true" />
      <RouterProvider router={router} />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '8px',
            background: '#1c2333',
            color: '#e6e1d6',
            border: '1px solid #30363d',
            fontFamily: "'Crimson Pro', Georgia, serif",
          },
          success: {
            style: {
              background: '#0d2818',
              border: '1px solid #1a4a2e',
              color: '#3fb950',
            },
          },
          error: {
            style: {
              background: '#2d1215',
              border: '1px solid #5a2a2a',
              color: '#f85149',
            },
          },
        }}
      />
    </>
  );
}

export default App;
