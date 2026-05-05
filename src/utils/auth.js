import { api, ApiError } from './api';

class Auth {
  constructor() {
    this.currentUser = null;
    this.ready = false;
  }

  async bootstrap() {
    try {
      const user = await api.get('/auth/me');
      this.currentUser = user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        this.currentUser = null;
      } else {
        console.error('bootstrap failed', err);
        this.currentUser = null;
      }
    }
    this.ready = true;
    this._notify();
  }

  isLoggedIn() {
    return !!this.currentUser;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  async register(username, password) {
    try {
      const user = await api.post('/auth/register', { username, password });
      this.currentUser = user;
      this._notify();
      return { success: true, user };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async login(username, password) {
    try {
      const user = await api.post('/auth/login', { username, password });
      this.currentUser = user;
      this._notify();
      return { success: true, user };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async logout() {
    try {
      await api.post('/auth/logout', {});
    } catch (err) {
      console.warn('logout request failed (still clearing local state)', err);
    }
    this.currentUser = null;
    this._notify();
  }

  _notify() {
    window.dispatchEvent(
      new CustomEvent('authStateChanged', {
        detail: { user: this.currentUser, isLoggedIn: !!this.currentUser },
      })
    );
  }
}

const authInstance = new Auth();
export default authInstance;
