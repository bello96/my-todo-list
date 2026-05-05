// 云函数入口文件
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const { fileContent, fileType, fileName, userId } = event;

  console.log('收到上传请求:', {
    fileType,
    fileName,
    userId,
    contentLength: fileContent ? fileContent.length : 0,
  });

  if (!fileContent || !fileType || !fileName || !userId) {
    console.error('参数不完整:', {
      fileContent: !!fileContent,
      fileType,
      fileName,
      userId,
    });
    return { code: 400, msg: '参数不完整' };
  }

  try {
    // 查询旧头像信息（用于后续删除）
    let oldAvatarFileId = null;
    try {
      const userRes = await db.collection('users').doc(userId).get();
      oldAvatarFileId =
        userRes.data && userRes.data.avatarFileId
          ? userRes.data.avatarFileId
          : null;
      console.log('用户旧头像FileID:', oldAvatarFileId);
    } catch (queryError) {
      console.warn('查询用户信息失败:', queryError.message);
    }

    // 上传新头像到云存储
    const cloudPath = `avatars/${userId}_${Date.now()}.${fileType}`;
    console.log('准备上传到路径:', cloudPath);

    const uploadResult = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: Buffer.from(fileContent, 'base64'),
    });

    console.log('上传成功:', uploadResult);

    // 获取临时访问链接
    let fileUrl = uploadResult.fileID;
    try {
      const tempFileRes = await cloud.getTempFileURL({
        fileList: [uploadResult.fileID],
      });

      if (
        tempFileRes.fileList &&
        tempFileRes.fileList[0] &&
        tempFileRes.fileList[0].tempFileURL
      ) {
        fileUrl = tempFileRes.fileList[0].tempFileURL;
        console.log('获取临时链接成功:', fileUrl);
      }
    } catch (tempError) {
      console.warn('获取临时链接失败:', tempError.message);
    }

    // 异步删除旧头像（不阻塞主流程）
    if (oldAvatarFileId && oldAvatarFileId !== uploadResult.fileID) {
      setTimeout(async () => {
        try {
          await cloud.deleteFile({
            fileList: [oldAvatarFileId],
          });
          console.log('旧头像删除成功:', oldAvatarFileId);
        } catch (deleteError) {
          console.warn('删除旧头像失败:', deleteError.message);
        }
      }, 2000);
    }

    return {
      code: 0,
      fileID: uploadResult.fileID,
      url: fileUrl,
      cloudPath: uploadResult.cloudPath,
    };
  } catch (error) {
    console.error('云函数执行错误:', error);
    return {
      code: 500,
      msg: error.message || '上传失败',
    };
  }
};
