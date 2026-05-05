import { useState, useEffect, useRef, useCallback } from 'react';
import { app } from '../utils/cloudbase';
import dayjs from 'dayjs';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import auth from '../utils/auth';
import { DatePicker, Input, App } from 'antd';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AddTodoModal from '../components/AddTodoModal';
import 'dayjs/locale/zh-cn';

const { RangePicker } = DatePicker;

const db = app.database();

function TodoList() {
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  // 添加待办事项弹窗相关状态
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [defaultDate, setDefaultDate] = useState(dayjs());

  // 新增状态：用于跟踪正在编辑的待办事项
  const [editingTodoId, setEditingTodoId] = useState(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  const editInputRef = useRef(null);

  // 日期筛选相关状态 - 支持从URL参数读取日期
  const initializeDateRange = () => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const selectedDay = dayjs(dateParam);
      if (selectedDay.isValid()) {
        return [selectedDay.startOf('day'), selectedDay.endOf('day')];
      }
    }
    return [dayjs().startOf('day'), dayjs().endOf('day')];
  };

  const [dateRange, setDateRange] = useState(initializeDateRange);

  // 监听URL参数变化，更新日期范围
  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const selectedDay = dayjs(dateParam);
      if (selectedDay.isValid()) {
        const newDateRange = [
          selectedDay.startOf('day'),
          selectedDay.endOf('day'),
        ];
        setDateRange(newDateRange);
      }
    }
  }, [searchParams]);

  // 获取待办事项列表
  const fetchTodos = useCallback(async () => {
    try {
      setLoading(true);
      const currentUser = auth.getCurrentUser();
      if (!currentUser) {
        console.error('用户未登录');
        return;
      }

      // 构建基本查询条件
      const queryConditions = {
        userId: currentUser._id,
      };

      // 如果日期范围有效，则添加日期查询条件
      if (dateRange && dateRange[0] && dateRange[1]) {
        const startDateTime = dateRange[0].format('YYYY-MM-DD 00:00:00');
        const endDateTime = dateRange[1].format('YYYY-MM-DD 23:59:59');

        queryConditions.createdAt = db.command.and([
          db.command.gte(startDateTime),
          db.command.lte(endDateTime),
        ]);
      }

      const res = await db
        .collection('todos')
        .where(queryConditions)
        .orderBy('createdAt', 'desc')
        .get();

      setTodos(res.data);
    } catch (error) {
      console.error('获取待办事项失败', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]); // 依赖日期变化

  // 打开添加待办事项弹窗
  const handleAddTodo = () => {
    // 如果路由有日期且日期不是历史日期则取路由的日期
    const dateParam = searchParams.get('date');
    setDefaultDate(
      dateParam && !dayjs(dateParam).isBefore(dayjs(), 'day')
        ? dayjs(dateParam)
        : dayjs()
    );
    setIsAddModalVisible(true);
  };

  // 添加成功回调
  const handleAddSuccess = async (selectedDate) => {
    // 重置路由日期为新增的日期
    setDateRange([selectedDate.startOf('day'), selectedDate.endOf('day')]);
    // 重新查询数据以保持日期筛选一致
    await fetchTodos();
  };

  // 全部完成功能
  const handleCompleteAll = async checked => {
    try {
      const currentUser = auth.getCurrentUser();
      if (!currentUser) {
        console.error('用户未登录');
        return;
      }

      // 根据选中状态确定要操作的任务
      const targetTodos = checked
        ? todos.filter(todo => !todo.completed) // 如果是完成，则操作未完成的任务
        : todos.filter(todo => todo.completed); // 如果是取消完成，则操作已完成的任务

      if (targetTodos.length === 0) {
        const statusText = checked ? '未完成' : '已完成';
        message.info(`当前没有${statusText}的任务`);
        return;
      }

      // 批量更新任务状态
      const updatePromises = targetTodos.map(todo =>
        db
          .collection('todos')
          .where({
            taskId: todo.taskId,
            userId: currentUser._id,
          })
          .update({
            completed: checked,
          })
      );

      await Promise.all(updatePromises);

      // 更新本地状态
      setTodos(prevTodos =>
        prevTodos.map(todo => {
          // 只更新目标任务的状态
          if (targetTodos.some(t => t.taskId === todo.taskId)) {
            return { ...todo, completed: checked };
          }
          return todo;
        })
      );

      const actionText = checked ? '完成' : '取消完成';
      message.success(`已${actionText} ${targetTodos.length} 项任务`);
    } catch (error) {
      console.error('批量更新任务状态失败', error);
      message.error('操作失败，请重试');
    }
  };

  // 检查是否所有任务都已完成
  const isAllCompleted =
    todos.length > 0 && todos.every(todo => todo.completed);
  const hasIncompleteTodos = todos.some(todo => !todo.completed);

  // 处理日期范围变化
  const handleDateRangeChange = dates => {
    if (dates && dates.length === 2) {
      setDateRange([dates[0], dates[1]]);
    } else {
      // 如果清空了日期选择,则查询的是全部
      setDateRange([null, null]);
    }
  };

  // 更新待办事项完成状态
  const toggleTodo = async (id, completed) => {
    try {
      const currentUser = auth.getCurrentUser();
      if (!currentUser) {
        console.error('用户未登录');
        return;
      }

      await db
        .collection('todos')
        .where({
          taskId: id,
          userId: currentUser._id, // 确保只能操作自己的数据
        })
        .update({
          completed: !completed,
        });
      // 更新状态
      setTodos(prevTodos =>
        prevTodos.map(todo =>
          todo.taskId === id ? { ...todo, completed: !completed } : todo
        )
      );
      // await fetchTodos();
    } catch (error) {
      console.error('更新待办事项状态失败', error);
    }
  };

  // 删除待办事项
  const deleteTodo = async id => {
    try {
      const currentUser = auth.getCurrentUser();
      if (!currentUser) {
        console.error('用户未登录');
        return;
      }

      await db
        .collection('todos')
        .where({
          taskId: id,
          userId: currentUser._id, // 确保只能删除自己的数据
        })
        .remove();
      // await fetchTodos();
      // 更新状态
      setTodos(prevTodos => prevTodos.filter(todo => todo.taskId !== id));
    } catch (error) {
      console.error('删除待办事项失败', error);
    }
  };

  // --- 进入编辑模式 ---
  const handleDoubleClick = todo => {
    setEditingTodoId(todo.taskId);
    setEditingTodoText(todo.content);
  };

  // --- 处理内容更新 ---
  const handleUpdateTodoContent = async id => {
    if (!editingTodoText.trim()) {
      // 如果内容为空，则直接删除该待办事项
      await deleteTodo(id);
      setEditingTodoId(null);
      return;
    }
    try {
      const currentUser = auth.getCurrentUser();
      if (!currentUser) {
        console.error('用户未登录');
        return;
      }

      await db
        .collection('todos')
        .where({
          taskId: id,
          userId: currentUser._id, // 确保只能修改自己的数据
        })
        .update({
          content: editingTodoText,
        });
      setEditingTodoId(null); // 退出编辑模式
      // await fetchTodos();
      // 更新状态
      setTodos(prevTodos =>
        prevTodos.map(todo =>
          todo.taskId === id ? { ...todo, content: editingTodoText } : todo
        )
      );
    } catch (error) {
      console.error('更新待办内容失败', error);
    }
  };

  // --- 新增功能：处理键盘事件（回车确认） ---
  const handleKeyDown = (e, id) => {
    if (e.key === 'Enter') {
      handleUpdateTodoContent(id);
    } else if (e.key === 'Escape') {
      setEditingTodoId(null); // 按下Esc退出编辑
    }
  };

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  // 当进入编辑模式时，自动聚焦到输入框
  useEffect(() => {
    if (editingTodoId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingTodoId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-base-200">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="mt-4 text-lg">加载待办事项中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-base-200 py-10">
      <div className="container mx-auto p-4 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.1 }}
          className="mb-8 from-primary to-secondary flex justify-between items-center"
        >
          <button
            onClick={() => navigate('/calendar')}
            className="btn btn-ghost btn-square"
            aria-label="返回日历"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>

          <div className="text-transparent bg-gradient-to-r bg-clip-text text-3xl font-bold text-center">
            待办列表
          </div>
          <span></span>
        </motion.div>

        {/* 日期范围筛选组件 */}
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0, duration: 0.1 }}
          className="card bg-base-100 shadow-md mb-6"
        >
          <div className="card-body p-4">
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="flex flex-col sm:flex-row gap-2 items-center flex-1">
                <label className="label">
                  <span className="label-text font-medium">日期:</span>
                </label>
                <div className="flex gap-2 items-center">
                  {searchParams.get('date') ? (
                    <span>{dateRange[0].format('YYYY-MM-DD')}</span>
                  ) : (
                    <RangePicker
                      value={dateRange}
                      onChange={handleDateRangeChange}
                      format="YYYY-MM-DD"
                      placeholder={['开始时间', '结束时间']}
                      className="w-60"
                      allowClear
                    />
                  )}
                </div>
              </div>
              <div className="text-sm text-base-content/60">
                共找到{' '}
                <span className="font-bold text-primary">{todos.length}</span>{' '}
                项任务
              </div>
            </div>
          </div>
        </motion.div>

        {/* 操作按钮区域 */}
        <motion.div
          className="flex justify-between items-center mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0, duration: 0.1 }}
        >
          {/* 全部完成多选框 */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="completeAll"
              checked={isAllCompleted}
              onChange={e => handleCompleteAll(e.target.checked)}
              disabled={todos.length === 0}
              className="checkbox checkbox-primary mr-2"
            />
            <label
              htmlFor="completeAll"
              className={`text-sm font-medium cursor-pointer ${
                todos.length === 0
                  ? 'text-base-content/50'
                  : 'text-base-content'
              }`}
            >
              全部完成{' '}
              {hasIncompleteTodos &&
                `(${todos.filter(todo => !todo.completed).length}项未完成)`}
            </label>
          </div>

          {/* 添加按钮 */}
          <button onClick={handleAddTodo} className="btn btn-primary shadow-md">
            <PlusIcon className="h-6 w-6" />
            <span className="ml-2">新增待办</span>
          </button>
        </motion.div>

        {/* 添加待办事项弹窗 */}
        <AddTodoModal
          visible={isAddModalVisible}
          onClose={() => setIsAddModalVisible(false)}
          onSuccess={handleAddSuccess}
          defaultDate={defaultDate}
        />

        <div className="space-y-4">
          <AnimatePresence>
            {todos.map(todo => (
              <motion.div
                key={todo.taskId}
                layout
                initial={{ opacity: 0, y: 2, scale: 1 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: -100, transition: { duration: 0.1 } }}
                whileHover={{ scale: 1, transition: { duration: 0.1 } }}
                className="card bg-base-100 shadow-lg"
              >
                <div className="card-body p-4 flex-row items-center">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => toggleTodo(todo.taskId, todo.completed)}
                    className="checkbox checkbox-primary mr-4"
                  />
                  <div className="flex-grow">
                    {editingTodoId === todo.taskId ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingTodoText}
                        onChange={e => setEditingTodoText(e.target.value)}
                        onBlur={() => handleUpdateTodoContent(todo.taskId)}
                        onKeyDown={e => handleKeyDown(e, todo.taskId)}
                        className="input input-bordered input-sm w-full"
                      />
                    ) : (
                      <span
                        className={`cursor-pointer text-lg ${
                          todo.completed
                            ? 'line-through text-base-content/50'
                            : ''
                        }`}
                      >
                        {todo.content}
                      </span>
                    )}
                  </div>
                  <div className="card-actions justify-end ml-4">
                    <button
                      onClick={() => handleDoubleClick(todo)}
                      className="btn btn-ghost btn-sm btn-square"
                      disabled={editingTodoId === todo.taskId || todo.completed}
                      aria-label="修改"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => deleteTodo(todo.taskId)}
                      className="btn btn-ghost btn-sm btn-square"
                      disabled={editingTodoId === todo.taskId || todo.completed}
                      aria-label="删除"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {todos.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-center p-8 bg-base-100 rounded-lg shadow-md mt-8"
          >
            <p className="text-xl">🎉 恭喜！所有任务都已完成！</p>
            <p className="text-base-content/70">快来添加一个新的待办事项吧。</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default TodoList;
