import { motion } from 'framer-motion';
import {
  ArrowRightEndOnRectangleIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

function closeDropdown(e) {
  e.target.closest('details')?.removeAttribute('open');
}

function Header({ currentUser, onLogout }) {
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
        <details className="dropdown dropdown-end">
          <summary className="list-none cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-base-200 transition-colors">
            <div className="avatar avatar-placeholder">
              <div className="bg-primary text-primary-content w-8 rounded-full">
                <UserIcon className="h-4 w-4" />
              </div>
            </div>
            <span className="text-sm font-medium text-base-content">
              {currentUser?.username}
            </span>
          </summary>
          <ul className="menu dropdown-content bg-base-100 rounded-box z-10 mt-2 w-44 p-2 shadow-lg">
            <li>
              <button
                type="button"
                onClick={(e) => {
                  closeDropdown(e);
                  onLogout();
                }}
                className="flex items-center gap-2 text-red-500"
              >
                <ArrowRightEndOnRectangleIcon className="h-4 w-4" />
                <span>退出登录</span>
              </button>
            </li>
          </ul>
        </details>
      </div>
    </motion.nav>
  );
}

export default Header;
