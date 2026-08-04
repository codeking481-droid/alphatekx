let conversationEngineInstance = null

export function setConversationEngine(engine) {
  conversationEngineInstance = engine
}

export function getConversationEngine() {
  if (!conversationEngineInstance) throw new Error('Conversation engine is not initialized')
  return conversationEngineInstance
}
