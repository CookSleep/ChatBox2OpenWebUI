<template>
  <div class="app">
    <div class="container">
      <h1 class="title">
        <span class="chatbox-color">ChatBox</span>
        <span class="to-color">&nbsp;to&nbsp;</span>
        <span class="webui-color">Open WebUI</span>
      </h1>
      <p class="subtitle">
        轻松将 ChatBox 导出的对话记录转换为 Open WebUI 格式，
        <br>让我们一起迈向更加广阔的 Open WebUI 吧！
      </p>
      
      <input type="file" id="fileInput" @change="handleFileUpload" accept=".json" multiple style="display: none;">
      <label for="fileInput" class="button">选择文件</label>
      
      <div v-if="conversations.length > 0" class="conversation-list">
        <div class="list-header">
          <label class="checkbox-label">
            <input type="checkbox" v-model="selectAll" @change="toggleSelectAll">
            <span class="checkbox-custom"></span>
            全选
          </label>
          <div class="model-info">
            <input v-model="globalModel" placeholder="所有对话使用的模型" @input="updateAllModels" class="input">
            <span class="info-icon" 
                  @mouseenter="handleMouseEnter($event, modelInfoContent)"
                  @mouseleave="handleMouseLeave">ⓘ</span>
          </div>
        </div>
        <div v-for="conv in conversations" :key="conv.id" class="conversation-item">
          <div class="conversation-header">
            <label class="checkbox-label">
              <input type="checkbox" v-model="conv.selected">
              <span class="checkbox-custom"></span>
              {{ conv.title }}
            </label>
            <div class="conversation-icons">
              <svg v-if="conv.hasWarning" class="icon warning" viewBox="0 0 24 24" @mouseenter="handleMouseEnter($event, warningInfoContent)" @mouseleave="handleMouseLeave">
                <path fill="red" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              <svg v-if="conv.hasImages" class="icon image" viewBox="0 0 24 24" @mouseenter="handleMouseEnter($event, imageInfoContent)" @mouseleave="handleMouseLeave">
                <path fill="orange" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
            </div>
          </div>
          <input v-model="conv.model" placeholder="本对话使用的模型" class="input">
        </div>
      </div>
      
      <button v-if="conversations.length > 0" @click="convertAndExport" class="button export-button" :disabled="!hasSelectedConversations">转换并导出</button>
      
      <div class="github-link-container">
        <a href="https://github.com/CookSleep/ChatBox2OpenWebUI" target="_blank" class="github-link">GitHub @CookSleep</a>
      </div>
    </div>
  
    <div class="section steps-section">
      <h2>聊天记录转移步骤</h2>
      <ol>
        <li>在ChatBox的<code>设置-其它-备份与恢复</code>中<strong>只勾选<code>聊天记录</code></strong>，然后导出</li>
        <li>点击本页面的<code>选择文件</code>按钮，选择刚刚从ChatBox导出的JSON文件
          <blockquote>本网页不会收集也无法收集您的个人数据，一切操作均在您的浏览器本地进行</blockquote>
        </li>
        <li>查看上传的对话列表，根据需要选择或取消选择从ChatBox中导出的对话</li>
        <li>为每个对话指定使用的模型（可选）</li>
        <li>点击<code>转换并导出</code>按钮生成Open WebUI格式的JSON文件</li>
        <li>在Open WebUI的<code>设置-对话-导入聊天记录</code>中选择刚刚生成的文件</li>
        <li>刷新Open WebUI页面，完成数据导入
          <blockquote>Open WebUI的对话专属系统提示需要在界面右上角的<code>对话高级设置</code>中查看、修改</blockquote>
        </li>
      </ol>
    </div>
  
    <Modal v-if="showModal" :title="modalTitle" :content="modalContent" @close="closeModal" />
    <div v-if="isTooltipVisible" class="tooltip" :style="tooltipStyle" @click.stop>
      <div v-html="tooltipContent"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import Modal from './components/Modal.vue';
import { convertConversation, isValidConversation } from './utils/converter';

