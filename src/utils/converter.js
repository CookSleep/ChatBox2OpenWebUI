import { v4 as uuidv4 } from 'uuid';

const USER_ROLE = "user";
const ASSISTANT_ROLE = "assistant";
const SYSTEM_ROLE = "system";

export function isValidConversation(messages) {
  let lastRole = null;
  for (let msg of messages) {
    if (msg.role === lastRole && (lastRole === USER_ROLE || lastRole === ASSISTANT_ROLE)) {
      return false;
    }
    lastRole = msg.role;
  }
  return true;
}

export function convertConversation(conversation, model) {
  let messages = [];
  let messageDict = {};
  let lastMessageId = null;
  let systemContent = "";

  for (let msg of conversation.messages) {
    if (msg.role === SYSTEM_ROLE) {
      systemContent = msg.content;
      continue;
    }

    if (msg.role === USER_ROLE || msg.role === ASSISTANT_ROLE) {
      let content = msg.content;
      if (msg.pictures && msg.pictures.length > 0) {
        content += "\n[该消息原本包含图片，但未被保存]";
      }

      let message = {
        id: msg.id,
        parentId: lastMessageId,
        childrenIds: [],
        role: msg.role,
        content: content,
        timestamp: msg.timestamp ? Math.floor(msg.timestamp / 1000) : Math.floor(Date.now() / 1000),
        models: msg.role === USER_ROLE ? [model] : [],
        model: msg.role === ASSISTANT_ROLE ? model : null,
        modelName: msg.role === ASSISTANT_ROLE ? model : null,
        modelIdx: msg.role === ASSISTANT_ROLE ? 0 : null,
        done: msg.role === ASSISTANT_ROLE ? true : null,
        userContext: msg.role === ASSISTANT_ROLE ? null : null
      };
      if (lastMessageId) {
        messages[messages.length - 1].childrenIds.push(msg.id);
      }
      messages.push(message);
      messageDict[msg.id] = message;
      lastMessageId = msg.id;
    }
  }

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