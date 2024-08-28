<template>
  <transition name="modal">
    <div class="modal-overlay" @click="$emit('close')">
      <div class="modal-content" @click.stop>
        <h2 v-html="title"></h2>
        <div class="modal-body" v-html="content"></div>
        <button @click="$emit('close')" class="close-button">关闭</button>
      </div>
    </div>
  </transition>
</template>

<script setup>
defineProps(['title', 'content']);
defineEmits(['close']);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: white;
  padding: 20px;
  border-radius: 8px;
  max-width: 80%;
  max-height: 80%;
  overflow-y: auto;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.modal-body {
  max-height: 400px;
  overflow-y: auto;
}

h2 {
  color: #FAC26E;
  margin-bottom: 15px;
}

.close-button {
  background-color: #FAC26E;
  border: none;
  color: white;
  padding: 10px 20px;
  text-align: center;
  text-decoration: none;
  display: inline-block;
  font-size: 16px;
  margin-top: 20px;
  cursor: pointer;
  border-radius: 30px;
  transition: all 0.3s ease;
}

.close-button:hover {
  background-color: #000000;
}

.modal-enter-active, .modal-leave-active {
  transition: opacity 0.3s;
}

.modal-enter-from, .modal-leave-to {
  opacity: 0;
}

hr {
  border: none;
  border-top: 1px solid #ccc;
  margin: 10px 0;
}
</style>