const conversations = ref([]);
const globalModel = ref('');
const showModal = ref(false);
const modalTitle = ref('');
const modalContent = ref('');
const isTooltipVisible = ref(false);
const tooltipContent = ref('');
const tooltipStyle = ref({});

const selectAll = computed({
  get: () => conversations.value.every(conv => conv.selected),
  set: (value) => conversations.value.forEach(conv => conv.selected = value)
});

const hasSelectedConversations = computed(() => conversations.value.some(conv => conv.selected));

function toggleSelectAll() {
  const newValue = selectAll.value;
  conversations.value.forEach(conv => conv.selected = newValue);
}

function updateAllModels() {
  conversations.value.forEach(conv => conv.model = globalModel.value);
}

function handleFileUpload(event) {
  // 初始化操作
  conversations.value = [];
  globalModel.value = '';
  showModal.value = false;
  isTooltipVisible.value = false;

  const files = event.target.files;
  let conversationsWithErrors = [];
  let conversationsWithImages = [];
  let validConversationsCount = 0;

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const chatSessions = data['chat-sessions'] || [];

        chatSessions.forEach(conv => {
          if (conv.messages && conv.messages.length > 0) {
            const hasWarning = !isValidConversation(conv.messages);
            const hasImages = conv.messages.some(msg => msg.pictures && msg.pictures.length > 0);
            conversations.value.push({
              id: uuidv4(),
              title: conv.name || "未命名对话",
              selected: !hasWarning,
              model: globalModel.value,
              rawData: conv,
              hasWarning,
              hasImages
            });
            if (hasWarning) {
              conversationsWithErrors.push(conv.name || "未命名对话");
            }
            if (hasImages) {
              conversationsWithImages.push(conv.name || "未命名对话");
            }
            validConversationsCount++;
          }
        });

        if (validConversationsCount === 0) {
          showErrorModal("无有效对话", "<strong>所选文件中没有有效的对话记录。请确保选择了正确的 ChatBox 导出文件。</strong>");
        } else {
          if (conversationsWithErrors.length > 0 || conversationsWithImages.length > 0) {
            showWarningModal(conversationsWithErrors, conversationsWithImages);
          }
        }
      } catch (error) {
        showErrorModal("无有效对话", "<strong>所选文件中没有有效的对话记录。请确保选择了正确的 ChatBox 导出文件。</strong>");
      }
    };
    reader.readAsText(file);
  });
}

function showErrorModal(title, content) {
  showModal.value = true;
  modalTitle.value = title;
  modalContent.value = content;
  conversations.value = [];
}

function showWarningModal(errorConversations, imageConversations) {
  showModal.value = true;
  modalTitle.value = "转换警告";
  let content = "";

  if (errorConversations.length > 0) {
    content += `
      <p><strong>以下对话包含不成对的消息（存在连续的User/Assistant消息），可能导致Open WebUI功能异常：</strong></p>
      <ul>
        ${errorConversations.map(title => `<li>${title}</li>`).join('')}
      </ul>
      <p>如果您确定要转换这些对话，建议先在ChatBox中手动删除不成对消息。</p>
      <hr style="border-color: #ccc;"> <!-- 添加分割线 -->
    `;
  }

  if (imageConversations.length > 0) {
    content += `
      <p><strong>以下对话包含图片，这些图片将在转换过程中丢失：</strong></p>
      <ul>
        ${imageConversations.map(title => `<li>${title}</li>`).join('')}
      </ul>
      <p>ChatBox导出的聊天记录文件中并不包含图片数据，因此所有的图片都会被丢弃并被 <code>[该消息原本包含图片，但未被保存]</code> 替代。</p>
      <hr style="border-color: #ccc;">
    `;
  }

  modalContent.value = content;
}

