import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Home } from './pages/Home';
import { AdminDashboard } from './pages/AdminDashboard';
import { CreateSession } from './pages/CreateSession';
import { JoinSession } from './pages/JoinSession';
import { Lobby } from './pages/Lobby';

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
    // Placeholder - will be built in Phase 5
    element: <div className="min-h-screen flex items-center justify-center"><p className="text-xl text-gray-600">Market page coming soon...</p></div>,
  },
  {
    path: '/session/:code/monitor',
    // Placeholder - will be built in Phase 5
    element: <div className="min-h-screen flex items-center justify-center"><p className="text-xl text-gray-600">Session monitor coming soon...</p></div>,
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
