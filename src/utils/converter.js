import { v4 as uuidv4 } from 'uuid';

const USER_ROLE = "user";
const ASSISTANT_ROLE = "assistant";
const SYSTEM_ROLE = "system";

export function isValidConversation(messages) {
  let lastRole = null;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    // 检查连续相同角色
    if (msg.role === lastRole && (lastRole === USER_ROLE || lastRole === ASSISTANT_ROLE)) {
      return false;
    }
    
    // 检查中间消息是否有错误（除了最后一条消息）
    if (i < messages.length - 1 && hasError(msg)) {
      return false;
    }
    
    // 检查是否有空内容消息（除了最后一条）
    if (i < messages.length - 1 && isEmptyContent(msg)) {
      return false;
    }
    
    lastRole = msg.role;
  }
  return true;
}

function getContent(msg) {
  if (msg.content && msg.content.length > 0) {
    return msg.content;
  }
  // If contentParts is present, filter for text parts and join them
  if (msg.contentParts && msg.contentParts.length > 0) {
    return msg.contentParts.filter(part => part.type == 'text').map(part => part.text).join("");
  }
  return "";
}

function hasImages(msg) {
  if (msg.contentParts && msg.contentParts.length > 0) {
    return msg.contentParts.some(part => part.type === 'image');
  }
  return false;
}

function getReasoningContent(msg) {
  // 检查新格式的 reasoningContent
  if (msg.contentParts && msg.contentParts.length > 0) {
    const reasoningPart = msg.contentParts.find(part => part.type === 'reasoning');
    if (reasoningPart && reasoningPart.text) {
      return reasoningPart.text;
    }
  }
  return null;
}

function hasError(msg) {
  // 检查消息是否包含错误
  return !!(msg.error || msg.errorCode || msg.errorExtra);
}

function isEmptyContent(msg) {
  // 检查消息内容是否为空
  const content = getContent(msg);
  return !content || content.trim().length === 0;
}

// 转换单个消息
function convertSingleMessage(msg, model, parentId) {
  if (msg.role !== USER_ROLE && msg.role !== ASSISTANT_ROLE) {
    return null;
  }
  
  let content = getContent(msg);
  
  // 处理空内容消息
  if (isEmptyContent(msg)) {
    if (hasError(msg)) {
      // 如果有错误信息，显示错误内容
      content = `[消息生成失败: ${msg.error || msg.errorExtra?.responseBody || '未知错误'}]`;
    } else {
      // 纯空内容消息，跳过
      return null;
    }
  }
  
  // 处理图片
  if (hasImages(msg)) {
    content += "\n[该消息原本包含图片，但未被保存]";
  }

  // 处理推理内容
  const reasoningContent = getReasoningContent(msg);
  if (reasoningContent) {
    content = `<details type=\"reasoning\" done=\"true\" duration=\"0\">\n<summary>Thought for 0 seconds</summary>\n> ${reasoningContent.replaceAll("\n", "\n> ")}\n> \n> \n</details>${content}`;
  }

  return {
    id: uuidv4(),
    parentId: parentId,
    childrenIds: [],
    role: msg.role,
    content: content,
    timestamp: msg.timestamp ? Math.floor(msg.timestamp / 1000) : Math.floor(Date.now() / 1000),
    models: msg.role === USER_ROLE ? [model] : [],
    model: msg.role === ASSISTANT_ROLE ? model : null,
    modelName: msg.role === ASSISTANT_ROLE ? model : null,
    modelIdx: msg.role === ASSISTANT_ROLE ? 0 : null,
    done: msg.role === ASSISTANT_ROLE ? true : null,
    userContext: null
  };
}

