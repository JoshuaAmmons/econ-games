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
]);

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '8px',
            background: '#333',
            color: '#fff',
          },
          success: {
            style: {
              background: '#059669',
            },
          },
          error: {
            style: {
              background: '#dc2626',
            },
          },
        }}
      />
    </>
  );
}

export default App;
