import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import { ArrowRightEndOnRectangleIcon } from '@heroicons/react/24/outline';

import { Dropdown, Avatar, Upload, App, Spin, Modal, Input } from 'antd';
import {
  UserOutlined,
  CameraOutlined,
  SunOutlined,
  MoonOutlined,
  DesktopOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { app } from '../utils/cloudbase';
import auth from '../utils/auth';

const db = app.database();

function Header({ currentUser, onLogout }) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar || null);
  const [themeMode, setThemeMode] = useState(() => {
    // 从 localStorage 读取用户手动设置的主题模式
    const saved = localStorage.getItem('user-theme-preference');
    return saved || 'system'; // 'system', 'light', 'dark'
  });
  
  // 修改用户名相关状态
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [nicknameLoading, setNicknameLoading] = useState(false);

  // 修改密码相关状态
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // 当 currentUser 变化时更新头像
  useEffect(() => {
    const updateAvatar = async () => {
      if (currentUser?.avatarFileId && currentUser?.avatar) {
        // 更新本地存储中的头像链接
        const updatedUser = { ...currentUser, avatar: currentUser?.avatar };
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));
      }
    };
    updateAvatar();
  }, [currentUser]);

  // 获取当前实际的主题状态
  const getCurrentTheme = useCallback(() => {
    if (themeMode === 'system') {
      return window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return themeMode;
  }, [themeMode]);

  // 主题切换函数
  const changeTheme = mode => {
    setThemeMode(mode);
    if (mode === 'system') {
      localStorage.removeItem('user-theme-preference');
    } else {
      localStorage.setItem('user-theme-preference', mode);
    }

    // 设置 DaisyUI 主题
    const actualTheme =
      mode === 'system'
        ? window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : mode;

    document.documentElement.setAttribute('data-theme', actualTheme);

    // 触发全局主题变化事件
    window.dispatchEvent(
      new CustomEvent('themeChanged', {
        detail: {
          isDark: actualTheme === 'dark',
          mode: mode,
        },
      })
    );
  };

  // 监听系统主题变化
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
            detail: {
              isDark: isDark,
              mode: 'system',
            },
          })
        );
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else {
      mediaQuery.addListener(handleSystemThemeChange);
    }

    // 初始化主题
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

  // 处理退出登录
  const handleLogout = () => {
    // 清除主题偏好设置，恢复为跟随系统
    localStorage.removeItem('user-theme-preference');
    setThemeMode('system');
    onLogout();
  };

  // 打开修改用户名弹窗
  const showNicknameModal = () => {
    setNewNickname(currentUser?.username || '');
    setIsNicknameModalOpen(true);
  };

  // 处理修改用户名
  const handleNicknameChange = async () => {
    if (!newNickname || !newNickname.trim()) {
      message.warning('新用户名不能为空');
      return;
    }

    if (newNickname.trim() === currentUser?.username) {
      message.warning('新用户名不能与当前用户名相同');
      return;
    }

    setNicknameLoading(true);
    try {
      // 更新数据库
      await db.collection('users').doc(currentUser._id).update({
        username: newNickname.trim(),
        updatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      });

      message.success('用户名修改成功，请重新登录');
      setIsNicknameModalOpen(false);
      // 延迟执行退出登录，让用户看到成功提示
      setTimeout(() => {
        handleLogout();
      }, 1000);
    } catch (error) {
      console.error('修改用户名失败:', error);
      message.error('修改用户名失败，请重试');
    } finally {
      setNicknameLoading(false);
    }
  };

  // 打开修改密码弹窗
  const showPasswordModal = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsPasswordModalOpen(true);
  };

  // 处理修改密码
  const handlePasswordChange = async () => {
    if (!currentPassword || !currentPassword.trim()) {
      message.warning('当前密码不能为空');
      return;
    }

    if (!newPassword || !newPassword.trim()) {
      message.warning('新密码不能为空');
      return;
    }

    if (newPassword.length < 6) {
      message.warning('新密码长度不能少于6位');
      return;
    }

    if (newPassword !== confirmPassword) {
      message.warning('两次输入的新密码不一致');
      return;
    }

    if (currentPassword === newPassword) {
      message.warning('新密码不能与当前密码相同');
      return;
    }

    setPasswordLoading(true);
    try {
      // 验证当前密码
      const CryptoJS = (await import('crypto-js')).default;
      const hashedCurrentPassword = CryptoJS.SHA256(currentPassword).toString();
      
      // 查询用户验证密码
      const userRes = await db.collection('users').doc(currentUser._id).get();
      if (!userRes.data || !userRes.data.length) {
        message.error('用户不存在');
        return;
      }

      const user = userRes.data[0];
      if (user.password !== hashedCurrentPassword) {
        message.error('当前密码错误');
        return;
      }

      // 更新密码
      const hashedNewPassword = CryptoJS.SHA256(newPassword).toString();
      await db.collection('users').doc(currentUser._id).update({
        password: hashedNewPassword,
        updatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      });

      message.success('密码修改成功，请重新登录');
      setIsPasswordModalOpen(false);
      // 延迟执行退出登录，让用户看到成功提示
      setTimeout(() => {
        handleLogout();
      }, 1000);
    } catch (error) {
      console.error('修改密码失败:', error);
      message.error('修改密码失败，请重试');
    } finally {
      setPasswordLoading(false);
    }
  };

  // antd Upload beforeUpload 拦截
  const beforeUpload = file => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件');
      return Upload.LIST_IGNORE;
    }
    if (file.size > 2 * 1024 * 1024) {
      message.error('图片大小不能超过2MB');
      return Upload.LIST_IGNORE;
    }
    return true;
  };

  // 自定义上传逻辑，调用云函数
  const customRequest = async ({ file, onSuccess, onError }) => {
    setUploading(true);
    try {
      // 读取文件为 base64
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const base64 = e.target.result.split(',')[1];
          // 调用云函数
          const res = await app.callFunction({
            name: 'userUploadAvatar',
            data: {
              fileContent: base64,
              fileType: file.name.split('.').pop(),
              fileName: file.name,
              userId: currentUser._id,
            },
          });
          console.log('云函数返回:', res);
          if (res.result && res.result.code === 0) {
            let fileUrl = res.result.url;
            let fileID = res.result.fileID;
            // 更新数据库
            await db.collection('users').doc(currentUser._id).update({
              avatar: fileUrl,
              avatarFileId: fileID,
              updatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
            });

            setAvatarUrl(fileUrl);

            // 更新本地存储，包含 avatarFileId
            const updatedUser = {
              ...currentUser,
              avatar: fileUrl,
              avatarFileId: fileID,
            };
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));

            // 直接更新 auth 实例，避免事件循环
            auth.currentUser = updatedUser;

            message.success('头像上传成功');
            onSuccess();
          } else {
            message.error(res.result?.msg || '上传失败');
            onError();
          }
        } catch (err) {
          message.error('上传失败');
          onError(err);
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploading(false);
      message.error('上传失败');
      onError(err);
    }
  };

  // 主题下拉菜单项
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

  // 用户下拉菜单项
  const userItems = [
    {
      key: 'nickname',
      label: (
        <div className="flex items-center gap-2 w-full">
          <EditOutlined />
          <span>修改用户名</span>
        </div>
      ),
      onClick: showNicknameModal,
    },
    {
      key: 'password',
      label: (
        <div className="flex items-center gap-2 w-full">
          <EditOutlined />
          <span>修改密码</span>
        </div>
      ),
      onClick: showPasswordModal,
    },
    {
      type: 'divider',
    },
    {
      key: 'upload',
      label: (
        <Upload
          showUploadList={false}
          beforeUpload={beforeUpload}
          customRequest={customRequest}
          accept="image/*"
          disabled={uploading}
        >
          <div className="flex items-center gap-2 w-full">
            <CameraOutlined />
            <span>
              {uploading ? '上传中...' : avatarUrl ? '更换头像' : '上传头像'}
            </span>
          </div>
        </Upload>
      ),
    },
    {
      type: 'divider',
    },
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

  // 获取当前主题显示图标
  const getThemeIcon = () => {
    if (themeMode === 'system') {
      return <DesktopOutlined className="text-base-content" />;
    } else if (themeMode === 'light') {
      return <SunOutlined className="text-yellow-500" />;
    } else {
      return <MoonOutlined className="text-blue-400" />;
    }
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
          {/* 主题切换下拉菜单 */}
          <Dropdown
            menu={{ items: themeItems }}
            placement="bottomRight"
            trigger={['click']}
          >
            <div className="flex items-center gap-1 cursor-pointer hover:bg-base-200 rounded-lg p-2 transition-colors">
              {getThemeIcon()}
            </div>
          </Dropdown>

          {/* 用户信息下拉菜单 */}
          <Dropdown
            menu={{ items: userItems }}
            placement="bottomRight"
            trigger={['click']}
          >
            <div className="flex items-center gap-2 cursor-pointer hover:bg-base-200 rounded-lg p-2 transition-colors">
              <Spin spinning={uploading}>
                <Avatar src={avatarUrl} icon={<UserOutlined />} size={32} />
              </Spin>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-base-content">
                  {currentUser?.username}
                </span>
              </div>
            </div>
          </Dropdown>
        </div>
      </div>

      {/* 修改用户名弹窗 */}
      <Modal
        title=""
        open={isNicknameModalOpen}
        onOk={handleNicknameChange}
        onCancel={() => setIsNicknameModalOpen(false)}
        confirmLoading={nicknameLoading}
        okText="确定"
        cancelText="取消"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">当前用户名</label>
            <Input
              value={currentUser?.username}
              disabled
              className="bg-base-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">新用户名</label>
            <Input
              placeholder="请输入新用户名"
              value={newNickname}
              onChange={(e) => setNewNickname(e.target.value)}
              onPressEnter={handleNicknameChange}
              maxLength={20}
              showCount
            />
          </div>
          <div className="text-sm text-gray-500">
            提示:修改用户名后需要重新登录
          </div>
        </div>
      </Modal>

      {/* 修改密码弹窗 */}
      <Modal
        title=""
        open={isPasswordModalOpen}
        onOk={handlePasswordChange}
        onCancel={() => setIsPasswordModalOpen(false)}
        confirmLoading={passwordLoading}
        okText="确定"
        cancelText="取消"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">当前密码</label>
            <Input.Password
              placeholder="请输入当前密码"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              maxLength={50}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">新密码</label>
            <Input.Password
              placeholder="请输入新密码(至少6位)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              maxLength={50}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">确认新密码</label>
            <Input.Password
              placeholder="请再次输入新密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onPressEnter={handlePasswordChange}
              maxLength={50}
            />
          </div>
          <div className="text-sm text-gray-500">
            提示：修改密码后需要重新登录
          </div>
        </div>
      </Modal>
    </motion.nav>
  );
}

export default Header;