// 构建消息树结构，处理所有分支
function buildMessageTree(conversation) {
  const mainMessages = conversation.messages || [];
  const forks = conversation.messageForksHash || {};
  const messageMap = new Map();
  
  // 添加主线消息
  mainMessages.forEach(msg => {
    messageMap.set(msg.id, {
      ...msg,
      source: 'main',
      alternatives: []
    });
  });
  
  // 处理分支消息
  Object.entries(forks).forEach(([parentId, forkData]) => {
    if (forkData.lists) {
      forkData.lists.forEach((forkList, index) => {
        if (forkList.messages && forkList.messages.length > 0) {
          // 每个分支列表作为一个完整的替代路径
          const branchMessages = forkList.messages.map(msg => ({
            ...msg,
            source: 'fork',
            forkParentId: parentId
          }));
          
          // 将分支消息添加到消息映射中
          branchMessages.forEach(msg => {
            messageMap.set(msg.id, msg);
          });
          
          // 如果父消息存在，将这个分支作为替代选项
          if (messageMap.has(parentId)) {
            const parentMsg = messageMap.get(parentId);
            parentMsg.alternatives.push(branchMessages);
          }
        }
      });
    }
  });
  
  return { messageMap, mainMessages };
}

// 智能选择最佳消息路径，避免角色冲突
function selectOptimalPath(conversation) {
  const { messageMap, mainMessages } = buildMessageTree(conversation);
  const result = [];
  
  for (let i = 0; i < mainMessages.length; i++) {
    const currentMsg = mainMessages[i];
    
    // System消息直接添加
    if (currentMsg.role === SYSTEM_ROLE) {
      result.push(currentMsg);
      continue;
    }
    
    const lastMsg = result[result.length - 1];
    
    // 检查是否会产生角色冲突
    if (lastMsg && lastMsg.role === currentMsg.role && 
        (currentMsg.role === USER_ROLE || currentMsg.role === ASSISTANT_ROLE)) {
      
      // 尝试从当前消息的替代分支中找到合适的消息
      const msgData = messageMap.get(currentMsg.id);
      let foundAlternative = false;
      
      if (msgData && msgData.alternatives) {
        for (const branch of msgData.alternatives) {
          if (branch.length > 0 && branch[0].role !== lastMsg.role) {
            // 找到合适的分支，添加整个分支
            branch.forEach(branchMsg => {
              if (branchMsg.role !== (result[result.length - 1]?.role)) {
                result.push(branchMsg);
              }
            });
            foundAlternative = true;
            break;
          }
        }
      }
      
      // 如果当前消息没有合适的分支，尝试从前一个消息的分支中找
      if (!foundAlternative && lastMsg) {
        const lastMsgData = messageMap.get(lastMsg.id);
        if (lastMsgData && lastMsgData.alternatives) {
          for (const branch of lastMsgData.alternatives) {
            if (branch.length > 0 && branch[0].role !== lastMsg.role) {
              // 替换最后一个消息为分支的第一个消息
              result[result.length - 1] = branch[0];
              // 添加分支的其余消息
              for (let j = 1; j < branch.length; j++) {
                if (branch[j].role !== (result[result.length - 1]?.role)) {
                  result.push(branch[j]);
                }
              }
              // 然后添加当前消息（如果角色不冲突）
              if (currentMsg.role !== (result[result.length - 1]?.role)) {
                result.push(currentMsg);
              }
              foundAlternative = true;
              break;
            }
          }
        }
      }
      
      // 如果没有找到合适的替代方案，跳过当前消息
      if (!foundAlternative) {
        continue;
      }
    } else {
      // 没有角色冲突，直接添加
      result.push(currentMsg);
    }
  }
  
  return result;
}

