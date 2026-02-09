import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Home } from './pages/Home';
import { AdminDashboard } from './pages/AdminDashboard';
import { CreateSession } from './pages/CreateSession';
import { JoinSession } from './pages/JoinSession';
import { Lobby } from './pages/Lobby';
import { Market } from './pages/Market';
import { SessionMonitor } from './pages/SessionMonitor';

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
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
