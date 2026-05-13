import { useEffect, useState, Suspense, lazy } from 'react';
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Header from './components/Header';
import auth from './utils/auth';
import './App.css';

const TodoList = lazy(() => import('./pages/TodoList'));
const CalendarView = lazy(() => import('./pages/CalendarView'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  const updateAuthState = () => {
    const loggedIn = auth.isLoggedIn();
    const user = auth.getCurrentUser();
    setIsLoggedIn(loggedIn);
    setCurrentUser(user);
  };

  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);
      await auth.bootstrap();
      updateAuthState();
      setLoading(false);
    };

    checkAuth();

    const handleAuthStateChange = (e) => {
      const { user, isLoggedIn } = e.detail;
      setIsLoggedIn(isLoggedIn);
      setCurrentUser(user);

      if (user && isLoggedIn) {
        auth.currentUser = user;
      } else {
        auth.currentUser = null;
      }
    };

    window.addEventListener('authStateChanged', handleAuthStateChange);

    return () => {
      window.removeEventListener('authStateChanged', handleAuthStateChange);
    };
  }, []);

  const handleLogout = () => {
    auth.logout();
    updateAuthState();
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-base-200">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="mt-4 text-lg">初始化中...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--fallback-b1, oklch(var(--b1)))',
            color: 'var(--fallback-bc, oklch(var(--bc)))',
          },
        }}
      />
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <div className="flex flex-col min-h-screen">
          {isLoggedIn && (
            <Header currentUser={currentUser} onLogout={handleLogout} />
          )}

          <main className="flex-grow">
            <Suspense
              fallback={
                <div className="flex justify-center items-center min-h-screen">
                  <span className="loading loading-spinner loading-lg text-primary"></span>
                </div>
              }
            >
              <Routes>
                <Route
                  path="/login"
                  element={isLoggedIn ? <Navigate to="/" replace /> : <Login />}
                />
                <Route
                  path="/register"
                  element={
                    isLoggedIn ? <Navigate to="/" replace /> : <Register />
                  }
                />
                <Route
                  path="/"
                  element={
                    isLoggedIn ? (
                      <Navigate to="/calendar" replace />
                    ) : (
                      <Navigate to="/login" replace />
                    )
                  }
                />
                <Route
                  path="/calendar"
                  element={
                    isLoggedIn ? (
                      <CalendarView />
                    ) : (
                      <Navigate to="/login" replace />
                    )
                  }
                />
                <Route
                  path="/todos"
                  element={
                    isLoggedIn ? <TodoList /> : <Navigate to="/login" replace />
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </Router>
    </>
  );
}

export default App;
