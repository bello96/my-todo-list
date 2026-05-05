import { app } from './cloudbase';
import CryptoJS from 'crypto-js';
import dayjs from 'dayjs';

const db = app.database();
const auth = app.auth();

// 密码加密函数
const hashPassword = password => {
  return CryptoJS.SHA256(password).toString();
};

// 确保有基础认证状态（用于数据库访问）
const ensureBasicAuth = async () => {
  try {
    const loginState = await auth.getLoginState();
    if (!loginState) {
      // 临时使用匿名登录来获取数据库访问权限
      await auth.signInAnonymously();
    }
  } catch (error) {
    console.error('无法获取数据库访问权限:', error);
    throw new Error('系统初始化失败，请稍后重试');
  }
};

// 用户认证类
class Auth {
  constructor() {
    this.currentUser = null;
    this.loadUserFromStorage();
    
    // 监听 localStorage 变化，确保多标签页同步
    window.addEventListener('storage', (e) => {
      if (e.key === 'currentUser') {
        if (e.newValue) {
          try {
            this.currentUser = JSON.parse(e.newValue);
          } catch (error) {
            console.error('解析用户信息失败:', error);
            this.currentUser = null;
          }
        } else {
          this.currentUser = null;
        }
      }
    });
    
    // 移除 userInfoUpdated 事件监听，避免循环
  }

  loadUserFromStorage() {
    try {
      const userStr = localStorage.getItem('currentUser');
      if (userStr) {
        this.currentUser = JSON.parse(userStr);
      }
    } catch (error) {
      console.error('加载用户信息失败:', error);
      localStorage.removeItem('currentUser');
    }
  }

  saveUserToStorage(user) {
    try {
      // console.log('保存用户信息到本地存储:', user);
      localStorage.setItem('currentUser', JSON.stringify(user));
      this.currentUser = user;

      // 触发自定义事件通知状态变化
      window.dispatchEvent(
        new CustomEvent('authStateChanged', {
          detail: { user, isLoggedIn: true },
        })
      );
    } catch (error) {
      console.error('保存用户信息失败:', error);
    }
  }

  // 新方法：仅更新存储，不触发事件
  updateUserInStorage(user) {
    try {
      console.log('静默更新用户信息到本地存储:', user);
      localStorage.setItem('currentUser', JSON.stringify(user));
      this.currentUser = user;
    } catch (error) {
      console.error('更新用户信息失败:', error);
    }
  }

  isLoggedIn() {
    return !!this.currentUser;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  // 用户注册
  async register(username, password) {
    try {
      // 确保有数据库访问权限
      await ensureBasicAuth();

      // 检查用户名是否已存在
      const existingUser = await db
        .collection('users')
        .where({ username })
        .get();

      if (existingUser.data.length > 0) {
        throw new Error('用户名已存在');
      }

      // 创建新用户
      const hashedPassword = hashPassword(password);
      const newUser = {
        username,
        password: hashedPassword,
        createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        lastLoginAt: null,
      };

      const result = await db.collection('users').add(newUser);

      // 注册成功后自动登录
      const userInfo = {
        _id: result.id,
        username,
        createdAt: newUser.createdAt,
      };

      this.saveUserToStorage(userInfo);

      return { success: true, user: userInfo };
    } catch (error) {
      console.error('注册失败:', error);
      return { success: false, error: error.message };
    }
  }

  // 用户登录接口
  async login(username, password) {
    try {
      // 确保有数据库访问权限
      await ensureBasicAuth();

      const hashedPassword = hashPassword(password);

      // 查找用户
      const result = await db
        .collection('users')
        .where({
          username,
          password: hashedPassword,
        })
        .get();

      if (result.data.length === 0) {
        throw new Error('用户名或密码错误');
      }

      const user = result.data[0];

      // 更新最后登录时间
      await db
        .collection('users')
        .doc(user._id)
        .update({
          lastLoginAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        });

      // 保存用户信息（不包含密码）
      const userInfo = {
        _id: user._id,
        username: user.username,
        avatar: user.avatar || null, // 添加头像字段
        avatarFileId: user.avatarFileId || null, // 添加头像文件ID
        createdAt: user.createdAt,
        lastLoginAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      };

      console.log('登录成功，用户信息:', userInfo);

      this.saveUserToStorage(userInfo);

      return { success: true, user: userInfo };
    } catch (error) {
      console.error('登录失败:', error);
      return { success: false, error: error.message };
    }
  }

  logout() {
    localStorage.removeItem('currentUser');
    this.currentUser = null;

    // 触发自定义事件通知状态变化
    window.dispatchEvent(
      new CustomEvent('authStateChanged', {
        detail: { user: null, isLoggedIn: false },
      })
    );
  }
}

const authInstance = new Auth();
export default authInstance;
