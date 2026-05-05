import { useEffect, useState, Suspense, lazy } from 'react';
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { App as AntdApp, ConfigProvider, theme, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Header from './components/Header';
import auth from './utils/auth';
import './App.css';

// 动态导入页面组件
const TodoList = lazy(() => import('./pages/TodoList'));
const CalendarView = lazy(() => import('./pages/CalendarView'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));

const { defaultAlgorithm, darkAlgorithm, compactAlgorithm } = theme;

// 自定义算法配置
const customLightAlgorithm = [defaultAlgorithm, compactAlgorithm];
const customDarkAlgorithm = [darkAlgorithm, compactAlgorithm];

// 完整的主题配置
const customThemeConfig = {
  light: {
    algorithm: customLightAlgorithm,
    token: {
      colorPrimary: '#605dff',
      colorBgBase: '#ffffff', // 明亮模式下的基础背景色
      colorBgContainer: '#ffffff', // 明亮模式下的容器背景色
      colorBgElevated: '#ffffff', // 弹出层背景色
      colorText: '#000000', // 明亮模式下的文字颜色
      colorTextBase: '#000000', // 基础文字颜色
    },
  },
  dark: {
    algorithm: customDarkAlgorithm,
    token: {
      colorPrimary: '#605df2',
      colorBgBase: '#1d232a', // 暗黑模式下的基础背景色
      colorBgContainer: '#1d232a', // 暗黑模式下的容器背景色
      colorBgElevated: '#2a323c', // 暗黑模式下的弹出层背景色
      colorText: '#ecfaff', // 暗黑模式下的文字颜色
      colorTextBase: '#ecfaff', // 基础文字颜色
    },
  },
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  // 添加暗黑模式检测
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // 从 localStorage 读取用户手动设置的主题，默认跟随系统
    const saved = localStorage.getItem('user-theme-preference');
    if (saved) {
      return saved === 'dark';
    }
    return (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  });

  // 监听主题变化事件
  useEffect(() => {
    const handleThemeChange = e => {
      setIsDarkMode(e.detail.isDark);
    };

    window.addEventListener('themeChanged', handleThemeChange);

    return () => {
      window.removeEventListener('themeChanged', handleThemeChange);
    };
  }, []);

  // 更新登录状态的函数
  const updateAuthState = () => {
    const loggedIn = auth.isLoggedIn();
    const user = auth.getCurrentUser();
    setIsLoggedIn(loggedIn);
    setCurrentUser(user);
  };

  useEffect(() => {
    // 初始检查登录状态
    const checkAuth = () => {
      setLoading(true);
      updateAuthState();
      setLoading(false);
    };

    checkAuth();

    // 监听自定义认证状态变化事件
    const handleAuthStateChange = e => {
      const { user, isLoggedIn } = e.detail;
      // console.log('接收到认证状态变化事件:', { user, isLoggedIn });
      setIsLoggedIn(isLoggedIn);
      setCurrentUser(user);

      // 注意：不要在这里调用 saveUserToStorage，避免无限循环
      // 只同步更新 auth 实例的 currentUser 属性
      if (user && isLoggedIn) {
        auth.currentUser = user;
      } else {
        auth.currentUser = null;
      }
    };

    window.addEventListener('authStateChanged', handleAuthStateChange);

    // 监听 storage 事件（作为后备方案）
    const handleStorageChange = e => {
      if (e.key === 'currentUser') {
        updateAuthState();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // 清理函数
    return () => {
      window.removeEventListener('authStateChanged', handleAuthStateChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // 退出登录
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
    <ConfigProvider
      locale={zhCN}
      theme={isDarkMode ? customThemeConfig.dark : customThemeConfig.light}
    >
      <AntdApp style={{ backgroundColor: 'transparent' }}>
        <Router>
          <div className="flex flex-col min-h-screen">
            {/* 顶部导航栏（仅登录后显示） */}
            {isLoggedIn && (
              <Header currentUser={currentUser} onLogout={handleLogout} />
            )}

            <main className="flex-grow">
              <Suspense
                fallback={
                  <div className="flex justify-center items-center min-h-screen">
                    <Spin size="large" />
                  </div>
                }
              >
                <Routes>
                  {/* 公开路由 */}
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

                  {/* 受保护的路由 */}
                  <Route
                    path="/"
                    element={
                      isLoggedIn ? <Navigate to="/calendar" replace /> : <Navigate to="/login" replace />
                    }
                  />
                  <Route
                    path="/calendar"
                    element={
                      isLoggedIn ? <CalendarView /> : <Navigate to="/login" replace />
                    }
                  />
                  <Route
                    path="/todos"
                    element={
                      isLoggedIn ? <TodoList /> : <Navigate to="/login" replace />
                    }
                  />

                  {/* 404 重定向 */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </main>
          </div>
        </Router>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
