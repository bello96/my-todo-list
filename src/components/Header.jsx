import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowRightEndOnRectangleIcon } from '@heroicons/react/24/outline';
import { Dropdown, Avatar } from 'antd';
import {
  UserOutlined,
  SunOutlined,
  MoonOutlined,
  DesktopOutlined,
} from '@ant-design/icons';

function Header({ currentUser, onLogout }) {
  const [themeMode, setThemeMode] = useState(() => {
    const saved = localStorage.getItem('user-theme-preference');
    return saved || 'system';
  });

  const getCurrentTheme = useCallback(() => {
    if (themeMode === 'system') {
      return window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return themeMode;
  }, [themeMode]);

  const changeTheme = (mode) => {
    setThemeMode(mode);
    if (mode === 'system') {
      localStorage.removeItem('user-theme-preference');
    } else {
      localStorage.setItem('user-theme-preference', mode);
    }

    const actualTheme =
      mode === 'system'
        ? window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : mode;

    document.documentElement.setAttribute('data-theme', actualTheme);

    window.dispatchEvent(
      new CustomEvent('themeChanged', {
        detail: { isDark: actualTheme === 'dark', mode },
      })
    );
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (themeMode === 'system') {
        const isDark = mediaQuery.matches;
        document.documentElement.setAttribute(
          'data-theme',
          isDark ? 'dark' : 'light'
        );
        window.dispatchEvent(
          new CustomEvent('themeChanged', {
            detail: { isDark, mode: 'system' },
          })
        );
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else {
      mediaQuery.addListener(handleSystemThemeChange);
    }

    const actualTheme = getCurrentTheme();
    document.documentElement.setAttribute('data-theme', actualTheme);

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      } else {
        mediaQuery.removeListener(handleSystemThemeChange);
      }
    };
  }, [themeMode, getCurrentTheme]);

  const handleLogout = () => {
    localStorage.removeItem('user-theme-preference');
    setThemeMode('system');
    onLogout();
  };

  const themeItems = [
    {
      key: 'system',
      label: (
        <div className="flex items-center gap-2">
          <DesktopOutlined />
          <span>跟随系统</span>
        </div>
      ),
      onClick: () => changeTheme('system'),
    },
    {
      key: 'light',
      label: (
        <div className="flex items-center gap-2">
          <SunOutlined />
          <span>明亮模式</span>
        </div>
      ),
      onClick: () => changeTheme('light'),
    },
    {
      key: 'dark',
      label: (
        <div className="flex items-center gap-2">
          <MoonOutlined />
          <span>黑暗模式</span>
        </div>
      ),
      onClick: () => changeTheme('dark'),
    },
  ];

  const userItems = [
    {
      key: 'logout',
      label: (
        <div className="flex items-center gap-2 text-red-500">
          <ArrowRightEndOnRectangleIcon className="h-4 w-4" />
          <span>退出登录</span>
        </div>
      ),
      onClick: handleLogout,
    },
  ];

  const getThemeIcon = () => {
    if (themeMode === 'system') {
      return <DesktopOutlined className="text-base-content" />;
    }
    if (themeMode === 'light') {
      return <SunOutlined className="text-yellow-500" />;
    }
    return <MoonOutlined className="text-blue-400" />;
  };

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="navbar bg-base-100 shadow-lg"
    >
      <div className="navbar-start">
        <h1 className="text-xl font-bold text-primary">Todo List</h1>
      </div>
      <div className="navbar-end">
        <div className="flex items-center gap-4">
          <Dropdown
            menu={{ items: themeItems }}
            placement="bottomRight"
            trigger={['click']}
          >
            <div className="flex items-center gap-1 cursor-pointer hover:bg-base-200 rounded-lg p-2 transition-colors">
              {getThemeIcon()}
            </div>
          </Dropdown>

          <Dropdown
            menu={{ items: userItems }}
            placement="bottomRight"
            trigger={['click']}
          >
            <div className="flex items-center gap-2 cursor-pointer hover:bg-base-200 rounded-lg p-2 transition-colors">
              <Avatar icon={<UserOutlined />} size={32} />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-base-content">
                  {currentUser?.username}
                </span>
              </div>
            </div>
          </Dropdown>
        </div>
      </div>
    </motion.nav>
  );
}

export default Header;
