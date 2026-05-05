const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const dayjs = require("dayjs");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

// 密码加密函数
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

exports.main = async (event, context) => {
  const { action, username, password } = event;

  try {
    if (action === "register") {
      // 检查用户名是否已存在
      const existingUser = await db
        .collection("users")
        .where({ username })
        .get();

      if (existingUser.data.length > 0) {
        return {
          success: false,
          error: "用户名已存在",
        };
      }

      // 创建新用户
      const hashedPassword = hashPassword(password);
      const result = await db.collection("users").add({
        data: {
          username,
          password: hashedPassword,
          createdAt: dayjs().format("YYYY-MM-DD HH:mm:ss"),
          lastLoginAt: null,
        },
      });

      return {
        success: true,
        userId: result._id,
      };
    } else if (action === "login") {
      // 用户登录验证
      const hashedPassword = hashPassword(password);
      const result = await db
        .collection("users")
        .where({
          username,
          password: hashedPassword,
        })
        .get();

      if (result.data.length === 0) {
        return {
          success: false,
          error: "用户名或密码错误",
        };
      }

      const user = result.data[0];

      // 更新最后登录时间
      await db
        .collection("users")
        .doc(user._id)
        .update({
          data: {
            lastLoginAt: dayjs().format("YYYY-MM-DD HH:mm:ss"),
          },
        });

      return {
        success: true,
        user: {
          _id: user._id,
          username: user.username,
          createdAt: user.createdAt,
        },
      };
    }

    return {
      success: false,
      error: "无效的操作",
    };
  } catch (error) {
    console.error("云函数执行失败:", error);
    return {
      success: false,
      error: "服务器错误，请稍后重试",
    };
  }
};