export function convertConversation(conversation, model) {
  const { messageMap, mainMessages } = buildMessageTree(conversation);
  const forks = conversation.messageForksHash || {};
  
  let messages = [];
  let messageDict = {};
  let systemContent = "";
  
  // 首先处理主线消息
  let lastMessageId = null;
  for (let i = 0; i < mainMessages.length; i++) {
    const msg = mainMessages[i];
    
    if (msg.role === SYSTEM_ROLE) {
      systemContent = getContent(msg);
      continue;
    }

    if (msg.role === USER_ROLE || msg.role === ASSISTANT_ROLE) {
      const convertedMsg = convertSingleMessage(msg, model, lastMessageId);
      if (convertedMsg) {
        messages.push(convertedMsg);
        messageDict[convertedMsg.id] = convertedMsg;
        
        // 更新父消息的 childrenIds
        if (lastMessageId && messageDict[lastMessageId]) {
          messageDict[lastMessageId].childrenIds.push(convertedMsg.id);
        }
        
        lastMessageId = convertedMsg.id;
      }
    }
  }
  
  // 然后处理所有分支消息
  Object.entries(forks).forEach(([parentId, forkData]) => {
    if (forkData.lists) {
      // 找到对应的父消息
      const parentOpenWebUIMsg = Object.values(messageDict).find(msg => {
        const originalParent = messageMap.get(parentId);
        return originalParent && Math.abs(msg.timestamp - Math.floor(originalParent.timestamp / 1000)) < 2;
      });
      
      if (!parentOpenWebUIMsg) {
        return;
      }
      
      // 按照分支中第一个消息（触发分支的消息）的时间戳排序
      const sortedForkLists = [...forkData.lists]
        .filter(forkList => forkList.messages && forkList.messages.length > 0)
        .sort((a, b) => {
          // 使用分支的第一个消息（触发分支的消息）的时间戳
          const aFirstMsg = a.messages[0];
          const bFirstMsg = b.messages[0];
          return (aFirstMsg.timestamp || 0) - (bFirstMsg.timestamp || 0);
        });
      
      // 存储每个分支的第一个消息ID，用于后续排序
      const branchFirstMessages = [];
      
      sortedForkLists.forEach(forkList => {
        let currentParentId = parentOpenWebUIMsg.id;
        let branchFirstMsgId = null;
        
        // 转换分支中的每个消息
        forkList.messages.forEach((branchMsg, index) => {
          if (branchMsg.role === USER_ROLE || branchMsg.role === ASSISTANT_ROLE) {
            const convertedBranchMsg = convertSingleMessage(branchMsg, model, currentParentId);
            if (convertedBranchMsg) {
              messages.push(convertedBranchMsg);
              messageDict[convertedBranchMsg.id] = convertedBranchMsg;
              
              // 记录分支的第一个消息
              if (index === 0) {
                branchFirstMsgId = convertedBranchMsg.id;
              } else {
                // 为非第一个消息设置父子关系
                if (messageDict[currentParentId]) {
                  messageDict[currentParentId].childrenIds.push(convertedBranchMsg.id);
                }
              }
              
              currentParentId = convertedBranchMsg.id;
            }
          }
        });
        
        // 将分支的第一个消息添加到父消息的 childrenIds 中
        if (branchFirstMsgId) {
          // 使用分支的第一个消息（触发分支的消息）的时间戳
          branchFirstMessages.push({
            id: branchFirstMsgId,
            timestamp: forkList.messages[0].timestamp || 0
          });
        }
      });
      
      // 按时间戳排序并添加到父消息的 childrenIds
      if (branchFirstMessages.length > 0) {
        // 保留原有的主线子消息
        const originalChildren = [...parentOpenWebUIMsg.childrenIds];
        
        // 按时间戳排序所有子消息（主线 + 分支）
        const allChildren = [
          ...originalChildren.map(childId => {
            const childMsg = messageDict[childId];
            return {
              id: childId,
              timestamp: childMsg ? childMsg.timestamp : 0,
              isMainline: true
            };
          }),
          ...branchFirstMessages.map(branch => ({
            ...branch,
            isMainline: false
          }))
        ];
        
        // 按时间戳排序，确保最早的在前面，最晚的在后面
        allChildren.sort((a, b) => {
          // 如果时间戳相同，主线消息优先
          if (a.timestamp === b.timestamp) {
            return a.isMainline ? -1 : (b.isMainline ? 1 : 0);
          }
          return a.timestamp - b.timestamp;
        });
        
        // 重新设置 childrenIds
        parentOpenWebUIMsg.childrenIds = allChildren.map(child => child.id);
      }
    }
  });

  return {
    id: "",
    title: conversation.name || "未命名对话",
    models: [model],
    system: "",
    params: {
      system: systemContent
    },
    messages: messages,
    history: {
      messages: messageDict,
      currentId: lastMessageId
    },
    tags: [],
    timestamp: Math.floor(Date.now() / 1000),
    files: []
  };
}