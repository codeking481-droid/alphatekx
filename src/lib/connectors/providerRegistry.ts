// Alpha Connector — Provider Registry
// All supported providers with their capabilities
// Adding a new provider requires only adding to this list

export type ConnectorAuthType = 'oauth' | 'apiKey'
export type ActionCapability = {
  id: string
  label: string
  description: string
  params?: string[]
}

export type ConnectorProvider = {
  id: string
  name: string
  description: string
  authType: ConnectorAuthType
  icon: string // icon name for mapping
  color: string
  category: 'Social Media' | 'Communication' | 'Productivity' | 'Content'
  composioAppName: string // maps to Composio's internal app name
  actions: ActionCapability[]
  docsUrl?: string
}

export const PROVIDER_REGISTRY: ConnectorProvider[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Upload and manage videos.',
    authType: 'oauth',
    icon: 'youtube',
    color: '#FF0000',
    category: 'Content',
    composioAppName: 'youtube',
    actions: [
      { id: 'upload_video', label: 'Upload Video', description: 'Upload a video to YouTube.', params: ['title', 'description', 'videoUrl', 'privacyStatus'] },
      { id: 'update_video', label: 'Update Video', description: 'Update video title or description.', params: ['videoId', 'title', 'description'] },
      { id: 'schedule_video', label: 'Schedule Video', description: 'Schedule a video for future publishing.', params: ['title', 'description', 'videoUrl', 'publishAt'] },
    ],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Send messages and templates.',
    authType: 'oauth',
    icon: 'whatsapp',
    color: '#25D366',
    category: 'Communication',
    composioAppName: 'whatsapp',
    actions: [
      { id: 'send_message', label: 'Send Message', description: 'Send a WhatsApp message.', params: ['to', 'message'] },
      { id: 'send_template', label: 'Send Template', description: 'Send a template message.', params: ['to', 'templateId'] },
      { id: 'send_media', label: 'Send Media', description: 'Send an image or document.', params: ['to', 'mediaUrl', 'caption'] },
    ],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    description: 'Post content and share updates.',
    authType: 'oauth',
    icon: 'linkedin',
    color: '#0A66C2',
    category: 'Social Media',
    composioAppName: 'linkedin',
    actions: [
      { id: 'create_post', label: 'Create Post', description: 'Create a new LinkedIn post.', params: ['text'] },
      { id: 'create_image_post', label: 'Create Image Post', description: 'Create a post with an image.', params: ['imageUrl', 'text'] },
      { id: 'create_article', label: 'Create Article', description: 'Create a LinkedIn article.', params: ['title', 'content', 'canonicalUrl'] },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Create pages, databases, and search.',
    authType: 'oauth',
    icon: 'notion',
    color: '#0A0F1E',
    category: 'Productivity',
    composioAppName: 'notion',
    actions: [
      { id: 'create_page', label: 'Create Page', description: 'Create a Notion page in a database.', params: ['databaseId', 'title', 'content'] },
      { id: 'update_page', label: 'Update Page', description: 'Update a Notion page.', params: ['pageId', 'properties'] },
      { id: 'search', label: 'Search', description: 'Search Notion for pages and databases.', params: ['query'] },
    ],
  },
]

// Fast lookup by id
export const getProvider = (id: string): ConnectorProvider | undefined =>
  PROVIDER_REGISTRY.find(p => p.id === id)

// Get action capability for a provider
export const getProviderAction = (providerId: string, actionId: string): ActionCapability | undefined => {
  const provider = getProvider(providerId)
  return provider?.actions.find(a => a.id === actionId)
}