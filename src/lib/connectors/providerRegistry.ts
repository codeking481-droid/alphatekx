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
    id: 'facebook',
    name: 'Facebook',
    description: 'Post content, manage pages, engage your audience.',
    authType: 'oauth',
    icon: 'facebook',
    color: '#1877F2',
    category: 'Social Media',
    composioAppName: 'facebook',
    actions: [
      { id: 'create_post', label: 'Create Post', description: 'Create a new post on a Facebook page.', params: ['pageId', 'message'] },
      { id: 'upload_photo', label: 'Upload Photo', description: 'Upload a photo to Facebook.', params: ['pageId', 'imageUrl', 'caption'] },
      { id: 'upload_video', label: 'Upload Video', description: 'Upload a video to Facebook.', params: ['pageId', 'videoUrl', 'title', 'description'] },
    ],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Create posts, carousels, and reels.',
    authType: 'oauth',
    icon: 'instagram',
    color: '#E4405F',
    category: 'Social Media',
    composioAppName: 'instagram',
    actions: [
      { id: 'create_post', label: 'Create Post', description: 'Create a new Instagram post.', params: ['imageUrl', 'caption'] },
      { id: 'create_carousel', label: 'Create Carousel', description: 'Create a carousel post.', params: ['mediaUrls', 'caption'] },
      { id: 'create_reel', label: 'Create Reel', description: 'Create a reel.', params: ['videoUrl', 'caption'] },
    ],
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    description: 'Post tweets, threads, and engage.',
    authType: 'oauth',
    icon: 'twitter',
    color: '#0A0F1E',
    category: 'Social Media',
    composioAppName: 'twitter',
    actions: [
      { id: 'create_tweet', label: 'Create Tweet', description: 'Post a new tweet.', params: ['text'] },
      { id: 'create_thread', label: 'Create Thread', description: 'Post a thread of tweets.', params: ['tweets'] },
      { id: 'reply_to_tweet', label: 'Reply', description: 'Reply to a tweet.', params: ['tweetId', 'text'] },
      { id: 'quote_tweet', label: 'Quote Tweet', description: 'Quote a tweet.', params: ['tweetId', 'text'] },
    ],
  },
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
    composioAppName: 'whatsapp_business',
    actions: [
      { id: 'send_message', label: 'Send Message', description: 'Send a WhatsApp message.', params: ['to', 'message'] },
      { id: 'send_template', label: 'Send Template', description: 'Send a template message.', params: ['to', 'templateName', 'parameters'] },
      { id: 'send_media', label: 'Send Media', description: 'Send a media message (image/video/document).', params: ['to', 'mediaUrl', 'mediaType', 'caption'] },
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
