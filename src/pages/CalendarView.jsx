import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { api } from '../utils/api';
import AddTodoModal from '../components/AddTodoModal';

dayjs.locale('zh-cn');

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function CalendarView() {
  const navigate = useNavigate();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(dayjs());

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [selectedDateForAdd, setSelectedDateForAdd] = useState(dayjs());

  const fetchMonthTodos = useCallback(async (date) => {
    try {
      setLoading(true);
      const from = date.startOf('month').format('YYYY-MM-DD');
      const to = date.endOf('month').format('YYYY-MM-DD');
      const data = await api.get(`/todos?from=${from}&to=${to}`);
      setTodos(data || []);
    } catch (error) {
      console.error('获取月度待办事项失败', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonthTodos(currentMonth);
  }, [currentMonth, fetchMonthTodos]);

  const getTodosForDate = (date) => {
    const dateStr = date.format('YYYY-MM-DD');
    return todos.filter((todo) => {
      const todoDate = dayjs(todo.createdAt).format('YYYY-MM-DD');
      return todoDate === dateStr;
    });
  };

  const handleOpenAddModal = (date) => {
    setSelectedDateForAdd(date);
    setIsAddModalVisible(true);
  };

  const handleAddSuccess = async () => {
    await fetchMonthTodos(currentMonth);
  };

  const handleDateSelect = (date) => {
    if (
      date.month() !== currentMonth.month() ||
      date.year() !== currentMonth.year()
    ) {
      return;
    }
    const dateStr = date.format('YYYY-MM-DD');
    navigate(`/todos?date=${dateStr}`);
  };

  // 构建 42 天网格（6 周 × 7 列），周一为第一列
  const firstDayOfMonth = currentMonth.startOf('month');
  const firstWeekday = firstDayOfMonth.day(); // 0 = 周日, 1 = 周一
  const offset = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const gridStart = firstDayOfMonth.subtract(offset, 'day');
  const days = [];
  for (let i = 0; i < 42; i++) {
    days.push(gridStart.add(i, 'day'));
  }

  // 月度统计
  const todayStr = dayjs().format('YYYY-MM-DD');
  const completedCount = todos.filter((t) => t.completed).length;
  const incompleteTodos = todos.filter((t) => !t.completed);
  const overdueCount = incompleteTodos.filter((t) => {
    const todoDate = dayjs(t.createdAt).format('YYYY-MM-DD');
    return todoDate < todayStr;
  }).length;
  const pendingCount = incompleteTodos.length - overdueCount;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-base-200 py-6">
      <div className="container mx-auto p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <div className="card bg-base-100 shadow-lg">
            <div className="card-body p-6">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.2 }}
                  className="grid grid-cols-3 gap-2"
                >
                  <div className="flex items-center space-x-2 p-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-[2px]"></div>
                    <span className="text-sm">
                      待办{pendingCount > 0 && ` (${pendingCount})`}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 p-2">
                    <div className="w-2 h-2 bg-green-500 rounded-[2px]"></div>
                    <span className="text-sm">
                      已完成{completedCount > 0 && ` (${completedCount})`}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 p-2">
                    <div className="w-2 h-2 bg-red-500 rounded-[2px]"></div>
                    <span className="text-sm">
                      超期未完成{overdueCount > 0 && ` (${overdueCount})`}
                    </span>
                  </div>
                </motion.div>

                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-sm btn-square btn-ghost"
                    onClick={() =>
                      setCurrentMonth((m) => m.subtract(1, 'month'))
                    }
                    aria-label="上个月"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  <span className="text-base font-medium min-w-[7rem] text-center">
                    {currentMonth.format('YYYY年MM月')}
                  </span>
                  <button
                    className="btn btn-sm btn-square btn-ghost"
                    onClick={() => setCurrentMonth((m) => m.add(1, 'month'))}
                    aria-label="下个月"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline ml-2"
                    onClick={() => setCurrentMonth(dayjs())}
                  >
                    今天
                  </button>
                </div>
              </div>

              {loading && (
                <div className="text-center py-2">
                  <span className="loading loading-spinner loading-sm"></span>
                </div>
              )}

              <div className="grid grid-cols-7 border-b border-base-300 mb-1">
                {WEEK_LABELS.map((label) => (
                  <div
                    key={label}
                    className="text-center text-sm font-medium py-2 text-base-content/70"
                  >
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-px bg-base-300 rounded overflow-hidden">
                {days.map((day) => {
                  const isCurrentMonth = day.month() === currentMonth.month();
                  const dayStr = day.format('YYYY-MM-DD');
                  const isToday = dayStr === todayStr;
                  const dayTodos = getTodosForDate(day);
                  const incompleteDayTodos = dayTodos.filter(
                    (t) => !t.completed
                  );
                  const isOverdue =
                    dayStr < todayStr && incompleteDayTodos.length > 0;
                  const canAdd =
                    isCurrentMonth && day.isAfter(dayjs().startOf('day'));

                  return (
                    <div
                      key={dayStr}
                      className={`relative bg-base-100 min-h-[100px] p-1 ${
                        isCurrentMonth
                          ? 'cursor-pointer hover:bg-base-200'
                          : 'opacity-40'
                      } ${isToday ? 'ring-2 ring-primary ring-inset' : ''}`}
                      onClick={() => handleDateSelect(day)}
                    >
                      <div
                        className={`text-xs ${
                          isToday
                            ? 'text-primary font-bold'
                            : 'text-base-content/70'
                        }`}
                      >
                        {day.date()}
                      </div>

                      <div className="space-y-0.5 mt-1">
                        {dayTodos.slice(0, 3).map((todo) => (
                          <div
                            key={todo.taskId}
                            className={`text-xs px-1 py-0.5 rounded truncate ${
                              todo.completed
                                ? 'bg-green-100 text-green-800'
                                : isOverdue
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-blue-100 text-blue-800'
                            }`}
                            title={todo.content}
                          >
                            {todo.content}
                          </div>
                        ))}
                        {dayTodos.length > 3 && (
                          <div className="text-xs text-gray-500 text-right">
                            +{dayTodos.length - 3} 更多...
                          </div>
                        )}
                      </div>

                      {canAdd && dayTodos.length === 0 && (
                        <div
                          className="absolute inset-0 flex items-center justify-center group"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenAddModal(day);
                          }}
                          title="添加待办"
                        >
                          <PlusIcon className="h-5 w-5 text-base-content/30 group-hover:text-base-content/60 transition-colors" />
                        </div>
                      )}

                      {canAdd && dayTodos.length > 0 && (
                        <button
                          type="button"
                          className="absolute bottom-1 left-1 p-1 hover:bg-base-300 rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenAddModal(day);
                          }}
                          title="添加待办"
                          aria-label="添加待办"
                        >
                          <PlusIcon className="h-3 w-3 text-base-content/40 hover:text-base-content/60" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>

        <AddTodoModal
          visible={isAddModalVisible}
          onClose={() => setIsAddModalVisible(false)}
          onSuccess={handleAddSuccess}
          defaultDate={selectedDateForAdd}
        />
      </div>
    </div>
  );
}

export default CalendarView;
