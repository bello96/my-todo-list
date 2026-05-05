export function serializeTodo(row) {
  return {
    taskId:    row.id,
    content:   row.content,
    completed: row.completed === 1,
    userId:    row.user_id,
    createdAt: `${row.task_date} 00:00:00`,
  };
}

export function serializeUser(row) {
  return {
    id:           row.id,
    username:     row.username,
    createdAt:    row.created_at,
    lastLoginAt:  row.last_login_at,
  };
}
