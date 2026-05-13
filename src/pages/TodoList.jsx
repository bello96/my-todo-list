import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../utils/api';
import dayjs from 'dayjs';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  ArrowLeftIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { DayPicker } from 'react-day-picker';
import { zhCN } from 'react-day-picker/locale';
import 'react-day-picker/dist/style.css';
import toast from 'react-hot-toast';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AddTodoModal from '../components/AddTodoModal';
import 'dayjs/locale/zh-cn';

function TodoList() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [defaultDate, setDefaultDate] = useState(dayjs());

  const [editingTodoId, setEditingTodoId] = useState(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  const editInputRef = useRef(null);

  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const rangePickerWrapRef = useRef(null);

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

  useEffect(() => {
    if (!rangePickerOpen) {
      return;
    }
    const onDocClick = (e) => {
      if (
        rangePickerWrapRef.current &&
        !rangePickerWrapRef.current.contains(e.target)
      ) {
        setRangePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [rangePickerOpen]);

  const fetchTodos = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.set('from', dateRange[0].format('YYYY-MM-DD'));
        params.set('to', dateRange[1].format('YYYY-MM-DD'));
      }
      const qs = params.toString();
      const data = await api.get(`/todos${qs ? `?${qs}` : ''}`);
      setTodos(data || []);
    } catch (error) {
      console.error('获取待办事项失败', error);
      toast.error(error?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  const handleAddTodo = () => {
    const dateParam = searchParams.get('date');
    setDefaultDate(
      dateParam && !dayjs(dateParam).isBefore(dayjs(), 'day')
        ? dayjs(dateParam)
        : dayjs()
    );
    setIsAddModalVisible(true);
  };

  const handleAddSuccess = async (selectedDate) => {
    setDateRange([selectedDate.startOf('day'), selectedDate.endOf('day')]);
    await fetchTodos();
  };

  const handleCompleteAll = async (checked) => {
    try {
      const targetTodos = checked
        ? todos.filter((t) => !t.completed)
        : todos.filter((t) => t.completed);

      if (targetTodos.length === 0) {
        toast(`当前没有${checked ? '未完成' : '已完成'}的任务`, { icon: 'ℹ️' });
        return;
      }

      const ids = targetTodos.map((t) => t.taskId);
      await api.post('/todos/bulk-complete', { ids, completed: checked });

      setTodos((prev) =>
        prev.map((t) =>
          ids.includes(t.taskId) ? { ...t, completed: checked } : t
        )
      );

      toast.success(
        `已${checked ? '完成' : '取消完成'} ${targetTodos.length} 项任务`
      );
    } catch (error) {
      console.error('批量更新任务状态失败', error);
      toast.error(error?.message || '操作失败，请重试');
    }
  };

  const isAllCompleted =
    todos.length > 0 && todos.every((todo) => todo.completed);
  const hasIncompleteTodos = todos.some((todo) => !todo.completed);

  const handleRangeSelect = (range) => {
    if (range?.from && range?.to) {
      setDateRange([dayjs(range.from), dayjs(range.to).endOf('day')]);
      setRangePickerOpen(false);
    } else if (range?.from) {
      setDateRange([dayjs(range.from), null]);
    } else {
      setDateRange([null, null]);
    }
  };

  const clearDateRange = (e) => {
    e.stopPropagation();
    setDateRange([null, null]);
  };

  const toggleTodo = async (id, completed) => {
    try {
      await api.patch(`/todos/${id}`, { completed: !completed });
      setTodos((prev) =>
        prev.map((t) =>
          t.taskId === id ? { ...t, completed: !completed } : t
        )
      );
    } catch (error) {
      console.error('更新待办事项状态失败', error);
      toast.error(error?.message || '操作失败');
    }
  };

  const deleteTodo = async (id) => {
    try {
      await api.del(`/todos/${id}`);
      setTodos((prev) => prev.filter((t) => t.taskId !== id));
    } catch (error) {
      console.error('删除待办事项失败', error);
      toast.error(error?.message || '删除失败');
    }
  };

  const handleDoubleClick = (todo) => {
    setEditingTodoId(todo.taskId);
    setEditingTodoText(todo.content);
  };

  const handleUpdateTodoContent = async (id) => {
    if (!editingTodoText.trim()) {
      await deleteTodo(id);
      setEditingTodoId(null);
      return;
    }
    try {
      await api.patch(`/todos/${id}`, { content: editingTodoText.trim() });
      setEditingTodoId(null);
      setTodos((prev) =>
        prev.map((t) =>
          t.taskId === id ? { ...t, content: editingTodoText.trim() } : t
        )
      );
    } catch (error) {
      console.error('更新待办内容失败', error);
      toast.error(error?.message || '更新失败');
    }
  };

  const handleKeyDown = (e, id) => {
    if (e.key === 'Enter') {
      handleUpdateTodoContent(id);
    } else if (e.key === 'Escape') {
      setEditingTodoId(null);
    }
  };

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

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

  const rangeLabel =
    dateRange[0] && dateRange[1]
      ? `${dateRange[0].format('YYYY-MM-DD')} ~ ${dateRange[1].format('YYYY-MM-DD')}`
      : dateRange[0]
        ? `${dateRange[0].format('YYYY-MM-DD')} ~ ...`
        : '选择日期范围';

  const hasRange = dateRange[0] || dateRange[1];

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
                    <div className="relative" ref={rangePickerWrapRef}>
                      <button
                        type="button"
                        onClick={() => setRangePickerOpen((v) => !v)}
                        className="input input-bordered w-64 text-left pr-10"
                      >
                        {rangeLabel}
                      </button>
                      {hasRange && (
                        <button
                          type="button"
                          onClick={clearDateRange}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-base-300 rounded"
                          aria-label="清空"
                        >
                          <XMarkIcon className="h-4 w-4 text-base-content/60" />
                        </button>
                      )}
                      {rangePickerOpen && (
                        <div className="absolute z-20 mt-1 bg-base-100 border border-base-300 rounded-lg shadow-lg p-2">
                          <DayPicker
                            mode="range"
                            locale={zhCN}
                            selected={{
                              from: dateRange[0]?.toDate(),
                              to: dateRange[1]?.toDate(),
                            }}
                            onSelect={handleRangeSelect}
                            showOutsideDays
                          />
                        </div>
                      )}
                    </div>
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

        <motion.div
          className="flex justify-between items-center mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0, duration: 0.1 }}
        >
          <div className="flex items-center">
            <input
              type="checkbox"
              id="completeAll"
              checked={isAllCompleted}
              onChange={(e) => handleCompleteAll(e.target.checked)}
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
                `(${todos.filter((todo) => !todo.completed).length}项未完成)`}
            </label>
          </div>

          <button onClick={handleAddTodo} className="btn btn-primary shadow-md">
            <PlusIcon className="h-6 w-6" />
            <span className="ml-2">新增待办</span>
          </button>
        </motion.div>

        <AddTodoModal
          visible={isAddModalVisible}
          onClose={() => setIsAddModalVisible(false)}
          onSuccess={handleAddSuccess}
          defaultDate={defaultDate}
        />

        <div className="space-y-4">
          <AnimatePresence>
            {todos.map((todo) => (
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
                        onChange={(e) => setEditingTodoText(e.target.value)}
                        onBlur={() => handleUpdateTodoContent(todo.taskId)}
                        onKeyDown={(e) => handleKeyDown(e, todo.taskId)}
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