function convertAndExport() {
  const selectedConversations = conversations.value.filter(conv => conv.selected);
  const convertedData = selectedConversations.map(conv => {
    const convertedChat = convertConversation(conv.rawData, conv.model);
    return {
      id: uuidv4(),
      user_id: uuidv4(),
      title: convertedChat.title,
      chat: convertedChat,
      updated_at: Math.floor(Date.now() / 1000),
      created_at: Math.floor(Date.now() / 1000),
      share_id: null,
      archived: false,
    };
  });

  const result = JSON.stringify(convertedData, null, 2);
  const blob = new Blob([result], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
  a.download = `ChatBox2OpenWebUI_${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showModal.value = true;
  modalTitle.value = "转换成功";
  modalContent.value = `成功转换了 ${convertedData.length} 个对话到 Open WebUI 格式。`;
}

function closeModal() {
  showModal.value = false;
}

const modelInfoContent = `
  <p>如果需要为对话中的AI回复添加头像，<br>则需要在Open WebUI的工作区内使用"创建一个模型"功能设置相关信息，并在本网页的"该对话使用的模型"中填写你刚刚创建的模型的ID。</p>
`;

const warningInfoContent = `
  <p><strong>此对话包含不成对的消息，可能无法被正确转换。</strong></p>
  <p>建议先在ChatBox中手动删除不成对消息。</p>
`;

const imageInfoContent = `
  <p><strong>此对话包含图片，图片将在转换过程中丢失。</strong></p>
  <p>ChatBox导出的聊天记录文件中并不包含图片数据，因此所有的图片都会被丢弃并被<code>[该消息原本包含图片，但未被保存]</code>替代。</p>
`;

function showTooltip(event, content) {
  tooltipContent.value = content;
  const rect = event.target.getBoundingClientRect();
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    tooltipStyle.value = {
      position: 'absolute',
      top: `${rect.bottom + window.scrollY + 5}px`,
      left: '10px',
      right: '10px',
      maxWidth: 'calc(100vw - 20px)',
    };
  } else {
    tooltipStyle.value = {
      position: 'absolute',
      top: `${rect.bottom + window.scrollY + 5}px`,
      left: `${rect.left + window.scrollX}px`,
      transform: 'translateX(-50%)',
      maxWidth: '300px',
    };
  }

  isTooltipVisible.value = true;
}

function showModelInfo(event) {
  showTooltip(event, modelInfoContent);
}

function showWarningInfo(event, conv) {
  showTooltip(event, warningInfoContent);
}

function showImageInfo(event, conv) {
  showTooltip(event, imageInfoContent);
}

let tooltipTimeout;

function handleMouseEnter(event, content) {
  clearTimeout(tooltipTimeout);
  showTooltip(event, content);
}

function handleMouseLeave() {
  tooltipTimeout = setTimeout(() => {
    isTooltipVisible.value = false;
  }, 100);
}

function handleScroll() {
  if (window.innerWidth <= 768) {
    isTooltipVisible.value = false;
  }
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll);
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
});
</script>

<style scoped>
.app {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  color: #333;
  background-color: #f5f5f5;
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.container {
  background-color: white;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  text-align: center;
}

.title {
  font-size: 32px;
  margin-bottom: 10px;
  font-weight: 600;
  white-space: nowrap;
  display: flex;
  justify-content: center;
  align-items: center;
}

.subtitle {
  color: #666;
  margin-bottom: 20px;
  font-size: 14px;
}

.chatbox-color {
  color: #FAC26E;
}

.to-color {
  color: #666;
  margin: 0 10px;
}

.webui-color {
  color: #000000;
}

.button {
  background-color: #FAC26E;
  border: none;
  color: white;
  padding: 12px 24px;
  text-align: center;
  text-decoration: none;
  display: inline-block;
  font-size: 16px;
  margin: 4px 2px;
  cursor: pointer;
  border-radius: 30px;
  transition: all 0.3s ease;
}

.button:hover {
  background-color: #000000;
  transform: translateY(-2px);
}

.button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
  transform: none;
}

.export-button {
  margin-top: 20px;
}

.conversation-list {
  margin-top: 30px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  background-color: #fafafa;
  text-align: left;
  position: relative;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.model-info {
  width: auto;
  margin-left: 0;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-top: 0;
  font-size: 14px;
}

.input {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 20px;
  font-size: 14px;
  transition: all 0.3s ease;
  width: calc(100% - 22px);
  margin-top: 5px;
  box-sizing: border-box;
}

.input:focus {
  outline: none;
  border-color: #FAC26E;
  box-shadow: 0 0 0 2px rgba(250, 194, 110, 0.2);
}

.checkbox-label {
  flex-basis: auto;
  min-width: 100px;
  display: flex;
  align-items: center;
  font-size: 14px;
}

.checkbox-label input[type="checkbox"] {
  display: none;
}

.checkbox-custom {
  width: 18px;
  height: 18px;
  border: 2px solid #FAC26E;
  border-radius: 3px;
  margin-right: 8px;
  position: relative;
  transition: all 0.2s ease;
}

.checkbox-label input[type="checkbox"]:checked + .checkbox-custom::after {
  content: '\2714';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #FAC26E;
  font-size: 14px;
}

.conversation-item {
  display: flex;
  flex-direction: column;
  margin-bottom: 10px;
  padding: 10px;
  background-color: white;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.conversation-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.conversation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  overflow: hidden;
}

.conversation-header label {
  flex-grow: 1;
  margin-right: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-icons {
  display: flex;
  gap: 5px;
  flex-shrink: 0;
}

.icon {
  width: 24px;
  height: 24px;
  cursor: pointer;
}

.github-link-container {
  display: flex;
  justify-content: center;
  margin-top: 30px;
}

.github-link {
  color: #FAC26E;
  text-decoration: none;
  font-weight: 600;
  transition: color 0.3s;
}

.github-link:hover {
  color: #000000;
}

.section {
  margin-top: 40px;
  background-color: white;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

h2 {
  color: #FAC26E;
  margin-bottom: 20px;
  font-weight: 600;
}

code {
  background-color: #f1f1f1;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', Courier, monospace;
}

blockquote {
  border-left: 3px solid #FAC26E;
  margin: 15px 0;
  padding: 10px 20px;
  background-color: #f9f9f9;
  border-radius: 0 4px 4px 0;
}

ol {
  padding-left: 20px;
}

li {
  margin-bottom: 10px;
}

.info-icon {
  font-size: 18px;
  color: #666;
  cursor: pointer;
  margin-left: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: #f0f0f0;
  transition: background-color 0.3s ease;
}

.info-icon:hover {
  background-color: #e0e0e0;
}

.tooltip {
  position: absolute;
  background-color: #333;
  color: #fff;
  padding: 15px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 1000;
  white-space: normal;
  word-wrap: break-word;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
  line-height: 1.5;
  pointer-events: none;
}

@media (max-width: 768px) {
  .app {
    padding: 10px;
  }

  .container {
    padding: 20px;
  }

  .title {
    font-size: 24px;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }

  .title span {
    margin: 5px;
  }

  .subtitle {
    font-size: 12px;
  }

  .button {
    padding: 10px 20px;
    font-size: 14px;
  }

  .conversation-list {
    padding: 10px;
  }

  .input {
    font-size: 12px;
  }

  .info-icon {
    font-size: 16px;
    width: 20px;
    height: 20px;
  }

  .conversation-header {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }

  .conversation-header label {
    max-width: calc(100% - 60px);
  }

  .conversation-icons {
    margin-left: 10px;
  }

  .model-info {
    width: 80%;
    margin-left: 5%;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    margin-top: 0;
    font-size: 12px;
  }

  .list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: nowrap;
  }

  .checkbox-label {
    flex-basis: 20%;
    min-width: 80px;
    display: flex;
    align-items: center;
    font-size: 12px;
  }

  .model-info .input {
    flex-grow: 1;
    margin-right: 5px;
    width: calc(100% - 85px);
    font-size: 12px;
  }

  .tooltip {
    position: absolute;
    left: 10px !important;
    right: 10px !important;
    max-width: calc(100vw - 20px);
  }
}
</style>